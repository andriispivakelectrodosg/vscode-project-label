import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SettingsPanel } from './settingsPanel';
import { ProjectLabelTreeProvider } from './treeViewProvider';

let statusBarItem: vscode.StatusBarItem;
let soundStatusBarItem: vscode.StatusBarItem;
let cachedProfileName: string | undefined;
let originalWindowTitle: string | undefined;
let treeProvider: ProjectLabelTreeProvider;

export function activate(context: vscode.ExtensionContext): void {
    // Detect profile once at activation (profile doesn't change mid-session)
    cachedProfileName = detectProfileName(context);

    // Remember original window title for clean restore on deactivate
    originalWindowTitle = vscode.workspace.getConfiguration('window').get<string>('title');

    // Create status bar item based on current config
    statusBarItem = createStatusBarItem();
    context.subscriptions.push(statusBarItem);

    // Create sound status bar item (right side, low priority so it's near the edge)
    soundStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    soundStatusBarItem.command = 'projectLabel.toggleSilenceAllSounds';
    context.subscriptions.push(soundStatusBarItem);
    updateSoundStatusBar();

    // ── Tree View Sidebar ──
    treeProvider = new ProjectLabelTreeProvider();
    const treeView = vscode.window.createTreeView('projectLabelView', {
        treeDataProvider: treeProvider,
        showCollapseAll: false,
    });
    context.subscriptions.push(treeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('projectLabel.refresh', () => {
            cachedProfileName = detectProfileName(context);
            updateLabel();
            treeProvider.refresh();
        }),
        vscode.commands.registerCommand('projectLabel.copyLabel', async () => {
            const label = buildLabelText();
            if (label) {
                await vscode.env.clipboard.writeText(label);
                vscode.window.showInformationMessage(`Copied: "${label}"`);
            }
        }),
        vscode.commands.registerCommand('projectLabel.enableNativeTitleBar', async () => {
            await setTitleBarStyle('native');
        }),
        vscode.commands.registerCommand('projectLabel.disableNativeTitleBar', async () => {
            await setTitleBarStyle('custom');
        }),
        vscode.commands.registerCommand('projectLabel.silenceCopilot', async () => {
            await setCopilotChatSilence(true);
        }),
        vscode.commands.registerCommand('projectLabel.unsilenceCopilot', async () => {
            await setCopilotChatSilence(false);
        }),
        vscode.commands.registerCommand('projectLabel.silenceAllSounds', async () => {
            await setSilenceAllSounds(true);
        }),
        vscode.commands.registerCommand('projectLabel.unsilenceAllSounds', async () => {
            await setSilenceAllSounds(false);
        }),
        // ── Settings Panel command ──
        vscode.commands.registerCommand('projectLabel.openSettings', () => {
            SettingsPanel.show(context.extensionUri);
        }),
        // ── Toggle commands for tree view ──
        vscode.commands.registerCommand('projectLabel.toggleShowProjectName', async () => {
            await toggleBoolSetting('showProjectName');
        }),
        vscode.commands.registerCommand('projectLabel.toggleShowProfile', async () => {
            await toggleBoolSetting('showProfile');
        }),
        vscode.commands.registerCommand('projectLabel.toggleShowInStatusBar', async () => {
            await toggleBoolSetting('showInStatusBar');
        }),
        vscode.commands.registerCommand('projectLabel.toggleUpdateWindowTitle', async () => {
            await toggleBoolSetting('updateWindowTitle');
        }),
        vscode.commands.registerCommand('projectLabel.toggleNativeTitleBar', async () => {
            await toggleBoolSetting('useNativeTitleBar');
        }),
        vscode.commands.registerCommand('projectLabel.toggleSilenceCopilot', async () => {
            await toggleBoolSetting('silenceCopilotChat');
        }),
        vscode.commands.registerCommand('projectLabel.toggleSilenceAllSounds', async () => {
            // Use actual signal state as ground truth instead of
            // projectLabel.silenceAllSounds (which may fail to persist).
            let currentlySilent = false;
            try {
                const sig = vscode.workspace.getConfiguration('accessibility.signals');
                const sample = sig.get<{ sound?: string }>('chatResponseReceived');
                currentlySilent = sample?.sound === 'off';
            } catch { /* ignore */ }
            await setSilenceAllSounds(!currentlySilent);
        })
    );

    // On first activation, check if user wants native title bar
    applyNativeTitleBarSetting();

    // Apply Copilot silence setting
    applyCopilotSilenceSetting();

    // Apply silence all sounds setting
    applySilenceAllSoundsSetting();

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
                if (e.affectsConfiguration('projectLabel.useNativeTitleBar')) {
                    applyNativeTitleBarSetting();
                }
                if (e.affectsConfiguration('projectLabel.silenceCopilotChat')) {
                    applyCopilotSilenceSetting();
                }
                if (e.affectsConfiguration('projectLabel.silenceAllSounds')) {
                    applySilenceAllSoundsSetting();
                    updateSoundStatusBar();
                }
                updateLabel();
                treeProvider.refresh();
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

function getProjectPath(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        return folders[0].uri.fsPath;
    }
    return '';
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
    const icon = config.get<string>('icon', '$(bracket-dot)');
    const color = config.get<string>('color', '');
    const updateTitle = config.get<boolean>('updateWindowTitle', true);

    const labelText = buildLabelText();

    if (!labelText) {
        statusBarItem.hide();
        return;
    }

    const showInStatusBar = config.get<boolean>('showInStatusBar', true);

    // Build display text with optional icon
    statusBarItem.text = icon ? `${icon} ${labelText}` : labelText;

    const projectPath = getProjectPath();
    const tooltipMd = new vscode.MarkdownString('', true);
    tooltipMd.isTrusted = true;
    tooltipMd.appendMarkdown(`**Project:** ${getProjectName()}\n\n`);
    if (projectPath) {
        tooltipMd.appendMarkdown(`**Path:** \`${projectPath}\`\n\n`);
    }
    tooltipMd.appendMarkdown(`**Profile:** ${cachedProfileName ?? 'Default'}\n\n`);
    tooltipMd.appendMarkdown('---\n\n*Click to copy label*');
    statusBarItem.tooltip = tooltipMd;

    // Apply color — supports both hex (#rrggbb) and theme color tokens
    if (color) {
        statusBarItem.color = color.startsWith('#') ? color : new vscode.ThemeColor(color);
    } else {
        statusBarItem.color = undefined;
    }

    if (showInStatusBar) {
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }

    // Update window title bar (displays near Help button in title bar)
    if (updateTitle) {
        const template = config.get<string>('titleTemplate',
            '[${label}] ${activeEditorShort}${separator}${rootName}');
        const titleWithLabel = template.replace(/\$\{label\}/g, labelText);
        vscode.workspace.getConfiguration('window').update(
            'title',
            titleWithLabel,
            vscode.ConfigurationTarget.Workspace
        );
    }
}

/**
 * Apply the useNativeTitleBar setting.
 * Sets window.titleBarStyle to "native" or "custom" and prompts for restart.
 */
async function applyNativeTitleBarSetting(): Promise<void> {
    const config = vscode.workspace.getConfiguration('projectLabel');
    const useNative = config.get<boolean>('useNativeTitleBar', false);
    const currentStyle = vscode.workspace.getConfiguration('window').get<string>('titleBarStyle');

    const targetStyle = useNative ? 'native' : 'custom';

    if (currentStyle !== targetStyle) {
        await vscode.workspace.getConfiguration('window').update(
            'titleBarStyle',
            targetStyle,
            vscode.ConfigurationTarget.Global
        );
        const action = await vscode.window.showInformationMessage(
            `Title bar style changed to "${targetStyle}". A restart is required for this to take effect.`,
            'Restart Now',
            'Later'
        );
        if (action === 'Restart Now') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }
}

/**
 * Command helper to set title bar style directly.
 */
async function setTitleBarStyle(style: 'native' | 'custom'): Promise<void> {
    // Also update our extension setting to stay in sync
    await vscode.workspace.getConfiguration('projectLabel').update(
        'useNativeTitleBar',
        style === 'native',
        vscode.ConfigurationTarget.Global
    );
    await vscode.workspace.getConfiguration('window').update(
        'titleBarStyle',
        style,
        vscode.ConfigurationTarget.Global
    );
    const action = await vscode.window.showInformationMessage(
        `Title bar style set to "${style}". A restart is required.`,
        'Restart Now',
        'Later'
    );
    if (action === 'Restart Now') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

// ── Toggle Helper ────────────────────────────────────────────────

/**
 * Toggle a boolean setting under projectLabel.* and refresh tree view.
 */
async function toggleBoolSetting(key: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('projectLabel');
    const current = config.get<boolean>(key, false);
    await config.update(key, !current, vscode.ConfigurationTarget.Global);
}

// ── Copilot Chat Silence ─────────────────────────────────────────

/** All accessibility.signals keys related to GitHub Copilot Chat */
const COPILOT_CHAT_SIGNALS = [
    'chatEditModifiedFile',
    'chatRequestSent',
    'chatResponseReceived',
    'chatUserActionRequired',
    'editsKept',
    'nextEditSuggestion',
    'codeActionApplied',
    'codeActionTriggered',
    'clear',
    'progress',
] as const;

/**
 * Apply the silenceCopilotChat setting on activation or config change.
 */
async function applyCopilotSilenceSetting(): Promise<void> {
    const silence = vscode.workspace
        .getConfiguration('projectLabel')
        .get<boolean>('silenceCopilotChat', false);

    if (silence) {
        await setCopilotChatSilence(true);
    }
}

/**
 * Set all Copilot Chat related accessibility signals to off or on.
 */
async function setCopilotChatSilence(silent: boolean): Promise<void> {
    const signals = vscode.workspace.getConfiguration('accessibility.signals');
    const value = { sound: silent ? 'off' : 'on' };

    for (const key of COPILOT_CHAT_SIGNALS) {
        await signals.update(key, value, vscode.ConfigurationTarget.Global);
    }

    // Also sync our own setting
    await vscode.workspace.getConfiguration('projectLabel').update(
        'silenceCopilotChat',
        silent,
        vscode.ConfigurationTarget.Global
    );

    vscode.window.showInformationMessage(
        silent
            ? 'Copilot Chat sounds silenced.'
            : 'Copilot Chat sounds restored.'
    );
}

// ── Silence ALL VS Code Sounds ──────────────────────────────────

/** All accessibility.signals keys in VS Code */
const ALL_SOUND_SIGNALS = [
    // Copilot / Chat
    'chatEditModifiedFile', 'chatRequestSent', 'chatResponseReceived',
    'chatUserActionRequired', 'editsKept', 'nextEditSuggestion',
    'codeActionApplied', 'codeActionTriggered', 'clear', 'progress',
    // Editor
    'lineHasBreakpoint', 'lineHasError', 'lineHasFoldedArea',
    'lineHasInlineSuggestion', 'lineHasWarning', 'noInlayHints',
    'onDebugBreak',
    // Tasks
    'taskCompleted', 'taskFailed',
    // Terminal
    'terminalBell', 'terminalCommandFailed', 'terminalCommandSucceeded',
    'terminalQuickFix',
    // Diff
    'diffLineDeleted', 'diffLineInserted', 'diffLineModified',
    // Notebook
    'notebookCellCompleted', 'notebookCellFailed',
    // Voice
    'voiceRecordingStarted', 'voiceRecordingStopped',
    // Save
    'save', 'format',
    // Position
    'positionHasError', 'positionHasWarning',
] as const;

/**
 * Apply the silenceAllSounds setting on activation or config change.
 */
async function applySilenceAllSoundsSetting(): Promise<void> {
    const silence = vscode.workspace
        .getConfiguration('projectLabel')
        .get<boolean>('silenceAllSounds', false);

    if (silence) {
        await setSilenceAllSounds(true);
    }
}

/**
 * Set ALL VS Code accessibility signals to off or on.
 */
async function setSilenceAllSounds(silent: boolean): Promise<void> {
    const signals = vscode.workspace.getConfiguration('accessibility.signals');
    const value = { sound: silent ? 'off' : 'on' };

    // Update ALL signals in parallel so they apply nearly instantly
    // instead of one-by-one (which causes delayed sound notifications).
    await Promise.all(
        ALL_SOUND_SIGNALS.map(key =>
            signals.update(key, value, vscode.ConfigurationTarget.Global)
                .then(undefined, () => { /* signal may not exist — skip */ })
        )
    );

    // Also sync our own setting (wrapped in try/catch — setting may not be
    // registered yet if VS Code hasn't fully reloaded after an upgrade).
    try {
        await vscode.workspace.getConfiguration('projectLabel').update(
            'silenceAllSounds',
            silent,
            vscode.ConfigurationTarget.Global
        );
    } catch {
        // Silently ignore — the actual accessibility.signals writes above
        // already took effect, and the setting will sync on next reload.
    }

    vscode.window.showInformationMessage(
        silent
            ? '🔇 All VS Code sounds silenced.'
            : '🔊 All VS Code sounds restored.'
    );

    updateSoundStatusBar();
}

// ── Sound Status Bar ─────────────────────────────────────────────

function updateSoundStatusBar(): void {
    // Check the actual accessibility.signals state as ground truth,
    // falling back to the projectLabel setting.
    let silent = false;
    try {
        silent = vscode.workspace
            .getConfiguration('projectLabel')
            .get<boolean>('silenceAllSounds', false);
    } catch { /* ignore */ }

    // Double-check: if at least a few key signals are "off", treat as silenced
    // even if projectLabel.silenceAllSounds wasn't persisted.
    try {
        const sig = vscode.workspace.getConfiguration('accessibility.signals');
        const sample = sig.get<{ sound?: string }>('chatResponseReceived');
        if (sample && sample.sound === 'off') {
            silent = true;
        }
    } catch { /* ignore */ }

    if (silent) {
        soundStatusBarItem.text = '$(mute)';
        soundStatusBarItem.tooltip = 'All sounds silenced — click to restore';
        soundStatusBarItem.color = new vscode.ThemeColor('errorForeground');
    } else {
        soundStatusBarItem.text = '$(unmute)';
        soundStatusBarItem.tooltip = 'Sounds enabled — click to silence all';
        soundStatusBarItem.color = undefined;
    }
    soundStatusBarItem.show();
}

export function deactivate(): void {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (soundStatusBarItem) {
        soundStatusBarItem.dispose();
    }
    // Restore original window title
    if (originalWindowTitle !== undefined) {
        vscode.workspace.getConfiguration('window').update(
            'title',
            originalWindowTitle || undefined,
            vscode.ConfigurationTarget.Workspace
        );
    }
}
