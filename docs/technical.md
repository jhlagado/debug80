# Debug80 Technical Guide

This document is the single technical reference for the Debug80 VS Code extension and debugger.
It is written for developers who have not built a VS Code extension before, and for anyone
interested in the assembler pipeline, source mapping, and stepping behavior.

## 1. What Debug80 is

Debug80 is a VS Code extension that embeds a Z80 debug adapter. It:
- Loads Intel HEX for runtime memory.
- Reads an asm80 .lst listing for address-to-source mapping.
- Optionally runs asm80 before each launch.
- Recognizes both `.asm` and `.zax` files as debuggable source documents in VS Code.
- Implements stepping, breakpoints, registers, and a simple terminal I/O bridge.

## 2. High-level architecture

Text diagram (left -> right = flow of control):

VS Code UI
  -> Extension wiring (src/extension/extension.ts + helpers)
  -> Debug adapter orchestration (src/debug/adapter.ts)
  -> Launch pipeline + command routing (src/debug/launch-pipeline.ts, src/debug/command-router.ts, src/debug/platform-registry.ts)
  -> Request handlers and platform view helpers (src/debug/matrix-request.ts, src/debug/memory-request.ts, src/debug/terminal-request.ts, src/debug/step-call-resolver.ts; src/extension/platform-view-provider.ts, src/extension/platform-view-state.ts)
  -> Platform runtimes/controllers (src/platforms/*)
  -> Z80 runtime + memory (src/z80/*)
  -> Mapping pipeline (src/mapping/*)

Key concepts:
- The extension registers a debug adapter type named `z80` and now splits its own
  wiring across small helper modules instead of keeping everything in one file.
- The debug adapter runs in-process (inline implementation), not as a separate server.
- Launch/config resolution is separated from the adapter session so platform selection,
  command routing, and request handling can evolve independently.
- Platform-specific emulation lives under `src/platforms/*`, with per-peripheral
  controllers and webview panel modules for machines that need them.

## 3. Repo layout

- src/extension/*
  - VS Code activation plus small helpers for commands, language association,
    debug-session events, terminal panel state, workspace selection, and the
    platform webview provider/state/message plumbing.
- src/debug/adapter.ts
  - Main debug adapter (Z80DebugSession) and request orchestration.
- src/debug/*-request.ts, src/debug/step-call-resolver.ts
  - Request handlers split out of the adapter for matrix, memory, terminal, and
    step-control flows.
- src/debug/launch-pipeline.ts, src/debug/command-router.ts, src/debug/platform-registry.ts
  - Launch/config merge, platform selection, and custom request dispatch.
- src/platforms/*
  - Platform-specific runtimes and controllers, including TEC-1/TEC-1G
    peripherals, shared serial helpers, and panel modules.
- src/mapping/*
  - Listing -> segments/anchors, layer 2 matching, and index building.
- src/z80/*
  - CPU, runtime, and instruction execution.
  - HEX and listing loaders.

## 4. Extension activation and commands

Entry point: src/extension/extension.ts

Activation now keeps the top-level wiring small and delegates the details to
helper modules:
1) Registers the debug adapter for type `z80`.
2) Registers commands and project scaffolding helpers.
3) Wires debug-session events into the terminal panel and ROM/source views.
4) Keeps the platform webview provider/state and workspace selection logic
   separate from the debug adapter path.

Important behavior for new VS Code extension developers:
- The debug adapter is created with vscode.DebugAdapterInlineImplementation.
- Terminal output is sent from the adapter via a custom event name:
  `debug80/terminalOutput`.
- Source-language enforcement currently normalizes `.asm` files to `z80-asm` and `.zax` files to `zax` when those languages are available.

### 4.1 Platform Extension API

Debug80 now exposes a small public extension API from `activate()` so other VS
Code extensions can register additional platforms without editing the core repo.
The runtime side uses [src/platforms/manifest.ts](../src/platforms/manifest.ts),
and the optional sidebar UI side uses
[src/extension/platform-view-manifest.ts](../src/extension/platform-view-manifest.ts).

For the external registration workflow, packaging model, and optional UI panel
registration, see [docs/platform-extension-api.md](./platform-extension-api.md).

## 5. Debug Adapter Protocol (DAP) flow

Class: Z80DebugSession in src/debug/adapter.ts

DAP lifecycle (simplified):
1) initializeRequest
   - Announces adapter capabilities.
2) launchRequest
   - Delegates launch/config resolution to src/debug/launch-pipeline.ts.
   - Resolves artifacts (HEX, LST) and runs asm80 if enabled.
   - Parses HEX and LST.
   - Builds source mapping and indexes.
   - Creates the runtime and applies breakpoints.
3) configurationDoneRequest (implicit behavior)
4) continue / step / pause / disconnect

Custom request handling is routed through `CommandRouter` and the platform
registry rather than being hardcoded directly in the session class. That keeps
platform-specific commands close to the platform implementation.

## 6. Project configuration

### 6.1 Config file discovery

Sources are searched in this order:
1) launch args.projectConfig
2) .vscode/debug80.json
3) debug80.json
4) .debug80.json
5) package.json (debug80 block)

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
- hex / listing (override)
- sourceRoots (list of extra source folders)
- stepOverMaxInstructions / stepOutMaxInstructions
- terminal (I/O bridge config)

Debug80 always writes a D8 debug map to `<artifactBase>.d8.json` in outputDir.

### 6.3 Scaffold command

Command: debug80.createProject
- Writes .vscode/debug80.json using inferDefaultTarget().
- Writes .vscode/launch.json if missing.
- Creates directories (outputDir, .vscode, etc).

## 7. Assembler integration

Debug80 routes assembly through a backend abstraction in `src/debug/assembler-backend.ts`.
The current default backend is `asm80`, implemented in `src/debug/asm80-backend.ts`.
`zax` is also available, implemented in `src/debug/zax-backend.ts`.

If `assemble !== false` and `sourceFile`/`asm` is provided:
- The selected backend assembles the program to HEX and LST artifacts.
- For `asm80`, this runs: `-m Z80 -t hex -o <output hex> <sourceFile>`.
- For `zax`, debug80 invokes the bundled CLI with `node <cli.js> --nobin -o <output hex> <sourceFile>`.
- The `.lst` generated by the backend is copied to the desired listing path if needed.
- Errors are printed to the Debug Console (stdout/stderr).

The backend also optionally supports:
- A binary output pass for `simple.binFrom` / `simple.binTo`.
- In-process mapping compilation for extra ROM listings.

Expected tools:
- The active assembler backend must be installed and available.
- For the current default backend, install `asm80` with `npm install -D asm80` or ensure it is on PATH.
- `zax` is bundled as an extension dependency when selected as the assembler backend.

## 8. Runtime and execution model

Runtime entry point: src/z80/runtime.ts

Key ideas:
- The runtime loads a 64K memory image from HEX.
- Each step executes a single instruction via execute() (src/z80/cpu.ts).
- runUntilStop loops instruction execution until a breakpoint, HALT, or pause.

Register display:
- The adapter exposes standard Z80 registers (AF, BC, DE, HL, IX, IY, etc).

### 8.1 Platform decomposition

Platform runtimes are responsible for wiring memory, I/O, and peripheral
controllers into the Z80 bus. The current TEC-1G runtime is split into smaller
modules such as:
- `src/platforms/tec1g/lcd.ts`
- `src/platforms/tec1g/glcd.ts`
- `src/platforms/tec1g/serial.ts`
- `src/platforms/tec1g/ds1302.ts`
- `src/platforms/tec1g/sd-spi.ts`
- `src/platforms/tec1g/sysctrl.ts`
- `src/platforms/tec1g/tec1g-memory.ts`

The runtime file stays as the orchestrator that instantiates those controllers
and attaches them to the CPU bus. The same pattern applies to other platforms:
small focused modules for the peripheral logic, plus a thin runtime wrapper.

## 9. Source mapping pipeline

The mapping pipeline converts a .lst listing into segments and anchors
used for breakpoints and stack frames.

### 9.1 Listing parser (Layer 1)

File: src/mapping/parser.ts

- Listing lines are detected by a leading 4-hex address.
- Byte tokens following the address determine end address.
- The remainder is captured as asmText.
- Symbol anchors are parsed from lines containing:
  "DEFINED AT LINE <n> IN <file>"

Outputs:
- segments[]: address ranges with lst text and optional source location.
- anchors[]: address -> file/line symbols.

Confidence:
- HIGH: exact anchor hit.
- MEDIUM: duplicate address or inferred between anchors.
- LOW: no anchors yet.

### 9.2 Layer 2 matching (optional refinement)

File: src/mapping/layer2.ts

- Resolves source files referenced by anchors.
- Normalizes asm lines (strip comments, uppercase, normalize whitespace).
- Searches a window around the anchor line to match lst text.
- Upgrades line accuracy where possible; downgrades data/macro regions.

Missing source files are reported to the Debug Console but are non-fatal.

### 9.3 Indexes for fast lookup

File: src/mapping/source-map.ts

Indexes built at launch:
- segmentsByAddress (sorted, for PC -> location)
- segmentsByFileLine (for breakpoint resolution)
- anchorsByFile (for fallback when no exact line match exists)

### 9.4 D8 Debug Map (D8M) format

Debug80 uses the D8 map as the canonical mapping source for debugging. On
launch it attempts to load `<artifactBase>.d8.json`; if the map is missing or
invalid, it regenerates the map from the .lst and writes it to disk, then uses
the regenerated map for the session. The on-disk standard is documented in
`docs/d8-debug-map.md` and is designed to be assembler-agnostic while
preserving the existing LST-derived confidence data.

For native producer-generated maps such as ZAX `.d8.json` output, Debug80 now
prefers the existing D8 map directly and does not treat it as stale relative to
the listing file or overwrite it with an LST-regenerated cache.

Debug80 always writes a `*.d8.json` file alongside the build artifacts.

### 9.5 Platforms

The debugger core runs against a platform abstraction that supplies memory and
I/O devices. Platform selection is per target in `debug80.json`. The platform
spec and configuration layout are defined in `docs/platforms.md`. External
registration and lazy manifest loading are documented in
`docs/platform-extension-api.md`.

## 10. Breakpoints and stack frames

### 10.1 Breakpoint resolution

- For .asm source breakpoints:
  - Resolve exact file:line to segments, else fallback to nearest anchor <= line.
- For .lst breakpoints:
  - Use listing lineToAddress map.

### 10.2 PC -> source location

- If a segment contains the PC and has loc.file, use it.
- If loc.line is missing, fallback to nearest anchor line <= PC.
- If no mapping exists, fall back to listing file/line.

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

The extension receives output via debug80/terminalOutput and renders it
in a webview panel.

## 14. For developers new to VS Code extensions

Key VS Code concepts used here:
- Extension activation: register commands and debug adapter factory.
- Debug Adapter Protocol: the adapter responds to DAP requests.
- Inline debug adapter: adapter runs in the extension host process.

If you want to add features, start here:
- New launch args: update LaunchRequestArguments in src/debug/adapter.ts.
- New terminal behavior: update buildIoHandlers() in src/debug/adapter.ts.
- New mapping logic: update src/mapping/* and the index builder.

## 15. Known limitations

- Mapping accuracy depends on the quality of the .lst listing and symbols.
- process.cwd() discovery may miss the workspace in extension dev host.
- Mapping cache output is described in older specs but not implemented yet.
