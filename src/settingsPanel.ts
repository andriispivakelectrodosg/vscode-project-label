import * as vscode from 'vscode';

export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static show(extensionUri: vscode.Uri): void {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            SettingsPanel.currentPanel._update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'projectLabelSettings',
            'Project Label Settings',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri],
            }
        );

        SettingsPanel.currentPanel = new SettingsPanel(panel);
    }

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (msg) => {
                switch (msg.type) {
                    case 'updateSetting': {
                        const config = vscode.workspace.getConfiguration('projectLabel');
                        await config.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
                        break;
                    }
                    case 'runCommand': {
                        vscode.commands.executeCommand(msg.command);
                        break;
                    }
                    case 'updateSignal': {
                        const signals = vscode.workspace.getConfiguration('accessibility.signals');
                        const val = { sound: msg.value ? 'off' : 'on' };
                        try {
                            await signals.update(msg.signal, val, vscode.ConfigurationTarget.Global);
                        } catch { /* signal may not exist */ }
                        break;
                    }
                    case 'silenceAll': {
                        const cmd = msg.value
                            ? 'projectLabel.silenceAllSounds'
                            : 'projectLabel.unsilenceAllSounds';
                        await vscode.commands.executeCommand(cmd);
                        // All parallel writes are done — cancel any pending
                        // debounce and send final states immediately.
                        if (this._signalDebounce) {
                            clearTimeout(this._signalDebounce);
                            this._signalDebounce = undefined;
                        }
                        this._doSendSignalStates();
                        break;
                    }
                    case 'requestSignals': {
                        this._sendSignalStates();
                        break;
                    }
                    case 'requestSettings': {
                        this._sendCurrentSettings();
                        break;
                    }
                }
            },
            null,
            this._disposables
        );

        // Re-send when config changes
        vscode.workspace.onDidChangeConfiguration(
            (e) => {
                if (e.affectsConfiguration('projectLabel')) {
                    this._sendCurrentSettings();
                }
                if (e.affectsConfiguration('accessibility.signals')) {
                    this._sendSignalStates();
                }
            },
            null,
            this._disposables
        );
    }

    private _sendCurrentSettings(): void {
        const config = vscode.workspace.getConfiguration('projectLabel');
        this._panel.webview.postMessage({
            type: 'settingsUpdate',
            settings: {
                showProjectName: config.get<boolean>('showProjectName', true),
                showProfile: config.get<boolean>('showProfile', true),
                separator: config.get<string>('separator', ' | '),
                customLabel: config.get<string>('customLabel', ''),
                alignment: config.get<string>('alignment', 'left'),
                priority: config.get<number>('priority', 1000),
                color: config.get<string>('color', ''),
                icon: config.get<string>('icon', '$(bracket-dot)'),
                updateWindowTitle: config.get<boolean>('updateWindowTitle', true),
                showInStatusBar: config.get<boolean>('showInStatusBar', true),
                titleTemplate: config.get<string>('titleTemplate',
                    '[${label}] ${activeEditorShort}${separator}${rootName}'),
                useNativeTitleBar: config.get<boolean>('useNativeTitleBar', false),
                silenceAllSounds: config.get<boolean>('silenceAllSounds', false),
            },
        });
        this._sendSignalStates();
    }

    private static readonly ALL_SIGNALS = [
        'chatEditModifiedFile', 'chatRequestSent', 'chatResponseReceived',
        'chatUserActionRequired', 'editsKept', 'nextEditSuggestion',
        'codeActionApplied', 'codeActionTriggered', 'clear', 'progress',
        'lineHasBreakpoint', 'lineHasError', 'lineHasFoldedArea',
        'lineHasInlineSuggestion', 'lineHasWarning', 'noInlayHints',
        'onDebugBreak', 'taskCompleted', 'taskFailed',
        'terminalBell', 'terminalCommandFailed', 'terminalCommandSucceeded',
        'terminalQuickFix', 'diffLineDeleted', 'diffLineInserted',
        'diffLineModified', 'notebookCellCompleted', 'notebookCellFailed',
        'voiceRecordingStarted', 'voiceRecordingStopped',
        'save', 'format', 'positionHasError', 'positionHasWarning',
    ];

    private _signalDebounce: ReturnType<typeof setTimeout> | undefined;

    /**
     * Debounced: waits 300ms after the last call before actually reading
     * and posting signal states.  This prevents 30+ intermediate broadcasts
     * when setSilenceAllSounds() loops through every signal.
     */
    private _sendSignalStates(): void {
        if (this._signalDebounce) {
            clearTimeout(this._signalDebounce);
        }
        this._signalDebounce = setTimeout(() => {
            this._doSendSignalStates();
        }, 300);
    }

    private _doSendSignalStates(): void {
        const signals = vscode.workspace.getConfiguration('accessibility.signals');
        const states: Record<string, boolean> = {};
        for (const key of SettingsPanel.ALL_SIGNALS) {
            const val = signals.get<{ sound?: string }>(key);
            // checked = muted (sound === 'off')
            states[key] = val?.sound === 'off';
        }
        this._panel.webview.postMessage({ type: 'signalStates', states });
    }

    private _update(): void {
        this._panel.title = 'Project Label Settings';
        this._panel.webview.html = this._getHtml();
        // Send settings after a small delay so the webview is ready
        setTimeout(() => this._sendCurrentSettings(), 200);
    }

    private _getHtml(): string {
        const nonce = getNonce();
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Project Label Settings</title>
<style nonce="${nonce}">
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --fg: var(--vscode-editor-foreground, #cccccc);
    --border: var(--vscode-panel-border, #444);
    --input-bg: var(--vscode-input-background, #3c3c3c);
    --input-fg: var(--vscode-input-foreground, #cccccc);
    --input-border: var(--vscode-input-border, #555);
    --btn-bg: var(--vscode-button-background, #0e639c);
    --btn-fg: var(--vscode-button-foreground, #ffffff);
    --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
    --accent: var(--vscode-focusBorder, #007fd4);
    --section-bg: var(--vscode-sideBar-background, #252526);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html {
    min-height: 100vh;
    width: 100%;
    background: var(--bg);
  }
  body {
    font-family: var(--vscode-font-family, system-ui);
    font-size: var(--vscode-font-size, 13px);
    color: var(--fg);
    background: var(--bg);
    padding: 20px 32px;
    line-height: 1.5;
    min-height: 100vh;
    width: 100%;
  }
  h1 {
    font-size: 1.6em;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h1 .icon { font-size: 1.3em; }
  .subtitle {
    opacity: 0.7;
    margin-bottom: 24px;
    font-size: 0.95em;
  }
  .section {
    background: var(--section-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px 20px;
    margin-bottom: 16px;
  }
  .section h2 {
    font-size: 1.15em;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  }
  .row:last-child { border-bottom: none; }
  .row-label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row-label .name { font-weight: 600; }
  .row-label .desc { opacity: 0.65; font-size: 0.9em; }
  .row-control { flex-shrink: 0; margin-left: 16px; }

  /* Checkbox */
  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--accent);
  }

  /* Inputs */
  input[type="text"], input[type="number"], select {
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.95em;
    font-family: inherit;
    width: 220px;
  }
  input[type="color"] {
    width: 36px;
    height: 28px;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    background: var(--input-bg);
    cursor: pointer;
    padding: 2px;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .color-row input[type="text"] {
    width: 140px;
  }

  /* Buttons */
  button {
    background: var(--btn-bg);
    color: var(--btn-fg);
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    font-size: 0.95em;
    cursor: pointer;
    transition: background 0.15s;
  }
  button:hover { background: var(--btn-hover); }
  .btn-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
  }
  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .sound-group {
    font-size: 0.95em;
    margin: 12px 0 4px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
    opacity: 0.85;
  }
  .sound-group:first-of-type { margin-top: 8px; }
  .signal-cb { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }

  /* Live preview */
  .preview-bar {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--vscode-statusBar-background, #007acc);
    color: var(--vscode-statusBar-foreground, #fff);
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.95em;
    margin-top: 8px;
  }
</style>
</head>
<body>

<h1><span class="icon">⚙️</span> Project Label Settings</h1>
<p class="subtitle">Configure how project name and profile are displayed in VS Code</p>

<!-- ── Display Section ──────────────── -->
<div class="section">
  <h2>🏷️ Display</h2>

  <div class="row">
    <div class="row-label">
      <span class="name">Show Project Name</span>
      <span class="desc">Display the workspace folder name in the label</span>
    </div>
    <div class="row-control">
      <input type="checkbox" id="showProjectName" data-key="showProjectName">
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Show Profile</span>
      <span class="desc">Display the VS Code profile name in the label</span>
    </div>
    <div class="row-control">
      <input type="checkbox" id="showProfile" data-key="showProfile">
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Show in Status Bar</span>
      <span class="desc">Display the label in the status bar at the bottom</span>
    </div>
    <div class="row-control">
      <input type="checkbox" id="showInStatusBar" data-key="showInStatusBar">
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Custom Label</span>
      <span class="desc">Override with a custom label (leave empty for auto)</span>
    </div>
    <div class="row-control">
      <input type="text" id="customLabel" data-key="customLabel" placeholder="e.g. My Project">
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Separator</span>
      <span class="desc">Text between project name and profile</span>
    </div>
    <div class="row-control">
      <input type="text" id="separator" data-key="separator" placeholder=" | ">
    </div>
  </div>

  <div class="row" style="border-bottom:none; padding-bottom:0">
    <div class="row-label">
      <span class="name">Preview</span>
    </div>
  </div>
  <div class="preview-bar" id="previewBar">$(bracket-dot) Loading…</div>
</div>

<!-- ── Appearance Section ───────────── -->
<div class="section">
  <h2>🎨 Appearance</h2>

  <div class="row">
    <div class="row-label">
      <span class="name">Icon</span>
      <span class="desc">Codicon icon displayed before the label</span>
    </div>
    <div class="row-control">
      <select id="icon" data-key="icon">
        <option value="$(bracket-dot)">$(bracket-dot) — Code</option>
        <option value="$(folder)">$(folder) — Folder</option>
        <option value="$(account)">$(account) — Profile</option>
        <option value="$(rocket)">$(rocket) — Rocket</option>
        <option value="$(zap)">$(zap) — Lightning</option>
        <option value="$(heart)">$(heart) — Heart</option>
        <option value="$(star-full)">$(star-full) — Star</option>
        <option value="$(home)">$(home) — Home</option>
        <option value="$(terminal)">$(terminal) — Terminal</option>
        <option value="$(globe)">$(globe) — Globe</option>
        <option value="$(beaker)">$(beaker) — Beaker</option>
        <option value="$(tools)">$(tools) — Tools</option>
        <option value="$(shield)">$(shield) — Shield</option>
        <option value="$(tag)">$(tag) — Tag</option>
        <option value="$(eye)">$(eye) — Eye</option>
        <option value="">(none) — No icon</option>
      </select>
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Label Color</span>
      <span class="desc">Status bar label color (hex, e.g. #b87333)</span>
    </div>
    <div class="row-control">
      <div class="color-row">
        <input type="color" id="colorPicker" value="#ffffff">
        <input type="text" id="color" data-key="color" placeholder="#b87333 or empty">
      </div>
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Alignment</span>
      <span class="desc">Position in the status bar</span>
    </div>
    <div class="row-control">
      <select id="alignment" data-key="alignment">
        <option value="left">Left</option>
        <option value="right">Right</option>
      </select>
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Priority</span>
      <span class="desc">Higher = further left in status bar</span>
    </div>
    <div class="row-control">
      <input type="number" id="priority" data-key="priority" min="0" max="10000" step="100">
    </div>
  </div>
</div>

<!-- ── Title Bar Section ────────────── -->
<div class="section">
  <h2>📐 Title Bar</h2>

  <div class="row">
    <div class="row-label">
      <span class="name">Update Window Title</span>
      <span class="desc">Inject project label into VS Code window title</span>
    </div>
    <div class="row-control">
      <input type="checkbox" id="updateWindowTitle" data-key="updateWindowTitle">
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Title Template</span>
      <span class="desc">Window title template. Use \${label} for the project label</span>
    </div>
    <div class="row-control">
      <input type="text" id="titleTemplate" data-key="titleTemplate"
        placeholder="[&dollar;{label}] &dollar;{activeEditorShort}&dollar;{separator}&dollar;{rootName}">
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Use Native Title Bar</span>
      <span class="desc">Required on Linux to see window title text. Requires restart.</span>
    </div>
    <div class="row-control">
      <input type="checkbox" id="useNativeTitleBar" data-key="useNativeTitleBar">
    </div>
  </div>

</div>

<!-- ── Sound Control Section ─────────────── -->
<div class="section">
  <h2>🔇 Sound Control</h2>

  <div class="row" style="border-bottom: 2px solid var(--accent, #007fd4); padding-bottom: 10px; margin-bottom: 6px;">
    <div class="row-label">
      <span class="name">✅ Silence ALL Sounds</span>
      <span class="desc">Master switch — mute/unmute every sound signal at once</span>
    </div>
    <div class="row-control">
      <input type="checkbox" id="silenceAllSounds">
    </div>
  </div>

  <h3 class="sound-group">🤖 Copilot / Chat</h3>
  <div class="row"><div class="row-label"><span class="name">Chat Request Sent</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="chatRequestSent"></div></div>
  <div class="row"><div class="row-label"><span class="name">Chat Response Received</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="chatResponseReceived"></div></div>
  <div class="row"><div class="row-label"><span class="name">Chat User Action Required</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="chatUserActionRequired"></div></div>
  <div class="row"><div class="row-label"><span class="name">Chat Edit Modified File</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="chatEditModifiedFile"></div></div>
  <div class="row"><div class="row-label"><span class="name">Edits Kept</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="editsKept"></div></div>
  <div class="row"><div class="row-label"><span class="name">Next Edit Suggestion</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="nextEditSuggestion"></div></div>
  <div class="row"><div class="row-label"><span class="name">Code Action Applied</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="codeActionApplied"></div></div>
  <div class="row"><div class="row-label"><span class="name">Code Action Triggered</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="codeActionTriggered"></div></div>
  <div class="row"><div class="row-label"><span class="name">Clear</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="clear"></div></div>
  <div class="row"><div class="row-label"><span class="name">Progress</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="progress"></div></div>

  <h3 class="sound-group">✏️ Editor</h3>
  <div class="row"><div class="row-label"><span class="name">Line Has Error</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="lineHasError"></div></div>
  <div class="row"><div class="row-label"><span class="name">Line Has Warning</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="lineHasWarning"></div></div>
  <div class="row"><div class="row-label"><span class="name">Line Has Breakpoint</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="lineHasBreakpoint"></div></div>
  <div class="row"><div class="row-label"><span class="name">Line Has Folded Area</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="lineHasFoldedArea"></div></div>
  <div class="row"><div class="row-label"><span class="name">Line Has Inline Suggestion</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="lineHasInlineSuggestion"></div></div>
  <div class="row"><div class="row-label"><span class="name">No Inlay Hints</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="noInlayHints"></div></div>
  <div class="row"><div class="row-label"><span class="name">On Debug Break</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="onDebugBreak"></div></div>
  <div class="row"><div class="row-label"><span class="name">Position Has Error</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="positionHasError"></div></div>
  <div class="row"><div class="row-label"><span class="name">Position Has Warning</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="positionHasWarning"></div></div>

  <h3 class="sound-group">✅ Tasks</h3>
  <div class="row"><div class="row-label"><span class="name">Task Completed</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="taskCompleted"></div></div>
  <div class="row"><div class="row-label"><span class="name">Task Failed</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="taskFailed"></div></div>

  <h3 class="sound-group">💻 Terminal</h3>
  <div class="row"><div class="row-label"><span class="name">Terminal Bell</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="terminalBell"></div></div>
  <div class="row"><div class="row-label"><span class="name">Terminal Command Failed</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="terminalCommandFailed"></div></div>
  <div class="row"><div class="row-label"><span class="name">Terminal Command Succeeded</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="terminalCommandSucceeded"></div></div>
  <div class="row"><div class="row-label"><span class="name">Terminal Quick Fix</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="terminalQuickFix"></div></div>

  <h3 class="sound-group">🔀 Diff</h3>
  <div class="row"><div class="row-label"><span class="name">Diff Line Deleted</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="diffLineDeleted"></div></div>
  <div class="row"><div class="row-label"><span class="name">Diff Line Inserted</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="diffLineInserted"></div></div>
  <div class="row"><div class="row-label"><span class="name">Diff Line Modified</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="diffLineModified"></div></div>

  <h3 class="sound-group">📓 Notebook</h3>
  <div class="row"><div class="row-label"><span class="name">Notebook Cell Completed</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="notebookCellCompleted"></div></div>
  <div class="row"><div class="row-label"><span class="name">Notebook Cell Failed</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="notebookCellFailed"></div></div>

  <h3 class="sound-group">🎤 Voice</h3>
  <div class="row"><div class="row-label"><span class="name">Voice Recording Started</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="voiceRecordingStarted"></div></div>
  <div class="row"><div class="row-label"><span class="name">Voice Recording Stopped</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="voiceRecordingStopped"></div></div>

  <h3 class="sound-group">💾 Save / Format</h3>
  <div class="row"><div class="row-label"><span class="name">Save</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="save"></div></div>
  <div class="row"><div class="row-label"><span class="name">Format</span></div><div class="row-control"><input type="checkbox" class="signal-cb" data-signal="format"></div></div>

</div>
<!-- ── Actions ──────────────────────── -->
<div class="section">
  <h2>⚡ Actions</h2>
  <div class="btn-row">
    <button data-command="projectLabel.refresh">🔄 Refresh Label</button>
    <button data-command="projectLabel.copyLabel">📋 Copy Label</button>
    <button class="btn-secondary" data-command="workbench.action.openSettings" data-args="projectLabel">Open JSON Settings</button>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let currentSettings = {};

  // ── Receive settings from extension ──
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'settingsUpdate') {
      currentSettings = msg.settings;
      applySettings(msg.settings);
    }
    if (msg.type === 'signalStates') {
      applySignalStates(msg.states);
    }
  });

  function applySettings(s) {
    setCheck('showProjectName', s.showProjectName);
    setCheck('showProfile', s.showProfile);
    setCheck('showInStatusBar', s.showInStatusBar);
    setCheck('updateWindowTitle', s.updateWindowTitle);
    setCheck('useNativeTitleBar', s.useNativeTitleBar);
    // Master "Silence ALL" checkbox is driven by signal states only
    // (see applySignalStates / syncMasterCheckbox) — do NOT set it here
    // to avoid fighting with the debounced signal state broadcast.

    setValue('customLabel', s.customLabel);
    setValue('separator', s.separator);
    setValue('color', s.color);
    setValue('priority', s.priority);
    setValue('titleTemplate', s.titleTemplate);

    setSelect('alignment', s.alignment);
    setSelect('icon', s.icon);

    // Sync color picker
    if (s.color && s.color.startsWith('#') && s.color.length === 7) {
      document.getElementById('colorPicker').value = s.color;
    }

    updatePreview(s);
  }

  function setCheck(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  }
  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  }
  function setSelect(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  }

  function updatePreview(s) {
    const parts = [];
    if (s.customLabel) {
      parts.push(s.customLabel);
    } else {
      if (s.showProjectName) parts.push('MyProject');
      if (s.showProfile) parts.push('Profile');
    }
    const label = parts.join(s.separator || ' | ');
    const icon = s.icon || '';
    const bar = document.getElementById('previewBar');
    bar.textContent = icon ? icon + ' ' + label : label;
    bar.style.color = (s.color && s.color.startsWith('#')) ? s.color : '';
  }

  // ── Send changes back to extension ──
  function sendUpdate(key, value) {
    vscode.postMessage({ type: 'updateSetting', key, value });
  }

  function runCommand(cmd) {
    vscode.postMessage({ type: 'runCommand', command: cmd });
  }

  // Bind checkboxes (generic settings)
  document.querySelectorAll('input[type="checkbox"][data-key]').forEach(el => {
    el.addEventListener('change', () => {
      sendUpdate(el.dataset.key, el.checked);
    });
  });

  // Bind master "Silence ALL" checkbox (no data-key — uses dedicated handler)
  const masterCb = document.getElementById('silenceAllSounds');
  if (masterCb) {
    masterCb.addEventListener('change', () => {
      const silent = masterCb.checked;
      // Visually toggle every signal checkbox immediately
      document.querySelectorAll('.signal-cb').forEach(cb => { cb.checked = silent; });
      // Tell the extension to run the silence/unsilence command
      vscode.postMessage({ type: 'silenceAll', value: silent });
    });
  }

  // Bind individual signal checkboxes
  document.querySelectorAll('.signal-cb').forEach(el => {
    el.addEventListener('change', () => {
      vscode.postMessage({ type: 'updateSignal', signal: el.dataset.signal, value: el.checked });
      // Sync master checkbox: checked only if ALL signals are checked
      syncMasterCheckbox();
    });
  });

  function syncMasterCheckbox() {
    const all = document.querySelectorAll('.signal-cb');
    const allChecked = Array.from(all).every(cb => cb.checked);
    if (masterCb) masterCb.checked = allChecked;
  }

  function applySignalStates(states) {
    document.querySelectorAll('.signal-cb').forEach(el => {
      const key = el.dataset.signal;
      if (key && states[key] !== undefined) {
        el.checked = states[key];
      }
    });
    syncMasterCheckbox();
  }

  // Bind text/number inputs (debounced)
  let debounceTimers = {};
  document.querySelectorAll('input[type="text"][data-key], input[type="number"][data-key]').forEach(el => {
    el.addEventListener('input', () => {
      clearTimeout(debounceTimers[el.id]);
      debounceTimers[el.id] = setTimeout(() => {
        let val = el.type === 'number' ? Number(el.value) : el.value;
        sendUpdate(el.dataset.key, val);
      }, 400);
    });
  });

  // Bind select
  document.querySelectorAll('select[data-key]').forEach(el => {
    el.addEventListener('change', () => {
      sendUpdate(el.dataset.key, el.value);
    });
  });

  // Sync color picker ↔ text input
  document.getElementById('colorPicker').addEventListener('input', (e) => {
    document.getElementById('color').value = e.target.value;
    sendUpdate('color', e.target.value);
  });

  // Bind all buttons with data-command attribute
  document.querySelectorAll('button[data-command]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-command');
      const args = btn.getAttribute('data-args');
      if (cmd) {
        vscode.postMessage({ type: 'runCommand', command: cmd, args: args || undefined });
      }
    });
  });

  // Request initial settings
  vscode.postMessage({ type: 'requestSettings' });
</script>
</body>
</html>`;
    }

    public dispose(): void {
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            d?.dispose();
        }
    }
}

function getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
