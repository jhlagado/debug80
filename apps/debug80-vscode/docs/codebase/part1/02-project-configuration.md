---
layout: default
title: 'Chapter 2 — Project Configuration'
parent: 'Part I — Orientation'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 2
---

[← Debug80 Architecture](01-what-debug80-is.md) | [Part I](index.md) | [Part II →](../part2/index.md)

# Chapter 2 — The Project Configuration System

A Debug80 project is defined by a JSON configuration file that tells the extension what to build, what platform to target, where to find source files and ROM images, and how to lay out memory. This chapter explains every part of that system: the config file format, how targets work, how multiple configuration sources are merged, and how the scaffolding flow creates a new project from scratch.

If you are going to work on any part of debug80 that touches launching, target selection, or platform setup, you need to understand this chapter. The configuration system is the spine — every debug session begins by resolving a config into a fully populated set of launch arguments.

---

## Where the config file lives

The current project model uses `debug80.json` at the workspace folder root as the primary project marker.

The search starts from the selected workspace folder root. `findProjectConfigPath()` in `src/extension/project-config.ts` currently checks two compatibility locations in order:

1. `debug80.json`
2. `.vscode/debug80.json`

If neither exists, the panel treats the folder as uninitialized: no configured targets appear in the selector, and the setup card can initialize the folder by writing a new root `debug80.json`.

New scaffolding and user-facing project setup should still use root `debug80.json`. Keeping the marker at the top level makes the project boundary visible in Explorer and keeps the panel's initialized/uninitialized state easy to reason about, while the `.vscode` lookup remains a read-path for older workspaces.

---

## The ProjectConfig type

The config file is parsed into a `ProjectConfig` object, defined in `src/debug/session/types.ts`. The current model is a **versioned manifest** with backwards-compatible support for older root-level fields.

```typescript
interface ProjectConfig {
  projectVersion?: 1 | 2;
  projectPlatform?: string;
  profiles?: Record<string, ProjectProfileConfig>;
  bundledAssets?: Record<string, BundledAssetReference>;
  defaultProfile?: string;

  defaultTarget?: string;
  target?: string;
  targets?: Record<string, Partial<LaunchRequestArguments> & { source?: string; profile?: string }>;

  // Root-level defaults still supported
  asm?: string;
  sourceFile?: string;
  source?: string;
  assembler?: string;
  hex?: string;
  outputDir?: string;
  artifactBase?: string;
  entry?: number;
  stopOnEntry?: boolean;
  platform?: string;
  assemble?: boolean;
  sourceRoots?: string[];
  stepOverMaxInstructions?: number;
  stepOutMaxInstructions?: number;
  terminal?: TerminalConfig;
  simple?: SimplePlatformConfig;
  tec1?: Tec1PlatformConfig;
  tec1g?: Tec1gPlatformConfig;
}
```

### Version 2 manifests

The current scaffolding path writes a **version 2** manifest. The important additions are:

- `projectVersion: 2` marks the manifest as using the newer model
- `projectPlatform` records the project's baseline platform identity
- `profiles` define reusable platform-and-bundle baselines
- `defaultProfile` selects the profile used when a target does not override it
- `bundledAssets` and profile-level `bundledAssets` can point at extension-shipped ROM, D8 source-map, and source bundles

In practice, the v2 manifest lets the scaffolder create monitor-first projects without hard-coding absolute paths into the starter config. Instead, the config can describe a bundled asset reference and the launch resolver can fall back to the extension-bundled file when the workspace copy is absent.

### Bundled assets

`BundledAssetReference` is a small indirection object:

```typescript
interface BundledAssetReference {
  bundleId: string; // e.g. 'tec1/mon1b/v1' or 'tec1g/mon3/v1'
  path: string; // file path inside the bundle
  destination?: string; // optional workspace-relative destination override
}
```

Bundled assets are used mainly for monitor ROMs, D8 source maps, and ROM source files. The current project kits use them to seed:

- `TEC-1 / MON-1B`
- `TEC-1G / MON-3`

The materialization path lives in `src/extension/bundle-materialize.ts`. Bundles are verified against `bundle.json` manifests and copied into workspace-relative destinations such as `roms/tec1/...` or `roms/tec1g/...`.

### Project kits

Scaffolding is no longer just "pick a platform and write a bare JSON file". The extension now has explicit **project kits** in `src/extension/project-kits.ts`. A kit defines:

- the platform
- the profile name
- the default app start address
- starter templates for assembly projects
- any bundled monitor assets that should be associated with the project

`src/extension/project-scaffolding.ts` builds the initial `debug80.json` from a `ScaffoldPlan` and writes starter source files. Bundled ROM assets remain referenced in the config; the launch resolver uses those references to locate extension-bundled files when workspace files are absent, and the explicit bundled-assets command can install local copies on demand.

---

## Targets

A target is a named build-and-debug configuration. A project can define multiple targets — one for each program, test case, or hardware configuration you want to debug. Each target is an entry in the `targets` object, keyed by name.

A typical multi-target config:

```json
{
  "defaultTarget": "matrix",
  "targets": {
    "matrix": {
      "sourceFile": "src/matrix.asm",
      "platform": "tec1g"
    },
    "hello": {
      "sourceFile": "src/hello.asm",
      "platform": "tec1g"
    },
    "test-serial": {
      "sourceFile": "src/test-serial.asm",
      "platform": "tec1g"
    }
  },
  "tec1g": {
    "romHex": "roms/mon-3.hex",
    "appStart": 8192
  }
}
```

In this example, all three targets share the same `tec1g` block at the root — the ROM image and application start address are inherited. Each target specifies its own source file. The `matrix` target is the default.

In the v2 manifest, a target can also point at a named profile:

```json
{
  "defaultProfile": "mon3",
  "targets": {
    "matrix": {
      "profile": "mon3",
      "sourceFile": "src/matrix.asm"
    }
  }
}
```

That arrangement lets the target inherit bundled ROM assets and baseline platform identity from the profile while still overriding source/build details at the target layer.

### Target selection priority

When a debug session launches, the system must decide which target to use. The resolution order is:

1. Explicit `target` passed in the launch arguments (e.g., from the webview selector)
2. The config's `target` field
3. The config's `defaultTarget` field
4. The first target alphabetically (if one exists)

If the project has no configured targets, launch does not fall through into the adapter. The extension reports that the project needs a program file and leaves the user in the target-picking flow.

This logic lives in `populateFromConfig()` in `src/debug/launch-args.ts`.

### Remembering the selected target

When a user selects a target — either through the panel selector or a command flow that resolves a target explicitly — the selection is stored in VS Code's workspace state under the key:

```
debug80.selectedTarget:{projectConfigPath}
```

The key includes the config file path, so different projects in a multi-root workspace each remember their own target independently. On the next launch, the stored target is preferred over the config's `defaultTarget`, unless it no longer exists in the config.

The persistence logic lives in `ProjectTargetSelectionController` in `src/extension/project-target-selection.ts`. The controller is now a thin orchestrator around extracted policy modules: `project-target-policy.ts` decides whether to reuse a stored or default target or prompt, `project-target-config-policy.ts` turns config entries into visible choices, `project-target-source-policy.ts` tracks which source files are already covered by targets, `project-target-filesystem.ts` handles existence checks and short-lived source-file caching, and `target-discovery.ts` scans the workspace for runnable AZM entry conventions plus `.glim` files that declare a complete program.

### Discovered versus configured targets

The project header can now surface two kinds of target choice:

- **Configured targets** already exist under `targets` in `debug80.json`.
- **Discovered targets** are runnable source files on disk that are not yet represented in `debug80.json`.

`listProjectTargetChoices()` merges those lists. Discovered entries carry `discovered: true` and `sourceFile`, and the webview prefixes them with `+` in the Target selector. Selecting one from the panel persists a new target entry into `debug80.json` by calling `addProjectTarget()`.

The discovery rules are broader than the old `main.asm`-only flow:

- files named exactly `main.asm` or `main.z80`
- any `.glim` file whose top-level source declares `program <name>`

The explicit **Add Target** command goes further. It lists every eligible `.asm`, `.z80`, or runnable `.glim` source file in the workspace, even when the file does not match the entry-point naming convention. The command generates a stable target name from the filename, copies the first existing target as a template, then replaces source-specific fields such as `sourceFile`, `asm`, `artifactBase`, and incompatible assembler overrides.

### Target editing and removal

`target-commands.ts` now owns a fuller target-maintenance surface than the earlier selector-only flow:

- `debug80.addTarget` adds a new configured target from a workspace source file
- `debug80.removeTarget` removes the selected target from `debug80.json` but leaves source files and build artifacts on disk
- `debug80.setEntrySource` repoints an existing target at another program file and keeps `sourceFile` and `asm` aligned
- `debug80.configureProject` prompts for a target, then edits one field at a time: target platform override, program file, assembler, target name, output directory, or artifact base

Removal keeps the project valid. If other configured targets remain, `removeProjectTarget()` picks a replacement current target and updates `defaultTarget` or legacy `target` when the removed target was still referenced there. If the removed target was the only target, Debug80 writes an empty `targets` map, clears `defaultTarget` and legacy `target`, forgets the remembered selection, and leaves the project in a valid zero-target state until the user picks another program file.

---

## Field aliases

Several fields have aliases — different names for the same value. This exists because the config format evolved and because different contexts use different naming conventions:

| Canonical field | Aliases                | Notes                          |
| --------------- | ---------------------- | ------------------------------ |
| `asm`           | `sourceFile`, `source` | The assembly source file path  |
| `defaultTarget` | `target`               | Which target to use by default |

During resolution, all aliases are checked in a defined order. The first non-undefined value wins. If you are writing code that reads these fields, always use the merge helpers behind `populateFromConfig()` rather than reading fields directly. `src/debug/launch/launch-config-merge.ts` now owns the field-by-field merge and alias handling while `src/debug/launch-args.ts` stays responsible for config discovery and top-level launch argument entry.

One practical example is `stopOnEntry`: the panel-level toggle is **not** written back into `debug80.json`, but target/root-level config values still merge through the launch pipeline. `resolveStopOnEntryForTarget()` in `src/extension/project-config.ts` mirrors the launch merge so the panel can show the effective project-level value without pretending it is persisted UI state.

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

Each layer is optional. Missing layers are skipped. For simple scalar fields (strings, numbers, booleans), the first non-undefined value in priority order wins. `populateFromConfig()` still drives the process, but the actual staged merge now lives in `mergeLaunchConfigStages()` in `src/debug/launch/launch-config-merge.ts`.

The top-level `azm` block also uses a shallow merge across root config, target config, and explicit launch arguments. That lets a target override `emitRegisterReport` or `registerContracts` without replacing the rest of the resolved AZM options. Nested objects inside `azm` still follow normal object replacement rules because `applyAzmOptions()` uses object spread at the `azm` layer only. `registerContractsPolicy` therefore replaces the whole policy object when a target or launch argument provides one, instead of merging per mode list.

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
      "sourceFile": "src/app.asm",
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

The target overrode `appStart` but inherited `romHex` and `entry` from the root. If the blocks were replaced instead of merged, the target would lose the ROM path. The merge function `mergeNestedPlatformBlock()` in `src/debug/launch/launch-config-merge.ts` handles this with `Object.assign()` over three layers: root, target, and runtime.

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
  projectConfig?: string; // Path to the config file that was resolved
  diagnostics?: boolean; // Enable verbose debug console output
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
  regions?: SimpleMemoryRegion[]; // ROM/RAM layout
  appStart?: number; // Where user code typically begins
  entry?: number; // Execution entry point
  binFrom?: number; // Binary export range (optional)
  binTo?: number;
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

  // TEC-1 specific
  romHex?: string; // Path to monitor ROM image
  ramInitHex?: string; // Initial RAM contents (optional)
  updateMs?: number; // UI refresh interval (default: 16ms)
  yieldMs?: number; // Cooperative yield interval
}
```

The `romHex` field is critical — it points to the monitor ROM (e.g., MON-1B, MON-2) that provides the TEC-1's built-in routines. Without it, the emulated TEC-1 has no firmware.

### Tec1gPlatformConfig

The TEC-1G adds a substantial amount of hardware.

```typescript
interface Tec1gPlatformConfig extends Tec1PlatformConfig {
  // Expansion ROM and storage
  expansionRomHex?: string; // Optional banked expansion ROM at 0x8000-0xBFFF
  romArtifacts?: Tec1gRomArtifactConfig[]; // Explicit ROM-first monitor/expansion build declarations

  // Memory banking
  expansionBankHi?: boolean; // A14 bank select mode
  protectOnReset?: boolean; // Write-protect banked memory on reset

  // Hardware features
  gimpSignal?: boolean; // GIMP signal support
  matrixMode?: boolean; // Matrix keyboard mode

  // Peripherals
  rtcEnabled?: boolean; // DS1302 real-time clock
  sdEnabled?: boolean; // SD card emulation
  sdImagePath?: string; // Path to SD card image file
  sdHighCapacity?: boolean; // SDHC mode

  // Legacy UI visibility defaults. Current TEC-1G core sections are always shown.
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

`romArtifacts` is the new ROM-first launch path for TEC-1G monitor and expansion images. Each entry declares a role (`'monitor'` or `'expansion'`), either a single source-backed build (`sourceFile`, `outputBin`, optional `outputDebugMap`), a multibank expansion build (`outputBin` plus `banks` and optional `outputs`), or an inactive binary placeholder, and fixed geometry that matches the current Phase 2 hardware model. Validation in `src/debug/launch/config-validation.ts` currently enforces:

- at most one active monitor artifact and one active expansion artifact
- monitor artifacts at `address: 0xC000` and `size: 0x4000`
- expansion artifacts at `windowAddress: 0x8000`, `windowSize: 0x4000`, and `bankSize === windowSize`
- `bankCount === imageSize / bankSize` for expansion images
- expansion `bankCount` in the supported 1-9 range
- multibank expansion entries declare unique `banks[].physicalBank` values in the supported 0-8 range
- multibank `outputs[]` recipes reference declared banks, avoid duplicate banks per recipe, and use either packed `outputBin` or per-bank `outputDir`
- active artifacts must be source-backed; binary-only entries are accepted only when `active: false`

At launch, `buildTec1gRomArtifactsIfRequested()` in `src/debug/launch/tec1g-rom-artifact-build.ts` assembles each active source-backed artifact with AZM before runtime creation. That path always forces `registerContracts: 'off'` and `emitRegisterReport: false` for ROM artifacts, even when the main app launch enables register-contract analysis, so monitor and expansion ROM builds do not inherit app-scoped contract enforcement or report generation. Single-source monitor and expansion artifacts are padded to their configured output size. Multibank expansion artifacts assemble each declared bank at the visible `0x8000-0xBFFF` window, pad each bank binary to 16K, then write configured output recipes. Packed recipes can use `layout: 'physical'` for a Debug80 runtime/programming image or `layout: 'contiguous'` for smaller deliverables such as the legacy 32K expansion image. Per-bank recipes copy `bankN.bin` files to an output directory. If no recipe writes the top-level `outputBin`, Debug80 still writes it as the physical runtime image and prepends each bank's D8 map to `debugMaps`.

The `uiVisibility` field is legacy configuration. The current TEC-1G panel keeps the main hardware surfaces visible and organizes them into accordion sections rather than expecting users to toggle sections on and off. Older configs that contain this field remain readable, but new project configuration should not rely on it for the normal front-panel layout.

---

## Project scaffolding

When a user creates a new project, the scaffolding system generates the config file and optional starter source. The flow is driven by `scaffoldProject()` in `src/extension/project-scaffolding.ts`.

### The scaffolding steps

1. **Check for an existing root config.** If `debug80.json` already exists at the workspace root, abort — do not overwrite.

2. **Resolve the kit.** If the caller already supplied a platform (the panel path), `getDefaultProjectKitForPlatform()` selects the default kit immediately. Otherwise `chooseProjectKit()` shows the kit picker.

3. **Build the scaffold plan.** A `ScaffoldPlan` captures the kit, target name, source file path, output directory, artifact base, and optional starter-file details. In the interactive path the source-file choice also includes **No target yet**, which creates a valid project with an empty `targets` map. In the panel's platform-preselected path this is intentionally minimal: the default source file is `src/main.asm`, the target name is derived from the filename, and no extra prompts are shown.

4. **Write files.** The scaffold writes:
   - the starter source file if it does not already exist
   - `debug80.json` at the workspace root

5. **Merge `.gitignore`.** `ensureDebug80Gitignore()` in `src/extension/project-gitignore.ts` appends a small, idempotent **Debug80**-marked block if one is not already present: the scaffold `outputDir` (e.g. `build/`), `out/` and `dist/`, `.vscode/launch.json` (local-only; the extension can still provide a default launch), and common OS files. It does not ignore `roms/`: project-local monitor ROM sources are real project source once copied in for monitor development. The block does not ignore the entire `.vscode/` tree, but new Debug80 project configuration still belongs in root `debug80.json`.

6. **Optionally write launch.json.** `.vscode/launch.json` is created only when the caller asked for launch scaffolding as well. The plain project-init path no longer creates an empty `.vscode` folder.

### The default config

The generated config now depends on the selected **project kit**. The common shape is:

```json
{
  "projectVersion": 2,
  "projectPlatform": "tec1g",
  "defaultProfile": "mon3",
  "defaultTarget": "app",
  "profiles": {
    "mon3": {
      "platform": "tec1g",
      "description": "TEC-1G monitor-first profile with user code at 0x4000.",
      "bundledAssets": {
        "romHex": {
          "bundleId": "tec1g/mon3/v1",
          "path": "mon3.bin",
          "destination": "roms/tec1g/mon3/mon3.bin"
        }
      }
    }
  },
  "targets": {
    "app": {
      "sourceFile": "src/main.asm",
      "outputDir": "build",
      "artifactBase": "main",
      "platform": "tec1g",
      "profile": "mon3",
      "tec1g": {
        "regions": [
          { "start": 0, "end": 2047, "kind": "rom" },
          { "start": 2048, "end": 49151, "kind": "ram" },
          { "start": 49152, "end": 65535, "kind": "rom" }
        ],
        "appStart": 16384,
        "entry": 0,
        "romHex": "roms/tec1g/mon3/mon3.bin",
        "sourceRoots": ["src", "roms/tec1g/mon3"]
      }
    }
  }
}
```

For `simple/default` and `tec1/mon1b` the same structure is used, but with the kit's platform-specific memory block and profile metadata. The platform is now selected during initialization rather than being a manual post-edit step.

### Assembler auto-detection

When a source file is selected or changed, the system infers the assembler from the file extension:

- `.asm`, `.z80`, and `.inc` → use AZM
- `.glim` → use Glimmer

Target discovery is independent of a mandatory `src/` folder. Debug80 looks for AZM entry points by convention (`main.asm` and `main.z80`) and treats a `.glim` file as runnable when it contains a top-level `program` declaration. Glimmer `part` files remain out of the target list. Ordinary helper assembly files and non-entry `.z80` files are also left out of automatic discovery unless selected explicitly with **Debug80: Set Program File**.

---

## The Debug Configuration Provider

VS Code's debug system allows extensions to dynamically provide and resolve launch configurations. Debug80 implements this through `Debug80ConfigurationProvider` in `src/extension/debug-configuration-provider.ts`.

### What it does

The provider intercepts the launch flow at two points:

**Before variable substitution** (`resolveDebugConfiguration`):

- If the user presses F5 with no `launch.json`, the provider creates a default config
- If the config has no explicit source or HEX paths, it locates root `debug80.json` and injects `projectConfig` into the launch arguments
- If no project config exists, it offers to create one

**After variable substitution** (`resolveDebugConfigurationWithSubstitutedVariables`):

- If `projectConfig` is set but no `target` is specified, it prompts the user to select a target
- Injects the selected target name into the final config

This two-phase approach means the user never needs a `launch.json` file. Pressing F5 in a workspace with a `debug80.json` just works — the provider resolves everything dynamically.

---

## Config file watching

The extension watches for changes to config files using VS Code's file system watcher. The watch patterns are:

```
**/debug80.json
```

When a config file is created or deleted, `WorkspaceSelectionController.updateHasProject()` fires, updating the panel's project status. This means adding a `debug80.json` to a workspace folder immediately makes it appear as a configured project in the root selector — no restart needed.

The watcher registration lives in `WorkspaceSelectionController.registerInfrastructure()`.

---

## Summary

- Debug80 projects are defined by a root-level `debug80.json`. That file is the project marker the panel uses for initialized workspace folders.

- The `ProjectConfig` type defines the file structure. The `targets` object holds named build configurations; root-level fields serve as defaults for all targets.

- Target resolution follows a priority chain: explicit argument → stored selection → `defaultTarget` → first available target → prompt. Selections are persisted in workspace state, keyed by config path.

- Launch arguments are assembled from four layers (runtime → target → root → platform defaults) via `populateFromConfig()`. Platform blocks are shallow-merged, not replaced, so targets can override individual fields without losing inherited values.

- TEC-1G configs have special ROM inheritance logic via `resolveTec1gBaseForMerge()` to ensure `romHex` propagates across targets.

- After merging, the result is a `LaunchRequestArguments` object — the only type the debug adapter sees. It never reads `ProjectConfig` directly.

- Three platform config types exist: `SimplePlatformConfig` (memory regions only), `Tec1PlatformConfig` (adds ROM and timing), and `Tec1gPlatformConfig` (adds banking, peripherals, and UI visibility).

- Project scaffolding is now kit-driven. Platform selection happens during initialization, and the scaffold writes a version 2 manifest with profile-level bundled-asset references for monitor-backed kits. Missing workspace assets resolve from the extension bundle at launch; the explicit bundled-assets command copies local files when requested.

- The `Debug80ConfigurationProvider` enables F5-to-debug without a `launch.json` — it resolves root `debug80.json` and the selected target dynamically.

- File watchers detect config creation/deletion in real time, updating the panel immediately.

---

[← Debug80 Architecture](01-what-debug80-is.md) | [Part I](index.md) | [Part II →](../part2/index.md)
