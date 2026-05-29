# Platform ROM Bundles And Source Maps

This document records the current bundled-ROM model. The extension is the
default vendor of ROM, native D8 source-map, and read-only source assets.
Project workspaces reference those assets by profile and only materialize local
copies when the user explicitly asks for them.

## Current Status

The single-profile bundled ROM flow is implemented for TEC-1 MON-1B and TEC-1G
MON3.

- Bundled assets live under `resources/bundles/<platform>/<profile>/<version>/`
  with a `bundle.json` manifest and checksum metadata.
- Scaffolded projects record stable workspace-relative ROM/source paths in
  `debug80.json`, plus `profiles.<name>.bundledAssets` references that map
  those paths to the extension bundle.
- Native D8 source maps are the debugger metadata. Listings are not a supported
  mapping input.
- Launch smart-resolves configured ROM and source-map paths: if the workspace
  file exists, it wins; if it is absent and a bundled asset reference exists,
  Debug80 uses the extension copy.
- `roms/` is ignored by default because it is for explicit local copies or user
  overrides, not required project source.
- **Debug80: Open Auxiliary Source** opens platform source files available to
  the active session.
- **Debug80: Copy Bundled Assets into Workspace** materializes bundled assets
  only when the user asks for local inspection or replacement files.

## Workspace Layout Policy

New scaffolded projects should be small:

```text
<project>/
  debug80.json                 # committed project contract
  src/
    main.asm                   # committed user source
  .gitignore                   # ignores build output and local materialized ROM copies
  build/                       # generated, ignored
  roms/                        # optional explicit materialization/override, ignored by default
```

`roms/` is reserved for local copies created by **Debug80: Copy Bundled Assets
into Workspace** or for deliberate user overrides. If a user is authoring a
monitor ROM, that should be a separate advanced project profile and the user can
remove the ignore rule intentionally.

## Bundle Manifest

Bundle manifests use `BundleManifestV1`:

```ts
interface BundleManifestV1 {
  schemaVersion: 1;
  id: string;
  version: string;
  platform: 'simple' | 'tec1' | 'tec1g';
  label: string;
  files: BundleFileEntry[];
  workspaceLayout: { destination: string };
}

type BundleFileRole = 'rom' | 'debug_map' | 'source' | 'source_tree';
```

The TEC-1G MON3 bundle currently ships:

- `mon3.bin` as the ROM image.
- `mon3.d8.json` as the native Debug80 source map.
- MON3 `.z80` source files.

The TEC-1 MON-1B bundle currently ships:

- `mon-1b.bin` as the ROM image.
- `mon-1b.asm` as source.

## Design Principles

| Principle                | Implication                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Extension = distribution | Versioned payloads plus manifest checksums.                                                     |
| Project = source         | `debug80.json` and user source files are committed; stock ROM assets are not copied by default. |
| D8 = debugger metadata   | Source mapping, breakpoints and symbols come from D8.                                           |
| Config is the contract   | Override by editing JSON or by materializing/replacing files under configured paths.            |
| No mandatory wizard      | The wizard accelerates layout; hand-authored `debug80.json` should behave the same.             |

## Future Work

- Add more bundled ROM profiles when their ROM image, native D8 map and source
  snapshot are available.
- Generalize TEC-1G multi-ROM configuration if future hardware profiles need
  multiple independently mapped ROM images.
- Add bundle size checks if packaged payloads grow enough to affect VSIX size.
