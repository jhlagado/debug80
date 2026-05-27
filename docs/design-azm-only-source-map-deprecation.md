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
- `src/debug/mapping/path-resolver.ts` creates `.debug80/cache/*.d8.json` paths.
- `src/debug/mapping/mapping-service.ts` can parse `.lst` listings, apply Layer 2
  source matching, and write generated D8 maps.
- `src/mapping/parser.ts`, `src/mapping/layer2.ts`, and related tests exist to
  reconstruct source maps from assembler listings.
- Extra ROM mapping still uses `extraListings` and bundled `.lst` files for
  monitor ROM source navigation.
- The Z80 listing grammar and `.lst` language support still exist for viewing
  listing files, which is separate from using listings as debugger metadata.

Recent work already moved runtime symbol loading toward the desired model:
Variables now prefer the build-side `.d8.json` before any Debug80 cache, and
empty Constants are hidden.

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

The `.debug80/cache/*.d8.json` map cache exists because Debug80 used to build
source maps from listings. It should be phased out for active project targets.

Recommended migration:

1. Stop using cache maps for active target source mapping when a build-side map
   exists.
2. Change source-map status and diagnostics to ask the user to build when the
   build-side `.d8.json` is missing.
3. Stop generating cache maps for normal project source.
4. Remove `resolveCacheDir`, `buildListingCacheKey`, and cache-specific tests
   once no runtime path depends on them.

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

- `resolveCacheDir` and `buildListingCacheKey` in
  `src/debug/mapping/path-resolver.ts`
- cache path behavior in `resolveDebugMapPath` and `resolveExtraDebugMapPath`
- Debug80-generated D8 writing in `src/debug/mapping/mapping-service.ts`
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
- Replace cache generation with "build target" guidance.
- Keep listing parser only for ROM compatibility.
- Update docs and troubleshooting.

### Phase 3: Replace ROM Listings with ROM D8 Maps

- Add bundled ROM D8 maps.
- Add config support for platform/ROM source maps.
- Deprecate `extraListings`.
- Verify MON-3 and TEC-1 ROM stepping.

### Phase 4: Remove Legacy Listing Machinery

- Remove project source map cache.
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
