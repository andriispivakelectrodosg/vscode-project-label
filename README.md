# Project Label

A lightweight VS Code extension that displays the current **project name** and/or **VS Code profile** in the status bar, so you always know which workspace and profile you're working in.

## Features

- Shows project folder name in the status bar
- Detects and shows the active VS Code profile name
- Configurable: choose to show project, profile, or both
- Customizable icon, color, alignment, and separator
- Click to copy the label to clipboard
- Optionally prepend label to the window title bar

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `projectLabel.showProjectName` | `true` | Show project/workspace folder name |
| `projectLabel.showProfile` | `true` | Show VS Code profile name |
| `projectLabel.separator` | `" \| "` | Separator between project and profile |
| `projectLabel.customLabel` | `""` | Override with a custom label |
| `projectLabel.alignment` | `"left"` | Status bar position (`left` or `right`) |
| `projectLabel.priority` | `1000` | Priority (higher = more to the left) |
| `projectLabel.color` | `""` | Text color (hex or theme color token) |
| `projectLabel.icon` | `"$(folder)"` | Codicon icon prefix |
| `projectLabel.updateWindowTitle` | `false` | Prepend label to window title |

## Commands

- **Project Label: Refresh** — Force re-detect project and profile
- **Project Label: Copy Label to Clipboard** — Copy current label text

## Installation

Install from `.vsix` file:

```
code --install-extension project-label-0.1.0.vsix
```

Or via VS Code: Extensions sidebar → `...` menu → **Install from VSIX...**

## License

MIT
