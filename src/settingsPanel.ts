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
                silenceCopilotChat: config.get<boolean>('silenceCopilotChat', false),
            },
        });
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
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border, #444);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --input-border: var(--vscode-input-border, #555);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --accent: var(--vscode-focusBorder);
    --section-bg: var(--vscode-sideBar-background, var(--bg));
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, system-ui);
    font-size: var(--vscode-font-size, 13px);
    color: var(--fg);
    background: var(--bg);
    padding: 20px 32px;
    line-height: 1.5;
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
    border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
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

  /* Toggle switch */
  .toggle {
    position: relative;
    width: 40px;
    height: 22px;
    cursor: pointer;
  }
  .toggle input { display: none; }
  .toggle .slider {
    position: absolute;
    inset: 0;
    background: var(--input-border);
    border-radius: 22px;
    transition: 0.2s;
  }
  .toggle .slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 3px;
    bottom: 3px;
    background: var(--fg);
    border-radius: 50%;
    transition: 0.2s;
  }
  .toggle input:checked + .slider {
    background: var(--accent);
  }
  .toggle input:checked + .slider::before {
    transform: translateX(18px);
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
    background: color-mix(in srgb, var(--fg) 10%, transparent);
  }

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
      <label class="toggle">
        <input type="checkbox" id="showProjectName" data-key="showProjectName">
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Show Profile</span>
      <span class="desc">Display the VS Code profile name in the label</span>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="showProfile" data-key="showProfile">
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="row">
    <div class="row-label">
      <span class="name">Show in Status Bar</span>
      <span class="desc">Display the label in the status bar at the bottom</span>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="showInStatusBar" data-key="showInStatusBar">
        <span class="slider"></span>
      </label>
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
      <span class="desc">Codicon icon before the label (e.g. $(bracket-dot), $(folder))</span>
    </div>
    <div class="row-control">
      <input type="text" id="icon" data-key="icon" placeholder="$(bracket-dot)">
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
      <label class="toggle">
        <input type="checkbox" id="updateWindowTitle" data-key="updateWindowTitle">
        <span class="slider"></span>
      </label>
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
      <label class="toggle">
        <input type="checkbox" id="useNativeTitleBar" data-key="useNativeTitleBar">
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="btn-row">
    <button onclick="runCommand('projectLabel.enableNativeTitleBar')">Enable Native Title Bar</button>
    <button class="btn-secondary" onclick="runCommand('projectLabel.disableNativeTitleBar')">Restore Custom Title Bar</button>
  </div>
</div>

<!-- ── Copilot Section ──────────────── -->
<div class="section">
  <h2>🤖 GitHub Copilot</h2>

  <div class="row">
    <div class="row-label">
      <span class="name">Silence Copilot Chat Sounds</span>
      <span class="desc">Mute all GitHub Copilot Chat accessibility sound notifications</span>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="silenceCopilotChat" data-key="silenceCopilotChat">
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="btn-row">
    <button onclick="runCommand('projectLabel.silenceCopilot')">🔇 Silence Now</button>
    <button class="btn-secondary" onclick="runCommand('projectLabel.unsilenceCopilot')">🔊 Restore Sounds</button>
  </div>
</div>

<!-- ── Actions ──────────────────────── -->
<div class="section">
  <h2>⚡ Actions</h2>
  <div class="btn-row">
    <button onclick="runCommand('projectLabel.refresh')">🔄 Refresh Label</button>
    <button onclick="runCommand('projectLabel.copyLabel')">📋 Copy Label</button>
    <button class="btn-secondary" onclick="runCommand('workbench.action.openSettings', 'projectLabel')">Open JSON Settings</button>
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
  });

  function applySettings(s) {
    setCheck('showProjectName', s.showProjectName);
    setCheck('showProfile', s.showProfile);
    setCheck('showInStatusBar', s.showInStatusBar);
    setCheck('updateWindowTitle', s.updateWindowTitle);
    setCheck('useNativeTitleBar', s.useNativeTitleBar);
    setCheck('silenceCopilotChat', s.silenceCopilotChat);

    setValue('customLabel', s.customLabel);
    setValue('separator', s.separator);
    setValue('icon', s.icon);
    setValue('color', s.color);
    setValue('priority', s.priority);
    setValue('titleTemplate', s.titleTemplate);

    setSelect('alignment', s.alignment);

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

  // Bind toggles
  document.querySelectorAll('.toggle input[type="checkbox"]').forEach(el => {
    el.addEventListener('change', () => {
      sendUpdate(el.dataset.key, el.checked);
    });
  });

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
