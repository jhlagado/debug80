---
layout: default
title: 'Chapter 14 — Mapping Data Structures'
parent: 'Part VI — Source Mapping'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 1
---

[Part VI](index.md) | [Parsing and Lookup →](15-parsing-and-lookup.md)

# Chapter 14 — Mapping Data Structures

Source mapping is the bridge between the Z80 program counter and the file open in VS Code. When execution stops at an address, Debug80 asks the mapping index for a source location. When the user sets a breakpoint, Debug80 asks the same index which address belongs to that source line.

The core mapping types live in `src/mapping/types.ts`, `src/mapping/source-map.ts`, and `src/mapping/d8-map.ts`.

---

## Runtime Mapping Result

The D8 loader returns a `MappingParseResult`:

```typescript
interface MappingParseResult {
  segments: SourceMapSegment[];
  anchors: SourceMapAnchor[];
}
```

`MappingParseResult` is now an internal runtime shape, not evidence that Debug80 still parses `.lst` files. AZM emits the native D8 map, `buildMappingFromD8DebugMap()` converts that D8 map into `segments` and `anchors`, and `src/debug/mapping/source-manager.ts` builds the indexed runtime state from it.

---

## SourceMapSegment

`SourceMapSegment` is the address range that Debug80 can map back to source:

```typescript
interface SourceMapSegment {
  start: number; // Inclusive Z80 address
  end: number; // Exclusive Z80 address
  loc: {
    file: string | null; // Source file, if known
    line: number | null; // 1-based source line, if known
  };
  lst: {
    line: number; // Assembler source-context line
    text: string; // Assembler source-context text
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

`start` and `end` use JavaScript slice-style ranges: `start` is included, `end` is excluded. A normal three-byte instruction at `0x0800` has `start: 0x0800` and `end: 0x0803`.

Some D8 segments are zero-width where `start === end`. Those segments can still provide useful source context for stack display or symbol lookup, but `resolveExecutableLocation()` filters them out when binding breakpoints.

`loc.file` and `loc.line` may be `null`. That happens when a source path cannot be resolved or a D8 segment intentionally carries no source line.

### Confidence

| Value    | Meaning                                                                         |
| -------- | ------------------------------------------------------------------------------- |
| `HIGH`   | The segment is tied to native D8 data with high confidence.                     |
| `MEDIUM` | The segment is usable but less exact, for example duplicate-address conditions. |
| `LOW`    | The segment has weak or missing source attribution.                             |

The current address lookup prefers the narrowest segment with a valid source line. It does not sort by confidence at lookup time. Confidence still matters for diagnostics and for understanding why a map may be approximate.

---

## SourceMapAnchor

Anchors come from D8 `symbols` entries. Each symbol with an address and source line becomes:

```typescript
interface SourceMapAnchor {
  address: number;
  symbol: string;
  file: string;
  line: number;
}
```

Anchors give Debug80 a known file and source line for a specific address. They power nearest-symbol lookup, stack-frame names, Go to Definition, workspace symbols, hovers, Variables, Watch expressions and conditional breakpoint symbol resolution.

Duplicate anchor addresses are allowed because labels, constants and data symbols can share an address.

---

## SourceMapIndex

`buildSourceMapIndex()` turns a `MappingParseResult` into lookup structures:

```typescript
interface SourceMapIndex {
  segmentsByAddress: SourceMapSegment[];
  segmentsByFileLine: Map<string, Map<number, SourceMapSegment[]>>;
  anchorsByFile: Map<string, SourceMapAnchor[]>;
}
```

`segmentsByAddress` is sorted by `start`, then the D8 source-context line. Address lookup scans this ordered array until the requested address is before the next segment.

`segmentsByFileLine` groups segments by normalized absolute file path and 1-based source line. Only segments with a resolved file and line are indexed here. Each line list is sorted by address.

`anchorsByFile` groups anchors by normalized absolute file path. Each list is sorted by source line, then address. `resolveLocation()` uses this only as a non-executable fallback; `resolveExecutableLocation()` skips anchor fallback so labels and directives do not become active breakpoints.

Path keys are normalized with `normalizePathForKey()` so source lookup is case-insensitive where the platform requires it.

---

## D8DebugMap

D8 is the structured debug-map format used by Debug80 and native mapping producers. The current v1 root object is:

```typescript
interface D8DebugMap {
  format: 'd8-debug-map';
  version: 1;
  arch: string;
  addressWidth: number;
  endianness: 'little' | 'big';
  files: Record<string, D8FileEntry>;
  lstText?: string[];
  segmentDefaults?: D8SegmentDefaults;
  symbolDefaults?: D8SymbolDefaults;
  memory?: D8MemoryLayout;
  generator?: D8Generator;
  diagnostics?: D8Diagnostics;
}
```

The full D8 format reference is [Appendix G — D8 Debug Map Format](../appendices/g-d8-debug-map-format.md). Required fields are `format`, `version`, `arch`, `addressWidth`, `endianness`, and `files`.

File entries group segments and symbols under a source path key. The empty string key represents unknown source.

```typescript
interface D8FileEntry {
  meta?: { sha256?: string; lineCount?: number };
  segments?: D8Segment[];
  symbols?: D8Symbol[];
}
```

### D8Segment

```typescript
interface D8Segment {
  start: number; // Inclusive address
  end: number; // Exclusive address
  line?: number | null;
  column?: number;
  kind?: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence?: 'high' | 'medium' | 'low';
  lstLine: number;
  lstText?: string;
  lstTextId?: number;
  includeChain?: string[];
  macro?: { name: string; callsite: { file: string; line: number; column?: number } };
}
```

`buildMappingFromD8DebugMap()` converts each D8 segment into a `SourceMapSegment`. If `line` is missing, it falls back to `lstLine`; values below 1 become `null`. If `lstTextId` is present, the text is read from the top-level `lstText` table.

### D8Symbol

```typescript
interface D8Symbol {
  name: string;
  address: number;
  line?: number;
  kind?: 'label' | 'constant' | 'data' | 'macro' | 'unknown';
  scope?: 'global' | 'local';
  size?: number;
}
```

Symbols with a source line become `SourceMapAnchor` entries during D8 import.

---

## Debug Map Selection

Debug80 now treats the build-side native D8 map as the authoritative source map for active project targets. AZM emits this map directly, so Debug80 should not need to reconstruct project source maps from listing text during normal use.

`buildMappingFromDebugMap()` resolves `<artifactBase>.d8.json` beside the selected target's build artifact. Native maps are not rejected just because a source file appears newer; stale checks are advisory UI signals rather than alternate mapping paths.

If no usable map exists, Debug80 returns an empty mapping and logs a build-required message. It does not parse `.lst` files, generate compatibility maps, or write project-local `.debug80/cache` files.

---

## Summary

- `SourceMapSegment` now uses `start`, exclusive `end`, `loc`, `lst`, and `confidence`.
- `SourceMapAnchor` is an address/symbol/file/line record parsed from symbol definitions.
- `SourceMapIndex` has three lookup structures: by address, by file/line, and by file anchors.
- D8 v1 requires `format`, `version`, `arch`, `addressWidth`, `endianness`, and grouped `files`.
- D8 segments use `start` and exclusive `end`, matching runtime `SourceMapSegment` ranges.
- Native D8 maps are the source of truth for active AZM targets.
- Listing-derived maps and ASM80 parser compatibility have been removed from the active Debug80 codebase.

---

[Part VI](index.md) | [Parsing and Lookup →](15-parsing-and-lookup.md)
