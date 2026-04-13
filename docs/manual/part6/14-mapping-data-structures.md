[Part VI](README.md) | [Parsing and Lookup →](15-parsing-and-lookup.md)

# Chapter 14 — Mapping Data Structures

When the user steps to the next instruction and the editor highlights a source line, or sets a breakpoint on a line and the debugger maps it to an address, that work is done by the source mapper. The mapper maintains a bidirectional index between Z80 addresses and source file locations. This chapter covers every type the mapper uses.

The source mapping code lives in `src/mapping/`.

---

## The problem

The assembler produces a `.lst` listing file alongside the binary. A listing interleaves source lines with their assembled bytes and addresses:

```
00800  3E 01       LD A, 1
00802  32 00 09    LD (0x0900), A
```

The mapper parses this listing and builds a table of segments: spans of addresses that correspond to spans of source lines. It also resolves anchor comments that pin a listing line to a specific source file and line number — necessary when the assembler includes files and the listing interleaves content from multiple sources.

---

## SourceMapSegment

`SourceMapSegment` in `src/mapping/parser.ts` is the fundamental mapping unit. Each segment represents a contiguous range of Z80 addresses that corresponds to a range of lines in a listing file:

```typescript
interface SourceMapSegment {
  startAddress: number;   // First address in this segment
  endAddress: number;     // Last address (inclusive)
  lstLine: number;        // Line number in the listing file (1-based)
  lstEndLine: number;     // Last listing line for this segment
  file: string;           // Source file path
  line: number;           // Source line number (1-based)
  endLine: number;        // Last source line for this segment
  confidence: SegmentConfidence;
  kind: SegmentKind;
  lstText?: string;       // Deduplication index into lstText table (D8 maps only)
}
```

The `startAddress`/`endAddress` pair describes the byte span assembled from these source lines. The `lstLine`/`lstEndLine` pair locates the same content in the listing file. The `file`/`line`/`endLine` triplet locates it in the original source file.

Segments are typically one instruction long — one or a few source lines assembling to a few bytes. But macro expansions or multi-line data statements produce segments where `endLine > line` by several lines.

### SegmentConfidence

Confidence describes how certain the mapper is about the address-to-source correspondence:

| Value | Meaning |
|-------|---------|
| `HIGH` | From a D8 debug map — the assembler emitted this mapping explicitly |
| `MEDIUM` | Parsed from a listing file with no ambiguity |
| `LOW` | Derived from a listing file where the exact source line is uncertain |

The confidence is used during display: HIGH and MEDIUM segments drive editor highlights and breakpoint binding without reservation; LOW segments are used only when no better option exists.

### SegmentKind

Kind categorises what kind of source content produced this segment:

| Value | Meaning |
|-------|---------|
| `'code'` | Executable instructions |
| `'data'` | Data declarations (DB, DW, etc.) |
| `'unknown'` | Could not be classified |

Kind matters for Layer 2 refinement (Chapter 15): data segments use different text-matching heuristics than code segments.

---

## SourceMapAnchor

Anchors are comments in the listing file that name the source file and line. When the assembler encounters an `INCLUDE` directive, it typically emits a comment like:

```
; file: src/lib/delay.asm, line: 1
```

The mapper recognises these comments and uses them to thread file context through the listing. Each parsed anchor is a `SourceMapAnchor`:

```typescript
interface SourceMapAnchor {
  lstLine: number;    // Line number in the listing where this anchor appears
  file: string;       // Absolute path to the source file
  line: number;       // Line number within that source file
}
```

Anchors are attached to segments during the parse phase. A segment's `file` and `line` fields come from the most recently seen anchor at or before the segment's `lstLine`. This is the `attachAnchors()` threading mechanism described in Chapter 15.

---

## MappingParseResult

`parseMapping()` returns a `MappingParseResult`:

```typescript
interface MappingParseResult {
  segments: SourceMapSegment[];
  anchors: SourceMapAnchor[];
  lstInfo: LstInfo;
}
```

`LstInfo` records metadata extracted during the parse:

```typescript
interface LstInfo {
  listingPath: string;
  hasAnchors: boolean;     // Whether any anchor comments were found
  lineCount: number;       // Total lines in the listing
}
```

`hasAnchors` is checked before anchor-dependent logic runs — if the listing has no file-tracking comments, the file context is assumed to be the single assembled source file throughout.

---

## SourceMapIndex

`SourceMapIndex` in `src/mapping/source-map.ts` is the runtime query structure. It wraps the raw segment array with three indexes optimised for the two lookup directions and for the listing-line queries the D8 validator needs:

```typescript
interface SourceMapIndex {
  segments: SourceMapSegment[];
  segmentsByAddress: SourceMapSegment[];          // sorted by startAddress
  segmentsByFileLine: Map<string,                 // file path
                       Map<number,               // line number
                           SourceMapSegment[]>>; // all segments on that line
  anchorsByFile: Map<string, SourceMapAnchor[]>; // anchors sorted by lstLine
}
```

### `segmentsByAddress`

A sorted copy of the segment array, ordered by `startAddress`. Address-to-source lookup uses binary search on this array to find the candidate segment. Because segments do not always cover every address (data gaps, alignment padding, unreachable code), the lookup finds the segment whose `startAddress ≤ address ≤ endAddress` and picks the narrowest span when multiple segments match.

### `segmentsByFileLine`

A nested Map keyed first by file path, then by source line number. Each entry holds all segments that include that source line. Source-to-address lookup — binding a user breakpoint at a given file and line — scans this map. When multiple segments match (a line that assembles to more than one address range, or a line shared between a macro definition and its expansion site), the mapper returns the first one with the highest confidence.

### `anchorsByFile`

A Map from file path to the list of anchors in that file, sorted by `lstLine`. This is used by `findAnchorLine()` during Layer 2 refinement to locate listing content that corresponds to a specific source line.

---

## D8DebugMap

The D8 debug map is a JSON file produced by the ZAX assembler when invoked with the `--d8` flag. It carries higher-quality mapping data than can be inferred from a listing alone, because the assembler knows the exact correspondence at assembly time rather than having it reconstructed afterward.

The format is defined in `src/mapping/d8-map.ts`:

```typescript
interface D8DebugMap {
  version: 1;
  generator: {
    name: string;
    version: string;
  };
  files: {
    [filePath: string]: {
      segments: D8Segment[];
      symbols: D8Symbol[];
    };
  };
  lstText: string[];     // Deduplication table for listing line text
  diagnostics?: D8Diagnostic[];
}
```

### D8Segment

Each segment in the D8 map describes one instruction or data item:

```typescript
interface D8Segment {
  address: number;
  endAddress: number;
  lstLine: number;
  line: number;
  endLine: number;
  confidence: SegmentConfidence;
  kind: SegmentKind;
  lstText?: number;      // Index into D8DebugMap.lstText deduplication table
}
```

The `lstText` field is an index into the top-level `lstText` array rather than the literal string. Many instructions produce identical listing text (e.g. `NOP` always produces `00`), so deduplication keeps the map file small. Layer 2 refinement dereferences this index when it needs the actual text.

### D8Symbol

```typescript
interface D8Symbol {
  name: string;
  address: number;
  line: number;
  kind: 'label' | 'equ' | 'macro';
}
```

Symbols in the D8 map are used to populate the symbol index (Chapter 4) and to provide variable resolution in the Variables pane.

### Diagnostics

The assembler may emit diagnostic entries describing portions of the source that could not be mapped confidently:

```typescript
interface D8Diagnostic {
  kind: 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
}
```

These surface in the debug console when the mapper processes a D8 file.

---

## D8ValidationWarning

Before a D8 map is used, `validateD8Map()` in `src/mapping/d8-validate.ts` checks it for structural problems. Each problem is a `D8ValidationWarning`:

```typescript
interface D8ValidationWarning {
  kind: D8WarningKind;
  message: string;
  file?: string;
  line?: number;
  address?: number;
}
```

The validator checks for:

| Check | Why |
|-------|-----|
| `lstLine === 0` | A segment with no listing line cannot be used for Layer 2 refinement |
| `line < 1` | A segment pointing at line zero is invalid |
| Empty address range | `startAddress === endAddress` is suspicious for non-data segments |
| Wide segment shadowing narrow | When a broad segment and a narrow segment share an address, the broad one should not have higher confidence |

Warnings do not abort the mapping load — they are collected and logged. The mapper continues with whatever valid segments remain.

---

## Summary

- `SourceMapSegment` is the atom: one address range ↔ one source line range, with confidence and kind.
- `SourceMapAnchor` threads file context through a listing by recording where each included file begins.
- `MappingParseResult` is the raw output of the listing parser.
- `SourceMapIndex` wraps the segments in three indexes: sorted by address, grouped by file/line, and anchors grouped by file.
- `D8DebugMap` is the assembler-native format: JSON with a per-file segment list, a symbol table, a listing-text deduplication table, and optional diagnostics.
- `SegmentConfidence` (HIGH/MEDIUM/LOW) records how certain each mapping is; confidence is used to arbitrate when multiple segments compete for the same address or line.

---

[Part VI](README.md) | [Parsing and Lookup →](15-parsing-and-lookup.md)
