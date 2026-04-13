[← Mapping Data Structures](14-mapping-data-structures.md) | [Part VI](README.md)

# Chapter 15 — Parsing and Lookup

This chapter covers the algorithms: how the listing file is parsed into segments, how anchors are attached, how the index is built, how address-to-source and source-to-address lookups work, and how Layer 2 refinement improves confidence for listings that lack D8 debug maps.

---

## Parsing a listing

`parseMapping()` in `src/mapping/parser.ts` reads the listing file line by line. Each line is matched against two regular expressions: one for assembled-code lines and one for anchor comments.

### Assembled-code lines

A listing line looks like:

```
00800  3E 01       LD A, 1
```

The regex captures the address field, the hex bytes, and the source text. From this the parser extracts:
- `address` — the assembled address of this instruction
- `byteCount` — the number of bytes (determines `endAddress`)
- `lstLine` — the current line number in the listing

The parser accumulates these into `SourceMapSegment` objects. An instruction with no bytes (a label, an EQU, a comment-only line) produces no segment.

### Anchor comments

Anchor lines look like:

```
; file: /path/to/source.asm, line: 42
```

The regex captures the file path and line number. Each match produces a `SourceMapAnchor` at the current `lstLine`.

### `attachAnchors()`

After the listing is fully parsed, `attachAnchors()` threads file context through the segment list. It iterates the segments in listing order and maintains a cursor into the anchor list. When the cursor's anchor `lstLine ≤ segment.lstLine`, the anchor fires: subsequent segments are tagged with that anchor's `file` and `line` offset.

The `line` offset works as follows: the anchor says "listing line N corresponds to source line M in file F". Segments that appear after that anchor have their source line calculated as:

```
segment.line = anchor.line + (segment.lstLine - anchor.lstLine)
```

This is correct when source lines and listing lines are in 1:1 correspondence. Macro expansions break that assumption — a single source line expands to many listing lines. The mapper handles this by treating macro spans as a single segment with `endLine === line` (the expansion shares the macro call site's line number).

When the listing has no anchors (`lstInfo.hasAnchors === false`), the mapper assigns all segments to the single source file passed in as context.

---

## Building the index

`buildSourceMapIndex()` in `src/mapping/source-map.ts` takes a `MappingParseResult` and constructs a `SourceMapIndex`.

1. **Sort by address** — `segmentsByAddress` is the segment array sorted by `startAddress` ascending.

2. **Group by file/line** — iterate all segments; for each segment, insert it into the nested `Map<string, Map<number, SourceMapSegment[]>>` under its `file` key and each line from `line` to `endLine`. Multi-line segments are indexed under every line they span, so a breakpoint on any line of a multi-line statement resolves correctly.

3. **Group anchors by file** — collect anchors into a `Map<string, SourceMapAnchor[]>` sorted by `lstLine` within each file.

---

## Address-to-source lookup: `findSegmentForAddress()`

Given a Z80 address, find the source location. This is used to populate the stack frame when execution pauses and to highlight the current instruction in the editor.

```
function findSegmentForAddress(index, address):
  candidates = binary search segmentsByAddress for segments where
               startAddress ≤ address ≤ endAddress

  if no candidates: return undefined

  prefer segment where:
    1. confidence is highest
    2. span is narrowest (endAddress - startAddress)
    3. line is valid (≥ 1)

  return best candidate
```

The narrowest-span preference is important. Macro expansions often create a wide segment covering the entire expansion alongside narrow per-instruction segments covering individual instructions within the expansion. The narrow segment gives the more precise location.

---

## Source-to-address lookup: `resolveLocation()`

Given a file path and line number, find the Z80 address. This is used when binding breakpoints and when navigating to an address from the editor.

`resolveLocation()` uses a slop search: it first tries the exact line, then tries `line ± 1`, `line ± 2`, up to `line ± 4`. This accommodates blank lines, comment-only lines, and minor listing/source misalignments.

```
function resolveLocation(index, file, line):
  for slop in [0, 1, -1, 2, -2, 3, -3, 4, -4]:
    candidates = index.segmentsByFileLine[file][line + slop]
    if candidates:
      best = highest confidence, then narrowest span
      return { address: best.startAddress, line: best.line }

  // Anchor fallback
  anchor = findAnchorLine(index, file, line)
  if anchor:
    return { address: anchor.address, line: anchor.line, confidence: LOW }

  return undefined
```

The anchor fallback handles lines that appear in the source but produced no assembled output — for example, a section of a file that is only assembled when a conditional is true but was not assembled in this build. The nearest anchor before the requested line provides the best available address.

---

## `findAnchorLine()`

`findAnchorLine()` searches the `anchorsByFile` map for the anchor whose listing line is nearest to the requested source line. It binary searches the sorted anchor array for the file, then scans outward from the closest match. This is used by both the `resolveLocation()` fallback and by Layer 2 when it needs to correlate source lines to listing lines for text matching.

---

## Layer 2 refinement: `applyLayer2()`

Layer 2 is a post-processing pass in `src/mapping/layer2.ts` that improves segment confidence by comparing the listing text of each segment against the corresponding source line.

This matters when the mapper has only a listing file (no D8 map). Listing parsing can assign incorrect line numbers when includes are nested or macros are used. Layer 2 catches these by verifying that the text matches.

### Text normalisation

Both the listing line and the source line are normalised before comparison:

1. Strip comments (everything after `;`)
2. Uppercase
3. Compress whitespace to single spaces
4. Trim

This makes `LD  A, (HL)    ; load accumulator` compare equal to `ld a,(hl)`.

### The refinement algorithm

```
for each segment with lstText defined:
  listing_text = normalise(lstText)
  source_text  = normalise(source_file[segment.line])

  if listing_text == source_text:
    segment.confidence = max(segment.confidence, MEDIUM)
    continue

  // Search nearby source lines
  for offset in [-3, -2, -1, +1, +2, +3]:
    candidate_text = normalise(source_file[segment.line + offset])
    if listing_text == candidate_text:
      segment.line = segment.line + offset
      segment.confidence = MEDIUM
      break

  // If still no match and segment is data, downgrade
  if no match found and segment.kind == 'data':
    segment.confidence = LOW
```

### Macro block detection

When Layer 2 encounters a run of listing lines that all correspond to the same source line (the hallmark of a macro expansion), it marks the entire run as a single macro block and assigns the source line of the macro call site. This prevents the expansion's internal instructions from being incorrectly attributed to whichever source line happens to have matching text.

### Confidence degradation

When Layer 2 cannot find a text match for a segment:
- `kind === 'code'` — confidence stays as-is; the parse was probably correct
- `kind === 'data'` — confidence degrades to LOW; data lines are prone to aliasing (many `DB 0x00` lines are textually identical)
- Ambiguous match (multiple lines match) — confidence degrades to LOW regardless of kind

---

## Building from a D8 map

When a D8 debug map is available, `buildMappingFromD8DebugMap()` in `src/mapping/d8-map.ts` builds the segment list directly from the D8 data rather than parsing the listing. Each `D8Segment` in each file entry becomes a `SourceMapSegment` with `confidence: HIGH`.

The listing file is still read — its text content is loaded into a lookup table for Layer 2 to use, but Layer 2 runs in verification mode only: it confirms HIGH-confidence segments rather than trying to repair LOW-confidence ones. Any segment that fails text verification is downgraded from HIGH to MEDIUM, not discarded.

`parseD8DebugMap()` handles the JSON parse with schema validation. If the `version` field is not `1`, or if required fields are missing, it throws. The caller falls back to listing-only parsing.

---

## Breakpoint integration

When the debug adapter receives a `setBreakpoints` request (Chapter 5), it calls `resolveLocation()` for each requested file and line. The returned address is registered with the `BreakpointManager`. If `resolveLocation()` returns `undefined`, the breakpoint is marked unverified and the editor shows it as a hollow dot.

The confidence of the resolved segment is stored on the breakpoint. LOW-confidence breakpoints are still active — they fire — but the debug console emits a note that the location may be approximate.

On each `StoppedEvent`, the stack frame builder calls `findSegmentForAddress()` for each frame's program counter. The returned `file` and `line` are sent to VS Code to highlight the current line and populate the call stack.

---

## Stack frame integration

The `resolveStackFrame()` function in `src/debug/stack-service.ts` calls `findSegmentForAddress()` for each frame address. Three outcomes are possible:

1. **Segment found, confidence HIGH or MEDIUM** — the frame shows the source file and line with a filled location icon.
2. **Segment found, confidence LOW** — the frame shows the location with a warning icon; the editor highlights the approximate line.
3. **No segment** — the frame shows the raw address as a hex string (`0x1A3F`) with no source link.

This three-path behaviour is described in Chapter 5. The source mapper's confidence levels are what drive the path selection.

---

## SourceManager orchestration

`SourceManager` in `src/debug/source-manager.ts` orchestrates the full mapping pipeline at launch:

1. Receive the assembled listing path from the launch pipeline.
2. Check for a D8 debug map at the conventional path (`<listing>.d8.json`).
3. If D8 map found: call `buildMappingFromD8DebugMap()`, then `buildSourceMapIndex()`.
4. If no D8 map: call `parseMapping()`, then `applyLayer2()`, then `buildSourceMapIndex()`.
5. Store the `SourceMapIndex` on the session state for all subsequent lookups.

The `SourceStateManager` (`src/debug/source-state-manager.ts`) wraps `SourceManager` and mediates access across multiple source files when the project has more than one assembled output (for example, separate ROM and RAM assembly runs).

---

## Summary

- The listing parser extracts segments from address/byte/source triplets and anchors from file-tracking comments.
- `attachAnchors()` threads file context through segments by carrying the most recent anchor forward.
- `buildSourceMapIndex()` produces three indexes: address-sorted, file/line-grouped, and anchors-by-file.
- `findSegmentForAddress()` binary searches by address and prefers the narrowest span among candidates.
- `resolveLocation()` slop-searches ±4 lines from the requested line before falling back to the nearest anchor.
- Layer 2 normalises and compares listing and source text to upgrade MEDIUM confidence and catch listing/source misalignments; macro blocks are detected and collapsed.
- D8 maps bypass listing inference entirely and produce HIGH-confidence segments; Layer 2 runs in verification mode only.
- Breakpoint binding calls `resolveLocation()`; stack frame resolution calls `findSegmentForAddress()`. Confidence levels drive the VS Code UI: hollow breakpoints, approximate-location warnings, and raw-address fallbacks.

---

[← Mapping Data Structures](14-mapping-data-structures.md) | [Part VI](README.md)
