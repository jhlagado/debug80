# Debug80 Technical Guide

This document is the single technical reference for the Debug80 VS Code extension and debugger.
It is written for developers who have not built a VS Code extension before, and for anyone
interested in the assembler pipeline, source mapping, and stepping behavior.

## 1. What Debug80 is

Debug80 is a VS Code extension that embeds a Z80 debug adapter. It:

- Loads Intel HEX for runtime memory.
- Reads AZM native D8 maps for address-to-source mapping.
- Optionally runs AZM before each launch.
- Implements stepping, breakpoints, registers, and a simple terminal I/O bridge.

## 2. High-level architecture

Text diagram (left -> right = flow of control):

VS Code UI
-> Extension activation (src/extension/extension.ts)
-> Debug Adapter Factory (src/debug/adapter.ts)
-> Z80DebugSession (DAP server)
-> Z80 runtime + memory (src/z80/_)
-> Mapping pipeline (src/mapping/_)

Key concepts:

- The extension registers a debug adapter type named `z80`.
- The debug adapter runs in-process (inline implementation), not as a separate server.
- The runtime executes Z80 instructions directly in JS/TS.

## 3. Repo layout

- src/extension/extension.ts
  - VS Code activation and command wiring.
  - Registers the debug adapter factory and built-in platform UIs.
  - Wires the sidebar platform view provider.
- src/extension/platform-view-provider.ts
  - PlatformViewProvider: WebviewViewProvider for the Debug80 sidebar.
  - Manages per-platform in-memory UI state and serial buffers.
  - Posts messages to the webview and handles inbound webview messages.
- src/extension/platform-extension-model.ts / platform-view-manifest.ts
  - Platform registration registry (runtime + UI).
  - `registerExtensionPlatform()` / `listPlatformUis()` / `loadPlatformUi()`.
- src/extension/debug-session-events.ts
  - Wires debug session lifecycle and custom DAP event handlers.
  - Routes `debug80/terminalOutput` to the sidebar (simple) or terminal panel (others).
- src/extension/platform-ui-entries.ts
  - Factory functions for built-in platform UI module bundles (Simple, TEC-1, TEC-1G).
- src/platforms/_/ui-panel-_.ts
  - Per-platform UI modules: HTML generation, state management, message handling, memory views.
- webview/
  - Browser-side source for all three platform panels (simple/, tec1/, tec1g/).
  - common/ — shared utilities: VS Code API bridge, session status, memory panel, serial helpers.
- src/debug/adapter.ts
  - Main debug adapter (Z80DebugSession). Stays at the top level of src/debug/.
  - Launch/config merge, assembler invocation, breakpoint resolution, stepping.
- src/debug/launch/
  - Launch pipeline: assembler invocation, program loading, config validation, source-state setup.
  - Key files: assembler.ts, assembler-backend.ts, azm-backend.ts,
    launch-pipeline.ts, launch-sequence.ts, launch-source-state.ts,
    program-loader.ts, config-utils.ts, config-validation.ts.
- src/debug/requests/
  - DAP request handlers extracted from the adapter: breakpoints, stepping, memory, registers,
    terminal, ROM, matrix, platform commands, warm-rebuild, variable scope.
  - Key files: adapter-request-controller.ts, command-router.ts, rebuild-request.ts, and
    per-request modules (io-requests.ts, memory-request.ts, register-request.ts, etc.).
- src/debug/mapping/
  - Mapping utilities used at runtime: path resolution, source management, breakpoint tracking,
    symbol service, stack frames, debug addressing.
  - Key files: mapping-service.ts, path-resolver.ts, breakpoint-manager.ts, stack-service.ts,
    source-manager.ts, source-state-manager.ts, symbol-service.ts.
- src/debug/session/
  - Session types and stateful helpers: session state shape, runtime control, adapter UI helpers,
    platform host/registry, error classes, and message/type definitions.
  - Key files: types.ts, session-state.ts, runtime-control.ts, platform-host.ts,
    platform-registry.ts, adapter-ui.ts, errors.ts, message-types.ts, memory-\*.ts.
- src/mapping/\*
  - D8 map conversion, validation, include-remap cleanup, and index building.
- src/z80/\*
  - CPU, runtime, and instruction execution.
  - HEX loading.

## 4. Extension activation and commands

Entry point: src/extension/extension.ts

Activation does four important things:

1. Registers the three built-in platform UIs (Simple, TEC-1, TEC-1G) via `registerBuiltInPlatformUis()`.
2. Registers the debug adapter for type `z80`.
3. Registers the `PlatformViewProvider` sidebar WebviewView (`debug80.platformView`).
4. Registers commands and debug session event handlers.

Registered commands (src/extension/commands.ts):

- debug80.createProject — scaffold a debug80.json in the workspace
- debug80.startDebug — launch a debug session for the selected target
- debug80.restartDebug — build the active target and update the current debug session
- debug80.selectWorkspaceFolder — change the active workspace root
- debug80.selectTarget — change the active launch target
- debug80.configureProject — open project config (currently a no-op; config is via project header)
- debug80.openProjectConfigPanel — open the project config JSON in an editor
- debug80.setEntrySource — set the main source file for the active target
- debug80.openTerminal — open the terminal panel (non-platform sessions)
- debug80.terminalInput — send text input to the active debug session terminal
- debug80.openTec1 — reveal the Debug80 platform panel
- debug80.openTec1Memory — switch the platform panel to the memory tab
- debug80.openRomSource — open auxiliary source files for the active session
- debug80.openDebug80View — reveal and focus the Debug80 sidebar panel
- debug80.addWorkspaceFolder — open a folder picker and add the chosen folder to the workspace
- debug80.materializeBundledRom — manually install bundled ROM assets into the active workspace

Important behavior for new VS Code extension developers:

- The debug adapter is created with vscode.DebugAdapterInlineImplementation.
- Terminal output is sent from the adapter via custom DAP events (see section 13).
- Platform UI is served from the sidebar WebviewView, not from a WebviewPanel.

## 5. Debug Adapter Protocol (DAP) flow

Class: Z80DebugSession in src/debug/adapter.ts

DAP lifecycle (simplified):

1. initializeRequest
   - Announces adapter capabilities.
2. launchRequest
   - Merges launch args with debug80.json.
   - Resolves artifacts (HEX, BIN, D8) and runs AZM if enabled.
   - Parses HEX and native D8 source maps.
   - Builds source mapping and indexes.
   - Creates the runtime and applies breakpoints.
3. configurationDoneRequest (implicit behavior)
4. continue / step / pause / disconnect

## 6. Project configuration

### 6.1 Config file discovery

Sources are searched in this order:

1. launch args.projectConfig
2. debug80.json ← checked first among file candidates (PROJECT_CONFIG_CANDIDATES)
3. .vscode/debug80.json
4. package.json (debug80 block)

Search origin:

- args.asm -> args.sourceFile -> process.cwd()
- Walk upward to filesystem root, first match wins.

Note: in extension development host, process.cwd() can be the extension repo,
so root-based discovery may miss the user workspace unless debug80.json is present.

### 6.2 Launch args and target merging

Launch args are merged with config targets in populateFromConfig().
Common fields:

- sourceFile (aka asm)
- outputDir
- artifactBase
- entry
- assemble (default true)
- hex (override)
- sourceRoots (list of extra source folders)
- stepOverMaxInstructions / stepOutMaxInstructions
- terminal (I/O bridge config)

Bundled profile assets are resolved during this merge step. Scaffolded TEC-1
and TEC-1G projects keep stable workspace-relative paths such as
`roms/tec1/mon1b/mon-1b.bin` or `roms/tec1g/mon3/mon3.bin` in the platform
config. If the file exists in the workspace it is used as an override; if it is
absent and `profiles.<name>.bundledAssets` maps that logical path to a shipped
bundle, Debug80 uses the copy under `resources/bundles/`.

AZM writes the D8 debug map to `<artifactBase>.d8.json` in `outputDir`; Debug80
loads that map as the source of truth.

### 6.3 Scaffold command

Command: debug80.createProject

- Writes debug80.json using the selected project kit and target source.
- Writes .vscode/launch.json if missing.
- Creates directories (outputDir, .vscode, etc).
- For bundled TEC-1/TEC-1G kits, writes profile-level `bundledAssets`
  references instead of copying stock ROM files into the workspace.

## 7. Assembler integration

Debug80 routes assembly through a backend abstraction in `src/debug/launch/assembler-backend.ts`.
The current default backend is `azm`, implemented in `src/debug/launch/azm-backend.ts`.

If `assemble !== false` and `sourceFile`/`asm` is provided:

- The selected backend assembles the program to HEX, BIN, and D8 artifacts.
- Debug80 links the `@jhlagado/azm` compiler directly through its public library API and writes
  HEX, compact BIN, D8, and register-care artifacts itself.
- The backend interface is async even when a backend is currently synchronous. This keeps launch and
  warm-rebuild semantics consistent and avoids shelling out for ESM-only libraries.
- Errors are printed to the Debug Console and returned as structured assembly diagnostics when possible.

The backend also optionally supports:

- A binary output pass for `simple.binFrom` / `simple.binTo`.

Expected tools:

- `@jhlagado/azm` is a normal extension dependency and must be included in the VSIX.
- Debug80 should not depend on globally installed assembler CLIs for published-extension behavior.
- AZM is ESM and is loaded with dynamic `import()` from the CommonJS extension host output.

## 8. Runtime and execution model

Runtime entry point: src/z80/runtime.ts

Key ideas:

- The runtime loads a 64K memory image from HEX.
- Each step executes a single instruction via execute() (src/z80/cpu.ts).
- runUntilStop loops instruction execution until a breakpoint, HALT, or pause.

Register display:

- The adapter exposes standard Z80 registers (AF, BC, DE, HL, IX, IY, etc).

## 9. Source mapping pipeline

The pipeline is **orchestrated from `src/debug/mapping-service.ts`**. Start
there when investigating how an AZM D8 map is located, validated, converted to
runtime segments/anchors, and indexed.

Debug80 uses AZM's native D8 source map. If the D8 map is missing or invalid,
source-map-backed features are unavailable until the target is rebuilt with AZM.

### 9.1 D8 loading and cleanup

Files:

- `src/debug/mapping/mapping-service.ts`
- `src/mapping/d8-map.ts`
- `src/mapping/d8-map-validate.ts`
- `src/mapping/include-remap.ts`

The D8 loader converts native `files[*].segments` and `files[*].symbols`
entries into Debug80's internal segments and anchors. A small include-remap pass
handles known cases where an assembler attributes included source to the parent
file even though the sibling include file owns the label.

### 9.2 Indexes for fast lookup

File: src/mapping/source-map.ts

Indexes built at launch:

- segmentsByAddress (sorted, for PC -> location)
- segmentsByFileLine (for breakpoint resolution)
- anchorsByFile (for fallback when no exact line match exists)

### 9.3 D8 Debug Map (D8M) format

Debug80 uses the D8 map as the canonical mapping source for debugging. On
launch it attempts to load `<artifactBase>.d8.json` beside the build artifact.
The on-disk standard is documented in `docs/d8-debug-map.md`.

The old `.debug80/cache/*.d8.json` project-local map cache has been removed;
active-target runtime features use the native build-side map beside the
artifact. Native AZM maps carry `files[*].symbols` entries for labels and
constants, which power navigation, hovers, variables, watches, and call stack
labels.

Source-map fallback policy:

- Debug80 loads the selected target source map from the resolved build artifact
  path: `<outputDir>/<artifactBase>.d8.json`.
- Platform ROM mapping is loaded only from explicit bundled/source-map paths in
  the platform configuration.
- Debug80 does not search `.debug80/cache`, does not generate D8 maps from
  listings, and does not derive fallback maps from source text.
- Current AZM D8 files may still contain historical field names such as
  `lstLine`, `lstText`, and `lstTextId`; these fields are accepted only as
  native AZM source-context fields, not as evidence of listing-derived Debug80
  fallback behavior.
- If the source map is missing or invalid, source-map-backed features become
  unavailable until the user builds the target again.

Editor navigation also uses source-map data. Debug80 registers VS Code providers
for Go to Definition, workspace symbols, and compact symbol hover on `z80-asm`
documents. These providers load the active target's D8 map and use
`files[*].symbols` from the last successful build instead of scanning source
text. User-facing messages call this a "source map": if no map exists, the user
must build the target before source-map-backed navigation is available; if the
map appears older than mapped source files, Debug80 warns but still uses it.
Symbol hovers also recognize nearby AZMDoc register-care contracts and render
both current multi-line contract comments and future compact single-line
contract comments as one concise hover line.

The Project panel also shows the active target's source-map status. Missing maps
tell the user to build the selected target, invalid maps ask for a rebuild, and
stale maps are called out as advisory rather than blocking debugger launch.

Run to Cursor is implemented through VS Code's normal DAP `gotoTargets` /
`goto` flow. Debug80 resolves the requested source line through the active
mapping index, creates a temporary run target, continues execution, and stops
when the target address is reached.

Stack traces are source-map aware. Frame 0 is the current PC, labelled with the
nearest source-map symbol and an offset, for example `UpdatePlayer+6`, instead
of the old generic `main` label. Debug80 then reads up to eight 16-bit words from
the current Z80 `SP` and treats them as best-effort return-address candidates.
Mapped candidates are displayed as symbolic stack entries; unmapped candidates
are shown as raw addresses marked as likely data. This is intentionally a view
over the machine stack, not a guaranteed high-level language call stack.

The command `Run to Here` is available from the Call Stack context menu while
debugging Z80 code. It only acts on caller return frames whose stack word maps
to known source code. The command sets a temporary run target at that return
address and lets the program execute normally until it arrives there; it does
not rewrite `SP`, `PC`, or stack memory.

The VS Code Variables panel now exposes source-map-backed Symbols and, when
available, Constants instead of duplicating registers; register display/editing
lives in Debug80's own Registers panel. Constants are value symbols from the
active target's D8 map, typically `EQU`-style definitions emitted by AZM. If the
active map has no value-only symbols, Debug80 hides the Constants scope rather
than showing an empty group. Without richer AZM metadata, Debug80 presents
memory-backed symbols conservatively: address, symbol kind, known size, first
byte, a word when size suggests it, a short byte preview, printable ASCII where
available, and source location.

The VS Code Watch panel uses the same paused runtime state plus active D8 source
map symbols to evaluate small Z80-focused expressions. Registers are available
with their normal names, including alternates such as `AF'` and `BC'`. Flags use
AZM register-care names (`zero`, `carry`, `sign`, `parity`, `halfCarry`) to avoid
confusion with registers. Square brackets read one byte from memory (`[HL]`,
`[PACMO_LIVES]`, `[IX + 4]`), while parentheses are reserved for grouping.
Arithmetic supports `+ - * / %`; bitwise operators are `& | ^ ~`; comparisons
are `eq ne lt le gt ge`; logical operators are `and`, `or`, and `not`. Zero is
false and any non-zero value is true.

Conditional breakpoints use the same evaluator. VS Code sends each breakpoint
condition with the source breakpoint, Debug80 stores the condition on the
resolved executable address, and the runtime checks it when the PC reaches that
address. A false or zero result lets execution continue. A true or non-zero
result stops with the normal breakpoint reason. Expression errors are treated as
breakpoint hits and are reported to the Debug Console, which avoids silently
skipping a breakpoint because of a typo or stale source-map symbol.

The orchestration for loading and validating these maps lives in
`src/debug/mapping-service.ts` (`buildMappingFromDebugMap`). This is distinct
from the data-format layer in `src/mapping/`.

### 9.4 Platforms

The debugger core runs against a platform abstraction that supplies memory and
I/O devices. Platform selection is per target in `debug80.json`. The platform
spec and configuration layout are defined in `docs/platforms.md`.

## 10. Breakpoints and stack frames

### 10.1 Breakpoint resolution

- For source breakpoints, resolve exact file:line to executable D8 segments.
- Non-executable symbols can still appear in navigation and variables, but they
  are not bound as executable breakpoints.

### 10.2 PC -> source location

- If a segment contains the PC and has loc.file, use it.
- If loc.line is missing, fallback to nearest anchor line <= PC.
- If no mapping exists, use the configured source file as a minimal fallback.

## 11. Stepping behavior

Stepping combines runtime instruction execution and adapter logic.

### 11.1 Step In

- Executes one instruction and stops at the next PC.

### 11.2 Step Over

- If the current instruction is a taken CALL or RST:
  - Run until the return address is hit.
- Otherwise, step a single instruction.

Return address rules:

- CALL nn or conditional CALL: pc + 3
- RST n: pc + 1

### 11.3 Step Out

- Tracks callDepth based on taken CALL/RST and RET/RETI/RETN.
- On Step Out, run until callDepth drops below the baseline depth.

### 11.4 Step limits

Optional caps:

- stepOverMaxInstructions
- stepOutMaxInstructions

When a cap is hit:

- Execution stops and logs a console message.
- The session remains active.

## 12. Pause, HALT, and stop behavior

- Pause interrupts the run loop and stops at the current PC.
- HALT stops execution; a second Continue terminates the session.
- Stop (disconnect) terminates the session immediately.

## 13. Terminal and I/O bridge

Launch args.terminal configures a basic port-based terminal:

- txPort: output port
- rxPort: input port
- statusPort: ready/available flags
- interrupt: optional break-to-NMI behavior

Custom requests:

- debug80/terminalInput (send text to rx buffer)
- debug80/terminalBreak (trigger interrupt on next tick)

The extension receives output via the `debug80/terminalOutput` custom DAP event.
Routing depends on the session platform (determined by the preceding `debug80/platform` event):

- **Simple platform sessions**: output is routed to the sidebar UI tab via
  `PlatformViewProvider.appendSimpleTerminal()`. The terminal content appears in
  the "TERMINAL" area of the simple platform's UI tab. No separate VS Code panel is opened.
- **All other sessions** (no recognized platform ID): output is routed to
  `TerminalPanelController`, which opens a dedicated VS Code panel if one is not already open.

## 14. Platform sidebar UI

### 14.1 Overview

The Debug80 sidebar (`debug80.platformView`) is a VS Code `WebviewViewProvider` implemented by
`PlatformViewProvider` (`src/extension/platform-view-provider.ts`). It is a single persistent
webview that swaps its HTML content when the active platform changes. All three built-in platforms
share this one sidebar location.

Built-in platforms and their sidebar behavior:

| Platform | UI tab content                                                  | CPU tab content                |
| -------- | --------------------------------------------------------------- | ------------------------------ |
| Simple   | Terminal output (TERMINAL area + CLEAR button)                  | Z80 memory viewer (4 sections) |
| TEC-1    | Hardware display, keypad, LCD, 8×8 LED matrix, serial terminal  | Z80 memory viewer              |
| TEC-1G   | Hardware display, keypad, GLCD, RGB LED matrix, serial terminal | Z80 memory viewer              |

### 14.2 Platform registration

Platforms register a runtime provider and a UI module bundle via `registerExtensionPlatform()`
in `src/extension/platform-extension-model.ts`. The three built-in registrations happen in
`registerBuiltInPlatformUis()` inside `extension.ts`.

Each UI entry (`PlatformUiEntry`) provides a `loadUiModules()` factory that lazily imports four
modules: `ui-panel-html`, `ui-panel-memory`, `ui-panel-messages`, and `ui-panel-state`.
These are combined into a `PlatformUiModules` bundle used by `PlatformViewProvider` to
generate HTML, apply updates, handle messages, and build serialized update payloads.

### 14.3 Project header

Every platform panel includes a project header at the top with three controls:

- **Project button** — shows the active workspace root name; with no folders it offers **Open Folder**; with multiple folders it opens the VS Code Quick Pick to choose the Debug80 workspace root (see `docs/adr/0001-project-workspace-root-control.md`).
- **Target select** — dropdown of available launch targets from `debug80.json`.
- **Platform select** — dropdown with options Simple / TEC-1 / TEC-1G.
  - Changing this dropdown immediately posts a `saveProjectConfig` message to the extension.
  - The extension writes `projectPlatform` and all per-target `platform` fields in `debug80.json`,
    then executes `debug80.restartDebug` to restart the emulator with the new platform.

### 14.4 Setup card

A setup card is shown at the top of the panel when the workspace is not ready:

- No workspace roots available → "Select a workspace root to get started." + Open Folder button.
- Workspace available but no project → "No debug80.json found..." message. The **Create Project**
  action is available via the inline **Initialize** button that appears next to the platform
  selector in the project header row. The setup card's own primary action button is hidden in
  this state to avoid duplication with the inline button.

The setup card is **hidden entirely** once a project exists with at least one target. There is no
"configured" or "ready" state shown — the project header controls are always visible and sufficient.

### 14.5 Session status button

Below the project header and tabs sits a session status button showing the current debug session
state. It doubles as a start/stop toggle:

- **Not running** — click to start debugging (`debug80.startDebug`).
- **Starting / Running / Paused** — click to stop the active session.

The status is driven by `debug80/sessionStatus` custom DAP events from the adapter.

### 14.6 Tab structure

Both Simple and TEC-1/TEC-1G panels use the same two-tab layout:

- **UI tab** (default on session start) — platform-specific content.
- **CPU tab** — Z80 memory inspector (four independently-addressed 16-byte dump sections,
  register strip, live refresh during pause).

Tab state is persisted in the extension host per-platform state and restored during webview
rehydration (see section 14.9).

### 14.7 Simple platform UI tab

The Simple platform has no hardware display. Its UI tab contains:

- **TERMINAL area** — a `<pre>` element that accumulates output text from the Z80 program's
  configured tx port (via `debug80/terminalOutput` DAP events, routed to the sidebar for simple
  sessions).
- **CLEAR button** — clears the terminal display and notifies the extension host to clear the
  serial buffer.

The terminal buffer (max 8 000 characters) is maintained in the extension host and replayed into
the webview on every rehydration via a `serialInit` message.

### 14.8 TEC-1 / TEC-1G UI tab

The UI tab for hardware platforms contains the physical hardware emulation display and a serial
terminal section. The serial terminal is driven by `debug80/tec1Serial` / `debug80/tec1gSerial`
custom DAP events and exposes send / save / send-file / clear controls. For TEC-1G the tab also
includes the RGB LED matrix and GLCD renderer.

### 14.9 Webview rehydration

When the sidebar HTML is replaced (platform switch, panel reveal, VS Code restart), the extension
host replays state in this order:

1. `projectStatus` — workspace roots, targets, selected target, platform
2. `sessionStatus` — current debug session state
3. `update` — full UI state snapshot (TEC-1/TEC-1G hardware registers, speaker, etc.)
4. `uiVisibility` — TEC-1G component visibility flags (TEC-1G only)
5. `serialInit` — accumulated serial/terminal buffer text
6. `selectTab` — restores the last active tab
7. Memory refresh restart if the CPU tab was active

### 14.10 Extension ↔ webview message types

**Extension → webview:**

| type            | Description                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `projectStatus` | Workspace roots, targets, selected target name, active platform ID     |
| `sessionStatus` | Debug session state: `starting`, `running`, `paused`, `not running`    |
| `update`        | Full platform UI state snapshot (carries `uiRevision` monotonic guard) |
| `uiVisibility`  | TEC-1G component show/hide flags                                       |
| `serial`        | Incremental text appended to the serial/terminal output                |
| `serialInit`    | Full serial/terminal buffer on rehydration                             |
| `serialClear`   | Clear the serial/terminal display                                      |
| `selectTab`     | Restore the active tab (`ui` or `memory`)                              |
| `snapshot`      | Memory dump for the CPU tab (register strip + hex sections)            |
| `snapshotError` | Error message when snapshot fails                                      |

**Webview → extension:**

| type                  | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `tab`                 | User switched to `ui` or `memory` tab                            |
| `saveProjectConfig`   | User changed Platform dropdown; payload: `{ platform: string }`  |
| `selectTarget`        | User changed Target dropdown                                     |
| `openWorkspaceFolder` | User clicked the workspace folder button                         |
| `createProject`       | User clicked Create Project in the setup card                    |
| `refresh`             | Memory panel requests a snapshot with updated view configuration |
| `registerEdit`        | User edited a register value in the CPU tab                      |
| `memoryEdit`          | User edited a memory byte in the CPU tab                         |
| `serialSend`          | User sent text via the serial input field                        |
| `serialSendFile`      | User triggered a file send via serial                            |
| `serialSave`          | User saved serial output to a file                               |
| `serialClear`         | User cleared the serial/terminal display                         |
| `key`                 | Keypad key press (TEC-1/TEC-1G)                                  |
| `reset`               | Reset button (TEC-1/TEC-1G)                                      |
| `speed`               | Speed toggle slow/fast (TEC-1/TEC-1G)                            |

## 15. For developers new to VS Code extensions

Key VS Code concepts used here:

- Extension activation: register commands and debug adapter factory.
- Debug Adapter Protocol: the adapter responds to DAP requests.
- Inline debug adapter: adapter runs in the extension host process.
- WebviewViewProvider: the sidebar panel (`debug80.platformView`) is a persistent webview
  that swaps HTML on platform change; see section 14.

If you want to add features, start here:

- New launch args: update LaunchRequestArguments in src/debug/adapter.ts.
- New terminal behavior: update buildIoHandlers() in src/debug/adapter.ts.
- New mapping logic: update src/mapping/\* and the index builder.
- New platform UI: see docs/platform-development-guide.md and docs/platform-extension-api.md.

## 16. Known limitations

- Mapping accuracy depends on the quality of the AZM D8 map.
- process.cwd() discovery may miss the workspace in extension dev host.
- Legacy `.debug80/cache` map output is removed; older specs that mention it
  are historical.
