# Debug80: Migrate Platform UI to Permanent Sidebar View

## Summary

Replace the ephemeral WebviewPanel (editor tab) with a permanent WebviewView in a dedicated
activity bar view container. Add welcome/onboarding when no project exists. All UI — including
memory view — stays within the panel. The debug80 panel is fully autonomous and self-contained;
it does not share space with the editor area.

## Motivation

- Users install the extension but have no visible entry point — they must know to run
  `Cmd+Shift+P → Debug80: Create Project`
- The platform UI panel (7-seg, LCD, keypad, serial) opens as an editor tab that feels
  "flaky" — it competes with source files for editor space and can be accidentally closed
- A permanent sidebar view with an activity bar icon provides always-available access, better
  onboarding, and a more integrated feel

## Architecture

```
Activity Bar Icon ("Debug80")
  └─ View Container: "debug80"
       └─ WebviewView: "debug80.platformView"
            ├─ Welcome state (no project detected)
            │    → "Create Project" button
            │    → Workspace folder picker (multi-root)
            ├─ Platform UI state (debug session active)
            │    → Tabs: Platform (7-seg, LCD, GLCD, keypad, speaker), Serial, Memory
            │    → All views contained within the panel
            └─ Idle state (project exists, no debug session)
                 → Platform info, "Start Debugging" hint
```

## Key Design Decisions

### 1. WebviewView (not WebviewPanel) for platform UI

VS Code's `WebviewView` lives in a view container (activity bar / secondary sidebar). It is
permanent — VS Code manages its lifecycle. It survives debug session start/stop without the
extension needing to create/destroy panels.

### 2. Memory stays inside the panel as a tab

Memory view remains a tab within the WebviewView alongside platform and serial tabs. The panel
is fully self-contained — nothing spills into the editor area. For hex dump readability in
narrow widths, the memory tab uses a responsive layout: fewer columns (e.g. 8-byte rows
instead of 16) and horizontal scroll when the panel is narrow.

### 3. `retainContextWhenHidden` is not available on WebviewView

WebviewView destroys its DOM when hidden. However, all platform state is already maintained in
TypeScript (`createTec1gUiState()`, `createSerialBuffer()`, etc.). When the view becomes
visible again, we re-set HTML and re-post the full current state — including non-state cached
data like GLCD font data. Add a `uiRevision` counter to the update payload so the webview can
ignore stale bursts if multiple updates fire right after rehydrate.

### 4. Single provider handles all platforms

Only one platform is active per debug session. The provider holds a `currentPlatform` field
and switches HTML templates on the `debug80/platform` event. TEC-1, TEC-1G, and
simple/terminal all share the same WebviewView.

### 5. Session-aware event routing

The provider tracks a `sessionId` for the active debug session. All incoming DAP events
(`debug80/tec1gUpdate`, `debug80/tec1Serial`, `debug80/platform`) are filtered against this
ID. Events from ended or mismatched sessions are ignored. This guards against:
- Updates arriving after a session has ended
- Multiple sessions in a multi-root workspace

Use the DAP session `id` (from `DebugSession.id`) as the canonical value. Reset to `undefined`
on `onDidTerminateDebugSession`. On `debug80/platform`, update `currentPlatform` without
resetting `sessionId`.

### 6. viewsWelcome for onboarding

VS Code's built-in `viewsWelcome` contribution (declared in package.json) shows automatically
when a context key (`debug80.hasProject`) is false. No custom HTML needed for the welcome
state.

Set the context key via `commands.executeCommand("setContext", ...)`. In multi-root, treat
`debug80.hasProject = true` if any folder contains `.vscode/debug80.json`.

### 7. Webview security and CSP

Use a strict content security policy in the sidebar webview. Prefer `nonce`-based script tags,
limit `img-src` to `webview.cspSource`, and avoid remote URLs. This keeps the sidebar view
consistent with the existing panel security model.

## New Files

| File                                      | Purpose                              |
| ----------------------------------------- | ------------------------------------ |
| `src/extension/platform-view-provider.ts` | `WebviewViewProvider` implementation |
| `resources/debug80-icon.svg`              | 24x24 activity bar icon              |

## Modified Files

| File | Changes |
| ---- | ------- |
| `package.json` | Add `viewsContainers.activitybar`, `views.debug80`, `viewsWelcome`, activation event, new command |
| `src/extension/extension.ts` | Register provider, set `debug80.hasProject` context key, route events through provider |
| `src/platforms/tec1g/ui-panel.ts` | Extract state+update logic from panel lifecycle into reusable functions |
| `src/platforms/tec1/ui-panel.ts` | Same refactoring |
| `src/platforms/tec1g/ui-panel-html-markup.ts` | Adapt memory tab layout for variable-width panel |

## Unchanged Files

- `ui-panel-html-style.ts`, `ui-panel-state.ts`, `ui-panel-serial.ts` — already decoupled
- `src/debug/adapter.ts` — custom DAP events unchanged
- All existing test files

## Implementation Phases

### Phase 1 — Activity bar + welcome view (non-breaking)

1. Create `resources/debug80-icon.svg` (test in both light and dark themes)
2. Add to `package.json`: viewsContainers, views, viewsWelcome, activation event.
   Use stable IDs — changing later breaks user layout preferences
3. Create skeleton `PlatformViewProvider` showing a "Debug80" placeholder
4. In `extension.ts`: register provider, scan workspace for `.vscode/debug80.json`,
   set `debug80.hasProject` context key, add FileSystemWatcher for debug80.json.
   In multi-root, context key = true if *any* folder has a project
5. Wire "Create Project" welcome button to existing `debug80.createProject` command

**Result:** Activity bar icon appears. No project → welcome with "Create Project".
Existing panel behavior unchanged — this phase is purely additive.

### Phase 2 — Platform UI in sidebar

6. Move TEC-1G state/update/serial handling into `PlatformViewProvider`
   - Reuse `createTec1gUiState()`, `createSerialBuffer()`, message handlers
   - On `setPlatform('tec1g')`: set `webview.html` using existing `getTec1gHtml()`
   - On `update()`: `postMessage` to webview (identical API)
7. Same for TEC-1 and simple/terminal platforms
8. Handle `onDidChangeVisibility`: re-set HTML and re-post full current state,
   including GLCD font data and any other webview-cached data
9. Add `sessionId` filtering: track active session ID in provider, ignore events
   from ended or mismatched sessions
10. Route `debug80/tec1gUpdate`, `debug80/tec1Serial`, `debug80/platform` events
    through provider instead of old panel controllers
11. Auto-reveal sidebar on `debug80/platform` event (debug session start)
12. Ensure all existing commands (`debug80.openTec1`, `debug80.openTec1g`, etc.)
    route to `provider.reveal()` instead of creating WebviewPanels

**Result:** Platform UI renders in sidebar instead of editor tab.

### Phase 3 — Responsive memory tab

13. Adapt memory tab to work at sidebar widths (300–500px)
    - Use 8-byte rows instead of 16 when panel width < 500px
    - Add horizontal scroll fallback for very narrow panels
    - Keep address column + hex + ASCII columns, reduce column count dynamically
    - Debounce resize handling; use hysteresis to avoid flicker when dragging
14. Pause memory snapshot refresh when the Memory tab is not the active tab
    (avoid wasting cycles on hidden content). Track active tab via a webview
    `postMessage` when the tab changes. Suggested messages:
    - `ui/tabChanged` with `{ tabId: "platform" | "serial" | "memory" }`
    - `ui/visibility` with `{ visible: boolean }` (optional if using `onDidChangeVisibility`)
15. Test memory tab readability at various panel widths

### Phase 4 — Polish + cleanup

16. Multi-root workspace: `debug80.selectWorkspaceFolder` command with QuickPick,
    store selection in `workspaceState`
17. Remove old WebviewPanel controller code and event listeners (avoid duplicate
    listeners and memory leaks)
18. Idle state view (project exists, no session): platform name, config summary
19. Test hide/show cycles, session start/stop, platform switching

### Migration Notes

- Keep legacy commands (`debug80.openTec1`, `debug80.openTec1g`, `debug80.openSimple`) for
  compatibility, but route them to `provider.reveal()` so the sidebar opens instead of an
  editor tab.
- Use stable view IDs and container IDs in `package.json` to avoid breaking existing user
  layout preferences.
- Ensure the webview view title is consistent with current panel titles to preserve user
  expectations and reduce churn in docs/screenshots.

## Risks and Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| `retainContextWhenHidden` unavailable | State in TypeScript; re-post on visibility change + `uiRevision` counter |
| Sidebar width constraints | GLCD 128px, 7-seg ~300px fit. Memory uses responsive rows with hysteresis |
| Stale events after session end | Provider tracks `sessionId`; ignores events from ended sessions |
| Backward compatibility | All open-panel commands route to `provider.reveal()`. No breaking change |
| Two platforms sharing one view | Only one active per session; provider switches HTML template |
| Duplicate listeners during migration | Phase 2 isolates rendering into shared service; Phase 4 deletes old code |

## Verification Checklist

- [ ] Activity bar icon visible after extension install (light + dark themes)
- [ ] Empty folder → welcome view with "Create Project" button
- [ ] Create project → welcome disappears, idle view shown
- [ ] Start debug session → platform UI renders in sidebar
- [ ] Hide sidebar → show sidebar → state preserved (displays, serial, GLCD)
- [ ] Memory tab readable at 350px panel width (8-byte rows, horizontal scroll)
- [ ] Resize sidebar while memory tab visible → no flicker (debounce + hysteresis)
- [ ] Stop debug session → sidebar shows idle state, no stale updates
- [ ] Start session, switch platforms quickly → view swaps cleanly, no stale data
- [ ] Multi-root: two folders, one with debug80.json → correct detection
- [ ] Multi-root: start session in non-selected root → view follows session
- [ ] All legacy commands (`debug80.openTec1`, etc.) open sidebar, not editor tab
