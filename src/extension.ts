import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let statusBarItem: vscode.StatusBarItem;
let cachedProfileName: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
    // Detect profile once at activation (profile doesn't change mid-session)
    cachedProfileName = detectProfileName(context);

    // Create status bar item based on current config
    statusBarItem = createStatusBarItem();
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('projectLabel.refresh', () => {
            cachedProfileName = detectProfileName(context);
            updateLabel();
        }),
        vscode.commands.registerCommand('projectLabel.copyLabel', async () => {
            const label = buildLabelText();
            if (label) {
                await vscode.env.clipboard.writeText(label);
                vscode.window.showInformationMessage(`Copied: "${label}"`);
            }
        })
    );

    // Recreate status bar item when alignment/priority changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('projectLabel')) {
                if (e.affectsConfiguration('projectLabel.alignment') ||
                    e.affectsConfiguration('projectLabel.priority')) {
                    statusBarItem.dispose();
                    statusBarItem = createStatusBarItem();
                    context.subscriptions.push(statusBarItem);
                }
                updateLabel();
            }
        })
    );

    // Listen for workspace folder changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => updateLabel())
    );

    // Initial update
    updateLabel();
}

function createStatusBarItem(): vscode.StatusBarItem {
    const config = vscode.workspace.getConfiguration('projectLabel');
    const alignment = config.get<string>('alignment') === 'right'
        ? vscode.StatusBarAlignment.Right
        : vscode.StatusBarAlignment.Left;
    const priority = config.get<number>('priority', 1000);

    const item = vscode.window.createStatusBarItem(alignment, priority);
    item.command = 'projectLabel.copyLabel';
    return item;
}

function getProjectName(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        return folders[0].name;
    }
    return 'No Folder';
}

/**
 * Detect the active VS Code profile name.
 *
 * Strategy (in priority order):
 * 1. globalStorageUri contains the profile ID for non-default profiles
 *    e.g. ~/.config/Code/User/profiles/<profileId>/globalStorage/<extensionId>
 *    We extract <profileId> and look it up in profiles.json.
 * 2. VSCODE_PROFILE env var (set by some VS Code builds).
 * 3. Falls back to "Default".
 */
function detectProfileName(context: vscode.ExtensionContext): string {
    // --- Method 1: Parse profile ID from globalStorageUri ---
    try {
        const globalStoragePath = context.globalStorageUri.fsPath;
        // Non-default profile path: .../User/profiles/<profileId>/globalStorage/...
        const profileIdMatch = globalStoragePath.match(
            /[/\\]profiles[/\\]([a-f0-9-]+)[/\\]globalStorage/i
        );

        if (profileIdMatch) {
            const profileId = profileIdMatch[1];
            const configDir = getVSCodeConfigDir();
            const profileListPath = path.join(configDir, 'User', 'profiles.json');

            if (fs.existsSync(profileListPath)) {
                const raw = fs.readFileSync(profileListPath, 'utf-8');
                const profilesData = JSON.parse(raw);
                const profiles: Array<{ name?: string; location?: string }> =
                    Array.isArray(profilesData) ? profilesData : (profilesData?.profiles ?? []);

                for (const p of profiles) {
                    if (p.location === profileId && p.name) {
                        return p.name;
                    }
                }
            }
            // If we found a profile ID but couldn't resolve the name, show the ID
            return profileId.substring(0, 8);
        }
    } catch {
        // Ignore — fall through to next method
    }

    // --- Method 2: Environment variable ---
    const envProfile = process.env['VSCODE_PROFILE'];
    if (envProfile) {
        return envProfile;
    }

    return 'Default';
}

function getVSCodeConfigDir(): string {
    const homeDir = os.homedir();

    switch (process.platform) {
        case 'win32':
            return path.join(
                process.env['APPDATA'] || path.join(homeDir, 'AppData', 'Roaming'),
                'Code'
            );
        case 'darwin':
            return path.join(homeDir, 'Library', 'Application Support', 'Code');
        default:
            return path.join(homeDir, '.config', 'Code');
    }
}

function buildLabelText(): string {
    const config = vscode.workspace.getConfiguration('projectLabel');

    // Custom label override
    const customLabel = config.get<string>('customLabel', '');
    if (customLabel) {
        return customLabel;
    }

    const showProject = config.get<boolean>('showProjectName', true);
    const showProfile = config.get<boolean>('showProfile', true);
    const separator = config.get<string>('separator', ' | ');

    const parts: string[] = [];

    if (showProject) {
        parts.push(getProjectName());
    }

    if (showProfile) {
        const profileName = cachedProfileName ?? 'Default';
        // Always show if profile-only mode, otherwise skip "Default"
        if (profileName !== 'Default' || !showProject) {
            parts.push(profileName);
        }
    }

    return parts.join(separator);
}

function updateLabel(): void {
    const config = vscode.workspace.getConfiguration('projectLabel');
    const icon = config.get<string>('icon', '$(folder)');
    const color = config.get<string>('color', '');
    const updateTitle = config.get<boolean>('updateWindowTitle', false);

    const labelText = buildLabelText();

    if (!labelText) {
        statusBarItem.hide();
        return;
    }

    // Build display text with optional icon
    statusBarItem.text = icon ? `${icon} ${labelText}` : labelText;
    statusBarItem.tooltip = `Project: ${getProjectName()}\nProfile: ${cachedProfileName ?? 'Default'}\n\nClick to copy`;

    // Apply color — supports both hex (#rrggbb) and theme color tokens
    if (color) {
        statusBarItem.color = color.startsWith('#') ? color : new vscode.ThemeColor(color);
    } else {
        statusBarItem.color = undefined;
    }

    statusBarItem.show();

    // Optionally prepend label to window title
    if (updateTitle) {
        const currentTitle = vscode.workspace.getConfiguration('window').get<string>('title', '');
        const prefix = `[${labelText}]`;
        if (!currentTitle?.startsWith(prefix)) {
            vscode.workspace.getConfiguration('window').update(
                'title',
                `${prefix} ${currentTitle}`,
                vscode.ConfigurationTarget.Workspace
            );
        }
    }
}

export function deactivate(): void {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
