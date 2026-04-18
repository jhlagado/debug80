# ADR 0001: Project (workspace root) control — button + Quick Pick

## Status

Accepted (2026-04-18)

## Context

The Debug80 platform panel header shows **Project** (active workspace root), **Target** (inline `<select>` from `debug80.json`), and **Platform**. **Target** and **Platform** are narrow, enumerable lists suited to a native dropdown in the webview.

**Project** is different: it selects a **VS Code workspace folder** (multi-root workspace), not a field inside the current config file. The webview cannot list or switch arbitrary workspace roots without extension support; the extension must validate the choice against `vscode.workspace.workspaceFolders` and persist the selection (`WorkspaceSelectionController`, `debug80.selectedWorkspace`).

Relevant lifecycle cases:

| Situation | Behaviour today |
|-----------|-----------------|
| No workspace folders | Project button shows **Open Folder** and triggers create/open flow (`project-root-button.ts` empty state). |
| Single root | Button shows that root’s name; click still routes through `selectProject` / `debug80.selectWorkspaceFolder` (no Quick Pick needed). |
| Multiple roots | Click opens **Quick Pick** with name, path, and whether each root has a `debug80.json` (`WorkspaceSelectionController.selectWorkspaceFolder`). |
| Workspace folders added/removed | `onDidChangeWorkspaceFolders` reapplies preferred selection; stale stored path falls back. |
| Switch root while a Z80 session is running | `debug80.selectWorkspaceFolder` may stop and restart debugging when the resolved project config path changes (`commands.ts`). |

An **inline `<select>` for roots** would duplicate the same list as the Quick Pick and require new webview markup, styling, keyboard behaviour, and message types (`selectProject` with explicit `rootPath` vs picker). It would be **more symmetric** with Target but **not** simpler for the extension.

## Decision

**Keep the Project control as a button** whose primary action is **choose workspace root via the VS Code Quick Pick** (or direct selection when only one root exists). **Do not** replace it with an inline dropdown as the default.

Optional **follow-up** (separate scope): add an inline root `<select>` only if we later need faster switching without opening the Quick Pick, accepting the extra UI and test surface.

## Consequences

- **Pros:** Reuses VS Code’s native multi-item picker (search, keyboard, consistent with other extensions). Keeps webview header compact when there are many roots or long paths. Avoids duplicating root metadata (config presence) in two UIs.
- **Cons:** Project and Target use different control patterns; users who expect two dropdowns may need a moment to learn that Project opens the editor picker.
- **Documentation:** Product copy should describe “workspace root” / “folder” rather than implying the button cycles roots (it opens a picker or applies the single root).

## References

- Webview: `webview/common/project-root-button.ts`
- Extension: `src/extension/workspace-selection.ts` (`selectWorkspaceFolder`, `rememberWorkspace`, `onDidChangeWorkspaceFolders`)
- Command: `debug80.selectWorkspaceFolder` in `src/extension/commands.ts`
