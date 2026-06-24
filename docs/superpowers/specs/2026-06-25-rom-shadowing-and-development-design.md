# ROM Shadowing And ROM Development Design

## Purpose

Debug80 needs a clearer model for project ROMs. The current project model works
well when an application is the main thing being developed and a monitor ROM is
only platform support. That is not enough for projects such as TECM8, where the
ROMs are the main software product and the RAM application is only a small
demo, test harness, or transitional entry point.

This document defines the scenarios Debug80 must support, the distinction
between ROM shadowing and ROM development, and the role of the `roms/`
directory. The main design rule is:

> Folder names must not trigger build behavior. Build behavior must be explicit
> in project configuration.

`roms/` is a recommended project convention for firmware assets and firmware
source, not a magic folder.

## Current Behavior

Debug80 currently has three overlapping ROM mechanisms.

1. Bundled ROM profiles.
   - Scaffolded TEC-1G projects reference the bundled MON-3 profile.
   - Launch resolves the bundled binary and debug map when no project-local copy
     exists.
   - Source-level ROM debugging can work because Debug80 ships source/debug-map
     information for the bundled ROM profile.

2. Project-local ROM binary override.
   - A target can set `tec1g.romHex` or `tec1.romHex`.
   - Debug80 loads that binary or Intel HEX file as platform firmware.
   - Debug80 does not infer or build source from that path.

3. Conventional local monitor source builder.
   - `src/debug/monitor-rom-conventions.ts` and
     `src/debug/launch/local-monitor-rom-build.ts` discover specific local
     monitor source entry files such as
     `roms/tec1g/mon3/mon3.rom.asm`.
   - If the convention entry exists, Debug80 builds it before launch, rewrites
     the launch args to use the built ROM, and adds the generated debug map.
   - This is useful, but it is convention-specific. It does not describe
     arbitrary ROM artifacts, expansion ROMs, multiple banks, or ROM-first
     software systems.

The current behavior also risks confusing `roms/` as a special trigger. It is
not currently a general trigger, and it should not become one.

## Terms

### Bundled ROM

A ROM image shipped with the extension. Example: Debug80's bundled TEC-1G MON-3
profile. It can include binary, source, and debug map metadata. The user does
not own or edit it in the project workspace.

### Shadowed ROM

A project-local ROM asset that replaces a bundled ROM slot for one project.
Shadowing can be binary-only or source-backed.

Shadowing means "use this project-local ROM instead of the default bundled ROM."
It does not necessarily mean active ROM development.

### ROM Development

A project explicitly compiles ROM source as part of its launch or rebuild flow.
The generated ROM artifact is loaded into the platform, and its generated debug
map is merged for source-level debugging.

TECM8 is a ROM-development project. Tetro might normally be an app-development
project but can still opt into ROM development for one custom monitor source.

ROM development describes building ROM artifacts. ROM-first describes which
artifact is the project's primary output. A source-backed shadow in an app
project is ROM development, but it is not necessarily ROM-first.

### ROM Artifact

One buildable or loadable firmware unit. Examples:

- TEC-1G fixed monitor ROM at `0xC000-0xFFFF`
- TEC-1G expansion ROM image backing the `0x8000-0xBFFF` banked window
- Future multi-bank expansion image

A ROM artifact can be source-backed or binary-only. Source-backed artifacts are
built by Debug80. Binary-only artifacts are loaded as supplied and may optionally
reference an explicit debug map.

### Application Artifact

A RAM-loaded program assembled from the target `sourceFile`, such as an app,
demo, proof, game, or diagnostic harness.

## TEC-1G Memory Invariants

These invariants must be explicit because TEC-1G ROM layout is not a simple
"one file maps to one contiguous address range" model.

1. The `monitor` role owns the fixed monitor ROM image at `0xC000-0xFFFF`.
2. The TEC-1G startup shadow at `0x0000` is derived from the lower 2K of the
   active monitor image.
3. Projects should not declare a separate startup-shadow artifact in this
   design. If a future hardware model supports a genuinely independent startup
   image, that should be a new role with explicit semantics.
4. The `expansion` role owns the ROM image backing the visible
   `0x8000-0xBFFF` window.
5. A 32K expansion ROM is not a contiguous `0x8000-0xFFFF` load. It is a
   backing image exposed through a 16K window, normally as two 16K banks.
6. Expansion artifact configuration must distinguish the visible window from
   the backing image size.

## TEC-1G Expansion Banking Contract

Bank switching must be part of the artifact contract, not an emulator detail
left to inference.

For the first TEC-1G ROM artifact implementation:

1. The visible expansion window is `0x8000-0xBFFF`.
2. The initial visible expansion bank is bank `0` unless explicitly configured.
3. Phase 2 supports only `bankSize === windowSize === 0x4000`.
4. The bank-select mechanism must be declared by the profile or artifact. A
   shape such as the following is sufficient:

   ```json
   {
     "bankSelect": {
       "kind": "tec1g-standard",
       "initialBank": 0
     }
   }
   ```

5. Debug80 must track active bank changes in the emulator before bank-aware
   breakpoints can be considered correct.
6. Expansion debug maps must be keyed by both artifact and bank, not only by
   address range. All banks occupy the same visible address range, so an address
   such as `0x8123` is ambiguous without the active bank.

This can still be implemented incrementally. The first useful version can load
the backing image and expose bank 0, but the configuration and debug-map model
must not pretend the backing image is a single contiguous address range.

## Scenarios To Support

### Scenario 1: Ordinary App Project With Bundled ROM

Example: a simple TEC-1G app or game project using MON-3.

Configuration shape:

```json
{
  "platform": "tec1g",
  "profile": "mon3",
  "sourceFile": "src/main.asm"
}
```

Behavior:

- Debug80 builds `src/main.asm`.
- Debug80 loads the bundled MON-3 ROM from the selected profile.
- Debug80 merges bundled MON-3 source/debug-map information.
- No project ROM source is compiled.
- The user can debug app source and bundled ROM source.

This is the compatibility baseline. It must not regress.

Some scaffolded or older projects may contain a `tec1g.romHex` value pointing at
a known bundled-materialization path such as `roms/tec1g/mon3/mon3.bin`. That
path should be treated as a project-local shadow only when the file actually
exists in the workspace. Otherwise, the bundled profile remains authoritative.

### Scenario 2: Ordinary App Project With Project Binary ROM Shadow

Example: Tetro uses a different monitor binary but does not develop that ROM.

Configuration shape:

```json
{
  "platform": "tec1g",
  "sourceFile": "src/main.asm",
  "tec1g": {
    "romHex": "roms/tec1g/tetro-monitor/monitor.bin"
  }
}
```

Behavior:

- Debug80 builds `src/main.asm`.
- Debug80 loads `roms/tec1g/tetro-monitor/monitor.bin`.
- Debug80 does not look for source next to the binary.
- Debug80 does not compile any ROM source.
- Source-level debugging for the custom ROM is available only if the user also
  supplies an explicit debug map or a future `romArtifacts` entry.

This supports users who only want to experiment with ROM binaries.

### Scenario 3: Ordinary App Project With Source-Backed ROM Shadow

Example: Tetro still has an app as the main target, but the user drops in a
custom monitor source and wants source-level ROM debugging.

Configuration shape:

```json
{
  "platform": "tec1g",
  "sourceFile": "src/main.asm",
  "tec1g": {
    "romHex": "build/roms/tetro-monitor/monitor.bin",
    "romArtifacts": [
      {
        "id": "monitor",
        "role": "monitor",
        "sourceFile": "roms/tetro-monitor/monitor.asm",
        "outputBin": "build/roms/tetro-monitor/monitor.bin",
        "outputDebugMap": "build/roms/tetro-monitor/monitor.d8.json",
        "address": 49152,
        "size": 16384
      }
    ]
  }
}
```

Behavior:

- Debug80 builds the monitor source first.
- Debug80 sets or validates that `tec1g.romHex` points at the generated binary.
- Debug80 builds the app target.
- Debug80 loads both artifacts.
- Debug80 merges both source maps.
- Breakpoints can bind in both the app source and the custom monitor source.

This is shadowing plus source-level debugging. It does not turn the project into
a ROM-first project. The app remains the main target.

### Scenario 4: ROM-First Project With Small App Stub

Example: TECM8 while MON-3 is still the active fixed monitor, but TECM8 owns an
expansion ROM and a future monitor replacement source.

Configuration shape:

```json
{
  "platform": "tec1g",
  "profile": "tecm8",
  "sourceFile": "src/demo.asm",
  "tec1g": {
    "expansionRomHex": "build/roms/tec1g/tecm8/expansion/expansion.bin",
    "romArtifacts": [
      {
        "id": "tecm8-expansion",
        "role": "expansion",
        "sourceFile": "roms/tec1g/tecm8/expansion/expansion.asm",
        "outputBin": "build/roms/tec1g/tecm8/expansion/expansion.bin",
        "outputDebugMap": "build/roms/tec1g/tecm8/expansion/expansion.d8.json",
        "windowAddress": 32768,
        "windowSize": 16384,
        "imageSize": 32768,
        "bankSize": 16384,
        "bankCount": 2
      },
      {
        "id": "tecm8-monitor",
        "role": "monitor",
        "sourceFile": "roms/tec1g/tecm8/monitor/monitor.asm",
        "outputBin": "build/roms/tec1g/tecm8/monitor/monitor.bin",
        "outputDebugMap": "build/roms/tec1g/tecm8/monitor/monitor.d8.json",
        "address": 49152,
        "size": 16384,
        "active": false
      }
    ]
  }
}
```

Behavior:

- Debug80 builds active ROM artifacts before launch.
- The expansion ROM is loaded through `expansionRomHex`.
- The monitor replacement source may be buildable but inactive until explicitly
  switched on.
- The `tecm8` profile inherits or declares bundled MON-3 as its active monitor
  role while TECM8 still depends on MON-3 services.
- The app stub is optional and secondary.

This supports TECM8's transitional state.

A non-empty `tec1g.romHex` is a project-local load path and must exist, except
for the documented legacy bundled-materialization compatibility case. New
profiles that intentionally use a bundled monitor while adding project-owned
expansion ROMs should represent that through profile metadata rather than by
pretending a bundled ROM is a project-local file.

### Scenario 5: ROM-First Project Replacing MON-3

Example: TECM8 after the monitor replacement can boot.

Configuration shape:

```json
{
  "platform": "tec1g",
  "profile": "tecm8",
  "tec1g": {
    "romHex": "build/roms/tec1g/tecm8/monitor/monitor.bin",
    "expansionRomHex": "build/roms/tec1g/tecm8/expansion/expansion.bin",
    "romArtifacts": [
      {
        "id": "tecm8-monitor",
        "role": "monitor",
        "sourceFile": "roms/tec1g/tecm8/monitor/monitor.asm",
        "outputBin": "build/roms/tec1g/tecm8/monitor/monitor.bin",
        "outputDebugMap": "build/roms/tec1g/tecm8/monitor/monitor.d8.json",
        "address": 49152,
        "size": 16384
      },
      {
        "id": "tecm8-expansion",
        "role": "expansion",
        "sourceFile": "roms/tec1g/tecm8/expansion/expansion.asm",
        "outputBin": "build/roms/tec1g/tecm8/expansion/expansion.bin",
        "outputDebugMap": "build/roms/tec1g/tecm8/expansion/expansion.d8.json",
        "windowAddress": 32768,
        "windowSize": 16384,
        "imageSize": 32768,
        "bankSize": 16384,
        "bankCount": 2
      }
    ]
  }
}
```

Behavior:

- Debug80 builds monitor and expansion ROM source.
- Debug80 loads the project monitor instead of bundled MON-3.
- Debug80 loads the project expansion ROM.
- Debug80 merges monitor and expansion debug maps.
- A RAM app target is optional.

This is the eventual TECM8 target model.

### Scenario 6: Promote Stable Project ROM To Bundled Profile

Example: TECM8 reaches a stable ROM milestone and should become a Debug80
profile or bundled platform asset rather than remaining only a project-local
shadow.

Behavior:

- The project-owned source remains the development source of truth until an
  explicit promotion step occurs.
- Promotion copies or packages the binary, source, generated debug map, profile
  metadata, and any required license or provenance notes into the platform asset
  area.
- Existing projects that still shadow the ROM locally continue to use their
  local ROMs.
- New projects selecting the promoted profile use the bundled profile assets.
- The same role semantics continue to apply: promoted monitor ROMs own the
  fixed monitor slot, and promoted expansion ROMs own the expansion window and
  backing image geometry.
- Promotion must preserve role, fixed address or window geometry, bank geometry,
  initial bank behavior, and debug-map bank metadata so project-local and
  bundled profiles produce equivalent launch/debug behavior.

This is not required for the first TECM8 development workflow, but the design
must leave room for it. A project ROM can start as a shadow, become the main
development target, and later become a bundled profile without changing the
meaning of the project-local workflow.

## The `roms/` Directory Question

The `roms/` directory is useful, but it should not be required.

Recommended convention:

```text
roms/<platform>/<profile>/<artifact>/
```

Examples:

```text
roms/tec1g/mon3/
roms/tec1g/tecm8/monitor/
roms/tec1g/tecm8/expansion/
roms/tetro-monitor/
```

Why this convention is useful:

- It visually separates firmware from RAM application source.
- It matches Debug80's existing bundled asset materialization paths.
- It makes it clear that these files shadow or replace platform firmware slots.
- It avoids burying firmware under `src/` where it looks like ordinary
  application code.
- It works for both binary-only shadows and source-backed ROM development.
- It groups mixed firmware assets together. ROM development often includes
  source, binaries, generated maps, hardware-ready images, and notes about the
  platform slot. A firmware namespace is a better default for that mixture than
  treating every file as ordinary app source.

Why this convention must not be mandatory:

- A user may prefer `src/roms/monitor.asm`.
- A user may prefer `firmware/monitor.asm`.
- Some projects may already have their own source layout.
- Build behavior should not depend on folder names.
- ROM source is still source code. Choosing `roms/` as the default convention
  is not a claim that ROM source is less important or less editable than code in
  `src/`.

Therefore:

- `roms/` is the default scaffold and documentation convention.
- `roms/` is not a trigger.
- The actual trigger is explicit `romArtifacts` configuration.
- Any `sourceFile` path in `romArtifacts` is valid.

## Why `src/roms/` Is Not The Default

`src/roms/` is technically valid, but it is not the best default convention for
Debug80 scaffolding.

The `src/` folder currently communicates "target program source" in most
Debug80 projects. Putting firmware under `src/roms/` blurs the distinction
between:

- code assembled into the RAM-loaded app target
- code assembled into fixed monitor ROM
- code assembled into banked expansion ROM

For ordinary app projects, that distinction helps users avoid accidentally
treating firmware as app code. For ROM-first projects, `roms/` makes the
project's center of gravity obvious.

The sharper distinction is:

- `sourceFile` remains the default application or selected target entry point.
- `roms/` is the default firmware namespace for platform slots, binary shadows,
  ROM source, and bundled-materialized assets.
- `romArtifacts[*].sourceFile` can point anywhere, including `src/roms/`, when
  a project wants all authored source under `src/`.

However, Debug80 should not impose this. If a project explicitly declares:

```json
{
  "role": "monitor",
  "sourceFile": "src/roms/monitor.asm"
}
```

then Debug80 should build it as a monitor ROM artifact.

## Proposed Configuration Model

Add platform ROM artifact declarations. For TEC-1G, the field can initially live
under `tec1g`:

```json
{
  "tec1g": {
    "romHex": "build/roms/monitor.bin",
    "expansionRomHex": "build/roms/expansion.bin",
    "romArtifacts": [
      {
        "id": "monitor",
        "role": "monitor",
        "sourceFile": "roms/monitor/monitor.asm",
        "outputBin": "build/roms/monitor/monitor.bin",
        "outputDebugMap": "build/roms/monitor/monitor.d8.json",
        "address": 49152,
        "size": 16384
      },
      {
        "id": "expansion",
        "role": "expansion",
        "sourceFile": "roms/expansion/expansion.asm",
        "outputBin": "build/roms/expansion/expansion.bin",
        "outputDebugMap": "build/roms/expansion/expansion.d8.json",
        "windowAddress": 32768,
        "windowSize": 16384,
        "imageSize": 32768,
        "bankSize": 16384,
        "bankCount": 2
      },
      {
        "id": "custom-monitor-binary",
        "role": "monitor",
        "binary": "roms/custom-monitor/monitor.bin",
        "debugMap": "roms/custom-monitor/monitor.d8.json",
        "address": 49152,
        "size": 16384,
        "build": false,
        "active": false
      }
    ]
  }
}
```

Field meanings:

- `id`: stable artifact id for diagnostics.
- `role`: platform slot. Initial TEC-1G roles are `monitor` and `expansion`.
- `sourceFile`: source to compile for a source-backed artifact.
- `binary`: existing binary to load for a binary-only artifact.
- `outputBin`: binary output to load.
- `outputDebugMap`: generated source map to merge.
- `debugMap`: explicit source map for a binary-only artifact, if available.
- `address`: expected logical load address.
- `size`: maximum artifact size.
- `windowAddress`: visible window start for a banked artifact.
- `windowSize`: visible window size for a banked artifact.
- `imageSize`: maximum backing image size for a banked artifact.
- `bankSize`: bank granularity for a banked artifact.
- `bankCount`: expected number of banks for a banked artifact.
- `build`: optional boolean; defaults to true for source-backed artifacts and
  false for binary-only artifacts.
- `active`: optional boolean; defaults to true. Inactive artifacts may be
  buildable manually but are not used for launch.

An artifact must be either source-backed or binary-only:

- source-backed: `sourceFile`, `outputBin`, and optionally `outputDebugMap`
- binary-only: `binary`, and optionally `debugMap`

For source-backed monitor artifacts, `address` and `size` describe the fixed
monitor image. For TEC-1G expansion artifacts, `windowAddress`, `windowSize`,
`imageSize`, and optional bank fields describe the hardware window and backing
image. Debug80 should not treat a 32K expansion image as a 32K contiguous memory
range beginning at `0x8000`.

Active artifact outputs must match the platform load field for their role:

- `monitor` must feed `tec1g.romHex`
- `expansion` must feed `tec1g.expansionRomHex`

Debug80 may fill those load fields from active artifacts during normalization,
or it may require the user to write them explicitly. It must not silently load a
different binary from the one the active artifact produced. If an explicit load
field and an active artifact disagree, Debug80 should fail with a diagnostic
unless a deliberate override mechanism is added.

The first implementation can avoid a full generic model and implement TEC-1G
roles only. The schema should still be shaped so it can generalize later.

### Phase 2 MVP Contract

The first implementation should deliberately be smaller than the full artifact
model above.

Phase 2 should support:

- TEC-1G `romArtifacts` only.
- Active source-backed artifacts for `monitor` and `expansion`.
- Existing binary shadows through `tec1g.romHex` and `tec1g.expansionRomHex`.
- At most one active artifact per role.
- Inactive artifacts syntactically, with launch ignoring them completely.
- `sourceFile` and `outputBin` as required fields for source-backed artifacts.
- `outputDebugMap` as optional for loading, but required for the acceptance
  tests that claim source-level ROM debugging.

Phase 2 should defer:

- Active binary-only `romArtifacts`, unless role-scoped binary debug maps become
  necessary for the first implementation.
- Generic cross-platform ROM artifact schema.
- Bank-aware breakpoints beyond the active-bank tracking required to avoid
  incorrect source binding.

This MVP boundary keeps the first implementation useful for TECM8 without
forcing Debug80 to solve every possible ROM packaging workflow at once.

### Validation Rules

TEC-1G Phase 2 validation should be concrete:

- `monitor.address` must be `0xC000`.
- `monitor.size` must be `0x4000`.
- A built monitor binary must be less than or equal to `monitor.size`.
- `expansion.windowAddress` must be `0x8000`.
- `expansion.windowSize` must be `0x4000`.
- `expansion.imageSize` must be a positive multiple of `bankSize`.
- `expansion.bankCount`, when supplied, must equal `imageSize / bankSize`.
- Phase 2 should reject `bankSize !== windowSize`.
- Source-backed artifacts must not specify `binary`.
- Binary-only artifacts must not specify `sourceFile` or `outputBin`.
- Active artifacts for the same role are an error.
- Missing active `sourceFile`, missing active `binary`, or missing generated
  `outputBin` after build are launch-blocking diagnostics.

## Launch Pipeline

The launch flow should become:

1. Merge project config and target config.
2. Resolve platform/profile.
3. Resolve bundled asset references.
4. Build active ROM artifacts declared by the platform config.
5. Patch or validate platform ROM paths:
   - `monitor` artifact should feed `tec1g.romHex`
   - `expansion` artifact should feed `tec1g.expansionRomHex`
6. Build the app target if one is present and `assemble !== false`.
7. Load program artifacts:
   - monitor ROM
   - expansion ROM
   - RAM app, if present
8. Merge debug maps:
   - role-specific ROM artifact maps according to map precedence
   - bundled maps for unshadowed roles
   - app map
   - user-specified auxiliary maps
9. Start debug session.

`assemble === false` should skip only the application artifact. It should not
skip active ROM artifact builds. That separation matters for ROM-first projects
where there may be no RAM app, or where the RAM app is only a stub.

This rule applies to explicit `romArtifacts`. Existing projects without
`romArtifacts` retain current `assemble` behavior, including the legacy local
monitor convention, until that convention is deliberately migrated.

Skipping a ROM build should require an artifact-level decision such as
`build: false` or a binary-only artifact. Missing required binaries should
produce clear errors that say which artifact is missing and which role could not
be loaded.

Precedence rules:

1. Active `romArtifacts` win for their declared role.
2. A legacy conventional local monitor source build runs only when no active
   explicit artifact owns the same role.
3. Explicit `romHex` and `expansionRomHex` values remain valid binary load
   fields, but an active artifact for the same role must either populate them or
   match them.
4. A bundled profile supplies binaries and maps for roles that are not shadowed
   by project-local load fields or active artifacts.
5. If two mechanisms claim the same role with different binaries, Debug80 should
   fail with a diagnostic rather than guessing.

## Source Maps And Debugging

ROM source-level debugging requires the generated debug maps to be merged
automatically.

For source-backed ROM artifacts:

- the build emits a D8 map
- Debug80 adds that D8 map to `debugMaps`
- Debug80 adds the artifact source folder to `sourceRoots` if needed
- bundled maps for the same role should be suppressed to avoid stale source
  binding

For binary-only shadows:

- no source map is generated
- Debug80 can still load the binary
- user-specified `debugMaps` can supply source-level mapping if available
- for Phase 2, role-scoped ROM maps must come from
  `romArtifacts[*].outputDebugMap` or `romArtifacts[*].debugMap`
- target-level `debugMaps` remain auxiliary maps and do not by themselves mark a
  bundled ROM role as shadowed

For bundled ROMs:

- bundled source maps continue to work as they do today

Map precedence must be role-aware:

1. A generated map from an active source-backed artifact wins for that artifact
   role.
2. An explicit user map for a binary-only artifact wins for that role or
   overlapping address range.
3. Bundled maps remain active for bundled roles that are not shadowed.
4. Binary-only shadows without maps suppress bundled maps for overlapping ranges
   or the same role, because binding a custom binary to stale bundled source is
   worse than having no source-level ROM mapping.
5. Application maps are independent of ROM role maps and should continue to bind
   RAM-loaded app source as they do today.
6. For banked expansion ROMs, map binding must include the active bank as well
   as the visible address.

This allows a mixed configuration such as bundled MON-3 plus project expansion
ROM: bundled MON-3 source still works, while the expansion ROM uses its project
map.

A missing `outputDebugMap` does not block ROM loading unless source-level ROM
debugging was explicitly requested. However, the acceptance criteria for
source-backed ROM debugging require generated maps and breakpoint binding in ROM
source.

## Compatibility Rules

1. Existing projects without `romArtifacts` must behave exactly as before.
2. Projects with only `platform`, `profile`, and `sourceFile` must continue to
   launch with bundled ROMs and bundled debug maps unchanged.
3. Existing `romHex` and `expansionRomHex` fields remain valid binary-load
   fields.
4. `roms/` must not trigger compilation.
5. Conventional local MON-3 source building should either remain supported or be
   migrated into an equivalent generated `romArtifacts` entry.
6. Explicit `romArtifacts` take precedence over the conventional local MON-3
   builder for the same role.
7. Project-local binary shadows must not require source.
8. Project-local source shadows must not require the project to be ROM-first.
9. ROM-first projects must not require a RAM app target.
10. Inactive artifacts are ignored by launch. Validation of their outputs should
   be optional and non-blocking unless a separate command explicitly asks to
   build or validate inactive artifacts.

## Migration Path

### Phase 1: Document And Preserve Existing Behavior

- Document the three modes:
  - bundled ROM
  - binary shadow
  - source-backed ROM artifact
- Keep `romHex` and `expansionRomHex` unchanged.
- Keep conventional local MON-3 builder unchanged.

### Phase 2: Add Explicit TEC-1G ROM Artifacts

- Add `tec1g.romArtifacts`.
- Validate roles, source paths, binary paths, output paths, fixed-ROM address
  and size, and banked-ROM window/image geometry.
- Build active artifacts before app assembly.
- Merge generated debug maps.
- Add focused tests for:
  - app project with no ROM artifacts
  - app project with monitor source artifact
  - ROM-first project with expansion source artifact
  - bundled MON-3 app project with no `tec1g` block: bundled binary and bundled
    map are used
  - project containing `roms/` source files but no `romArtifacts`: no ROM source
    build occurs
  - existing binary `tec1g.romHex`: binary loads, no source lookup occurs, and
    bundled monitor map is suppressed
  - missing explicit `tec1g.romHex`: launch fails with a path diagnostic
  - legacy local MON-3 convention still runs when no explicit monitor artifact
    exists
  - explicit monitor artifact disables the legacy local MON-3 convention for
    that role
  - ROM-first target with no `sourceFile`: ROM artifacts build and launch
    succeeds

### Phase 3: Convert Local Monitor Convention To Artifact Model

- Make "Copy Monitor ROM into Project" write an explicit artifact declaration
  or present a command to add one.
- Preserve the old convention as a compatibility fallback.

### Phase 4: TECM8 First-Class Profile

- Generate a TECM8-style profile that keeps MON-3 active initially and builds
  the expansion ROM.
- Later switch monitor role from bundled MON-3 to project TECM8 monitor when the
  monitor can boot.

### Phase 5: Promote Stable Project ROMs Into Bundled Profiles

- Add a deliberate promotion workflow for ROMs that graduate from project-local
  development into Debug80 platform assets.
- Preserve binary, source, generated debug map, platform/profile metadata, and
  provenance.
- Keep project-local shadows authoritative for projects that already declare
  them.
- Make new projects select the promoted bundled profile explicitly.
- Preserve role, fixed address or window geometry, bank geometry, initial bank
  behavior, and debug-map bank metadata.

## Open Decisions

### Should `outputBin` point into `build/` or `roms/`?

Recommended default: `build/`.

Reason:

- source belongs in `roms/`
- generated artifacts belong in `build/`
- Debug80 can load generated outputs directly
- git tracking stays clean

Exception:

- a project may intentionally track a built ROM binary under `roms/` for
  distribution or hardware burning
- this should be a project decision, not a Debug80 requirement

### Should monitor source live under `roms/` or `src/roms/`?

Recommended default: `roms/`.

Reason:

- it is firmware source, not app source
- it shadows or replaces platform ROM slots
- it aligns with bundled ROM materialization

But Debug80 should support either path because the config carries the artifact
role.

### Should `romArtifacts` live under `tec1g` or profile-level config?

Initial recommendation: under `tec1g`.

Reason:

- roles are platform-specific
- validation can be platform-specific
- launch already normalizes platform config

Future possibility:

- profile-level `artifacts` could support cross-platform builds later

## Recommended Design Position

Use `roms/` as the default project convention for firmware source and firmware
shadowing, but make explicit configuration the only behavior trigger.

In other words:

```text
roms/                         convention
romArtifacts/sourceFile        build trigger
romHex/expansionRomHex         load trigger
debugMaps                      source-map trigger for binary-only ROMs
```

This protects Tetro-style app projects, supports source-backed ROM debugging,
and gives TECM8 the ROM-first workflow it needs without making every project
ROM-first.
