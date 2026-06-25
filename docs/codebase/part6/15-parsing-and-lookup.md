---
layout: default
title: 'Chapter 15 — Parsing and Lookup'
parent: 'Part VI — Source Mapping'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 2
---

[← Mapping Data Structures](14-mapping-data-structures.md) | [Part VI](index.md)

# Chapter 15 — Parsing and Lookup

This chapter follows the current source-mapping path from AZM native D8 JSON to breakpoint binding, editor navigation, Watch expressions, Variables and stack-frame lookup.

Debug80 no longer reconstructs source maps from `.lst` files. AZM is the supported assembler and emits the `.d8.json` source map that Debug80 consumes.

---

## Loading a D8 Map

`SourceManager` in `src/debug/mapping/source-manager.ts` wraps the mapping service for launch and warm rebuild. The active target supplies:

- the selected source file, usually `asmPath` / `sourceFile`
- the HEX artifact path
- source roots used to resolve file keys from the D8 map
- map arguments such as `artifactBase` and `outputDir`

`buildMappingFromDebugMap()` in `src/debug/mapping/mapping-service.ts` resolves the expected map path, normally:

```text
<outputDir>/<artifactBase>.d8.json
```

It then parses and validates the file with `parseD8DebugMap()` and `validateD8Segments()`. Invalid, missing or non-native maps do not trigger a listing or cache fallback. Debug80 logs a source-map diagnostic that names the relative target map when possible, tells the user to build the selected target with AZM, and returns an empty mapping.

`validateD8Segments()` performs quality checks and logs warnings as `D8 quality warning` messages. Warnings do not abort mapping.

The same loader also accepts explicit auxiliary platform ROM maps through `auxiliaryDebugMaps`. For those auxiliary maps, `resolveAuxiliaryDebugMapFiles()` first asks the mapping service to resolve each project-relative file key through the workspace root, then falls back to the map file's own directory. This matters for generated TEC-1G monitor maps whose `.d8.json` lives under `build/` while the source file key still points at `roms/...` under the project root.

---

## D8 Conversion

`buildMappingFromD8DebugMap()` converts D8 file entries into the runtime shape used by the debugger:

- D8 `files[*].segments` become `SourceMapSegment` records.
- D8 `files[*].symbols` become `SourceMapAnchor` records when they include source lines.
- D8 confidence strings map to runtime confidence values: `high` → `HIGH`, `medium` → `MEDIUM`, `low` → `LOW`.

The D8 fields `lstLine`, `lstText` and `lstTextId` remain part of the D8 v1 schema. In the current architecture they are assembler-provided source context inside the native map, not evidence that Debug80 reads a project-local listing file.

---

## Include Attribution Repair

`src/mapping/include-remap.ts` contains the only remaining source-attribution repair pass. Some included monitor sources can be attributed to the parent file while retaining the included file's line numbers. Debug80 handles this by:

1. Checking whether the reported parent file actually defines the symbol at the reported line.
2. Searching sibling `.z80` / `.asm` files for exactly one matching label at that line.
3. Repointing the anchor to that sibling file.
4. Propagating that include file across following segments until the next genuine parent-file symbol.

This is a D8 cleanup pass, not the old listing-text matcher. The previous listing parser modules have been removed.

---

## Building the Index

`buildSourceMapIndex()` builds three lookup structures:

1. `segmentsByAddress`, sorted by `start`, then D8 source-context line.
2. `segmentsByFileLine`, grouped by normalized resolved file path and source line.
3. `anchorsByFile`, grouped by normalized resolved file path and sorted by source line/address.

Only resolvable files enter the file-line and anchor indexes. A segment can remain valid for address lookup even when its source path cannot be resolved.

---

## Address-to-Source Lookup

`findSegmentForAddress()` scans `segmentsByAddress` until it reaches a segment whose `start` is greater than the requested address.

A segment matches when:

```text
segment.start <= address < segment.end
```

When several segments overlap, the lookup prefers:

1. a segment with a valid source line over one without a valid line
2. the narrowest address span

This prevents broad context segments from shadowing instruction-level mappings. If the best segment has no valid source line, the warning handler can log a diagnostic.

---

## Source-to-Address Lookup

`resolveLocation()` and `resolveExecutableLocation()` both call the same internal lookup:

```typescript
const lineSlop = [0, -1, 1, -2, 2, -3, 3, -4, 4];
```

The lookup tries the exact line first, then nearby lines. This handles blank lines, labels and comments around an executable source line.

`resolveLocation()` may fall back to the nearest anchor at or before the requested line. `resolveExecutableLocation()` returns only segments with `end > start` and never falls back to anchors. Breakpoint binding uses the executable path so labels, constants and directive-only lines do not become active breakpoints.

---

## Stack Frames and Breakpoints

Breakpoint handling calls source-to-address lookup during `setBreakpoints`. Addresses returned by `resolveExecutableLocation()` are registered with the breakpoint manager. If the VS Code breakpoint has a condition, the condition string is stored against the resolved address and evaluated later by the runtime loop. If no executable address is found, VS Code receives an unverified breakpoint.

Stack-frame resolution calls `findSegmentForAddress()` for the program counter. If a mapped file and line are available, VS Code can open and highlight that location. Debug80 also reads up to eight words from the current `SP` and treats mapped words as best-effort return-address frames. If mapping is missing, the stack display falls back to the raw address or marks stack words as likely data.

Editor features also consume the same source map. F12 / Go to Definition, hover details, workspace symbol search, the Variables panel, Watch expressions and conditional breakpoint expressions all use symbols from the active D8 map. User-facing messages should say "source map" or "build the target" rather than exposing internal D8 details.

---

## SourceManager Orchestration

The current `SourceManager.buildState()` flow is:

1. Resolve the main source file from `asmPath`, `sourceFile`, or the HEX artifact fallback.
2. Resolve configured `sourceRoots`.
3. Call `buildMappingFromDebugMap()` with the HEX path, optional ASM path, optional source file, map arguments and service helpers.
4. Build a `SourceMapIndex` from the D8-derived mapping.
5. Return source file, source roots, mapping, index and missing-source warnings.

There are no additional listing inputs, listing-content inputs, or listing-derived fallback paths in the current active source-state flow.

---

## Summary

- AZM native D8 maps are the source of truth for Debug80 source mapping.
- Debug80 no longer parses `.lst` files or ASM80-style symbol tables for active mapping.
- `SourceMapSegment` and `SourceMapAnchor` are runtime data structures built from D8 files.
- The remaining include-remap pass repairs known D8 path attribution problems for included monitor sources.
- Address lookup prefers valid source lines and narrow spans.
- Breakpoint lookup uses executable-only source-to-address resolution.

---

[← Mapping Data Structures](14-mapping-data-structures.md) | [Part VI](index.md)
