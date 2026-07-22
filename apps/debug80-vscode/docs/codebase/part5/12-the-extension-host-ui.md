---
layout: default
title: 'Chapter 12 — The Extension Host UI'
parent: 'Part V — The Extension UI'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 1
---

[Part V](index.md) | [The Webview Panels →](13-the-webview-panels.md)

# Chapter 12 — The Extension Host UI

The Debug80 sidebar panel is a VS Code `WebviewView` embedded in the built-in **Run & Debug** container (`"views": { "debug": [...] }` in `package.json`). It runs in a separate JavaScript context from the extension host and communicates with it entirely through message passing. The extension host side of this boundary is managed by `PlatformViewProvider` in `src/extension/platform-view-provider.ts`.

The view is registered under `"views": { "debug": [...] }` in `package.json` with `visibility: "visible"`, which places it as a normal Run and Debug subpanel alongside Variables, Watch, Call Stack, and Breakpoints. The extension can activate through the view, through Z80 debug resolution, through a workspace containing `debug80.json`, or through the contributed Z80 assembly and Glimmer language activation events.

This chapter covers the provider class: what state it holds, how the webview is created and destroyed, the complete message catalogue in both directions, how message routing is structured, and how the provider wires together the debug adapter, the workspace, and the UI.

---

## Language contributions

Debug80 also owns the editor-facing language contributions for authored source files. In `package.json`, the extension contributes:

- language id `z80-asm` for `.asm`, `.z80`, and `.asmi`
- language id `glim` for `.glim`
- breakpoint support for common Z80 assembly language ids plus `glim`
- TextMate grammars at `syntaxes/z80-asm.tmLanguage.json` and `syntaxes/glim.tmLanguage.json`

The Z80 assembly grammar is deliberately lexical. It recognizes semicolon comments, AZMDoc comments, strings, labels, local labels, directives, condition-bearing control instructions, Z80 mnemonics, registers, condition codes, number formats, symbols, operators, layout types, enum/member syntax, layout casts, field declarations, AZM `op` declarations, lowercase AZM op invocations, `sizeof`/`offset`, and register contract annotations such as `in`, `out`, `clobbers`, and `preserves`.

The Glimmer grammar covers top-level declarations, header clauses, resource declarations, pixel-row forms, and embedded `begin` / `end` block bodies. Those block bodies embed the `source.z80.asm` grammar inside `source.glim`, so assembly instructions inside Glimmer blocks inherit the same lexical colouring and breakpoint affordances as standalone Z80 sources.

Colour is driven by default `editor.tokenColorCustomizations` in `package.json`. The Z80 palette distinguishes comments, labels, symbols, directives, annotations, instructions, registers, conditions and flags, strings, function names including AZM op declarations and invocations, operators, and numeric literals. Glimmer adds distinct scopes for structural declarations, block and resource names, reactive cells and pulses, declaration operators, resource constants and strings. This is TextMate colouring, not semantic-token analysis.

`registerLanguageAssociations()` in `src/extension/language-association.ts` is a safety net for opened documents. Once VS Code knows the contributed languages, it assigns `.asm`, `.z80`, and `.asmi` documents to `z80-asm` for `file` and `untitled` documents. Glimmer relies on the direct `package.json` language contribution for `.glim`, while the embedded Z80 scopes inside Glimmer blocks come from the TextMate grammar itself.

The language-server design note in the source repository is still a future direction. The current implementation is not an LSP, but it does provide several editor services from the last built D8 source map:

- **Go to Definition / F12** via `registerD8DefinitionProvider()` in `src/extension/d8-definition-provider.ts`, registered for both `z80-asm` and `glim` documents.
- **Workspace Symbols** via `registerD8WorkspaceSymbolProvider()`, scoped to the active target's D8 map.
- **Debug80: Search Workspace Symbols** via `debug80.searchWorkspaceSymbols`, a visible command that delegates to VS Code's `workbench.action.showAllSymbols` while using the same active-target D8 symbol provider.
- **Hover** via `registerD8HoverProvider()`, showing compact symbol kind/address/value/size/source information and any nearby `.routine` register contract.
- **Source-map freshness hints**, warning the user to build when source files appear newer than the active target's D8 map.

These providers deliberately use the active build artifact as the source of truth. If no D8 map exists, the feature reports that the target needs to be built rather than attempting to parse the workspace live.

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

### Platform module cache — `loadedModules`

The provider maintains a second parallel map: `loadedModules: Map<string, PlatformUiModules>`. Where `platformStates` holds _runtime data_ (hardware state, serial buffer, tab), `loadedModules` holds _behaviour_ — the functions that know how to generate HTML, serialize state to update messages, and handle incoming webview messages.

Modules are loaded through `loadPlatformUi()` and cached in `loadedModules`. In the current provider implementation that loading is done eagerly by `preloadAllPlatforms()` during `resolveWebviewView()`, so each registered platform has both its module bundle and state entry ready before the first render. After a module is loaded, `initPlatformState()` creates the corresponding `PerPlatformState` entry.

The `getActiveBundle(id)` helper retrieves both maps together, returning `{ modules, state }` or `undefined`. This ensures the two maps stay synchronized — callers never work with state that has no matching modules, or vice versa.

#### The `PlatformUiModules` contract

`PlatformUiModules` in `src/extension/platform-view-manifest.ts` is the interface every platform UI must satisfy:

```typescript
interface PlatformUiModules<TUiState = unknown> {
  getHtml(tab: PanelTab, webview: vscode.Webview, extensionUri: vscode.Uri): string;
  createUiState(): TUiState;
  resetUiState(state: TUiState): void;
  applyUpdate(state: TUiState, payload: unknown): Record<string, unknown>;
  createMemoryViewState(): MemoryViewState;
  handleMessage(message: PlatformViewMessage, context: PlatformUiMessageContext): Promise<void>;
  buildUpdateMessage(state: TUiState, uiRevision: number): Record<string, unknown>;
  buildClearMessage(state: TUiState, uiRevision: number): Record<string, unknown>;
  snapshotCommand: 'debug80/memorySnapshot';
}
```

| Method                  | Role                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `getHtml`               | Build the webview HTML for a given initial tab and webview context                              |
| `createUiState`         | Allocate a blank `TUiState` (called once per platform on module load)                           |
| `resetUiState`          | Zero out UI state on session end (called by `clear()`)                                          |
| `applyUpdate`           | Merge an incoming hardware update payload into `TUiState`; return the serialized message fields |
| `createMemoryViewState` | Create a fresh `MemoryViewState` for the memory inspector                                       |
| `handleMessage`         | Dispatch a platform-specific webview message (e.g. `key`, `matrixKey`, `refresh`)               |
| `buildUpdateMessage`    | Serialize the current `TUiState` into a full `update` message (used for rehydration)            |
| `buildClearMessage`     | Serialize a zeroed `TUiState` into a clear `update` message (session ended)                     |
| `snapshotCommand`       | The DAP custom request name to use when fetching a memory snapshot                              |

Each platform wires its modules through a `PlatformUiEntry` factory (`createTec1PlatformUiEntry()`, etc.) in `src/extension/platform-ui-entries.ts`. The factory's `loadUiModules()` function uses dynamic `import()` to pull in the platform's HTML, memory, message-handling, and state modules, then composes them into a single `PlatformUiModules` object.

### Parallel state trees

The provider maintains a `platformStates: Map<string, PerPlatformState>` with an entry for every registered platform (Simple, TEC-1, TEC-1G). All three are held in memory simultaneously. Each entry holds:

- `uiState` — platform-specific hardware state (digits, matrix rows, LCD buffer, speaker, etc.; empty for Simple)
- `serialBuffer` — accumulated serial / terminal output text (max 8 000 characters)
- `memoryViews` — which memory regions are shown in the memory inspector
- `activeTab` — which tab (`'ui'` or `'memory'`) was last active
- `refreshController` — memory snapshot polling machinery

Only one platform is active at a time (`currentPlatform`), but all other platforms' state is preserved. If the user switches from TEC-1 to TEC-1G and back, the TEC-1 state rehydrates without a round trip to the adapter.

### The `uiRevision` counter

Every `update` message from the extension host carries a `uiRevision` number. The webview tracks the last revision it applied and ignores any message with a lower number. This prevents a race condition where a slow-arriving update from a previous session overwrites a fresh update from the current one.

The counter only ever increases. `nextUiRevision()` increments `uiRevision` and returns the new value; it is called each time a state-bearing message is sent. The counter is **never reset** — not even when `renderCurrentView()` is called. When `renderCurrentView()` sets new HTML on the webview, the webview's own JavaScript state (including its local `uiRevision` tracking) resets to zero because the webview frame is destroyed and recreated. The extension host counter continues to increase from wherever it was, so the first `update` message sent after a render will have a revision number higher than zero and the freshly initialised webview will accept it.

---

## HTML generation

The webview's HTML is built from a template in `src/platforms/panel-html.ts`. `buildPanelHtml()` reads the platform's `index.html` template from the built webview directory, resolves URI references for scripts and stylesheets, generates a CSP nonce, and replaces template tokens:

| Token                | Replaced with                                    |
| -------------------- | ------------------------------------------------ |
| `{{cspSource}}`      | `webview.cspSource` — the allowed content source |
| `{{nonce}}`          | Random nonce for inline script/style             |
| `{{styleUri}}`       | Platform-specific `styles.css` URI               |
| `{{commonStyleUri}}` | Shared `webview/common/styles.css` URI           |
| `{{scriptUri}}`      | Compiled `index.js` URI                          |
| `{{activeTab}}`      | `'ui'` or `'memory'` — which tab opens first     |

The HTML is set on `webviewView.webview.html`. Setting this property destroys the existing webview content and starts fresh — all JavaScript state in the webview is lost. This happens on every platform switch and every time the sidebar is revealed after being hidden.

Webview resources are restricted to `out/webview/` via `localResourceRoots`. No other paths are accessible.

---

## `resolveWebviewView()`

This is the provider's main lifecycle method. VS Code calls it once, providing the `WebviewView` object. The method:

1. Stores the view reference.
2. Configures the webview options (scripts enabled, resource roots).
3. Registers the message handler.
4. Registers visibility and disposal handlers.
5. Calls `renderCurrentView(false)` to populate the initial HTML and state.

### Visibility handler

When the sidebar becomes hidden, the memory refresh polling stops. When it becomes visible again, `renderCurrentView(true)` runs — the HTML is rebuilt, state is reposted, and memory polling restarts if the memory tab is active.

This means every show/hide cycle regenerates the webview HTML. The buffered state (serial text, UI state) is reposted from the provider's in-memory copies, so the user sees a consistent panel despite the HTML being recreated.

### Panel-layout reset command

`registerPanelViewCommands()` in `src/extension/panel-view-commands.ts` now exposes a visible command, `debug80.resetPanelLayout`. The command calls `PlatformViewProvider.resetPanelLayout()`, which marks a pending reset, reveals the Debug80 view, and then posts a one-shot `{ type: 'resetPanelLayout' }` message once the webview is available.

The provider does not rebuild platform state for this action. It only tells the webview to discard persisted accordion order and open-state preferences and return to the default layout for the active platform.

---

## `renderCurrentView()`

This is the method that actually populates the panel. It runs on every platform switch and every sidebar reveal:

```
1. Set webview.html to platform HTML (destroys old webview)
2. Post projectStatus (workspace roots, targets, selected target, active platform, AZM options, source-map status, CoolTerm status, build status)
3. Post sessionStatus (running/paused/not running)
4. Post full update snapshot (hardware state for TEC-1/TEC-1G; empty for Simple)
5. Post serialInit (full buffered serial/terminal text, if any)
6. Post selectTab (active tab)
7. Sync memory refresh (start polling if on memory tab)
```

When no debug session is active, the provider still renders a platform webview so the project header and setup card remain interactive. The selected platform identity comes from the remembered workspace/project state rather than from an active runtime.

---

## Message routing

Inbound messages from the webview are typed as `PlatformViewInboundMessage` — a union defined in `src/contracts/platform-view.ts`. The raw message is immediately handed to `handlePlatformViewMessage()` in `src/extension/platform-view-messages.ts`, which is responsible for all routing decisions.

### `platform-view-messages.ts`

`handlePlatformViewMessage()` receives the message and a dependency object (`PlatformViewMessageDependencies`) that provides callback functions for each action. It is now a thin composition layer:

1. `handleProjectViewMessage()` handles project/session actions.
2. `handleSerialViewMessage()` handles serial-buffer actions.
3. `handleActivePlatformViewMessage()` forwards remaining messages to the active platform adapter.

The project and serial handlers are split into `src/extension/platform-view-project-messages.ts` and `src/extension/platform-view-serial-messages.ts`; active-platform dispatch lives in `src/extension/platform-view-platform-messages.ts`.

The message families are:

- Project and session commands (`createProject`, `selectProject`, `openWorkspaceFolder`, `configureProject`, `selectTarget`, `addTarget`, `removeTarget`, `restartDebug`, `setEntrySource`, `startDebug`, `sendHexViaCoolTerm`) are forwarded to the corresponding callback, which invokes a VS Code command or host-side action. The `createProject` path passes an optional `platform` string to `debug80.createProject`; when present the command resolves the default kit for that platform via `getDefaultProjectKitForPlatform()` and scaffolds without showing additional pickers. The `openWorkspaceFolder` path also forwards an optional `platform` field when the webview includes it, so `debug80.addWorkspaceFolder` can preserve the active panel context. `setStopOnEntry` and `setAzmOptions` are handled inline by the provider — they update session-scoped provider fields and refresh the `projectStatus` payload.
- Serial commands (`serialSendFile`, `serialSave`) are forwarded to their callbacks.
- `serialClear` calls `clearSerialBuffer` for the current platform.
- Any unrecognised type falls through to `handlePlatformMessage`, which dispatches to the platform-specific adapter.

The routing functions contain no provider state — they are pure dispatch layers with dependencies supplied by the provider, which keeps them independently testable.

### Serial actions — `platform-view-serial-actions.ts`

`handlePlatformSerialSendFile()` and `handlePlatformSerialSave()` in `src/extension/platform-view-serial-actions.ts` handle the two serial file workflows:

- `handlePlatformSerialSendFile()` opens a file picker, reads the file, and sends each character individually as a `debug80/tec1SerialInput` or `debug80/tec1gSerialInput` custom request (2 ms between characters, 10 ms between lines, CR appended at each line end). A cancellable progress notification shows during the transfer.
- `handlePlatformSerialSave()` opens a save dialog and writes the buffered serial text to a file. If the contents look like Intel HEX (all lines start with `:`), the default filter offers `.hex`.

### Auto rebuild on save

`registerAutoRebuildOnSave()` in `src/extension/auto-rebuild.ts` adds a second extension-host workflow around active sessions. When the user saves an eligible source document during a running Z80 session, the extension debounces the save for 250 ms and then sends `debug80/rebuildWarm` to the active debug session.

Eligibility is checked by `debug80-source-extensions.ts`. The current rebuild-on-save path accepts `.asm`, `.z80`, `.asmi`, and `.glim` files, but only when the saved file is inside the active session's workspace folder. This keeps one workspace's save from warm-rebuilding another workspace's session in a multi-root window.

Successful warm rebuilds clear any prior rebuild diagnostics and append the summary line to the shared Debug80 output channel. Assembly failures are converted into a single VS Code diagnostic at the reported source location, the short summary is appended to the output channel, and the detailed compiler text is shown in the same output stream. Repeated saves while a rebuild is already in flight are coalesced by `SessionStateManager`: the extension marks that another rebuild is pending and reruns exactly once when the current rebuild completes.

### CoolTerm hardware send

Debug80 also has a host-side hardware send path through CoolTerm. The command `debug80.sendHexViaCoolTerm` is registered in `src/extension/commands.ts` and implemented by `src/extension/coolterm/`.

This is not the same as emulated serial input. It sends the selected target's built HEX file to a real board by controlling a running CoolTerm instance over its Remote Control Socket:

1. `resolveCoolTermHexArtifact()` reads the current `debug80.json`, selected target, `outputDir`, `artifactBase` and any explicit `hex` path to locate the HEX file.
2. `CoolTermRemoteClient` opens a TCP socket to `127.0.0.1:51413`.
3. `sendHexViaCoolTerm()` pings CoolTerm, opens the serial port, and sends the HEX file with CoolTerm's `SEND_TEXTFILE` command.
4. Status is reported through VS Code notifications and the Debug80 hardware-status line when CoolTerm has accepted and sent the file.

Debug80 does not wait for `PASSED` or `FAILED` text on the serial line. MON3's Intel HEX loader reports completion on the TEC-1G seven-segment display: `PASS` means the load was accepted, and `ERROR` means checksum or write verification failed. The serial startup message `TEC-1G Connected` belongs to MON3 boot, not to the HEX load result.

The user must configure CoolTerm with the TEC-1G monitor serial settings (`4800` baud, 8 data bits, no parity, 2 stop bits) and enable its Remote Control Socket on port 51413. Debug80 intentionally delegates native serial-port ownership to CoolTerm here, avoiding bundled native serial dependencies in the VSIX.

The Debug80 source repository also includes `tec-1g.CoolTermSettings` as a CoolTerm settings preset for the TEC-1G defaults. It captures the 4800 8N2 raw-transfer setup, but the user still chooses the real serial port and enables the Remote Control Socket for their local CoolTerm installation.

### Platform module dispatch

Platform-specific messages (hardware input, memory inspector, tab changes) are routed through the `PlatformUiModules` object retrieved from `loadedModules`. Calling `modules.handleMessage(msg, context)` delegates to the platform's own message handler, which translates webview messages into debug adapter custom requests. There is no platform-specific branching in `platform-view-messages.ts` itself — all platform variation lives behind the `PlatformUiModules` interface.

Shared TEC-1/TEC-1G panel message handling has the same shape. `handleCommonPanelMessage()` in `src/platforms/panel-messages.ts` composes layout messages (`panel-tab-messages.ts`), edit messages (`panel-edit-messages.ts`) and runtime messages (`panel-runtime-messages.ts`) instead of keeping the full switch table in one file.

---

## Messages: extension host → webview

All messages are posted via `postMessage()`. The webview handles them in `window.addEventListener('message', ...)`.

| Type               | Key fields                                                                                           | When sent                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `update`           | `uiRevision`, platform-specific hardware fields (empty object for Simple)                            | Platform hardware state changes                                       |
| `serial`           | `text: string`                                                                                       | Incremental serial/terminal data                                      |
| `serialInit`       | `text: string`                                                                                       | Full serial/terminal buffer on rehydration                            |
| `serialClear`      | —                                                                                                    | Clear the serial/terminal display                                     |
| `projectStatus`    | `roots[]`, `targets[]`, project fields, AZM option fields, CoolTerm fields, build-status fields, source-map status fields | Workspace, project, target, build, hardware-send, or source-map state changes |
| `sessionStatus`    | `status: 'starting' \| 'running' \| 'paused' \| 'not running'`                                       | Debug session state changes                                           |
| `resetPanelLayout` | —                                                                                                    | The user runs `debug80.resetPanelLayout` or equivalent host action    |
| `selectTab`        | `tab: 'ui' \| 'memory'`                                                                              | Tab should be selected                                                |
| `snapshot`         | Register and memory dump                                                                             | Memory inspector refresh completes                                    |
| `snapshotError`    | `message?: string`                                                                                   | Memory snapshot request failed                                        |

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
  matrixScanCycles?: Array<{
    id: number,
    startCycle: number,
    endCycle: number,
    rows: Array<{ row: number, red: number, green: number, blue: number, dwellCycles: number }>
  }>,
  matrixDroppedScanCycles?: number,
  matrixClockHz?: number,
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

`matrix`, `matrixGreen`, and `matrixBlue` are the steady-state row masks stored in `Tec1gUiState`. `matrixScanCycles`, `matrixDroppedScanCycles`, and `matrixClockHz` are transient runtime playback fields. `platform-ui-entries.ts` forwards those fields from the live `debug80/tec1gUpdate` payload when present, but they are not persisted into the extension host's mirrored UI state.

---

## Messages: webview → extension host

These arrive in `onDidReceiveMessage` and are dispatched as described above.

| Type                  | Key fields                                    | Handler                                                                                                                                                                                             |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startDebug`          | —                                             | Execute start debug command                                                                                                                                                                         |
| `createProject`       | `rootPath`, `platform?`                       | Execute create project command; optional `platform` pre-selects kit filter                                                                                                                          |
| `openWorkspaceFolder` | `platform?`                                   | Execute open folder command, forwarding active platform context when the webview provides it                                                                                                        |
| `selectProject`       | `rootPath`                                    | Execute workspace selection                                                                                                                                                                         |
| `configureProject`    | —                                             | Execute the project-configuration command palette flow for the selected project and target                                                                                                          |
| `saveProjectConfig`   | `platform: string`                            | Write `projectPlatform` + per-target `platform` to `debug80.json`, then restart debug. This is now effectively a legacy path because the platform selector is hidden once a project is initialized. |
| `selectTarget`        | `rootPath`, `targetName`                      | Execute target selection                                                                                                                                                                            |
| `addTarget`           | optional `rootPath`                           | Add a new configured target from a discovered source file                                                                                                                                            |
| `removeTarget`        | optional `rootPath`, `targetName`             | Remove a configured target from `debug80.json` while leaving source files unchanged                                                                                                                 |
| `restartDebug`        | —                                             | Execute the run-current-target command, which builds then launches the current target                                                                                                               |
| `buildTarget`         | —                                             | Execute the build-only command for the current target without launching a debug session                                                                                                             |
| `setAzmOptions`       | `registerContractsMode`, `contractUpdateMode` | Update session-scoped AZM options shown in the Project panel                                                                                                                                        |
| `removeWorkspaceFolder` | `rootPath`                                  | Remove the selected workspace folder from the VS Code workspace after confirmation, leaving files on disk unchanged                                                                                 |
| `sendHexViaCoolTerm`  | optional `rootPath`, `targetName`             | Send the selected target's HEX artifact to a real board through CoolTerm                                                                                                                            |
| `setEntrySource`      | —                                             | Execute set entry source command                                                                                                                                                                    |
| `serialSendFile`      | —                                             | File picker → character-by-character send (TEC-1/TEC-1G)                                                                                                                                            |
| `serialSave`          | `text`                                        | Save dialog → write file                                                                                                                                                                            |
| `serialClear`         | —                                             | Clear serial/terminal buffer                                                                                                                                                                        |
| `key`                 | `code: number`, optional `pressed: boolean`   | Platform adapter → adapter custom request                                                                                                                                                           |
| `reset`               | —                                             | Platform adapter → adapter custom request                                                                                                                                                           |
| `speed`               | `mode`                                        | Platform adapter → adapter custom request                                                                                                                                                           |
| `tab`                 | `tab`                                         | Update active tab; start/stop memory polling                                                                                                                                                        |
| `refresh`             | memory params                                 | Platform adapter → fetch memory snapshot                                                                                                                                                            |
| `registerEdit`        | `register`, `value`                           | Platform adapter → adapter custom request                                                                                                                                                           |
| `memoryEdit`          | `address`, `value`                            | Platform adapter → adapter custom request                                                                                                                                                           |
| `matrixKey`           | `key`, `pressed`, modifiers                   | TEC-1G only; platform adapter                                                                                                                                                                       |
| `matrixMode`          | `enabled`                                     | TEC-1G only; platform adapter                                                                                                                                                                       |

---

## Platform message routing

When a platform-specific message arrives, `resolvePlatformAdapter()` returns the appropriate adapter and `adapter.handleMessage()` delegates to `handleTec1Message()` or `handleTec1gMessage()`. These functions translate webview messages into debug adapter custom requests:

| Webview message           | Adapter custom request    |
| ------------------------- | ------------------------- |
| `key` (TEC-1)             | `debug80/tec1Key`         |
| `reset` (TEC-1)           | `debug80/tec1Reset`       |
| `speed` (TEC-1)           | `debug80/tec1Speed`       |
| `refresh` (all platforms) | `debug80/memorySnapshot`  |
| `registerEdit`            | `debug80/registerWrite`   |
| `memoryEdit`              | `debug80/memoryWrite`     |
| `key` (TEC-1G)            | `debug80/tec1gKey`        |
| `matrixKey` (TEC-1G)      | `debug80/tec1gMatrixKey`  |
| `matrixMode` (TEC-1G)     | `debug80/tec1gMatrixMode` |
| `reset` (TEC-1G)          | `debug80/tec1gReset`      |
| `speed` (TEC-1G)          | `debug80/tec1gSpeed`      |

For TEC-1G, the optional `pressed` flag is forwarded unchanged to `debug80/tec1gKey`. `pressed: true` starts a held keypad press, `pressed: false` releases it, and omitting the field preserves the older pulse-style request shape that TEC-1 still uses.

All adapter requests go through `session.customRequest()` on the current `vscode.DebugSession`.

---

## Shared message contract — `src/contracts/platform-view.ts`

The types shared between the extension host and webview are defined in `src/contracts/platform-view.ts`:

- **`PlatformId`** — `'simple' | 'tec1' | 'tec1g'`; the canonical platform identifier used throughout the extension and webview.
- **`ProjectStatusPayload`** — the shape of the `projectStatus` message body. The key field is `projectState?: 'noWorkspace' | 'uninitialized' | 'initialized'`, which drives control visibility in the webview. Other fields include workspace roots, targets, selected target, entry source, platform, `stopOnEntry`, the project-persisted `azmSymbolCase`, session-scoped AZM option fields, CoolTerm availability / inferred HEX path / hardware status text, separate build status text/state, and source-map status text/state. Each target row can also carry `description`, `detail`, `discovered?: true`, and `sourceFile`, which let the panel distinguish persisted targets from runnable source files that have not yet been written into `debug80.json`.
- **`PlatformViewControlMessage`** — a discriminated union of all project/session/serial/hardware-send control messages (`startDebug`, `restartDebug`, `buildTarget`, `createProject`, `openWorkspaceFolder`, `selectProject`, `configureProject`, `saveProjectConfig`, `setStopOnEntry`, `setAzmOptions`, `setAzmSymbolCase`, `selectTarget`, `addTarget`, `removeTarget`, `removeWorkspaceFolder`, `sendHexViaCoolTerm`, `setEntrySource`, `serialSendFile`, `serialSave`, `serialClear`). The `saveProjectConfig` message carries `{ platform: string }` and triggers a config write + debug restart. The `createProject` message carries an optional `platform?: string` field that, when present, selects the default kit for that platform without showing pickers. In practice the webview can also attach an optional `platform` field to `openWorkspaceFolder`, and the message parser forwards that through to `debug80.addWorkspaceFolder`. The `setStopOnEntry` message carries `{ stopOnEntry: boolean }` and updates the provider's global toggle. `setAzmOptions` updates session-scoped AZM restart options. `setAzmSymbolCase` carries `{ symbolCase: 'strict' | 'insensitive' }` and persists the merged project-level `azm.symbolCase` value into `debug80.json`.
- **`PlatformViewInboundMessage`** — the full union of all messages the extension host can receive: `PlatformViewControlMessage | Tec1Message | Tec1gMessage | { type?: string; [key: string]: unknown }`.

This file is the authoritative definition of the message boundary. Platform-view-messages.ts imports `PlatformViewInboundMessage` directly from it.

---

## Platform registration model — `src/extension/platform-extension-model.ts`

`registerExtensionPlatform()` in `src/extension/platform-extension-model.ts` is the unified API for registering a platform with both the runtime provider registry and the extension UI:

```typescript
interface ExtensionPlatformEntry {
  runtime: PlatformManifestEntry;
  ui?: PlatformUiEntry;
}

function registerExtensionPlatform(entry: ExtensionPlatformEntry): void;
```

A single call registers the platform's runtime (via `registerPlatform()` in `src/platforms/provider.ts`) and, if a `ui` entry is provided, its sidebar UI (via `registerPlatformUi()` in `platform-view-manifest.ts`). `listExtensionPlatforms()` returns the unified list in runtime-manifest order, merging any UI entries that are present. `registerRuntimePlatform()` is a compatibility alias for registering runtime-only platforms using the existing public surface.

---

## Memory refresh

The memory inspector polls the adapter for live register and memory snapshots while the session is paused. The refresh controller (`tec1RefreshController`, `tec1gRefreshController`) manages this polling:

- Start polling when the memory tab becomes active.
- Stop polling when the panel is hidden or the tab switches away.
- Poll at 150 ms intervals.
- On each poll, call `session.customRequest('debug80/memorySnapshot', snapshotPayload)` and post the result as a `snapshot` message.

The snapshot payload describes which memory regions and views are currently displayed. The adapter reads those regions from the Z80 memory array and returns them in a single response.

---

## Project status and the three-state model

`getProjectStatusPayload()` assembles the project header data and signals one of three explicit project states via the `projectState` field of `ProjectStatusPayload`.

### `projectState` values

| Value             | Condition                                | What the provider includes                                                        |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| `'noWorkspace'`   | No workspace folder selected             | `roots[]` only                                                                    |
| `'uninitialized'` | Folder selected, no `debug80.json` found | `rootName`, `rootPath`, `platform` (current or `'simple'`), `stopOnEntry`         |
| `'initialized'`   | Folder has a `debug80.json`              | Full payload: `targets[]`, `targetName`, `platform`, `stopOnEntry`, `entrySource` |

The `'uninitialized'` branch includes `platform: this.currentPlatform ?? 'simple'` so the webview can show the Platform selector at its correct value even before a project config exists.

### Webview state helpers — `webview/common/`

Three shared modules translate the payload into rendering decisions:

**`project-state.ts`** — exports `ProjectViewState = 'noWorkspace' | 'uninitialized' | 'initialized'` and `resolveProjectViewState(payload)`. The function prefers the explicit `projectState` field when present, falling back to inferring state from `hasProject` and `rootPath` for backward compatibility.

**`setup-card-state.ts`** — exports `resolveSetupCardState(selectedRoot, projectState, targetCount): SetupCardState | null`. Returns the text and primary-action label for the onboarding card, or `null` to hide it:

- `noWorkspace` / no selected root → "No workspace folder is open" + **Open Folder** button
- `uninitialized` → "Uninitialized Debug80 project" + **Initialize Project** button
- `initialized` → `null` (card hidden)

**`project-controls.ts`** — exports `applyInitializedProjectControls(payload, elements)`. Enforces which controls are visible based on `projectState`:

| Control               | `noWorkspace` | `uninitialized` | `initialized` |
| --------------------- | ------------- | --------------- | ------------- |
| Platform selector     | hidden        | **visible**     | hidden        |
| `platformInfoControl` | hidden        | hidden          | hidden        |
| Target control        | hidden        | hidden          | **visible**   |
| Stop on entry label   | hidden        | hidden          | **visible**   |
| Build and Run buttons | hidden        | hidden          | **visible**   |
| Tabs (UI / Memory)    | hidden        | hidden          | **visible**   |
| Panel content areas   | hidden        | hidden          | **visible**   |

The Platform selector is intentionally shown in the uninitialized state so the user can choose a platform before clicking Initialize Project. Once the project exists, the platform is stored in `debug80.json` and the selector is hidden. The `platformInfoControl` element (a read-only platform label) is always hidden — it exists in the HTML for legacy reasons but is never made visible by `applyInitializedProjectControls`.

Because VS Code webview stylesheets set `display: flex` on `.project-control` elements, the UA `[hidden]` → `display: none` rule is overridden. `webview/common/styles.css` includes an explicit `.project-control[hidden] { display: none }` rule, and likewise `.stop-on-entry-label[hidden] { display: none }`, to ensure hidden controls are correctly invisible.

---

## Project scaffolding and project kits

When `debug80.createProject` runs for a new workspace, it calls `scaffoldProject()` in `src/extension/project-scaffolding.ts`. The core abstraction that replaced the old ad-hoc platform field is the **project kit** (`src/extension/project-kits.ts`).

### `ProjectKit`

A `ProjectKit` is an immutable descriptor for one platform/profile combination:

```typescript
type ProjectKit = {
  id: ProjectKitId; // e.g. 'tec1/mon1b'
  platform: ScaffoldPlatform; // 'simple' | 'tec1' | 'tec1g'
  profileName: string; // profile key written into debug80.json
  label: string; // shown in the quick-pick
  description: string;
  appStart: number;
  entry: number;
  starterTemplates: Record<StarterLanguage, string>; // relative template paths
  bundledProfile?: {
    bundleRelPath: string; // versioned bundle dir path, e.g. 'tec1/mon1b/v1'
    romPath: string; // workspace-relative ROM destination
    debugMapPath?: string;
    sourcePath?: string;
    sourceRoots: string[];
  };
};
```

The four built-in kits are:

| Kit ID            | Platform | Profile      | Monitor          |
| ----------------- | -------- | ------------ | ---------------- |
| `simple/default`  | `simple` | `default`    | none             |
| `tec1/classic-2k` | `tec1`   | `classic-2k` | none             |
| `tec1/mon1b`      | `tec1`   | `mon1b`      | MON-1B (bundled) |
| `tec1g/mon3`      | `tec1g`  | `mon3`       | MON3 (bundled)   |

### Kit selection — `getDefaultProjectKitForPlatform()` and `chooseProjectKit()`

`project-kits.ts` exports two selection paths:

**`getDefaultProjectKitForPlatform(platform)`** — returns the single default kit for a platform string (`'simple'`, `'tec1'`, or `'tec1g'`) without showing any picker. This is the path taken when the user clicks **Initialize Project** from the panel's uninitialized state: the platform value already shown in the Platform selector is passed directly, and the project is scaffolded immediately using the platform's bundle-first default kit (TEC-1 → `tec1/mon1b`; TEC-1G → `tec1g/mon3`; Simple → `simple/default`). In this path the scaffold does not ask for target name or source language; it creates `src/main.asm` and derives the initial target name from that file.

**`chooseProjectKit(preselectedPlatform?)`** — the interactive path. Calls `getProjectKitChoices()` / `listProjectKits()`. If only one kit matches the platform, the picker is skipped. Otherwise a `showQuickPick()` prompt lists all matching kits. This path is used when the command is invoked without a pre-selected platform (e.g. from the Command Palette).

The `platform?` field on the `createProject` webview message flows through `handleCreateProject` in `platform-view-messages.ts` into the `debug80.createProject` command args and then into `scaffoldProject()`.

### `buildScaffoldPlan()` — interactive plan construction

After kit selection, `buildScaffoldPlan()` collects the remaining inputs:

1. A target name (input box, default `'app'`).
2. A source file choice: an existing `.asm` file from the workspace, a new assembly starter file, or **No target yet** for a zero-target project.

The result is a `ScaffoldPlan` — `{ kit, targetName, sourceFile, outputDir, artifactBase, starterLanguage?, starterFile?, noTarget? }`.

### `createDefaultProjectConfig()` — writing `debug80.json`

`createDefaultProjectConfig(plan)` assembles the `debug80.json` structure from the plan:

- A `profiles` section with one entry (`plan.kit.profileName`) containing the platform, description, and — if the kit has a `bundledProfile` — a `bundledAssets` map with `romHex`, optional `debugMap`, and optional `source` entries (each a `BundledAssetReference`).
- A `targets` section with one entry (`plan.targetName`) containing `sourceFile`, `outputDir`, `artifactBase`, `platform`, `profile`, and the platform-specific memory map block (`simple`, `tec1`, or `tec1g`). For kits with a `bundledProfile`, the target block also includes `romHex` and `sourceRoots`. The `tec1g/custom` kit remains project-owned rather than bundle-backed, so its target block writes explicit `romHex` and `expansionRomHex` paths under `roms/tec1g/custom/`.
- Top-level `projectVersion`, `projectPlatform`, `defaultProfile`, and, when a target is scaffolded immediately, `defaultTarget` fields.

When the scaffold creates or updates project files, it also calls `ensureDebug80Gitignore()` in `src/extension/project-gitignore.ts` to create or append a standard **Debug80**-marked ignore block (see Chapter 2). The normal panel initialization path writes root `debug80.json` and does not create `.vscode/launch.json`; launch scaffolding is an explicit optional path.

Bundled ROM files are **not copied during scaffolding**. The generated profile records `BundledAssetReference` entries. During launch, `resolveBundledAssetRuntimePath()` in `src/debug/launch/launch-config-merge.ts` checks the workspace path first; if that path is missing and corresponds to the bundled asset destination, it falls back to the copy inside the extension bundle. The explicit `debug80.materializeBundledRom` command is surfaced as **Debug80: Copy Monitor ROM into Project** and copies the whole monitor bundle when the user wants to work on monitor source locally.

Local monitor development is enabled by a convention rather than another user-facing config field. The copy command creates a platform-specific ROM entry source:

- TEC-1G / MON-3: `roms/tec1g/mon3/mon3.rom.asm`
- TEC-1 / MON-1B: `roms/tec1/mon1b/mon1b.rom.asm`

On launch, `buildLaunchSession()` in `src/debug/launch/launch-sequence.ts` now stages ROM-related overrides in two passes before platform resolution:

1. `buildTec1gRomArtifactsIfRequested()` assembles active `tec1g.romArtifacts` for TEC-1G launches, requiring `.bin` output paths and AZM-derived `.d8.json` siblings. Monitor artifacts replace `tec1g.romHex`, expansion artifacts replace `tec1g.expansionRomHex`, generated D8 maps are prepended to `debugMaps`, and the artifact source directories are appended to `sourceRoots`.
2. `buildLocalMonitorRomIfPresent()` still checks for the conventional platform `*.rom.asm` file. If it exists and assembly is enabled, Debug80 builds it into `build/roms/...`, then mutates the launch arguments so the platform `romHex` points at the generated ROM HEX and `debugMaps` includes the generated D8 map.

If neither override path is active, the normal bundled-ROM fallback remains in effect.

### Starter templates

If the user chose to create a starter source file, `createStarterSourceContent()` reads the template from `resources/project-kits/<kit.starterTemplates[language]>` via `readProjectKitStarterTemplate()`. The file is written to the workspace before `debug80.json` is created. If the file already exists, it is not overwritten. The current TEC-1G / MON-3 starter is not a bare loop: it sets `SP` to `0x7fff`, clears the LCD through MON-3 `RST 0x10` APIs, writes `Debug80 TEC-1G` on LCD row 1, then continuously calls the MON-3 segment-scan API so the six-digit display shows `HELLO`.

---

## Summary

- `PlatformViewProvider` is the single point of contact between the debug adapter and the webview. It holds all hardware display state and serial/terminal buffers in memory on the extension host side for all three platforms simultaneously.

- The Debug80 panel is registered under `"views": { "debug": [...] }` in `package.json`, placing it as a collapsible subpanel in the **Run & Debug sidebar**. The `"onView:debug80.platformView"` activation event ensures the extension starts as soon as the user expands the panel.

- The panel uses a **responsive two-column layout** driven by CSS container queries on `#app`. Below 440 px (TEC-1) or 480 px (TEC-1G) the layout collapses to a single column; above those thresholds the original two-column grid is restored.

- The webview HTML is regenerated on every platform switch and sidebar reveal. Buffered state is reposted from in-memory copies, making the panel self-restoring.

- The `uiRevision` counter only ever increments — it is never reset, not even when the webview HTML is replaced. The webview's own counter resets when new HTML is set; the host counter does not.

- Message routing is handled by `handlePlatformViewMessage()` in `platform-view-messages.ts`, composed from project, serial and active-platform routing helpers. Serial file workflows are in `platform-view-serial-actions.ts`. Platform-specific dispatch calls `modules.handleMessage()` via the `PlatformUiModules` interface — no platform branching in the routing layer.

- `ProjectStatusPayload` carries a `projectState` field with three explicit values: `'noWorkspace'`, `'uninitialized'`, and `'initialized'`. The webview uses `resolveProjectViewState()` from `webview/common/project-state.ts` to map this to rendering decisions. `applyInitializedProjectControls()` from `webview/common/project-controls.ts` shows or hides each control depending on the state — the Platform selector is visible only while uninitialized; all debug controls are visible only once initialized.

- When `projectState` is `'uninitialized'`, the setup card shows an **Initialize Project** button. Clicking it sends `createProject` with the platform currently shown in the Platform selector. The extension uses `getDefaultProjectKitForPlatform()` to resolve the default kit and scaffolds the project without displaying any pickers.

- **Stop on entry** is a global session toggle held as `public stopOnEntry = false` on `PlatformViewProvider` — not stored in `debug80.json` and not persisted across restarts. It defaults to `false`. When the checkbox changes, the provider updates the field and broadcasts a `projectStatus` refresh; the new value applies on the **next explicit restart** (it does not trigger an automatic restart). At every call to `startCurrentProjectDebugging()`, `platformViewProvider.stopOnEntry` is passed directly in the launch config object, taking priority over any `stopOnEntry` value left in the project config.

- **Restart semantics for workspace changes**: `debug80.selectWorkspaceFolder` restarts the active debug session whenever the selected project config **path** changes — regardless of whether the platform changed. Previously the restart was only triggered on a platform change.

- The provider holds two parallel maps: `platformStates` (hardware state, serial buffer, tab) and `loadedModules` (behaviour — HTML generation, state serialization, message handling). Modules are loaded once at startup via `preloadAllPlatforms()` and cached permanently. `PlatformUiModules` in `platform-view-manifest.ts` is the interface every platform UI must satisfy.

- The shared message contract is defined in `src/contracts/platform-view.ts`: `PlatformId`, `ProjectStatusPayload` (includes `projectState`, `platform`, `stopOnEntry`, AZM option fields, CoolTerm status, separate build status, and source-map status), `PlatformViewControlMessage` (includes `setStopOnEntry`, `setAzmOptions`, `sendHexViaCoolTerm`, `saveProjectConfig`, and `createProject` with optional `platform?`), and `PlatformViewInboundMessage`.

- `registerExtensionPlatform()` in `platform-extension-model.ts` is the unified API for registering both the runtime and UI concerns of a platform in a single call.

- The memory refresh controller polls the adapter at 150 ms intervals when the memory tab is active and the panel is visible. Polling stops automatically on tab switch or panel hide.

- Project status is assembled from workspace folders, `debug80.json` discovery, workspace-persisted target selection, the active platform ID, and inferred build/source-map state. It emits one of three `projectState` values and drives the project header (Project button + `+` / `-` workspace-folder buttons, Target dropdown, Platform dropdown, Stop-on-entry checkbox, Strict labels checkbox, Build button, and Run button). The same payload also carries the selected target's inferred HEX path for CoolTerm, a build-status line for build-only and assembly-failure feedback, and a source-map freshness summary.

- Project scaffolding is driven by **project kits** (`src/extension/project-kits.ts`). A kit packages the platform, profile name, memory-map defaults, starter templates, and optional bundled ROM references into a single descriptor. `buildScaffoldPlan()` selects a kit interactively (command palette path); `getDefaultProjectKitForPlatform()` selects the bundle-first default silently (panel initialization path). `createDefaultProjectConfig()` writes `profiles` and `targets` from the chosen kit. Bundled ROM references resolve to workspace files first, then extension-bundled files; `debug80.materializeBundledRom` installs workspace copies and the conventional local `*.rom.asm` entry point on demand.

---

[Part V](index.md) | [The Webview Panels →](13-the-webview-panels.md)
