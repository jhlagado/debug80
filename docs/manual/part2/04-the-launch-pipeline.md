[← DAP and the Debug Session](03-dap-and-the-debug-session.md) | [Part II](README.md) | [Execution Control →](05-execution-control.md)

# Chapter 4 — The Launch Pipeline

When the user presses F5 in VS Code, the debug adapter receives a `launchRequest` with a `LaunchRequestArguments` object. What happens next is the most complex sequence in the codebase: configuration is merged, source code is assembled, binaries are loaded into memory, source maps are built, platform hardware is initialized, and a Z80 runtime is created. The result is a `LaunchSessionArtifacts` object that contains everything needed to run and debug a Z80 program.

This chapter follows the pipeline from start to finish.

---

## Overview

The launch pipeline has seven stages, each handled by a different module:

```
launchRequest arrives
    │
    ├─ 1. Configuration merge        (launch-args.ts)
    │     Merge launch.json args with debug80.json → LaunchRequestArguments
    │
    ├─ 2. Platform resolution         (platforms/manifest.ts)
    │     Lazy-load the platform provider → ResolvedPlatformProvider
    │
    ├─ 3. Artifact path resolution    (launch-args.ts, path-resolver.ts)
    │     Derive .hex, .lst, .asm paths → absolute file paths
    │
    ├─ 4. Assembly                    (launch-pipeline.ts, assembler.ts)
    │     Invoke asm80 or zax assembler → .hex + .lst files on disk
    │
    ├─ 5. Program loading             (program-loader.ts)
    │     Parse HEX, build memory image → HexProgram + ListingInfo
    │
    ├─ 6. Source mapping              (source-manager.ts, symbol-service.ts)
    │     Parse listing + debug map → MappingIndex + SymbolIndex
    │
    └─ 7. Runtime creation            (launch-sequence.ts)
          Create Z80Runtime with platform I/O → ready to execute
```

All seven stages happen inside `buildLaunchSession()` in `src/debug/launch-sequence.ts`. The function takes the merged `LaunchRequestArguments` and a `LaunchSequenceContext` (callbacks for emitting events and sending responses) and returns a `LaunchSessionArtifacts` object.

If any stage fails, the error propagates up to `handleLaunchRequest()` in the session class. Two error types receive special handling: `MissingLaunchArtifactsError` prompts the user to create a config file; `AssembleFailureError` formats the assembly diagnostic and sends it to both the Debug Console and the extension host.

---

## Stage 1: Configuration merge

The raw `LaunchRequestArguments` from VS Code's `launch.json` is sparse — it might contain only a `projectConfig` path and a `target` name. `populateFromConfig()` in `src/debug/launch-args.ts` fills in the gaps by reading the project configuration file and merging its fields.

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

`populateFromConfig()` searches for the config file by walking up the filesystem from the assembly source file's directory. It looks for `debug80.json`, `.debug80.json`, and `.vscode/debug80.json` at each level. It also checks `package.json` for a `debug80` field — useful for projects that want to keep their config inside an existing manifest.

### Platform block merging

Platform-specific configuration blocks (`tec1`, `tec1g`, `simple`) are **shallow merged**, not replaced. If the root config has `tec1g: { romHex: "mon3.hex" }` and the target has `tec1g: { clockSpeed: 4000000 }`, the merged result is `tec1g: { romHex: "mon3.hex", clockSpeed: 4000000 }`. This is handled by `mergeNestedPlatformBlock()`.

The TEC-1G platform has an additional inheritance rule: `resolveTec1gBaseForMerge()` ensures that the `romHex` field from the first target definition carries forward to other targets that don't specify their own ROM. This allows a project to define a ROM once and share it across targets.

### Field-by-field resolution

After merging, `populateFromConfig()` resolves each field individually:

- `asm` and `sourceFile` — resolved to absolute paths relative to the base directory.
- `hex` and `listing` — resolved or derived from the assembly path (same basename, different extensions).
- `platform` — normalized to lowercase, defaulting to `'simple'`.
- `entry` — parsed as a number (hex if prefixed with `0x`).
- `assembler` — left as-is or inferred from the source file extension.

The result is a fully populated `LaunchRequestArguments` with all paths absolute and all defaults filled in.

---

## Stage 2: Platform resolution

`resolvePlatformProvider()` in `src/platforms/manifest.ts` loads the platform-specific provider for the configured platform. Platforms are registered in a manifest and loaded lazily via dynamic `import()`:

```typescript
const platformProvider = await resolvePlatformProvider(merged);
```

The manifest maps platform IDs to factory functions:

| Platform | Provider factory |
|----------|-----------------|
| `'simple'` | `createSimplePlatformProvider()` |
| `'tec1'` | `createTec1PlatformProvider()` |
| `'tec1g'` | `createTec1gPlatformProvider()` |

Each factory returns a `ResolvedPlatformProvider` — an object that describes everything the pipeline needs from the platform:

```typescript
interface ResolvedPlatformProvider {
  id: PlatformKind;
  payload: unknown;                        // Sent to extension host via debug80/platform event
  simpleConfig?: SimplePlatformConfig;
  tec1Config?: Tec1PlatformConfig;
  tec1gConfig?: Tec1gPlatformConfigNormalized;
  extraListings: string[];                 // Additional listing files (e.g., ROM listing)
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

The pipeline needs three file paths: the assembly source (`.asm` or `.zax`), the Intel HEX binary (`.hex`), and the assembler listing (`.lst`). `resolveArtifacts()` derives any missing paths from the ones that are present:

```typescript
const { hexPath, listingPath, asmPath } = resolveArtifacts(merged, baseDir, { ... });
```

The resolution rules:

- If `hex` and `listing` are both specified, use them directly.
- If only `asm` is specified, derive `hex` and `listing` from the same basename in the output directory: `program.asm` → `program.hex` + `program.lst`.
- If an output directory is configured, artifacts go there. Otherwise they sit next to the source.
- All paths are resolved to absolute.

The base directory (`baseDir`) is resolved from the workspace root or the project config file's parent directory. Path resolution functions live in two files: `src/debug/launch-args.ts` for the pure logic (testable without VS Code) and `src/debug/path-resolver.ts` for the VS Code-aware version (uses `vscode.workspace.workspaceFolders`).

---

## Stage 4: Assembly

If the launch arguments include an assembly source file and `assemble` is not `false`, the pipeline invokes the assembler to produce fresh `.hex` and `.lst` files:

```typescript
assembleIfRequested({
  backend: assemblerBackend,
  args: merged,
  asmPath,
  hexPath,
  listingPath,
  platform,
  sendEvent: (event) => context.emitEvent(event),
});
```

### Assembler backend selection

`resolveAssemblerBackend()` in `src/debug/assembler-backend.ts` chooses the assembler based on the `assembler` field in the launch arguments, or infers it from the file extension:

| Extension | Backend |
|-----------|---------|
| `.asm`, `.a80`, `.inc`, `.s`, `.z80` | asm80 |
| `.zax` | zax |

The backend conforms to the `AssemblerBackend` interface:

```typescript
interface AssemblerBackend {
  id: string;
  assemble(options: AssembleOptions): AssembleResult;
  assembleBin?(options: AssembleBinOptions): AssembleResult;
  compileMappingInProcess?(sourcePath, baseDir): MappingParseResult | undefined;
}
```

`assemble()` produces HEX and listing output. `assembleBin()` is optional — the simple platform uses it to produce raw binary output for custom memory regions (configured via `binFrom`/`binTo`). `compileMappingInProcess()` is an optimization: the zax backend can produce source mappings without writing files to disk.

### The asm80 invocation

`runAssembler()` in `src/debug/assembler.ts` spawns the asm80 process:

```
asm80 -m Z80 -t hex -o <outputDir> <asmPath>
```

The function finds the asm80 binary by searching `node_modules/.bin/` up from the workspace root, then checking the extension's bundled copy, then `require.resolve()`. On failure, it parses the asm80 error output into a structured `AssemblyDiagnostic` with file path, line number, column, and source line. This diagnostic is formatted and sent to both the Debug Console and the extension host (as a `debug80/assemblyFailed` event).

Assembly output is captured line-by-line and emitted to the Debug Console via `OutputEvent`, so the user sees assembler progress in real time.

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

With the `.hex` and `.lst` files on disk, `loadProgramArtifacts()` in `src/debug/program-loader.ts` reads and parses them:

```typescript
const { program, listingInfo, listingContent } = loadProgramArtifacts({
  platform, baseDir, hexPath, listingPath,
  resolveRelative, resolveBundledTec1Rom, logger,
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

### Listing parsing

The listing file is parsed into a `ListingInfo` structure that maps source lines to hex offsets. This is used later by the breakpoint manager and stack trace builder to translate between source locations and memory addresses.

The raw listing content is also preserved — the source mapping stage needs it to extract symbol definitions.

---

## Stage 6: Source mapping

Source mapping connects memory addresses to source file locations. This is what makes "set a breakpoint on line 12" work — the breakpoint manager needs to know which memory address corresponds to line 12.

The source mapping stage has three parts: building the debug map, building the symbol index, and resolving source roots.

### The SourceManager

`SourceManager` in `src/debug/source-manager.ts` orchestrates source state construction. It is created during the launch pipeline and injected into the `SourceStateManager` wrapper:

```typescript
context.sourceState.setManager(new SourceManager({
  platform, baseDir,
  resolveRelative, resolveMappedPath, relativeIfPossible,
  resolveExtraDebugMapPath, resolveDebugMapPath,
  resolveListingSourcePath,
  logger,
}));
```

The manager's `buildState()` method coordinates the work:

1. **Resolve the main source file** — prioritizes the ASM path, falls back to `sourceFile`, then derives from the listing path.
2. **Resolve source roots** — directories where source files live, used to map relative paths in listings to absolute paths on disk.
3. **Resolve extra listings** — platform-provided listing files (e.g., ROM listings). These are validated for existence and deduplicated against the primary listing.
4. **Extend source roots** — adds the directories of extra listings to the source root list, so ROM source references resolve correctly.
5. **Build the mapping** — parses the listing and any debug map files to create a `MappingParseResult` and a `SourceMapIndex`.

The result is a `SourceManagerState` containing the resolved source file, source roots, extra listing paths, and the complete mapping index.

### The debug map

The mapping between source lines and addresses comes from two sources:

- **The assembler listing** — contains address-to-line mappings for the main source file. This is always available.
- **The debug map file** — a `.d8map` file that contains richer mapping data, including multi-file mappings and segment information. This is generated by the zax assembler or by a post-processing step.

If a debug map file exists and is not stale (newer than the listing), it is used in preference to the listing-only mapping. The debug map path is derived from the listing path, optionally through a cache directory (`.debug80/cache/`) to avoid polluting the source directory.

### The symbol index

`buildSymbolIndex()` in `src/debug/symbol-service.ts` creates a searchable index of symbols (labels) and their addresses:

```typescript
const symbolIndex = buildSymbolIndex({
  mapping: builtSourceState.mapping,
  listingContent,
  sourceFile: context.sourceState.file,
});
```

Symbols come from the mapping data if available, or are extracted from the listing file by regex-matching lines like:

```
LOOP:  0x0042  DEFINED AT LINE 15 IN FILE program.asm
```

The index provides two views:

- **`anchors`** — all symbols sorted by address. Used for nearest-symbol lookup in the memory inspector.
- **`lookupAnchors`** — symbols filtered to addresses within source-mapped ranges. This prevents symbols from unmapped regions (like ROM) from appearing in user-facing lookups.
- **`list`** — a deduplicated name-to-address list for the symbol table.

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
const runtime = createZ80Runtime(program, entry, platformIo.ioHandlers, platformProvider.runtimeOptions);
```

`createZ80Runtime()` initializes the Z80 CPU emulator with the loaded program memory, the entry point address, and the platform's I/O handlers. The `runtimeOptions` may include `romRanges` — address ranges that are marked read-only so the emulator rejects writes to ROM.

### Platform asset loading and finalization

Some platforms need additional setup after the runtime exists:

```typescript
const platformAssets = platformProvider.loadAssets?.({ baseDir, logger, resolveRelative });
const entry = platformProvider.resolveEntry(platformAssets);
```

`loadAssets()` loads platform-specific data files (font ROMs, GLCD data). `resolveEntry()` determines the program entry point — for TEC-1/TEC-1G, this might be the monitor ROM's entry rather than the user program's entry, depending on configuration.

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
  listing: ListingInfo;
  listingPath: string;
  mapping: MappingParseResult;
  mappingIndex: SourceMapIndex;
  sourceRoots: string[];
  extraListingPaths: string[];
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;

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

**Missing launch inputs.** If no `asm`, `hex`, or `listing` is specified and no config file is found, `respondToMissingLaunchInputs()` prompts the user to create a `debug80.json` via the project scaffolding command. If the user creates one, they get a message to configure it and re-run. If they cancel, they get an error explaining what is needed.

**Missing artifacts.** If assembly succeeds (or is skipped) but the `.hex` or `.lst` files do not exist on disk, a `MissingLaunchArtifactsError` is thrown. This typically means the user needs to build their project first. The handler prompts for config creation as a recovery path.

**Assembly failure.** If the assembler returns a non-zero exit code, an `AssembleFailureError` is thrown with the parsed diagnostic. The error is sent to three destinations: the Debug Console (full asm80 output), the extension host (structured diagnostic for the webview), and the VS Code error notification (one-line summary).

All three paths send an error response to VS Code, which shows the error and cleans up the debug session UI.

---

## Summary

- The launch pipeline converts a `LaunchRequestArguments` into a running Z80 debug session through seven stages: config merge, platform resolution, path resolution, assembly, program loading, source mapping, and runtime creation.

- Configuration merging follows a four-layer priority system. Platform blocks are shallow-merged, not replaced. The TEC-1G ROM field has its own inheritance rule.

- Platforms are lazy-loaded via dynamic imports. Each platform provides a `ResolvedPlatformProvider` that supplies I/O handlers, custom commands, ROM configurations, and entry point resolution.

- The assembler backend is selected by file extension (`.asm` → asm80, `.zax` → zax). Assembly is optional and conditional on the `assemble` flag.

- Program loading builds a platform-specific memory image: plain for simple, ROM + RAM overlay for TEC-1/TEC-1G. The listing file is parsed for source mapping and symbol extraction.

- Source mapping produces a `SourceMapIndex` for fast address-to-source lookups and a `SymbolIndex` for label resolution. Both the listing file and optional debug map files contribute to the mapping.

- The Z80 runtime is created last, with platform I/O handlers and ROM protection ranges. Platform providers can finalize the runtime with additional setup after creation.

- `LaunchSessionArtifacts` captures all pipeline outputs. `applyLaunchSessionArtifacts()` writes them into the existing `SessionStateShape` without replacing the object reference.

- Three error paths handle missing inputs, missing build artifacts, and assembly failures — each with user-facing messaging through multiple channels.

---

[← DAP and the Debug Session](03-dap-and-the-debug-session.md) | [Part II](README.md) | [Execution Control →](05-execution-control.md)
