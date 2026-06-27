---
layout: default
title: 'Chapter 4 — The Launch Pipeline'
parent: 'Part II — The Debug Adapter'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 2
---

[← DAP and the Debug Session](03-dap-and-the-debug-session.md) | [Part II](index.md) | [Execution Control →](05-execution-control.md)

# Chapter 4 — The Launch Pipeline

When the user presses F5 in VS Code, the debug adapter receives a `launchRequest` with a `LaunchRequestArguments` object. What happens next is the most complex sequence in the codebase: configuration is merged, source code is assembled, binaries are loaded into memory, source maps are built, platform hardware is initialized, and a Z80 runtime is created. The result is a `LaunchSessionArtifacts` object that contains everything needed to run and debug a Z80 program.

This chapter follows the pipeline from start to finish.

---

## Overview

The launch pipeline has seven stages, each handled by a different module:

```
launchRequest arrives
    │
    ├─ 1. Configuration merge        (launch-args.ts, launch/launch-config-merge.ts)
    │     Discover config, then merge launch.json args with debug80.json → LaunchRequestArguments
    │
    ├─ 2. Platform resolution         (platforms/manifest.ts)
    │     Lazy-load the platform provider → ResolvedPlatformProvider
    │
    ├─ 3. Artifact path resolution    (launch/launch-config-merge.ts, mapping/path-resolver.ts)
    │     Derive source, .hex and D8 source-map paths → absolute file paths
    │
    ├─ 4. Assembly                    (launch-pipeline.ts, launch/assembler.ts)
    │     Run linked AZM backend → .hex + .d8.json artifacts on disk
    │
    ├─ 5. Program loading             (launch/program-loader.ts)
    │     Parse HEX, build memory image → HexProgram
    │
    ├─ 6. Source mapping              (launch/launch-source-state.ts, launch/source-state-build-options.ts,
    │                                  mapping/d8-source-paths.ts, mapping/d8-symbols.ts)
    │     Load native D8 map → MappingIndex + source roots + source-map symbol lists
    │
    └─ 7. Runtime creation            (launch/launch-sequence.ts)
          Create Z80Runtime with platform I/O → ready to execute
```

All seven stages happen inside `buildLaunchSession()` in `src/debug/launch/launch-sequence.ts`. The function takes the merged `LaunchRequestArguments` and a `LaunchSequenceContext` (callbacks for emitting events and sending responses) and returns a `LaunchSessionArtifacts` object.

If any stage fails, the error propagates up to `handleLaunchRequest()` in the session class. Two error types receive special handling: `MissingLaunchArtifactsError` prompts the user to create a config file; `AssembleFailureError` formats the assembly diagnostic and sends it to both the Debug Console and the extension host.

---

## Stage 1: Configuration merge

The raw `LaunchRequestArguments` from VS Code's `launch.json` is sparse — it might contain only a `projectConfig` path and a `target` name. `populateFromConfig()` in `src/debug/launch-args.ts` fills in the gaps by reading the project configuration file and delegating the staged merge to `mergeLaunchConfigStages()` in `src/debug/launch/launch-config-merge.ts`. `launch-args.ts` remains at the `src/debug/` top level because adapter and platform entry points both depend on it for config discovery.

The merge follows the four-layer pipeline described in Chapter 2:

1. **Runtime defaults** — sensible fallbacks (platform defaults to `'simple'`, assemble defaults to `true`).
2. **Target overrides** — fields from the named target in `debug80.json`.
3. **Root configuration** — fields at the root of `debug80.json`.
4. **Launch arguments** — fields from `launch.json` (highest priority).

```typescript
const merged = populateFromConfig(args, {
  resolveBaseDir: (requestArgs) => resolveBaseDir(requestArgs),
});
```

### Finding the config file

`populateFromConfig()` normally receives the project path that the extension host resolved from the selected workspace folder's root `debug80.json`. When it must resolve configuration from launch arguments or a source path, it still has compatibility fallbacks. At each level it checks, in order:

1. an explicit `projectConfig` path from the launch args (if present)
2. `debug80.json`
3. `.debug80.json`
4. `.vscode/debug80.json`

The `.debug80.json`, `.vscode/debug80.json`, and `package.json` `debug80` field paths are compatibility paths in the launch layer. They are not the initialized-project marker used by the panel or by new scaffolding.

### Platform block merging

Platform-specific configuration blocks (`tec1`, `tec1g`, `simple`) are **shallow merged**, not replaced. If the root config has `tec1g: { romHex: "mon3.hex" }` and the target has `tec1g: { clockSpeed: 4000000 }`, the merged result is `tec1g: { romHex: "mon3.hex", clockSpeed: 4000000 }`. This is handled by `mergeNestedPlatformBlock()` in `launch-config-merge.ts`.

The TEC-1G platform has an additional inheritance rule: `resolveTec1gBaseForMerge()` ensures that the `romHex` field from the first target definition carries forward to other targets that don't specify their own ROM. This allows a project to define a ROM once and share it across targets.

### Field-by-field resolution

After merging, `populateFromConfig()` resolves each field individually:

- `asm` and `sourceFile` — resolved to absolute paths relative to the base directory.
- `hex` — resolved or derived from the assembly path and output directory.
- `platform` — normalized to lowercase, defaulting to `'simple'`.
- `entry` — parsed as a number (hex if prefixed with `0x`).
- `assembler` — left as-is or inferred from the source file extension.

The result is a fully populated `LaunchRequestArguments` with all paths absolute and all defaults filled in. Bundled ROM and D8 map references are also resolved here by `resolveBundledAssetRuntimePath()`, which prefers a workspace copy when it exists and otherwise falls back to the extension-bundled asset when the config reference points at the bundle destination.

---

## Stage 2: Platform resolution

`resolvePlatformProvider()` in `src/platforms/manifest.ts` loads the platform-specific provider for the configured platform. Platforms are registered in a manifest and loaded lazily via dynamic `import()`:

```typescript
const platformProvider = await resolvePlatformProvider(merged);
```

The manifest maps platform IDs to factory functions:

| Platform   | Provider factory                 |
| ---------- | -------------------------------- |
| `'simple'` | `createSimplePlatformProvider()` |
| `'tec1'`   | `createTec1PlatformProvider()`   |
| `'tec1g'`  | `createTec1gPlatformProvider()`  |

Each factory returns a `ResolvedPlatformProvider` — an object that describes everything the pipeline needs from the platform:

```typescript
interface ResolvedPlatformProvider {
  id: PlatformKind;
  payload: unknown;                        // Sent to extension host via debug80/platform event
  simpleConfig?: SimplePlatformConfig;
  tec1Config?: Tec1PlatformConfig;
  tec1gConfig?: Tec1gPlatformConfigNormalized;
  runtimeOptions?: { romRanges: ... };     // Address ranges that are read-only
  registerCommands(registry, context): void;
  buildIoHandlers(callbacks): Promise<PlatformIoBuildResult>;
  loadAssets?(context): unknown;
  resolveEntry(assets?): number | undefined;
  finalizeRuntime?(context): void;
}
```

The provider is used throughout the remaining pipeline stages — it supplies platform-specific configurations, registers custom DAP commands, builds I/O handlers, and finalizes the runtime after creation.

After resolution, two things happen immediately:

1. The platform registers its custom commands via `registerCommands()`, adding handlers to the `PlatformRegistry`.
2. The platform's `payload` is sent to the extension host as a `debug80/platform` custom DAP event. This tells the webview which platform panel to render.

### Lazy loading

The dynamic `import()` means platform code is not loaded until needed. The TEC-1G provider, for example, pulls in the full TEC-1G runtime, matrix keymap, display emulation, and ROM loading code. None of this is loaded if the user is debugging with the `simple` platform. This keeps extension startup fast.

Custom platforms can be registered at runtime via `registerPlatform()`, which adds an entry to the manifest. This is the extension point for third-party hardware support.

---

## Stage 3: Artifact path resolution

The pipeline needs an assembly source path and a primary Intel HEX output path. `resolveArtifacts()` derives any missing paths from the ones that are present:

```typescript
const { hexPath, asmPath } = resolveArtifacts(merged, baseDir);
```

The resolution rules:

- If `hex` is specified, use it directly.
- If only `asm` is specified, derive `hex` from the same basename in the output directory: `program.asm` → `program.hex`.
- If an output directory is configured, artifacts go there. Otherwise they sit next to the source.
- All paths are resolved to absolute.

The source-map artifact is the native D8 map written beside the build output, normally `program.d8.json`. The D8 path is resolved later by `resolveDebugMapPath()` from the HEX path, optional `artifactBase`, optional `outputDir`, and source path.

The base directory (`baseDir`) is resolved from the workspace root or the project config file's parent directory. Config discovery stays in `src/debug/launch-args.ts`. The staged path normalization and bundled-asset resolution live in `src/debug/launch/launch-config-merge.ts`. Source-map path derivation for active sessions lives in `src/debug/mapping/path-resolver.ts`.

---

## Stage 4: Assembly

If the launch arguments include an assembly source file and `assemble` is not `false`, the pipeline invokes the assembler to produce fresh `.hex` and native `.d8.json` files:

```typescript
assembleIfRequested({
  backend: assemblerBackend,
  args: merged,
  asmPath,
  hexPath,
  platform,
  sendEvent: (event) => context.emitEvent(event),
});
```

### Assembler backend selection

`resolveAssemblerBackend()` in `src/debug/launch/assembler-backend.ts` chooses the assembler based on the `assembler` field in the launch arguments, or infers it from the file extension:

| Extension              | Backend |
| ---------------------- | ------- |
| `.asm`, `.inc`, `.z80` | AZM     |

Debug80 now supports AZM as its assembler backend. ZAX has been removed, and the old listing-derived mapping path is retired from active launch behavior.

The backend conforms to the `AssemblerBackend` interface:

```typescript
interface AssemblerBackend {
  id: string;
  assemble(options: AssembleOptions): AssembleResult;
  assembleBin?(options: AssembleBinOptions): AssembleResult;
}
```

`assemble()` produces the primary build artifacts, normally HEX plus native D8 source map. `assembleBin()` is optional — the simple platform uses it to produce raw binary output for custom memory regions (configured via `binFrom`/`binTo`), and the TEC-1G ROM-artifact path uses it to materialize monitor or expansion `.bin` images with fixed address windows.

### The AZM invocation

`AzmBackend` in `src/debug/launch/azm-backend.ts` loads `@jhlagado/azm/compile` and calls the linked compile API in-process. The backend requests HEX, BIN, D8 and lowered-source artifacts:

```
compile(asmPath, {
  outputType: 'hex',
  emitBin: true,
  emitHex: true,
  emitD8m: true,
  emitAsm80: true,
  sourceRoot,
  registerContracts,
  emitRegisterReport,
  registerContractsProfile,
  registerContractsInterfaces,
  ...
})
```

The successful path writes the HEX output, BIN output when present, a native D8 map, and any requested register-contract artifacts beside the HEX artifact. Register-contract reports are written as `.regcontracts.txt`; inferred interfaces are written as `.asmi`. Debug80 no longer writes placeholder listings or generated source-map cache files.

TEC-1G ROM-artifact assembly is a narrower path inside the same AZM backend. `buildTec1gRomArtifactsIfRequested()` assembles each active source-backed monitor or expansion artifact before platform resolution, always overrides AZM options to `registerContracts: 'off'` and `emitRegisterReport: false`, and then pads the generated `.bin` to the configured monitor `size` or expansion `imageSize`. This keeps ROM artifacts deterministic and prevents the app launch's register-contract mode from changing monitor or cartridge builds.

The backend validates AZM's returned artifacts before treating assembly as successful. A compile result without a HEX artifact, without a D8 source map, or with a HEX artifact that contains no Intel HEX data records is reported as assembly failure. This prevents an empty or unusable HEX output from being written and then loaded as if it were a valid target.

On failure, the backend converts AZM diagnostics into a structured `AssemblyDiagnostic` with file path, line number, column, and source line when available. Relative diagnostic paths are resolved against the launch `sourceRoot`, and the backend reads the referenced source line from disk when it can. This includes register-contract diagnostics such as strict-mode stack-discipline failures. The diagnostic is formatted and sent to both the Debug Console and the extension host (as a `debug80/assemblyFailed` event). The extension host resolves any relative diagnostic path against the session workspace folder before publishing it to VS Code's diagnostic collection, and it also updates project status plus the user-facing build-failed notification.

Assembler diagnostics are emitted through `OutputEvent`, so errors and warnings appear in the Debug Console even though the normal successful path is in-process and quiet.

Assembler backends should be treated as part of the extension's packaged dependency set for release. The release process must verify that `npm run package` / VSIX creation includes the runtime code needed for linked assembly on a clean machine, not only on the developer's workspace.

### Error handling

If assembly fails, `assembleIfRequested()` throws an `AssembleFailureError`. Back in `handleLaunchRequest()`, this is caught and handled specially:

```typescript
if (err instanceof AssembleFailureError) {
  emitConsoleOutput(sendEvent, detail);
  emitAssemblyFailed(sendEvent, { diagnostic, error });
  this.sendErrorResponse(response, 1, shortMessage);
  return;
}
```

The assembly error is shown in three places: the Debug Console (full detail), the extension host (for the webview to display), and the VS Code error notification (short summary).

---

## Stage 5: Program loading

With the `.hex` file resolved, `loadProgramArtifacts()` in `src/debug/launch/program-loader.ts` reads the executable program:

```typescript
const { program } = loadProgramArtifacts({
  platform,
  baseDir,
  hexPath,
  resolveRelative,
  resolveBundledTec1Rom,
  logger,
  ...(tec1Config ? { tec1Config } : {}),
  ...(tec1gConfig ? { tec1gConfig } : {}),
});
```

### HEX parsing

The Intel HEX file is parsed into a `HexProgram` — an object containing the loaded memory image and metadata (start address, end address, entry point). The parser handles all standard Intel HEX record types.

### Platform-specific memory building

The simple platform loads the HEX image directly into a clean 64KB address space. The TEC-1 and TEC-1G platforms build a more complex memory image:

**TEC-1 memory (`buildTec1Memory()`)**:

1. Allocate a zeroed 64KB buffer.
2. Load the ROM image into the low memory region. The ROM source is either a path from `tec1Config.romHex` or the bundled MON-1B ROM. The loader tries binary format first (`.bin`), then Intel HEX.
3. Optionally overlay a RAM initialization HEX image (`tec1Config.ramInitHex`).
4. Overlay the user's compiled program HEX on top.

**TEC-1G memory (`buildTec1gMemory()`)**:
Similar to TEC-1 but with different ROM loading logic — TEC-1G ROMs can be loaded at a specific offset address, and the ROM source resolution follows the TEC-1G config inheritance chain.

The overlay order matters. The user's program is applied last, so it can overwrite ROM areas if needed. This is how programs that include their own monitor code work.

## Stage 6: Source mapping

Source mapping connects memory addresses to source file locations. This is what makes "set a breakpoint on line 12" work — the breakpoint manager needs to know which memory address corresponds to line 12.

The source mapping stage has three parts: building the debug map, building the symbol index, and resolving source roots. `buildLaunchSourceState()` in `src/debug/launch/launch-source-state.ts` owns the top-level orchestration and delegates reusable setup helpers to `src/debug/launch/source-state-build-options.ts`. Two focused mapping helpers now carry the shared D8-specific logic: `src/debug/mapping/d8-source-paths.ts` resolves file paths and primary-source selection for D8 maps, and `src/debug/mapping/d8-symbols.ts` converts D8 symbol records into the richer source-map symbol shape used by the debugger and editor providers. `launch-sequence.ts` calls the orchestration entry point with the assembled inputs and receives a `LaunchSourceBuildResult` in return.

### `buildLaunchSourceState()` — `src/debug/launch/launch-source-state.ts`

`buildLaunchSourceState()` owns the entire source-state setup for a launch. It was extracted from `launch-sequence.ts` because that file was handling too many concerns; the extraction gives source-state setup a single testable entry point with a well-defined input/output contract.

The function:

1. **Resolves source roots** — `buildLaunchSessionSourceRoots()` walks `args.sourceRoots`, the assembly source directory, and the base directory to build the initial root list.
2. **Instantiates `SourceManager`** — `createSourceStateManager()` creates the manager with path-resolution callbacks for the current session and injects it into the `SourceStateManager`.
3. **Calls `sourceState.build()`** — `buildSourceStateBuildArgs()` and `buildSourceMapArgs()` package the map inputs, including any `debugMapAddressSpaces` metadata carried on the launch args, then D8 source-map discovery and `buildSourceMapIndex()` run via the manager.
4. **Collects D8-backed symbol metadata** — `readSourceMapSymbols()` reads the preferred and auxiliary D8 maps, uses `resolveDebugMapFilePath()` from `src/debug/mapping/d8-source-paths.ts` to normalize file locations, and converts each D8 symbol through `d8SymbolToSourceMapSymbol()` in `src/debug/mapping/d8-symbols.ts`.
5. **Builds the symbol index** — calls `buildSymbolIndex()` from `src/debug/mapping/symbol-service.ts` and applies the lookup anchors back to `sourceState`.
6. **Returns** a `LaunchSourceBuildResult` containing `sourceRoots`, `mapping`, `mappingIndex`, `symbolAnchors`, `symbolList`, and D8-backed source-map symbols.

### The SourceManager

`SourceManager` in `src/debug/mapping/source-manager.ts` orchestrates source state construction. It is instantiated inside `buildLaunchSourceState()` and injected into the `SourceStateManager` wrapper. The manager's `buildState()` method coordinates the work:

1. **Resolve the main source file** — prioritizes the ASM path, then falls back to `sourceFile`.
2. **Resolve source roots** — directories where source files live, used to map D8 relative paths to absolute paths on disk.
3. **Build the mapping** — loads the native D8 map, merges auxiliary maps, applies optional address-space tags keyed by resolved D8-map path, and creates a `MappingParseResult` plus `SourceMapIndex`.

The result is a `SourceManagerState` containing the resolved source file, source roots, and the complete mapping index.

### The native D8 source map

The mapping between source lines and addresses now normally comes from a native D8 JSON file:

- **Native D8 map** — AZM emits a `.d8.json` source map beside the build artifact. This is the authoritative active-project source map.

User-facing messages should call this a "source map" and tell the user to build the target if the map is missing or stale.

For TEC-1G multibank ROM artifacts, `buildTec1gRomArtifactsIfRequested()` also records `debugMapAddressSpaces` keyed by each generated auxiliary D8 path. `buildMappingFromDebugMap()` applies that metadata to every imported segment and anchor from the matching map, so later breakpoint and stack lookups can distinguish bank 0 from bank 3 even though both are visible at `0x8000-0xBFFF`.

### The symbol index

`buildSymbolIndex()` in `src/debug/mapping/symbol-service.ts` creates a searchable index of symbols and constants:

```typescript
const symbolIndex = buildSymbolIndex({
  mapping: builtSourceState.mapping,
});
```

Symbols come from the active D8 mapping data.

The index provides the classic address-oriented symbol views:

- **`anchors`** — all symbols sorted by address. Used for nearest-symbol lookup in the memory inspector.
- **`lookupAnchors`** — symbols filtered to addresses within source-mapped ranges. This prevents symbols from unmapped regions (like ROM) from appearing in user-facing lookups.
- **`list`** — a deduplicated name-to-address list for the symbol table.

`readSourceMapSymbols()` also preserves richer source-map symbols for editor and debugger UI features. It prefers the resolved primary D8 map path when that artifact exists and also reads any auxiliary maps listed in `debugMaps[]`. F12 navigation, hover details, workspace symbols, the Variables panel, Watch expressions and conditional breakpoint expressions all use these active-target symbol records where possible. When an auxiliary TEC-1G ROM map carries a bank address space, the same identity is preserved on its imported runtime symbols and segments.

### Source file notification

After source mapping is complete, the pipeline emits a `debug80/mainSource` event with the resolved source file path. The extension host uses this to open the file in the editor.

---

## Stage 7: Runtime creation

The final stage creates the Z80 runtime — the emulator that will execute the program — and connects it to the platform's I/O handlers.

### Platform I/O

Each platform provides I/O handlers that implement the Z80's port-mapped I/O system. `buildIoHandlers()` creates these handlers and returns the platform runtimes:

```typescript
const platformIo = await platformProvider.buildIoHandlers({
  terminal: merged.terminal,
  onTec1Update: emitPlatformEvent('debug80/tec1Update'),
  onTec1Serial: emitPlatformEvent('debug80/tec1Serial'),
  onTec1gUpdate: emitPlatformEvent('debug80/tec1gUpdate'),
  onTec1gSerial: emitPlatformEvent('debug80/tec1gSerial'),
  onTerminalOutput: emitPlatformEvent('debug80/terminalOutput'),
});
```

The result includes:

- **I/O handlers** — `portIn` and `portOut` functions wired to the platform's emulated hardware (display controllers, keyboard scanners, serial ports, speaker).
- **Platform runtimes** — `Tec1Runtime` or `Tec1gRuntime` instances that manage the hardware state and timing.
- **Terminal state** — for the TEC-1G terminal emulation, if configured.

The callback functions (`onTec1gUpdate`, etc.) are how the emulated hardware communicates state changes to the webview. Each callback wraps `emitDapEvent()`, which sends a custom DAP event to the extension host.

### Z80Runtime creation

```typescript
const runtime = createZ80Runtime(
  program,
  entry,
  platformIo.ioHandlers,
  platformProvider.runtimeOptions
);
```

`createZ80Runtime()` initializes the Z80 CPU emulator with the loaded program memory, the entry point address, and the platform's I/O handlers. The `runtimeOptions` may include `romRanges` — address ranges that are marked read-only so the emulator rejects writes to ROM.

### Platform asset loading and finalization

Some platforms need additional setup after the runtime exists:

```typescript
const platformAssets = platformProvider.loadAssets?.({ baseDir, logger, resolveRelative });
const entry = platformProvider.resolveEntry(platformAssets);
```

`loadAssets()` loads platform-specific data files (font ROMs, GLCD data). `resolveEntry()` determines the program entry point. On TEC-1G, expansion ROM assets can still contribute a boot entry when no monitor artifact owns the launch, but an active monitor artifact keeps execution on configured `tec1g.entry` so the project-owned monitor remains authoritative.

After the runtime is created:

```typescript
platformProvider.finalizeRuntime?.({ runtime, sessionState, assets: platformAssets });
```

`finalizeRuntime()` performs last-minute setup — loading font data into specific memory regions, configuring initial I/O port states, or setting up interrupt vectors. This runs after the program is loaded so it can inspect or modify the memory image.

### Entry point and restart capture

The pipeline resolves two related addresses:

- **Entry point** (`loadedEntry`) — where the program counter starts. For the simple platform, this is the first address in the HEX file or a configured `entry` value. For TEC-1/TEC-1G, it is typically the monitor ROM entry (address 0x0000) unless the application overrides it.

- **Restart capture address** (`restartCaptureAddress`) — the address where the CPU state should be captured for warm restarts. This is typically `appStart` from the platform configuration. When the PC reaches this address for the first time, `captureEntryCpuStateIfNeeded()` snapshots the CPU registers, allowing the debug adapter to restore this state for a warm rebuild without restarting the full session.

---

## The artifacts object

`buildLaunchSession()` returns a `LaunchSessionArtifacts` containing everything produced by the pipeline:

```typescript
interface LaunchSessionArtifacts {
  platform: PlatformKind;

  // Source mapping
  mapping: MappingParseResult;
  mappingIndex: SourceMapIndex;
  sourceRoots: string[];
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
  sourceMapSymbols: SourceMapDebugSymbol[];

  // Program
  loadedProgram: HexProgram;
  loadedEntry: number | undefined;
  restartCaptureAddress: number | undefined;
  runtime: Z80Runtime;

  // Platform
  terminalState: TerminalState | undefined;
  tec1Runtime: Tec1Runtime | undefined;
  tec1gRuntime: Tec1gRuntime | undefined;
  platformRuntime: ActivePlatformRuntime | undefined;
  tec1gConfig: Tec1gPlatformConfigNormalized | undefined;

  // Execution limits
  stepOverMaxInstructions: number;
  stepOutMaxInstructions: number;
}
```

Back in `handleLaunchRequest()`, these artifacts are applied to the session state via `applyLaunchSessionArtifacts()`, which copies each field into the corresponding `SessionStateShape` property. This is a field-by-field assignment — not a replacement of the state object — because the request controller and other components already hold references to the state object.

---

## After the pipeline

With artifacts applied, `handleLaunchRequest()` completes the launch:

1. **Capture entry CPU state** — if the PC is already at the restart capture address, snapshot the registers.
2. **Apply launch breakpoints** — take any breakpoints the user set before launch (cached by the breakpoint manager) and verify them against the new source maps. Send `BreakpointEvent('changed')` for each verified breakpoint so VS Code updates its UI.
3. **Mark launch complete** — set `runState.launchComplete = true`.
4. **Send the launch response** — tells VS Code the launch succeeded.
5. **Start execution** — if both `launchComplete` and `configurationDone` are true and `stopOnEntry` is false, begin execution via `startConfiguredExecutionIfReady()`.
6. **Send entry stop** — if `stopOnEntry` is true, send `StoppedEvent('entry')` so VS Code shows the program paused at the entry point.

The session is now live. The execution loop (Chapter 5) takes over from here.

---

## Error paths

The launch pipeline has three distinct error paths:

**Missing launch inputs.** If no `asm` or `hex` is specified and no config file is found, `respondToMissingLaunchInputs()` prompts the user to create a `debug80.json` via the project scaffolding command. If the user creates one, they get a message to configure it and re-run. If they cancel, they get an error explaining what is needed.

**Missing artifacts.** If assembly succeeds (or is skipped) but the required `.hex` artifact does not exist on disk, a `MissingLaunchArtifactsError` is thrown. If the D8 source map is missing, source-level features degrade until the user builds the selected target with AZM.

**Assembly failure.** If AZM reports diagnostics that prevent assembly, an `AssembleFailureError` is thrown with the parsed diagnostic. The error is sent to three destinations: the Debug Console (full assembler output), the extension host (structured diagnostic for the webview), and the VS Code error notification (one-line summary).

All three paths send an error response to VS Code, which shows the error and cleans up the debug session UI.

---

## Summary

- The launch pipeline converts a `LaunchRequestArguments` into a running Z80 debug session through seven stages: config merge, platform resolution, path resolution, assembly, program loading, source mapping, and runtime creation.

- Configuration merging follows a four-layer priority system. Platform blocks are shallow-merged, not replaced. The TEC-1G ROM field has its own inheritance rule.

- Platforms are lazy-loaded via dynamic imports. Each platform provides a `ResolvedPlatformProvider` that supplies I/O handlers, custom commands, ROM configurations, and entry point resolution.

- The assembler backend is selected from the target configuration and source file extension. AZM is the supported backend for `.asm`, `.inc` and `.z80`. Assembly is optional and conditional on the `assemble` flag.

- Program loading builds a platform-specific memory image: plain for simple, ROM + RAM overlay for TEC-1/TEC-1G. Source mapping and symbols come from the native D8 map emitted by AZM.

- Source mapping is handled by `buildLaunchSourceState()` in `src/debug/launch/launch-source-state.ts`. This function owns source-state orchestration, `src/debug/launch/source-state-build-options.ts` holds the reusable source-root, map-argument, and `SourceManager` setup helpers, `src/debug/mapping/d8-source-paths.ts` centralizes D8 file-path resolution, and `src/debug/mapping/d8-symbols.ts` centralizes D8 symbol conversion. Together they give source-state setup a focused testable boundary.

- The Z80 runtime is created last, with platform I/O handlers and ROM protection ranges. Platform providers can finalize the runtime with additional setup after creation.

- `LaunchSessionArtifacts` captures all pipeline outputs. `applyLaunchSessionArtifacts()` writes them into the existing `SessionStateShape` without replacing the object reference.

- Three error paths handle missing inputs, missing build artifacts, and assembly failures — each with user-facing messaging through multiple channels.

---

[← DAP and the Debug Session](03-dap-and-the-debug-session.md) | [Part II](index.md) | [Execution Control →](05-execution-control.md)
