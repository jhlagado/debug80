[Part V](README.md) | [The Webview Panels →](13-the-webview-panels.md)

# Chapter 12 — The Extension Host UI

The debug80 sidebar panel is a VS Code WebviewView — an iframe-based panel embedded in the Activity Bar sidebar. It runs in a separate JavaScript context from the extension and communicates with it entirely through message passing. The extension host side of this boundary is managed by `PlatformViewProvider` in `src/extension/platform-view-provider.ts`.

This chapter covers the provider class: what state it holds, how the webview is created and destroyed, the complete message catalogue in both directions, and how the provider wires together the debug adapter, the workspace, and the UI.

For lifecycle edge-cases that are maintained as behavior contracts (session affinity filtering, rehydration replay order, TEC-1G matrix commit policy, and serial send pacing), see `docs/design-platform-ui-runtime-behaviors.md`.

---

## The provider class

`PlatformViewProvider` implements `vscode.WebviewViewProvider`. VS Code calls `resolveWebviewView()` once when the sidebar panel first becomes visible. After that, the provider drives the webview by posting messages to it and handling messages it sends back.

```typescript
export class PlatformViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug80.platformView';

  private view: vscode.WebviewView | undefined;
  private currentPlatform: PlatformId | undefined;
  private currentSession: vscode.DebugSession | undefined;
  private currentSessionId: string | undefined;
  private uiRevision = 0;
  private selectedWorkspace: vscode.WorkspaceFolder | undefined;
  private hasProject = false;
  private readonly workspaceState: vscode.Memento | undefined;
  private readonly extensionUri: vscode.Uri;
  ...
}
```

### Parallel state trees

The provider maintains parallel state trees for TEC-1 and TEC-1G. Both are held in memory simultaneously:

- `tec1UiState` / `tec1gUiState` — digits, matrix rows, LCD buffer, speaker state, speed mode
- `tec1SerialBuffer` / `tec1gSerialBuffer` — accumulated serial output text
- `tec1MemoryViews` / `tec1gMemoryViews` — which memory regions are shown in the memory inspector
- `tec1RefreshController` / `tec1gRefreshController` — memory snapshot polling machinery

Only one platform is active at a time (`currentPlatform`), but the other platform's state is preserved. If the user switches from a TEC-1 session to a TEC-1G session and back, the TEC-1 state rehydrates without a round trip to the adapter.

### The `uiRevision` counter

Every `update` message from the extension host carries a `uiRevision` number. The webview tracks the last revision it applied and ignores any message with a lower number. This prevents a race condition where a slow-arriving update from a previous session overwrites a fresh update from the current one.

The counter increments via `nextUiRevision()` on every state-bearing message. It is reset to 0 when `renderCurrentView()` is called (new HTML is set, so the webview's counter resets to 0 as well).

---

## HTML generation

The webview's HTML is built from a template in `src/platforms/panel-html.ts`. `buildPanelHtml()` reads the platform's `index.html` template from the built webview directory, resolves URI references for scripts and stylesheets, generates a CSP nonce, and replaces template tokens:

| Token | Replaced with |
|-------|--------------|
| `{{cspSource}}` | `webview.cspSource` — the allowed content source |
| `{{nonce}}` | Random nonce for inline script/style |
| `{{styleUri}}` | Platform-specific `styles.css` URI |
| `{{commonStyleUri}}` | Shared `webview/common/styles.css` URI |
| `{{scriptUri}}` | Compiled `index.js` URI |
| `{{activeTab}}` | `'ui'` or `'memory'` — which tab opens first |

The HTML is set on `webviewView.webview.html`. Setting this property destroys the existing webview content and starts fresh — all JavaScript state in the webview is lost. This happens on every platform switch and every time the sidebar is revealed after being hidden.

Webview resources are restricted to `out/webview/` via `localResourceRoots`. No other paths are accessible.

---

## `resolveWebviewView()`

This is the provider's main lifecycle method. VS Code calls it once, providing the `WebviewView` object. The method:

1. Stores the view reference.
2. Configures the webview options (scripts enabled, resource roots).
3. Registers the message handler.
4. Registers visibility and disposal handlers.
5. Calls `renderCurrentView(true)` to populate the initial HTML and state.

### Message handler

The message handler dispatches on `msg.type`. Messages fall into three categories:

**Project and session commands** — handled directly in the provider:

| Type | Action |
|------|--------|
| `startDebug` | Execute `debug80.startDebug` command |
| `createProject` | Execute `debug80.createProject` command |
| `selectProject` | Execute `debug80.selectWorkspaceFolder` with `rootPath` |
| `selectTarget` | Execute `debug80.selectTarget` with `rootPath` and `targetName` |
| `setEntrySource` | Execute `debug80.setEntrySource` command |

**Serial I/O commands** — handled in the provider:

| Type | Action |
|------|--------|
| `serialSendFile` | Open file picker, send file contents character-by-character to adapter |
| `serialSave` | Open save dialog, write buffered serial text to file |
| `serialClear` | Clear the serial buffer for the current platform |

**Platform-specific messages** — forwarded to `handleTec1Message()` or `handleTec1gMessage()`:

| Type | Examples |
|------|---------|
| Hardware input | `key`, `reset`, `speed`, `matrixKey`, `matrixMode` |
| Memory inspector | `tab`, `refresh`, `registerEdit`, `memoryEdit` |

The platform message handlers receive a context object containing `getSession()`, the refresh controller, the active tab accessors, and the memory view state.

### Visibility handler

When the sidebar becomes hidden, the memory refresh polling stops. When it becomes visible again, `renderCurrentView(true)` runs — the HTML is rebuilt, state is reposted, and memory polling restarts if the memory tab is active.

This means every show/hide cycle regenerates the webview HTML. The buffered state (serial text, UI state) is reposted from the provider's in-memory copies, so the user sees a consistent panel despite the HTML being recreated.

---

## `renderCurrentView()`

This is the method that actually populates the panel. It runs on every platform switch and every sidebar reveal:

```
1. Set webview.html to platform HTML (destroys old webview)
2. Post projectStatus (workspace roots, current target)
3. Post sessionStatus (running/paused/not running)
4. Post full update (digits, matrix, LCD, speaker state)
5. Post serialInit (full buffered serial text, if any)
6. Post selectTab (active tab)
7. Sync memory refresh (start polling if on memory tab)
```

When no platform is set yet (before the first debug session), the provider renders the TEC-1G webview as a default. This ensures the panel shows something meaningful even before the first launch.

---

## Messages: extension host → webview

All messages are posted via `postMessage()`. The webview handles them in `window.addEventListener('message', ...)`.

| Type | Key fields | When sent |
|------|-----------|-----------|
| `update` | `uiRevision`, `digits[]`, `matrix[]`, `speaker`, `speedMode`, `lcd[]`, `speakerHz?` (plus TEC-1G fields) | Platform hardware state changes |
| `serial` | `text: string` | Incremental serial data from adapter |
| `serialInit` | `text: string` | Full serial buffer on rehydration |
| `projectStatus` | `roots[]`, `targets[]`, `rootName?`, `rootPath?`, `hasProject?`, `targetName?`, `entrySource?` | Workspace or project state changes |
| `sessionStatus` | `status: 'starting' \| 'running' \| 'paused' \| 'not running'` | Debug session state changes |
| `selectTab` | `tab: 'ui' \| 'memory'` | Tab should be selected |
| `snapshot` | Register and memory dump | Memory inspector refresh completes |
| `snapshotError` | `message?: string` | Memory snapshot request failed |
| `uiVisibility` | `visibility: Record<string, boolean>`, `persist: boolean` | TEC-1G section visibility changes |

The TEC-1G `update` message carries additional fields not present in TEC-1:

```typescript
{
  type: 'update',
  uiRevision: number,
  digits: number[],
  // RGB matrix — three colour planes
  matrix: number[],           // red plane rows
  matrixGreen?: number[],
  matrixBlue?: number[],
  matrixBrightnessR?: number[],  // per-pixel brightness (64 entries)
  matrixBrightnessG?: number[],
  matrixBrightnessB?: number[],
  matrixMode?: boolean,
  // GLCD
  glcd: number[],             // 1024-byte GDRAM
  glcdDdram?: number[],
  glcdState?: { displayOn, graphicsOn, cursorOn, ... },
  // Text LCD
  lcd: number[],
  lcdState?: { displayOn, cursorOn, cursorAddr, ... },
  lcdCgram?: number[],
  // System
  speaker: number,
  speedMode: 'fast' | 'slow',
  sysCtrl?: number,
  bankA14?: boolean,
  capsLock?: boolean,
  speakerHz?: number
}
```

---

## Messages: webview → extension host

These arrive in `onDidReceiveMessage` and are dispatched as described above.

| Type | Key fields | Handler |
|------|-----------|---------|
| `startDebug` | — | Execute start debug command |
| `createProject` | — | Execute create project command |
| `selectProject` | `rootPath` | Execute workspace selection |
| `selectTarget` | `rootPath`, `targetName` | Execute target selection |
| `setEntrySource` | — | Execute set entry source command |
| `serialSendFile` | — | File picker → character-by-character send |
| `serialSave` | `text` | Save dialog → write file |
| `serialClear` | — | Clear serial buffer |
| `key` | `code: number` | Platform handler → adapter custom request |
| `reset` | — | Platform handler → adapter custom request |
| `speed` | `mode` | Platform handler → adapter custom request |
| `tab` | `tab` | Update active tab; start/stop memory polling |
| `refresh` | memory params | Platform handler → fetch memory snapshot |
| `registerEdit` | `register`, `value` | Platform handler → adapter custom request |
| `memoryEdit` | `address`, `value` | Platform handler → adapter custom request |
| `matrixKey` | `key`, `pressed`, modifiers | TEC-1G only; platform handler |
| `matrixMode` | `enabled` | TEC-1G only; platform handler |

---

## Platform message routing

When a platform-specific message arrives, the provider calls `handleTec1Message()` or `handleTec1gMessage()` with a context object. These functions translate webview messages into debug adapter custom requests:

| Webview message | Adapter custom request |
|----------------|----------------------|
| `key` (TEC-1) | `debug80/tec1Key` |
| `reset` (TEC-1) | `debug80/tec1Reset` |
| `speed` (TEC-1) | `debug80/tec1Speed` |
| `refresh` (TEC-1) | `debug80/tec1MemorySnapshot` |
| `registerEdit` | `debug80/registerWrite` |
| `memoryEdit` | `debug80/memoryWrite` |
| `key` (TEC-1G) | `debug80/tec1gKey` |
| `matrixKey` (TEC-1G) | `debug80/tec1gMatrixKey` |
| `matrixMode` (TEC-1G) | `debug80/tec1gMatrixMode` |
| `reset` (TEC-1G) | `debug80/tec1gReset` |
| `speed` (TEC-1G) | `debug80/tec1gSpeed` |
| `refresh` (TEC-1G) | `debug80/tec1gMemorySnapshot` |

All adapter requests go through `session.customRequest()` on the current `vscode.DebugSession`.

---

## Memory refresh

The memory inspector polls the adapter for live register and memory snapshots while the session is paused. The refresh controller (`tec1RefreshController`, `tec1gRefreshController`) manages this polling:

- Start polling when the memory tab becomes active.
- Stop polling when the panel is hidden or the tab switches away.
- Poll at 150 ms intervals via `refreshTec1Snapshot()`.
- On each poll, call `session.customRequest('debug80/tec1MemorySnapshot', snapshotPayload)` and post the result as a `snapshot` message.

The snapshot payload describes which memory regions and views are currently displayed. The adapter reads those regions from the Z80 memory array and returns them in a single response.

---

## Project status

`getProjectStatusPayload()` assembles the project header data. It queries:

- `vscode.workspace.workspaceFolders` — all open workspace roots
- `findProjectConfigPath(folder)` — whether each root has a `debug80.json`
- `resolveProjectStatusSummary()` — the selected target and entry source from workspace state
- `listProjectTargetChoices()` — the target names available in the config file

This payload is posted as a `projectStatus` message. The webview renders it as a compact header: a button showing the current workspace root (clicking it sends `selectProject`) and a dropdown of available targets (changing it sends `selectTarget`).

---

## Serial file send

`handlePlatformSerialSendFile()` in `platform-view-serial-actions.ts` handles the `serialSendFile` webview message (the provider delegates to it). It:

1. Opens a file picker filtered to `.hex`, `.txt`, and all files.
2. Reads the file as UTF-8 text.
3. Sends each character individually as a `debug80/tec1SerialInput` (or `debug80/tec1gSerialInput`) custom request, with 2 ms between characters and 10 ms between lines.
4. Appends a CR (`\r`) at the end of each line.
5. Shows a cancellable progress notification.

The character-by-character sending mirrors the timing of a real terminal, giving the program time to process each byte. Intel HEX files sent this way are loaded by the MON-1B or MON-3 monitor's load routine.

`handlePlatformSerialSave()` handles `serialSave`: it warns on an empty buffer, picks `.hex` vs `.txt` filters when the buffer looks like Intel HEX, then writes UTF-8 bytes via `vscode.workspace.fs.writeFile`.

---

## Summary

- `PlatformViewProvider` is the single point of contact between the debug adapter and the webview. It holds all hardware display state and serial buffers in memory on the extension host side.

- The webview HTML is regenerated on every platform switch and sidebar reveal. Buffered state is reposted from in-memory copies, making the panel self-restoring.

- The `uiRevision` counter prevents stale updates from a previous session overwriting current state.

- Twelve message types flow from the extension host to the webview; sixteen message types flow back. Platform-specific messages are translated into debug adapter custom requests.

- The memory refresh controller polls the adapter at 150 ms intervals when the memory tab is active and the panel is visible. Polling stops automatically on tab switch or panel hide.

- Project status is assembled from workspace folders, `debug80.json` discovery, and workspace-persisted target selection. It drives the compact project header that appears on all tabs.

---

[Part V](README.md) | [The Webview Panels →](13-the-webview-panels.md)
