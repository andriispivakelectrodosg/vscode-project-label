# Silence Copilot Chat

Mute all GitHub Copilot Chat accessibility sound notifications with a single toggle.

## What Gets Silenced

| Signal | Description |
|--------|------------|
| `chatRequestSent` | Sound when sending a chat message |
| `chatResponseReceived` | Sound when response arrives |
| `chatUserActionRequired` | Sound for required actions |
| `chatEditModifiedFile` | Sound when chat edits a file |
| `editsKept` | Sound when edits are accepted |
| `nextEditSuggestion` | Sound for next edit suggestion |
| `codeActionApplied` | Sound for applied code actions |
| `codeActionTriggered` | Sound for triggered code actions |
| `clear` | Sound on clear |
| `progress` | Progress indicator sound |

## How to Use

- **Silence**: Run `Project Label: Silence Copilot Chat Sounds` or toggle in the sidebar
- **Restore**: Run `Project Label: Restore Copilot Chat Sounds`
- **Auto-apply**: Enable `projectLabel.silenceCopilotChat` in settings — silences on every startup

## What It Does

Sets `accessibility.signals.<signal>.sound` to `"off"` for all Copilot-related signals globally.
