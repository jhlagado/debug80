# AZM-Only Source Map Deprecation Plan

## Purpose

Debug80 originally supported an ASM80/listing-driven workflow. That made sense
while ASM80 was the production assembler and Debug80 had to reconstruct source
mapping from `.lst` files. AZM is now the supported assembler and emits native
Debug80 `.d8.json` source maps. The legacy listing-derived path should therefore
be deprecated and removed in phases.

The goal is to simplify Debug80 around one clear contract:

- AZM is the only bundled assembler.
- A successful build produces HEX/BIN artifacts and a native `.d8.json` map.
- Debugger source mapping, editor navigation, variables, call stack display,
  and breakpoints read the active target's build-side `.d8.json`.
- Debug80 does not regenerate source maps from listings for normal project code.

## Current Legacy Surface

The legacy behavior is not isolated to one switch. The main areas are:

- Launch schema still documents `assembler: "asm80"` as a legacy alias.
- Project/config validation accepts both `azm` and `asm80`.
- Technical docs still describe listing-derived map generation.
- `src/debug/mapping/path-resolver.ts` now resolves D8 maps beside build/listing
  artifacts, but listing compatibility still remains in the launch path.
- `src/debug/mapping/mapping-service.ts` can parse `.lst` listings and apply
  Layer 2 source matching.
- `src/mapping/parser.ts`, `src/mapping/layer2.ts`, and related tests exist to
  reconstruct source maps from assembler listings.
- Extra ROM mapping still uses `extraListings` and bundled `.lst` files for
  monitor ROM source navigation.
- The Z80 listing grammar and `.lst` language support still exist for viewing
  listing files, which is separate from using listings as debugger metadata.

Recent work moved runtime symbol loading and map paths toward the desired model:
Variables prefer the build-side `.d8.json`, empty Constants are hidden, and the
project-local `.debug80/cache` map path has been removed.

## What Should Stay

Some listing-adjacent features are still useful and should not be removed just
because ASM80 is deprecated:

- `.lst` file syntax highlighting can remain as a viewer convenience.
- D8 format fields such as `lstLine` and `lstText` can remain because AZM may
  include listing context in native maps.
- Tests for D8 parsing/validation should remain.
- ROM/source browsing commands can remain, but they should migrate from
  `extraListings` toward native ROM `.d8.json` maps.

## What Should Be Deprecated

### 1. `assembler: "asm80"` Alias

Deprecate the config alias first. Debug80 should accept it temporarily with a
warning, then remove it from new schemas and generated projects.

Recommended migration:

1. Remove `asm80` from user-facing docs and marketplace text.
2. Keep accepting existing `asm80` configs for one transition period.
3. Emit a Debug Console warning:

   `Debug80: assembler "asm80" is deprecated; use "azm" or omit the assembler field.`

4. Remove the alias after the deprecation window.

### 2. Listing-Derived Source Map Cache

The old `.debug80/cache/*.d8.json` map cache existed because Debug80 used to
build source maps from listings. That project-local cache path has now been
removed: active target maps resolve to the build-side `<artifactBase>.d8.json`
path, and new scaffolded projects no longer add `.debug80/` to `.gitignore`.

Completed migration steps:

1. Stop using `.debug80/cache` maps for active target source mapping.
2. Remove `resolveCacheDir` and `buildListingCacheKey`.
3. Resolve primary and extra map paths beside their build/listing artifacts.
4. Stop writing Debug80-generated active-target maps to a project cache.

This should make the build directory the single visible place for generated
debug artifacts.

### 3. Listing Parser as Source-Map Producer

`parseMapping`, Layer 2 matching, and `buildMappingFromListing` currently
reconstruct source mappings from `.lst` content. That should no longer be part
of the normal launch path.

Recommended migration:

1. Introduce a native-map-first launch source path with a clear failure mode:
   if `<artifactBase>.d8.json` is missing or invalid, report "Build the selected
   target" instead of regenerating from `.lst`.
2. Keep listing parsing temporarily only for explicit ROM/listing compatibility.
3. Remove Layer 2 and ASM80 include-anchor correction from the active project
   path.
4. Delete listing-derived mapping tests after replacement tests cover native D8
   behavior.

### 4. ROM `extraListings`

Monitor ROM source stepping currently depends on listings in places. This is the
most sensitive area because Debug80 still needs good MON-3/TEC-1 utility
debugging.

Recommended migration:

1. Ask AZM or the ROM build process to produce `.d8.json` maps for bundled ROMs.
2. Add `extraMaps` or equivalent platform config that points at ROM D8 maps.
3. Keep `extraListings` as deprecated compatibility until bundled profiles have
   D8 maps.
4. Remove listing-derived ROM mapping only after MON-3 stepping and symbol
   lookup work from native ROM maps.

This keeps the important monitor utility debugging while removing the old
listing parser dependency.

## Proposed Target Architecture

The launch path should become:

1. Resolve project and target.
2. Run AZM through the direct library backend unless `assemble: false`.
3. Resolve build artifacts:
   - HEX/BIN for runtime memory.
   - D8 map for all source mapping.
4. Load the D8 map directly.
5. Build runtime indexes from D8:
   - address to source
   - file/line to address
   - symbols/constants/data
   - stack display labels
6. Load optional ROM/platform D8 maps and merge them into the same lookup layer.
7. If any required D8 map is missing, show a clear build/configuration error.

This removes the need for a "source map generation" subsystem inside Debug80.
AZM becomes responsible for source-map correctness, while Debug80 becomes a
consumer and validator of D8 maps.

## Candidate Code Simplifications

Likely removable or shrinkable after migration:

- remaining listing-to-D8 compatibility branches in `buildMappingFromListing`
- listing-to-D8 generation branches in `buildMappingFromListing`
- Layer 2 matching from the active project launch path
- ASM80 include remap helpers from the active project launch path
- tests that only validate listing-derived source-map generation
- schema/docs that present `listing` as an ordinary launch input
- schema/docs that present `asm80` as an accepted assembler choice

Some of these modules may remain temporarily for ROM compatibility until ROM D8
maps replace `extraListings`.

## Risks

- Existing user projects that set `assembler: "asm80"` need a migration warning.
- Existing projects that launch with prebuilt `hex` + `listing` but no `asm`
  will need a native `.d8.json` map or a documented unsupported path.
- Monitor ROM stepping must not regress. Bundled ROM profiles need D8 maps before
  `extraListings` is removed.
- Tests currently cover listing behavior heavily. Removing it should be paired
  with stronger native D8 tests so coverage does not simply disappear.

## Recommended Phasing

### Phase 1: Deprecate and Prefer Native Maps

- Keep behavior compatible.
- Warn on `assembler: "asm80"`.
- Make all active-target features prefer build-side D8 maps.
- Hide or remove user-facing references to listing-derived maps.
- Add tests proving native D8 maps provide breakpoints, F12, hover, Variables,
  and call stack data.

### Phase 2: Stop Generating Project Source Maps from Listings

- Require build-side D8 for active project targets.
- Replace in-memory listing fallback with "build target" guidance.
- Keep listing parser only for ROM compatibility.
- Update docs and troubleshooting.

### Phase 3: Replace ROM Listings with ROM D8 Maps

- Add bundled ROM D8 maps.
- Add config support for platform/ROM source maps.
- Deprecate `extraListings`.
- Verify MON-3 and TEC-1 ROM stepping.

### Phase 4: Remove Legacy Listing Machinery

- Remove any remaining listing-derived active-target map generation.
- Remove active-path listing parser and Layer 2 matching.
- Remove ASM80 alias.
- Remove stale schema/docs/tests.

## Immediate Next Steps

The safest next code change is small:

1. Add a deprecation warning for `assembler: "asm80"`.
2. Remove `asm80` from user-facing docs and new examples.
3. Change source-map status wording so missing build-side D8 maps ask the user
   to build, not rely on generated caches.
4. Add an issue/design note for ROM D8 maps before removing `extraListings`.

That gives Debug80 a clear AZM-only direction without risking MON-3 or existing
debug sessions in one large change.
