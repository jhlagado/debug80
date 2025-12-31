# Mapping Implementation Plan

This plan decomposes the mapping and debugger integration work into phases with concrete, testable steps. It is intentionally granular to support task planning and review.

---

## Scope

Implement source-level debugging using LST-derived mapping with optional Layer 2 refinement, while preserving LST fallback behavior.

---

## Phase 1: Layer 1 Parser + LST Fallback (Minimum Viable)

1. Add a new mapping parser module (e.g., `src/mapping-parser.ts`) that produces:
   * `segments` (start/end/loc/lst/confidence)
   * `anchors`
   * `addressToLine` fallback data (listing)
2. Implement deterministic LST body parsing using the byte-token rule and boundary rule in `docs/specs/mapping.md`.
3. Parse symbol table entries and build `anchorsByAddress`.
4. Implement Layer 1 attachment (listing order traversal) to assign `file/line/confidence` to entries.
5. Add in-memory structures in the adapter:
   * `segmentsByAddress` sorted by `start` (tie-break `lst.line`)
6. Update `StackTraceRequest` to:
   * resolve PC to segment
   * use `loc.file`/`loc.line` when available
   * fall back to listing when `loc.file` is null or no segment matches
7. Keep listing breakpoints working as-is.
8. Add tests for:
   * LST parsing (byte tokens, zero-byte lines, macro markers)
   * symbol table boundary rule
   * PC -> source fallback behavior

---

## Phase 2: Source Breakpoints + Indexes

1. Build `segmentsByFileLine` index: `file -> line -> segments[]`.
2. Build `anchorsByFile` index for fallback mapping.
3. Implement `resolveLocation(file, line)`:
   * exact line match -> lowest start address
   * fallback to nearest anchor at/before line
4. Update `setBreakPointsRequest` to:
   * accept `.asm` source paths
   * resolve to addresses via `resolveLocation`
   * verify/unverify with clear messaging
5. Add tests for:
   * breakpoint resolution (exact and fallback)
   * ambiguity (multiple segments at same line)

---

## Phase 3: Layer 2 Matching (Optional)

1. Add `.asm` loader with deterministic resolution order `[lstDir, ...sourceRoots]`.
2. Normalize `.asm` lines per spec and precompute `normLines`.
3. Implement matching algorithm with windowing, tie-breaks, and back-jump guard.
4. Apply data/macro heuristics (DB/DW/etc, macro unroll markers).
5. Merge Layer 2 results into `segments`, updating `line/confidence`.
6. Record missing `.asm` files without failing the launch.
7. Add tests for:
   * normalization correctness
   * ambiguous matches
   * missing source file behavior

---

## Phase 4: Persistence (Optional)

1. Define a cache key based on:
   * LST path + mtime/size
   * list of resolved source files + mtimes
2. Serialize `segments` and `anchors` to JSON (Appendix B).
3. Load cached mapping when inputs are unchanged; validate schema version.
4. Provide a bypass flag (e.g., `useCache: false`).
5. Add tests for cache hit/miss and invalidation.

---

## Validation and Coverage

1. Run the analyzer on Caverns and parser_test listings; record coverage stats.
2. Verify stepping across:
   * high-confidence source lines
   * low-confidence/macro regions (listing fallback)
3. Verify breakpoint behavior for:
   * `.asm` files with and without Layer 2
   * listing breakpoints
4. Document any residual mapping gaps.

---

## Deliverables

* Updated parser + adapter implementation
* Test coverage for parsing and breakpoint resolution
* Optional cache support
* Notes on coverage and known limitations
