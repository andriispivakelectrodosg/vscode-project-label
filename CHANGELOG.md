# Changelog

All notable changes to the **Project Label** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
