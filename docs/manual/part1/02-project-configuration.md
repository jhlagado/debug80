[← What Debug80 Is](01-what-debug80-is.md) | [Part I](README.md) | [Part II →](../part2/README.md)

# Chapter 2 — The Project Configuration System

A debug80 project is defined by a JSON configuration file that tells the extension what to build, what platform to target, where to find source files and ROM images, and how to lay out memory. This chapter explains every part of that system: the config file format, how targets work, how multiple configuration sources are merged, and how the scaffolding flow creates a new project from scratch.

If you are going to work on any part of debug80 that touches launching, target selection, or platform setup, you need to understand this chapter. The configuration system is the spine — every debug session begins by resolving a config into a fully populated set of launch arguments.

---

## Where the config file lives

Debug80 looks for a project configuration file in three locations, checked in this order:

1. `.vscode/debug80.json`
2. `debug80.json`
3. `.debug80.json`

The first file found wins. The search starts from the workspace folder root. If none of these files exist, the project has no debug80 configuration and the extension treats it as unconfigured — no targets appear in the selector, and launching a debug session requires either creating a project or providing explicit launch arguments.

The discovery logic lives in `findProjectConfigPath()` in `src/extension/project-config.ts`. It takes a `WorkspaceFolder` and returns the absolute path to the first matching config file, or `undefined`.

---

## The ProjectConfig type

The config file is parsed into a `ProjectConfig` object, defined in `src/debug/types.ts`. Here is the full shape:

```typescript
interface ProjectConfig {
  // Target management
  defaultTarget?: string;       // Which target to use when none is specified
  target?: string;              // Alias for defaultTarget

  // Named target configurations
  targets?: Record<string, Partial<LaunchRequestArguments> & { source?: string }>;

  // Root-level defaults (applied to all targets unless overridden)
  asm?: string;                 // Source file path
  sourceFile?: string;          // Alias for asm
  source?: string;              // Alias for asm (used in some config styles)
  assembler?: string;           // 'asm80' or 'zax'
  hex?: string;                 // Intel HEX binary path
  listing?: string;             // Listing file path
  outputDir?: string;           // Build output directory
  artifactBase?: string;        // Base name for build artifacts
  entry?: number;               // Execution entry point address
  stopOnEntry?: boolean;        // Break at entry point
  platform?: string;            // 'simple', 'tec1', or 'tec1g'
  assemble?: boolean;           // Whether to run the assembler before debugging
  sourceRoots?: string[];       // Directories to search for source files

  // Stepping limits
  stepOverMaxInstructions?: number;
  stepOutMaxInstructions?: number;

  // Platform-specific configuration blocks
  terminal?: TerminalConfig;
  simple?: SimplePlatformConfig;
  tec1?: Tec1PlatformConfig;
  tec1g?: Tec1gPlatformConfig;
}
```

The `targets` field is where the real work happens. Everything else at the root level serves as defaults — values that apply to all targets unless a specific target overrides them.

---

## Targets

A target is a named build-and-debug configuration. A project can define multiple targets — one for each program, test case, or hardware configuration you want to debug. Each target is an entry in the `targets` object, keyed by name.

A typical multi-target config:

```json
{
  "defaultTarget": "matrix",
  "targets": {
    "matrix": {
      "sourceFile": "src/matrix.zax",
      "assembler": "zax",
      "platform": "tec1g"
    },
    "hello": {
      "sourceFile": "src/hello.asm",
      "platform": "tec1g"
    },
    "test-serial": {
      "sourceFile": "src/test-serial.zax",
      "assembler": "zax",
      "platform": "tec1g"
    }
  },
  "tec1g": {
    "romHex": "roms/mon-3.hex",
    "appStart": 8192
  }
}
```

In this example, all three targets share the same `tec1g` block at the root — the ROM image and application start address are inherited. Each target specifies its own source file and assembler. The `matrix` target is the default.

### Target selection priority

When a debug session launches, the system must decide which target to use. The resolution order is:

1. Explicit `target` passed in the launch arguments (e.g., from the webview selector)
2. The config's `target` field
3. The config's `defaultTarget` field
4. The first target alphabetically (if exactly one exists, it is used without prompting)

This logic lives in `populateFromConfig()` in `src/debug/launch-args.ts`.

### Remembering the selected target

When a user selects a target — either through the panel selector or a Quick Pick — the selection is stored in VS Code's workspace state under the key:

```
debug80.selectedTarget:{projectConfigPath}
```

The key includes the config file path, so different projects in a multi-root workspace each remember their own target independently. On the next launch, the stored target is preferred over the config's `defaultTarget`, unless it no longer exists in the config.

The persistence logic lives in `ProjectTargetSelectionController` in `src/extension/project-target-selection.ts`.

---

## Field aliases

Several fields have aliases — different names for the same value. This exists because the config format evolved and because different contexts use different naming conventions:

| Canonical field | Aliases | Notes |
|-----------------|---------|-------|
| `asm` | `sourceFile`, `source` | The assembly source file path |
| `defaultTarget` | `target` | Which target to use by default |

During resolution, all aliases are checked in a defined order. The first non-undefined value wins. If you are writing code that reads these fields, always use the resolution helpers in `launch-args.ts` rather than reading fields directly — they handle the alias chain correctly.

---

## The merge pipeline

A debug session's final configuration is not read from a single source. It is assembled from up to four layers, merged in priority order:

```
Runtime launch arguments  (highest priority)
    ▼
Target-specific config    (from targets[name])
    ▼
Root config               (from debug80.json root)
    ▼
Platform defaults          (lowest priority)
```

Each layer is optional. Missing layers are skipped. For simple scalar fields (strings, numbers, booleans), the first non-undefined value in priority order wins. This merge happens in `populateFromConfig()`.

### Platform block merging

Platform configuration blocks (`simple`, `tec1`, `tec1g`) receive special treatment. They are **shallow-merged**, not replaced. This means a target can override specific fields within a platform block without losing other fields defined at the root level.

Consider:

```json
{
  "tec1g": {
    "romHex": "roms/mon-3.hex",
    "appStart": 8192,
    "entry": 0
  },
  "targets": {
    "app": {
      "sourceFile": "src/app.zax",
      "tec1g": {
        "appStart": 16384
      }
    }
  }
}
```

The `app` target's effective `tec1g` block is:

```json
{
  "romHex": "roms/mon-3.hex",
  "appStart": 16384,
  "entry": 0
}
```

The target overrode `appStart` but inherited `romHex` and `entry` from the root. If the blocks were replaced instead of merged, the target would lose the ROM path — a subtle and frustrating bug. The merge function `mergeNestedPlatformBlock()` in `launch-args.ts` handles this with `Object.assign()` over three layers (root, target, runtime).

### TEC-1G ROM inheritance

There is one additional subtlety for TEC-1G configurations. The MON-3 ROM path (`romHex`) is often defined in only one place — either at the root `tec1g` block or in a single target's `tec1g` block. Other targets that also use TEC-1G might define partial overrides (just `appStart`, for example) and expect to inherit the ROM.

The function `resolveTec1gBaseForMerge()` handles this:

1. If the root `tec1g.romHex` exists and is non-empty — use the root block as the base
2. Otherwise, find the first target (alphabetically) that defines a non-empty `romHex`
3. Use that target's `tec1g` block as the base, then apply root-level overrides on top

This ensures that `romHex` propagates across targets even when it is not defined at the root level.

---

## The LaunchRequestArguments type

After the merge pipeline runs, the result is a fully populated `LaunchRequestArguments` object — the type that the debug adapter actually uses. It has the same fields as `ProjectConfig` plus a few runtime-only additions:

```typescript
interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  // All ProjectConfig fields, plus:
  projectConfig?: string;    // Path to the config file that was resolved
  diagnostics?: boolean;     // Enable verbose debug console output
}
```

The adapter never reads `ProjectConfig` directly. It only sees `LaunchRequestArguments`, which has already been through the full merge pipeline. If you are working on the adapter side, `LaunchRequestArguments` is your entry point — you never need to care about where a value came from.

---

## Platform configuration in detail

Each platform has its own configuration block type. These blocks define how the emulated hardware is set up — memory layout, ROM images, peripheral options, and timing controls.

### SimplePlatformConfig

The minimal platform. No hardware emulation beyond optional terminal I/O.

```typescript
interface SimplePlatformConfig {
  regions?: SimpleMemoryRegion[];   // ROM/RAM layout
  appStart?: number;                // Where user code typically begins
  entry?: number;                   // Execution entry point
  binFrom?: number;                 // Binary export range (optional)
  binTo?: number;
  extraListings?: string[];         // Additional listing files for symbols
}

interface SimpleMemoryRegion {
  start: number;
  end: number;
  kind?: 'rom' | 'ram' | 'unknown';
  readOnly?: boolean;
}
```

Memory regions define which address ranges are ROM (read-only) and which are RAM (read-write). The Z80 memory model is a flat 64K array — regions tell the emulator which writes to accept and which to reject.

### Tec1PlatformConfig

Extends the simple platform with TEC-1 hardware.

```typescript
interface Tec1PlatformConfig {
  // Inherited from simple
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  extraListings?: string[];

  // TEC-1 specific
  romHex?: string;          // Path to monitor ROM image
  ramInitHex?: string;      // Initial RAM contents (optional)
  updateMs?: number;        // UI refresh interval (default: 16ms)
  yieldMs?: number;         // Cooperative yield interval
}
```

The `romHex` field is critical — it points to the monitor ROM (e.g., MON-1B, MON-2) that provides the TEC-1's built-in routines. Without it, the emulated TEC-1 has no firmware.

### Tec1gPlatformConfig

The TEC-1G adds a substantial amount of hardware.

```typescript
interface Tec1gPlatformConfig extends Tec1PlatformConfig {
  // Cartridge and storage
  cartridgeHex?: string;        // Expansion cartridge ROM

  // Memory banking
  expansionBankHi?: boolean;    // A14 bank select mode
  protectOnReset?: boolean;     // Write-protect banked memory on reset

  // Hardware features
  gimpSignal?: boolean;         // GIMP signal support
  matrixMode?: boolean;         // Matrix keyboard mode

  // Peripherals
  rtcEnabled?: boolean;         // DS1302 real-time clock
  sdEnabled?: boolean;          // SD card emulation
  sdImagePath?: string;         // Path to SD card image file
  sdHighCapacity?: boolean;     // SDHC mode

  // UI visibility (which sections to show in the panel)
  uiVisibility?: {
    lcd?: boolean;
    display?: boolean;
    keypad?: boolean;
    matrix?: boolean;
    matrixKeyboard?: boolean;
    glcd?: boolean;
    serial?: boolean;
  };
}
```

The `uiVisibility` field controls which hardware sections appear in the webview panel. This is a convenience — not all programs use all peripherals, and hiding unused sections keeps the UI clean.

---

## Project scaffolding

When a user creates a new project, the scaffolding system generates the config file and optional starter source. The flow is driven by `scaffoldProject()` in `src/extension/project-scaffolding.ts`.

### The scaffolding steps

1. **Check for existing config.** If a `debug80.json` already exists in any of the three locations, abort — do not overwrite.

2. **Prompt for target name.** An input box asks the user to name the target (default: `app`).

3. **Choose entry source.** A Quick Pick shows:
   - Any `.asm` or `.zax` files already in the project folder
   - "Create ASM starter" — generates a minimal `.asm` file
   - "Create ZAX starter" — generates a minimal `.zax` file

4. **Build the scaffold plan.** A `ScaffoldPlan` object captures the target name, source file path, output directory, artifact base name, assembler type, and optional starter file content.

5. **Write files.** The scaffold writes:
   - The starter source file (if requested)
   - `.vscode/debug80.json` with the generated config

### The default config

The generated config always uses platform `simple` with a basic memory layout:

```json
{
  "defaultTarget": "app",
  "targets": {
    "app": {
      "sourceFile": "src/main.zax",
      "outputDir": "build",
      "artifactBase": "main",
      "assembler": "zax",
      "platform": "simple",
      "simple": {
        "regions": [
          { "start": 0, "end": 2047, "kind": "rom" },
          { "start": 2048, "end": 65535, "kind": "ram" }
        ],
        "appStart": 2304,
        "entry": 0
      }
    }
  }
}
```

This is a known limitation — the scaffolding does not offer a platform choice. Users who want TEC-1 or TEC-1G must edit the config manually after creation. Adding platform selection to the scaffolding flow is planned.

### Assembler auto-detection

When a source file is selected or changed, the system infers the assembler from the file extension:

- `.zax` → `assembler: "zax"`
- `.asm` → remove the `assembler` field (defaults to asm80)

This logic runs both during scaffolding and when updating a target's source file via `updateProjectTargetSource()`.

---

## The Debug Configuration Provider

VS Code's debug system allows extensions to dynamically provide and resolve launch configurations. Debug80 implements this through `Debug80ConfigurationProvider` in `src/extension/debug-configuration-provider.ts`.

### What it does

The provider intercepts the launch flow at two points:

**Before variable substitution** (`resolveDebugConfiguration`):
- If the user presses F5 with no `launch.json`, the provider creates a default config
- If the config has no explicit source/hex/listing paths, it locates the project config file and injects `projectConfig` into the launch arguments
- If no project config exists, it offers to create one

**After variable substitution** (`resolveDebugConfigurationWithSubstitutedVariables`):
- If `projectConfig` is set but no `target` is specified, it prompts the user to select a target
- Injects the selected target name into the final config

This two-phase approach means the user never needs a `launch.json` file. Pressing F5 in a workspace with a `debug80.json` just works — the provider resolves everything dynamically.

---

## Config file watching

The extension watches for changes to config files using VS Code's file system watcher. The watch patterns are:

```
**/.vscode/debug80.json
**/debug80.json
**/.debug80.json
```

When a config file is created or deleted, `WorkspaceSelectionController.updateHasProject()` fires, updating the panel's project status. This means adding a `debug80.json` to a workspace folder immediately makes it appear as a configured project in the root selector — no restart needed.

The watcher registration lives in `WorkspaceSelectionController.registerInfrastructure()`.

---

## Summary

- Debug80 projects are defined by a JSON config file at `.vscode/debug80.json`, `debug80.json`, or `.debug80.json`. The first found wins.

- The `ProjectConfig` type defines the file structure. The `targets` object holds named build configurations; root-level fields serve as defaults for all targets.

- Target resolution follows a priority chain: explicit argument → stored selection → `defaultTarget` → single target → prompt. Selections are persisted in workspace state, keyed by config path.

- Launch arguments are assembled from four layers (runtime → target → root → platform defaults) via `populateFromConfig()`. Platform blocks are shallow-merged, not replaced, so targets can override individual fields without losing inherited values.

- TEC-1G configs have special ROM inheritance logic via `resolveTec1gBaseForMerge()` to ensure `romHex` propagates across targets.

- After merging, the result is a `LaunchRequestArguments` object — the only type the debug adapter sees. It never reads `ProjectConfig` directly.

- Three platform config types exist: `SimplePlatformConfig` (memory regions only), `Tec1PlatformConfig` (adds ROM and timing), and `Tec1gPlatformConfig` (adds banking, peripherals, and UI visibility).

- Project scaffolding generates a default `simple` platform config. Platform selection during creation is not yet implemented.

- The `Debug80ConfigurationProvider` enables F5-to-debug without a `launch.json` — it resolves the project config and target dynamically.

- File watchers detect config creation/deletion in real time, updating the panel immediately.

---

[← What Debug80 Is](01-what-debug80-is.md) | [Part I](README.md) | [Part II →](../part2/README.md)
