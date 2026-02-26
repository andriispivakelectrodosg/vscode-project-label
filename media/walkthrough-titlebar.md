# Title Bar Setup

Project Label can inject your label into the VS Code **window title bar**.

## How It Works

The extension sets `window.title` to a template containing your label, e.g.:

```
[my-project | Dev] extension.ts — my-project
```

## Linux Users — Important!

On Linux with the default **custom title bar**, VS Code draws its own title bar and the OS title doesn't show. You need the **native title bar** to see the label text.

### Enable Native Title Bar

1. Run command: `Project Label: Enable Native Title Bar (Linux)`
2. Or toggle in the sidebar panel
3. **Restart VS Code** when prompted

### Title Template

Customize the title format using VS Code variables:

| Variable | Description |
|----------|------------|
| `${label}` | Your project label |
| `${activeEditorShort}` | Current file name |
| `${rootName}` | Workspace folder name |
| `${separator}` | Conditional separator |
| `${dirty}` | Unsaved changes indicator |

Default: `[${label}] ${activeEditorShort}${separator}${rootName}`
