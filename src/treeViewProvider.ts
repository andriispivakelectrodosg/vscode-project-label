import * as vscode from 'vscode';

/**
 * Tree view provider for the Project Label sidebar panel.
 * Shows current settings and quick-action buttons in the Explorer sidebar.
 */
export class ProjectLabelTreeProvider implements vscode.TreeDataProvider<SettingItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SettingItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: SettingItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SettingItem): SettingItem[] {
        if (element) {
            return []; // No nesting
        }

        const config = vscode.workspace.getConfiguration('projectLabel');
        const items: SettingItem[] = [];

        // ── Info Section ──
        const folders = vscode.workspace.workspaceFolders;
        const projectName = folders?.[0]?.name ?? 'No Folder';
        const projectPath = folders?.[0]?.uri.fsPath ?? '';

        items.push(new SettingItem(
            `Project: ${projectName}`,
            projectPath || 'No workspace open',
            'symbol-folder',
            { command: 'projectLabel.copyLabel', title: 'Copy Label' }
        ));

        // ── Display toggles ──
        items.push(new SettingItem(
            `Project Name: ${boolIcon(config.get('showProjectName', true))}`,
            'Toggle project name in label',
            'eye',
            { command: 'projectLabel.toggleShowProjectName', title: 'Toggle' }
        ));

        items.push(new SettingItem(
            `Profile: ${boolIcon(config.get('showProfile', true))}`,
            'Toggle profile name in label',
            'person',
            { command: 'projectLabel.toggleShowProfile', title: 'Toggle' }
        ));

        items.push(new SettingItem(
            `Status Bar: ${boolIcon(config.get('showInStatusBar', true))}`,
            'Toggle status bar visibility',
            'layout-statusbar',
            { command: 'projectLabel.toggleShowInStatusBar', title: 'Toggle' }
        ));

        items.push(new SettingItem(
            `Window Title: ${boolIcon(config.get('updateWindowTitle', true))}`,
            'Toggle window title injection',
            'browser',
            { command: 'projectLabel.toggleUpdateWindowTitle', title: 'Toggle' }
        ));

        // ── Title Bar ──
        items.push(new SettingItem(
            `Native Title Bar: ${boolIcon(config.get('useNativeTitleBar', false))}`,
            'Required on Linux to see title text',
            'layout-panel',
            { command: 'projectLabel.toggleNativeTitleBar', title: 'Toggle' }
        ));

        // ── Copilot ──
        items.push(new SettingItem(
            `Copilot Silence: ${boolIcon(config.get('silenceCopilotChat', false))}`,
            'Mute Copilot Chat accessibility sounds',
            'mute',
            { command: 'projectLabel.toggleSilenceCopilot', title: 'Toggle' }
        ));

        // ── All Sounds ──
        items.push(new SettingItem(
            `Silence All Sounds: ${boolIcon(config.get('silenceAllSounds', false))}`,
            'Mute ALL VS Code accessibility sounds',
            'bell-slash',
            { command: 'projectLabel.toggleSilenceAllSounds', title: 'Toggle' }
        ));

        // ── Appearance ──
        const icon = config.get<string>('icon', '$(bracket-dot)');
        const color = config.get<string>('color', '');
        const alignment = config.get<string>('alignment', 'left');

        items.push(new SettingItem(
            `Icon: ${icon || '(none)'}`,
            `Alignment: ${alignment} · Color: ${color || 'theme default'}`,
            'paintcan'
        ));

        // ── Actions separator ──
        items.push(new SettingItem(
            '── Actions ──',
            '',
            'dash',
        ));

        items.push(new SettingItem(
            'Open Settings Panel',
            'Full visual settings editor',
            'settings-gear',
            { command: 'projectLabel.openSettings', title: 'Open Settings' }
        ));

        items.push(new SettingItem(
            'Refresh Label',
            'Re-detect profile and update',
            'refresh',
            { command: 'projectLabel.refresh', title: 'Refresh' }
        ));

        items.push(new SettingItem(
            'Copy Label to Clipboard',
            'Copy current label text',
            'clippy',
            { command: 'projectLabel.copyLabel', title: 'Copy' }
        ));

        return items;
    }
}

function boolIcon(val: boolean): string {
    return val ? '✅' : '⬜';
}

class SettingItem extends vscode.TreeItem {
    constructor(
        label: string,
        description: string,
        icon: string,
        command?: vscode.Command
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(icon);
        if (command) {
            this.command = command;
        }
        this.contextValue = 'projectLabelSetting';
    }
}
