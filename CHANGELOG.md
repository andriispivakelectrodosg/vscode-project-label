# Changelog

All notable changes to the **Project Label** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.4] - 2026-02-26

### Fixed

- **Master "Silence ALL" checkbox** now correctly toggles every individual signal checkbox (visual + backend).
- **Status bar sound button** no longer shows "not a registered configuration" error — `setSilenceAllSounds` now wraps the config write in try/catch.
- **Sound status bar** now cross-checks actual `accessibility.signals` state as ground truth.
- Individual signal checkbox changes sync the master checkbox state (checked only when all are checked).

### Changed

- Master checkbox sends dedicated `silenceAll` message instead of generic `updateSetting`.
- Removed stale extension versions (0.1.0, 0.4.1, 0.4.2) that could interfere with setting registration.

## [0.5.3] - 2026-02-26

### Added

- **Individual sound signal controls** — settings panel now shows every `accessibility.signals.*` key grouped by category (Copilot/Chat, Editor, Tasks, Terminal, Diff, Notebook, Voice, Save/Format).
- **Master "Silence ALL Sounds" checkbox** at the top of the Sound Control section with a visual separator.
- Real-time sync: toggling any individual signal checkbox writes directly to `accessibility.signals.<key>.sound`.

### Changed

- Merged old separate "GitHub Copilot" and "Sound Control" sections into a single unified **Sound Control** section.
- `toggleSilenceAllSounds` command now calls `setSilenceAllSounds()` directly instead of `toggleBoolSetting()`, fixing the "not a registered configuration" error.

### Removed

- Removed standalone "Silence Copilot Chat Sounds" checkbox (individual Copilot signals now available in the grouped list).

## [0.5.2] - 2026-02-26

### Added

- **Sound status icon in status bar** — shows `$(unmute)` when sounds are on, `$(mute)` (red) when silenced. Click to toggle.

### Changed

- Replaced fancy toggle switches with **plain native checkboxes** for reliable rendering in webview.
- Removed all custom toggle CSS and inline JS color logic.

## [0.5.1] - 2026-02-26

### Fixed

- **Broken `setCheck` function** — previous edit mangled the function definition, preventing settings from loading into the panel.
- **Removed redundant Sound Control buttons** — toggle already reflects and controls the state; static buttons were confusing.
- **Background fills entire viewport** — `html` and `body` now use `min-height: 100vh` so background covers the full webview.
- **Toggle colors applied via inline JS** — immune to VS Code webview style injection. Green (#4caf50) ON, red (#f44336) OFF now guaranteed visible.

## [0.5.0] - 2026-02-26

### Added

- **Silence ALL Sounds** — new setting, toggle, and buttons to mute/restore every VS Code accessibility sound signal (30+ signals: editor, terminal, tasks, diff, notebook, voice, Copilot, etc.).
- New commands: `Silence All VS Code Sounds`, `Restore All VS Code Sounds`, `Toggle Silence All Sounds`.
- Separate **Sound Control** section in Settings Panel with toggle + action buttons.
- New quick toggle in sidebar tree view: `Silence All Sounds`.

### Fixed

- **Settings page background** — added solid color fallbacks for all CSS variables so the background renders correctly in webview.
- **Toggle switch colors** — added `!important` to ensure green (#4caf50) ON and red (#f44336) OFF colors override webview defaults.
- Replaced unsupported `color-mix()` CSS function with `rgba()` fallbacks for row borders and button hover.

## [0.4.2] - 2026-02-26

### Changed

- Toggle switches now use **green** (#4caf50) for ON and **red** (#f44336) for OFF with white knob.
- Icon selector changed from free-text input to **dropdown** with 16 predefined codicon options.

### Removed

- Redundant "Enable/Disable" button pairs under Title Bar and Copilot sections — toggles already reflect and control the state.

## [0.4.1] - 2026-02-26

### Fixed

- Buttons in Settings Panel webview were non-functional due to CSP blocking inline `onclick` handlers.
- Replaced all inline event handlers with `data-command` attributes and `addEventListener` in nonce'd script block.

## [0.4.0] - 2026-02-26

### Added

- **Settings Panel** — full webview UI with toggle switches, color picker, live preview, and action buttons. Open via `Project Label: Open Settings Panel` command.
- **Sidebar Tree View** — Activity Bar panel (`$(bracket-dot)` icon) with quick toggles for all boolean settings, project info, and action shortcuts.
- **Walkthrough** — 5-step "Get Started" guide (Help → Get Started → Project Label) covering display, appearance, title bar, and Copilot silence.
- Official VS Code logo as extension icon.
- Toggle commands for all boolean settings (`toggleShowProjectName`, `toggleShowProfile`, `toggleShowInStatusBar`, `toggleUpdateWindowTitle`, `toggleNativeTitleBar`, `toggleSilenceCopilot`).
- Menu actions in sidebar title bar (settings gear, refresh).
- Activation event `onView:projectLabelView` for sidebar.

## [0.3.0] - 2026-02-26

### Added

- **Native Title Bar toggle** — `projectLabel.useNativeTitleBar` setting switches `window.titleBarStyle` between "native" and "custom". Required on Linux to see window title text. Prompts for restart.
- Commands: `Project Label: Enable Native Title Bar (Linux)`, `Project Label: Restore Custom Title Bar`.
- **Copilot Chat Silence** — `projectLabel.silenceCopilotChat` setting mutes 10 `accessibility.signals` related to GitHub Copilot Chat (chatRequestSent, chatResponseReceived, chatUserActionRequired, chatEditModifiedFile, editsKept, nextEditSuggestion, codeActionApplied, codeActionTriggered, clear, progress).
- Commands: `Project Label: Silence Copilot Chat Sounds`, `Project Label: Restore Copilot Chat Sounds`.
- Auto-applies silence setting on activation when enabled.

## [0.2.0] - 2026-02-26

### Added

- Rich **Markdown tooltip** popup showing project name, full path, and profile name.
- Changed default icon to `$(bracket-dot)`.
- `projectLabel.showInStatusBar` — toggle status bar visibility independently.
- `projectLabel.titleTemplate` — customizable window title template with `${label}` variable.

### Changed

- `projectLabel.updateWindowTitle` default changed to `true`.
- Icon fallback in source updated to match `$(bracket-dot)` default.

## [0.1.0] - 2026-02-26

### Added

- Status bar item showing current project/workspace folder name.
- Profile name detection via `globalStorageUri` path parsing against `profiles.json`.
- Configurable settings:
  - `projectLabel.showProjectName` — toggle project name display.
  - `projectLabel.showProfile` — toggle profile name display.
  - `projectLabel.separator` — separator between project and profile.
  - `projectLabel.customLabel` — override with a fixed label.
  - `projectLabel.alignment` — left or right status bar placement.
  - `projectLabel.priority` — ordering priority in the status bar.
  - `projectLabel.color` — hex color or theme color token.
  - `projectLabel.icon` — codicon prefix (e.g., `$(folder)`).
  - `projectLabel.updateWindowTitle` — optionally prepend label to window title.
- Commands:
  - `Project Label: Refresh` — force re-detect project and profile.
  - `Project Label: Copy Label to Clipboard` — copy current label text (also triggered by clicking the status bar item).
- Cross-platform support (Linux, macOS, Windows).
