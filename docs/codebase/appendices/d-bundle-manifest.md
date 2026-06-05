---
layout: default
title: 'Appendix D — ROM Bundle Infrastructure'
parent: 'Appendices'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 4
---

[← Appendix C](c-session-state.md) | [Appendices](index.md)

# Appendix D — ROM Bundle Infrastructure

The Debug80 extension ships ROM firmware, D8 source maps, and related assets for supported platforms directly inside the VSIX package. These assets are called **ROM bundles**. A monitor-backed project records stable workspace-relative ROM/source-map paths and profile-level `bundledAssets` references in `debug80.json`. At launch, missing workspace files resolve to the copy inside the extension bundle. The explicit bundled-assets command can copy those files into the workspace when the user wants local files to inspect or override.

This appendix covers the bundle manifest schema, the materialization functions, the resource directory layout, and how bundles are wired into the project-kit scaffolding and command flows.

---

## Why bundles?

Shipping firmware inside the extension means users get a working TEC-1G project immediately, without needing to source a ROM image separately. The bundle approach also allows the extension to verify file integrity via SHA-256 checksums, and to map files to named roles (ROM, debug map, source tree) rather than relying on naming conventions.

---

## Resource directory layout

Bundle files are stored under `resources/bundles/` in the extension root:

```
resources/
  bundles/
    tec1/
      mon1b/
        v1/
          bundle.json      Manifest (schema version, file list, workspace layout)
          mon-1b.bin       ROM binary image
          mon-1b.asm       ROM source
    tec1g/
      mon3/
        v1/
          bundle.json      Manifest (schema version, file list, workspace layout)
          mon3.bin         ROM binary image
          mon3.d8.json     D8 source map (symbols and source map)
          *.z80            ROM source modules
          README.md        Human-readable notes about the firmware version
```

The path segments under `bundles/` form the _bundle relative path_ (e.g. `tec1/mon1b/v1` or `tec1g/mon3/v1`). Two constants in `bundle-materialize.ts` name the shipped bundles:

| Constant               | Value             | Platform     |
| ---------------------- | ----------------- | ------------ |
| `BUNDLED_MON1B_V1_REL` | `'tec1/mon1b/v1'` | TEC-1 MON-1B |
| `BUNDLED_MON3_V1_REL`  | `'tec1g/mon3/v1'` | TEC-1G MON3  |

---

## `BundleManifestV1` — the manifest schema

`bundle.json` is parsed into a `BundleManifestV1` object (defined in `src/extension/bundle-manifest.ts`):

```typescript
interface BundleManifestV1 {
  schemaVersion: 1; // Must equal BUNDLE_MANIFEST_SCHEMA_VERSION
  id: string; // Stable bundle identifier, e.g. 'tec1g/mon3'
  version: string; // Semver or upstream label, e.g. '1.6.0-bc25'
  platform: 'simple' | 'tec1' | 'tec1g';
  label: string; // Human-readable name, e.g. 'MON3 (TEC-1G)'
  files: BundleFileEntry[];
  workspaceLayout: BundleWorkspaceLayout;
}

interface BundleFileEntry {
  role: 'rom' | 'debug_map' | 'source' | 'source_tree';
  path: string; // Path relative to the bundle root directory
  sha256?: string; // Optional SHA-256 hex for integrity verification
}

interface BundleWorkspaceLayout {
  destination: string; // Directory relative to workspace root, e.g. 'roms/tec1g/mon3'
}
```

The MON3 v1 `bundle.json`:

```json
{
  "schemaVersion": 1,
  "id": "tec1g/mon3",
  "version": "1.6.0-bc25",
  "platform": "tec1g",
  "label": "MON3 (TEC-1G)",
  "files": [
    {
      "role": "rom",
      "path": "mon3.bin",
      "sha256": "754555aa4029fc496352fbb4a7de91e67c7c7e58de76c7dc5fba2e85e4705401"
    },
    {
      "role": "debug_map",
      "path": "mon3.d8.json",
      "sha256": "a3d164350710285c4dac05c193f07eeff4ba64c548ad36ae9626b29d453e1380"
    },
    {
      "role": "source",
      "path": "mon3.z80",
      "sha256": "cc23b4115834e5ba71fc1e78bc4defc4330df962bf4394bf502e65d3196e96cf"
    }
  ],
  "workspaceLayout": {
    "destination": "roms/tec1g/mon3"
  }
}
```

The MON-1B v1 `bundle.json`:

```json
{
  "schemaVersion": 1,
  "id": "tec1/mon1b",
  "version": "1.0.0",
  "platform": "tec1",
  "label": "MON-1B (TEC-1)",
  "files": [
    {
      "role": "rom",
      "path": "mon-1b.bin",
      "sha256": "f3e39203ecf134c737e307a5f7ef82f3c4b62b979da0fb883b56b632ab3b1596"
    },
    {
      "role": "source",
      "path": "mon-1b.asm",
      "sha256": "69ceca17b6ff853d3eefe9876c5ec813a085680533d4294c43781e64048ae49e"
    }
  ],
  "workspaceLayout": {
    "destination": "roms/tec1/mon1b"
  }
}
```

`isBundleManifestV1()` validates the parsed JSON before trusting it. Any manifest that fails validation is treated as absent.

---

## Materialization functions

`bundle-materialize.ts` exports two functions for copying bundle files into the workspace. Both verify SHA-256 checksums when present, skip existing files by default, and return a discriminated union (`ok: true | false`) with a `reason` string on failure.

### `materializeBundledAsset()` — single asset reference

This is the per-asset materialization path used by the `debug80.materializeBundledRom` command:

```typescript
function materializeBundledAsset(
  extensionUri: vscode.Uri,
  workspaceRoot: string,
  reference: BundledAssetReference,
  options?: { overwrite?: boolean }
): MaterializeBundledAssetResult;
```

`BundledAssetReference` carries `{ bundleId, path, destination? }`. The function:

1. Reads and validates `bundle.json` for the given `bundleId`.
2. Locates the matching entry in `manifest.files` by `path`.
3. Resolves the destination — using `reference.destination` if set, otherwise falling back to `manifest.workspaceLayout.destination/<basename>`.
4. Validates the destination is workspace-relative and does not escape the workspace root.
5. Verifies the source file's SHA-256.
6. Copies the file unless it already exists and `overwrite` is false.
7. Returns `{ ok: true, destinationRelative, materializedRelativePath }` on success.

### `materializeBundledRom()` — whole-bundle copy

This function copies _all_ files in a bundle into the destination directory declared by the manifest. It is available for whole-bundle installation workflows when the workspace needs local copies of ROM, D8 source-map, and source files:

```typescript
function materializeBundledRom(
  extensionUri: vscode.Uri,
  workspaceRoot: string,
  bundleRelPath: string,
  options?: { overwrite?: boolean }
): MaterializeBundledRomResult;
```

**Steps:**

1. Read `bundle.json` from `<extensionUri>/resources/bundles/<bundleRelPath>/bundle.json` and validate it.
2. Resolve the destination directory: `<workspaceRoot>/<workspaceLayout.destination>`. Create it if needed.
3. For each file entry in the manifest:
   - Verify the source file exists in the extension bundle.
   - If `sha256` is specified, compute the SHA-256 of the source file and compare. Return `{ ok: false }` on mismatch.
   - If the destination file already exists and `overwrite` is not true, skip the copy (but still record the path).
   - Otherwise copy with `fs.copyFileSync()`.
4. Return `{ ok: true, destinationRelative, romRelativePath, debugMapRelativePath? }`.

On success, `romRelativePath` and `debugMapRelativePath` are workspace-relative paths (using `/` separators) that can be written directly into `debug80.json` as ROM and source-map bundle references.

The `overwrite: false` default means subsequent calls on the same workspace are idempotent — files already present are not clobbered, but their paths are still resolved and returned.

---

## Integration points

### Project kits and scaffolding

Bundle metadata is embedded in `ProjectKit.bundledProfile` (defined in `src/extension/project-kits.ts`). Each kit that requires a ROM carries:

```typescript
bundledProfile: {
  bundleRelPath: string;   // versioned bundle dir path, e.g. 'tec1/mon1b/v1'
  romPath: string;         // workspace-relative destination, e.g. 'roms/tec1/mon1b/mon-1b.bin'
  debugMapPath?: string;   // e.g. 'roms/tec1g/mon3/mon3.d8.json'
  sourceRoots: string[];   // source root directories for the debug adapter
}
```

When `createDefaultProjectConfig()` in `project-scaffolding.ts` builds a `debug80.json` for a kit with a `bundledProfile`, it writes a `bundledAssets` map into the profile section. Each entry is a `BundledAssetReference` (`{ bundleId, path, destination }`). Scaffolding records these references but does not copy the ROM files immediately.

The launch argument resolver checks the configured workspace path first. If that file does not exist, and the path matches the bundled asset's declared destination, it resolves the asset from `<extension>/resources/bundles/<bundleId>/<path>`. This keeps the project runnable without writing ROM files into the workspace.

The two monitor-backed kits and their bundles:

| Kit          | Bundle constant        | Bundle path     |
| ------------ | ---------------------- | --------------- |
| `tec1/mon1b` | `BUNDLED_MON1B_V1_REL` | `tec1/mon1b/v1` |
| `tec1g/mon3` | `BUNDLED_MON3_V1_REL`  | `tec1g/mon3/v1` |

### Explicit command

The `debug80.materializeBundledRom` VS Code command (registered in `src/extension/commands.ts`) lets users run materialization manually. The command:

1. Prompts for a workspace folder.
2. If a `debug80.json` exists, reads the `bundledAssets` from the default profile and uses those references.
3. If no project config is found, shows a quick-pick with the available fallback plans (MON3 and MON-1B) and uses `materializeBundledAsset()` for each selected reference.
4. Asks whether to overwrite existing files or skip them.
5. Reports success or failure via `vscode.window.showInformationMessage()`.

This is useful if a user wants local ROM/source-map files for inspection or replacement. Normal launch does not require this step.

---

## Adding a new bundle

To add a new bundle (e.g. a different firmware version or a new platform ROM):

1. Create a new directory under `resources/bundles/`, e.g. `tec1g/mon3/v2/`.
2. Place the files there and create a `bundle.json` with `schemaVersion: 1`.
3. Add a constant for the new relative path in `bundle-materialize.ts` (e.g. `BUNDLED_MON3_V2_REL`).
4. Add a new `ProjectKit` entry in `project-kits.ts` with a `bundledProfile` referencing the new bundle.
5. If the bundle should be available via the manual install command, add it to `buildBundledAssetFallbackPlans()` in `src/extension/bundle-asset-installer.ts`.

The manifest validator (`isBundleManifestV1`) checks `schemaVersion === 1`. Future schema versions would add a new `isBundleManifestV2` validator and a migration path, leaving V1 parsing unchanged.

---

## Source files

| File                                         | Role                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/extension/bundle-manifest.ts`           | `BundleManifestV1` type, `BundleFileEntry`, `BundleWorkspaceLayout`, `isBundleManifestV1()`                    |
| `src/extension/bundle-materialize.ts`        | `materializeBundledAsset()`, `materializeBundledRom()`, `BUNDLED_MON1B_V1_REL`, `BUNDLED_MON3_V1_REL`          |
| `src/extension/project-kits.ts`              | `ProjectKit` type with `bundledProfile`; kit registry for all platforms                                        |
| `src/extension/project-scaffolding.ts`       | `createDefaultProjectConfig()` writes `bundledAssets` into profile from kit metadata                           |
| `src/extension/commands.ts`                  | Registers `debug80.materializeBundledRom` command (thin shell; logic delegated to `bundle-asset-installer.ts`) |
| `src/extension/bundle-asset-installer.ts`    | `buildBundledAssetFallbackPlans()` and bundled asset install plan logic for the explicit install command       |
| `resources/bundles/tec1/mon1b/v1/`           | Shipped MON-1B bundle: `bundle.json`, `mon-1b.bin`, `mon-1b.asm`                                               |
| `resources/bundles/tec1g/mon3/v1/`           | Shipped MON3 bundle: `bundle.json`, `mon3.bin`, `mon3.d8.json`, MON3 `.z80` source modules                     |
| `tests/extension/bundle-materialize.test.ts` | Unit tests for `materializeBundledRom()` and checksum mismatch handling                                        |

---

[← Appendix C](c-session-state.md) | [Appendices](index.md)
