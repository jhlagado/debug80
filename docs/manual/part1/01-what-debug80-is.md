[Part I](README.md) | [The Project Configuration System →](02-project-configuration.md)

# Chapter 1 — What Debug80 Is and How It Fits Together

Debug80 is a VS Code extension that lets you debug Z80 assembly programs. You write Z80 source, assemble it, and step through it instruction by instruction — inspecting registers, memory, flags, and the I/O peripherals of emulated hardware — all inside VS Code's standard debugging interface.

That description is accurate but it hides the interesting part. The extension does not merely wrap a debugger. It contains a full Z80 CPU emulator, emulations of real retro hardware (the TEC-1 and TEC-1G single-board computers), assembler backends, source-to-address mapping, a custom webview panel with live hardware visualisation, and a pluggable platform system that allows new hardware targets to be added without modifying the core. Understanding how these pieces fit together is the first step toward contributing to any of them.

This chapter maps the territory.

---

## The problem debug80 solves

Z80 programs run on hardware that most developers do not have on their desk. Even when the hardware is available, instrumenting it for debugging — setting breakpoints, inspecting registers, single-stepping — requires specialised equipment. An emulator removes that barrier: the CPU executes in software, so the debugger has full visibility into every cycle.

But an emulator alone is not enough. A Z80 program written for a TEC-1G does not just execute instructions — it drives a 6-digit seven-segment display by strobing I/O ports in a tight loop, reads a matrix keypad by scanning rows and columns, writes pixels to a 128x64 graphical LCD, and communicates over a serial port. If the emulator does not emulate the hardware peripherals, the program does not behave like a program. It behaves like a sequence of port writes that go nowhere.

Debug80 solves both problems. It emulates the Z80 CPU at the instruction level, emulates the I/O peripherals of specific target platforms, and exposes both to VS Code's Debug Adapter Protocol so that the standard debugging UI — breakpoints, stepping, variable inspection — works out of the box. A custom webview panel renders the emulated hardware in real time: you see the seven-segment display update, the LED matrix light up, the LCD draw characters, while you step through the code that drives them.

---

## The three runtime layers

A VS Code extension is not one program. It is three, running in three separate contexts with different capabilities and different communication channels. Understanding this split is essential — it explains why certain code lives where it does and why data must be serialised to cross boundaries.

### The extension host

The extension host is a Node.js process managed by VS Code. This is where the extension's TypeScript code runs: registering commands, managing workspace state, creating webview panels, and listening to debug session events. The extension host has full access to the VS Code API — it can read files, show notifications, open editors, and talk to the debug adapter.

Key files in this layer:

- `src/extension/extension.ts` — the `activate()` function, where everything is wired together
- `src/extension/commands.ts` — command handlers (start debug, select target, etc.)
- `src/extension/platform-view-provider.ts` — creates and manages the sidebar webview
- `src/extension/workspace-selection.ts` — tracks which workspace folder is active
- `src/extension/debug-session-events.ts` — responds to debug session lifecycle events

### The debug adapter

The debug adapter speaks the Debug Adapter Protocol (DAP). VS Code sends it requests — "launch this program," "set a breakpoint at line 12," "what are the current register values?" — and it sends back responses and events. In debug80, the adapter runs in-process (not as a separate executable), but it operates as a logically separate component with its own state.

The adapter is where the Z80 emulator lives. When VS Code says "continue," the adapter runs the Z80 CPU in a loop until it hits a breakpoint or halts. When VS Code says "give me the variables," the adapter reads the emulated CPU's register file and formats the values.

Key files:

- `src/debug/adapter.ts` — the `Z80DebugSession` class, implementing DAP
- `src/debug/adapter-request-controller.ts` — delegates DAP requests to specialised handlers
- `src/debug/session-state.ts` — all per-session state: the runtime, source maps, breakpoints, run state
- `src/debug/launch-sequence.ts` — the pipeline from "launch" to "Z80 is running"
- `src/debug/runtime-control.ts` — execution control: run, step, pause

### The webview

The webview is an iframe rendered in the VS Code sidebar. It runs in a browser context — it has a DOM, can draw on canvases, and handles user input — but it cannot access the file system or the VS Code API directly. It communicates with the extension host exclusively through `postMessage`.

The webview renders the platform-specific hardware visualisation: seven-segment displays, keypad, LED matrix, LCD, GLCD, serial terminal, and the memory/register inspector (the CPU tab).

Key files:

- `webview/tec1g/index.html` — the panel HTML template
- `webview/tec1g/index.ts` — the webview entry point: message handling, tab switching, UI state
- `webview/common/memory-panel.ts` — the CPU tab: register strip, memory dumps, inline editing
- `webview/common/styles.css` — shared styles

### How they communicate

```
Extension Host                     Debug Adapter
     │                                  │
     │  ── DAP requests/responses ──►   │
     │  ◄── DAP events ──────────────   │
     │                                  │
     │  ── customRequest() ──────────►  │   (memory snapshots, register
     │  ◄── response ────────────────   │    writes, platform commands)
     │                                  │
     ▼
  Webview
     │
     │  ◄── postMessage (update) ────   Extension Host
     │  ── postMessage (key press) ──►  Extension Host
```

The extension host is the hub. It receives hardware state updates from the debug adapter (via custom DAP events like `debug80/tec1gUpdate`), reformats them, and posts them to the webview. User actions in the webview (key presses, target selection) are posted back to the extension host, which translates them into DAP custom requests or VS Code commands.

Data crossing these boundaries must be serialisable. You cannot pass a function reference or a class instance from the extension host to the webview. This constraint shapes the message types throughout the codebase — they are plain objects with string, number, boolean, and array fields.

---

## The cast of characters

Debug80 has seven major subsystems. Each one owns a specific responsibility and communicates with the others through defined interfaces. Here is what they are, what they do, and where they live.

### Z80 emulator

**What it does:** Executes Z80 instructions. Maintains the full CPU state — registers, flags, interrupt mode, halt state — and calls out to I/O handlers for port reads and writes.

**Where it lives:** `src/z80/`

**Key type:** `Cpu` — a plain object containing every register (A, B, C, D, E, H, L, F, IX, IY, SP, PC, I, R), the alternate register set, interrupt state, and a cycle counter. This is the single most important data structure in the codebase. Every inspection, every step, every breakpoint check reads from it.

**Key function:** `execute(cpu, callbacks)` — fetches the opcode at PC, decodes it, executes the operation, advances PC, and returns the cycle count. This is the inner loop of the emulator.

### Platform runtimes

**What they do:** Emulate the I/O peripherals of a specific hardware target. A platform runtime provides the I/O callbacks that the Z80 emulator calls on `in` and `out` instructions, and maintains the hardware state (display digits, matrix rows, LCD contents, speaker state).

**Where they live:** `src/platforms/tec1/`, `src/platforms/tec1g/`, `src/platforms/simple/`

**Key type:** `ResolvedPlatformProvider` — the interface every platform must implement. It defines how to build I/O handlers, load ROM assets, resolve the entry point, and register platform-specific DAP commands.

**Key pattern:** Platforms are loaded lazily via dynamic `import()`. The platform registry (`src/platforms/manifest.ts`) maps platform IDs to loader functions. A new platform can be added by implementing the provider interface and registering it — no changes to the debug adapter core.

### Debug adapter

**What it does:** Implements the Debug Adapter Protocol. Handles launch, breakpoints, stepping, variable inspection, and custom requests. Owns the per-session state and orchestrates the Z80 emulator and platform runtime.

**Where it lives:** `src/debug/`

**Key type:** `SessionStateShape` — a large structure holding everything that belongs to a single debug session: the Z80 runtime, source maps, symbol tables, breakpoints, run state flags, platform runtime references, and the loaded program image. Understanding this type is understanding what a debug session *is*.

### Source mapping

**What it does:** Maps between source file lines and Z80 memory addresses. This is what makes breakpoints and "show me the current line" work. Two mapping sources are supported: listing files (`.lst`) produced by the assembler, and D8 debug maps (a JSON format with richer segment and symbol information).

**Where it lives:** `src/mapping/`

**Key type:** `SourceMapIndex` — two maps working in opposite directions. `locationToAddresses` takes a file path and line number and returns the memory addresses that correspond to that source line. `addressToLocation` takes an address and returns the source file and line. Breakpoint resolution uses the first; stack trace display uses the second.

### Assembly pipeline

**What it does:** Assembles Z80 source files into loadable binaries. Two assembler backends are supported: asm80 (a traditional Z80 assembler) and ZAX (a structured assembler with functions and control flow). The pipeline also parses Intel HEX files to load program bytes into the emulated memory.

**Where it lives:** `src/debug/assembler.ts`, `src/debug/asm80-backend.ts`, `src/debug/zax-backend.ts`, `src/z80/loaders.ts`

**Key flow:** Source file → assembler backend → Intel HEX binary + listing file + (optionally) D8 debug map → `parseHex()` → byte array loaded into Z80 memory.

### Extension shell

**What it does:** Wires everything together in the VS Code extension host. Registers commands, manages workspace and project selection, watches for config file changes, handles debug session lifecycle events, and owns the webview panel.

**Where it lives:** `src/extension/`

**Key class:** `PlatformViewProvider` — the `WebviewViewProvider` that creates the sidebar panel, renders the platform-specific HTML, and bridges messages between the webview and the debug adapter. This is the most complex class in the extension layer because it manages state for two different platform UIs (TEC-1 and TEC-1G), handles session affinity, and coordinates memory snapshot refresh cycles.

### Webview UI

**What it does:** Renders the hardware emulation panel in the browser context. Draws seven-segment displays, LED matrices, LCDs, and the memory inspector. Handles user input (keypad clicks, register edits, target selection) and communicates with the extension host via message passing.

**Where it lives:** `webview/`

**Key pattern:** The webview is stateless across reloads. Every time the webview HTML is replaced (which happens on tab switches, visibility changes, and platform transitions), the extension host replays the full UI state — current display digits, matrix values, LCD contents, serial buffer — via a burst of `postMessage` calls. The `uiRevision` counter prevents stale updates from an earlier render from overwriting current state.

---

## What lives for how long

Not all state has the same lifetime. Confusing session state with extension state is one of the most common sources of bugs. Here is the hierarchy:

### Extension lifetime

Created in `activate()`, lives until VS Code shuts down or the extension is deactivated. This includes:

- The `PlatformViewProvider` instance and its accumulated UI state
- The `WorkspaceSelectionController` and its remembered workspace folder
- Registered commands and event handlers
- File system watchers for config changes

### Session lifetime

Created when a debug session launches, destroyed when it terminates. This includes:

- The Z80 runtime (CPU state, memory image)
- The platform runtime (TEC-1/TEC-1G hardware state)
- Source maps, symbol tables, breakpoint addresses
- The `SessionStateShape` structure in the adapter
- Run state flags (`isRunning`, `lastStopReason`, `callDepth`)

### Webview lifetime

Created when the webview panel is first resolved, destroyed when it is disposed (e.g., the sidebar is closed). The webview can be replaced (new HTML set) multiple times within a single webview lifetime. Each replacement requires full state rehydration.

### Persisted state

Survives across VS Code restarts. Stored in VS Code's `workspaceState` memento:

- The selected workspace folder path (`debug80.selectedWorkspace`)
- The selected target name per project config path

---

## The extension lifecycle in sequence

Here is what happens from the moment VS Code loads the extension to the moment a Z80 program is running and visible in the panel:

**1. Activation.** VS Code calls `activate()`. The extension registers the debug adapter factory, the webview view provider, all commands, workspace watchers, and debug session event handlers. No debug session exists yet.

**2. Webview resolution.** When the user opens the Debug80 sidebar panel, VS Code calls `resolveWebviewView()` on the `PlatformViewProvider`. The provider renders the default platform HTML (TEC-1G) with the project header selectors populated from workspace state. The UI tab is active. No emulation is running — the displays are dark.

**3. Auto-start (if configured).** If a valid workspace root and target are remembered from a previous session, the extension automatically starts a debug session. This triggers step 4 immediately after activation.

**4. Debug session start.** The user starts debugging (F5, or by selecting a target in the panel). VS Code calls `launchRequest()` on the debug adapter. The launch pipeline runs:
   - Resolve the project config and merge with launch arguments
   - Load the platform provider (lazy import)
   - Assemble the source if requested
   - Parse the Intel HEX binary into memory
   - Parse the listing / D8 debug map for source mapping
   - Create the Z80 runtime with platform I/O handlers
   - Load ROM images (for TEC-1/TEC-1G)
   - Build the symbol index
   - Apply breakpoints

**5. Platform announcement.** The adapter sends a `debug80/platform` custom event. The extension host receives it and calls `setPlatform()` on the view provider, which renders the correct platform webview (TEC-1 or TEC-1G) and begins posting hardware state updates.

**6. Execution.** The Z80 runs. On each `tick()` callback, the platform runtime checks timing, updates hardware state, and periodically sends UI update events to the extension host. The extension host forwards these to the webview, which renders the display.

**7. Breakpoint hit / pause.** The Z80 hits a breakpoint or the user pauses. The adapter sends a `StoppedEvent` to VS Code. VS Code requests the stack trace, variables, and (via the webview) memory snapshots. The user inspects state, edits registers or memory, and resumes.

**8. Session termination.** The user stops debugging. The adapter cleans up session state. The platform view provider clears the UI state but keeps the webview rendered with dark displays, ready for the next session.

---

## How to run, build, and test

### Building

```bash
npm run build
```

This runs two steps: the TypeScript compiler (`tsc`) for the extension and adapter code, and an esbuild bundler for the webview TypeScript. The compiled output goes to `out/`.

### Running

Open the debug80 project in VS Code and press F5 to launch an Extension Development Host — a second VS Code window running the extension from the compiled output. Open a workspace with a debug80 project (e.g., `debug80-tec1g-mon3`) and the extension activates.

### Testing

```bash
npm test
```

This runs the full test suite via vitest. Tests cover:

- Z80 instruction decoding and execution (`tests/z80/`)
- Debug adapter request handling (`tests/debug/`)
- Platform state management (`tests/platforms/`)
- Source mapping and listing parsing (`tests/mapping/`)
- Extension command and provider logic (`tests/extension/`)
- Webview message handling (`tests/webview/`)

Tests use a mock VS Code API (`tests/__mocks__/vscode.ts`) so they run without a VS Code instance.

### Project structure at a glance

```
debug80/
├── src/
│   ├── extension/       Extension host code (commands, providers, lifecycle)
│   ├── debug/           Debug adapter (DAP, launch, execution, inspection)
│   ├── z80/             Z80 CPU emulator (decode, execute, memory)
│   ├── mapping/         Source mapping (listings, D8 debug maps, symbols)
│   ├── platforms/       Platform runtimes (simple, tec1, tec1g)
│   └── util/            Shared utilities (logging)
├── webview/
│   ├── common/          Shared webview code (memory panel, styles)
│   ├── tec1/            TEC-1 webview (HTML, entry point, renderers)
│   └── tec1g/           TEC-1G webview (HTML, entry point, renderers)
├── tests/               Mirrors src/ structure
├── docs/                Design documents and this manual
└── package.json         Extension manifest (commands, activation, DAP registration)
```

---

## Summary

- Debug80 is a VS Code extension that emulates Z80 hardware (CPU + platform peripherals) and exposes it through the standard debugging interface with a live hardware visualisation panel.

- Three runtime layers — extension host, debug adapter, and webview — run in separate contexts and communicate via DAP and `postMessage`. Data crossing these boundaries must be serialisable.

- Seven subsystems share the work: the Z80 emulator, platform runtimes, debug adapter, source mapping, assembly pipeline, extension shell, and webview UI. Each has a clear responsibility and defined interfaces.

- State has four lifetimes: extension (survives across sessions), session (created at launch, destroyed at termination), webview (created at panel resolve, may be replaced), and persisted (survives across VS Code restarts).

- The lifecycle flows from activation → webview resolution → debug launch → platform announcement → execution → breakpoint/pause → inspection → termination.

- `npm run build` compiles the extension; `npm test` runs the full vitest suite; F5 in VS Code launches a development host.

---

[Part I](README.md) | [The Project Configuration System →](02-project-configuration.md)
