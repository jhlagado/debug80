# Plan: asm80-style `.lst` listing output for AZM

Status: revised after code review (v2)
Date: 2026-07-18

## Goal

Teach the AZM assembler to emit a listing file (`<base>.lst`) in the layout
produced by the asm80 assembler: a per-line gutter with the emitted address and
machine bytes, followed by the source line, and a symbol table trailer. The
listing is a human-readable build artifact alongside `.hex`, `.bin`, and
`.d8.json`, and it is consumable by tools that already parse asm80 listings
(including this repo's own `scripts/dev/listingRangeTools.mjs`).

## Revision notes (v2)

The v1 plan was reviewed against the actual code. Three claims did not
survive contact:

1. **`sourceSegments` do not cover data directives.** In
   `src/assembly/program-emission.ts`, only `emitProgramInstruction` and
   `emitAlign` call `addSourceSegment`. `emitDb`, `emitDw`, `emitDs`, and
   `emitStringData` write image bytes but record no segment. The v1 claim
   that segments give "the bytes-per-source-line association without
   re-deriving sizes" is false for every `db`/`dw`/`ds`/string line. Phase 1
   below fixes emission first (which also improves `.d8.json`).
2. **The per-file cursor walk mis-orders imports.** Walking items and
   printing "all unprinted lines of F up to L" prints the parent file's
   lines *between its last item and the import site* only after control
   returns to the parent — i.e. after the entire imported file. The
   expander already produces the exact interleaved order as
   `LogicalLine[]` (`src/node/source-host.ts`, `expandFile`); v1 discarded
   it. The body is now driven by that line list.
3. **The full-image map cannot represent `ds`.** `assembledImageToMap`
   zero-fills the whole origin→end image, so a `ds` hole is
   indistinguishable from real `00` bytes. The listing must be built from
   the *initialized* map (the same map the hex writer gets) so `ds`
   reservations naturally have no byte tokens.

Also corrected: the test files cited in v1
(`test/integration/stage-12-compile-api.test.ts`, "stage-13/14-cli") do not
exist; real seams are named in the Tests section. The column rules for
long byte runs were contradictory (pad-to-20 vs 8 bytes wide) and are now
specified exactly.

## Reference format

Derived from asm80 0.9.3 (`asm.js`, `lst()` non-compact mode) and the CLI
(`asm80.js`), which always writes `<output-stem>.lst` next to the output:

- Lines with emitted bytes start with the 4-hex-digit address (`toHex4`)
  followed by three spaces, so byte tokens begin at column 7 (0-based).
- Bytes are printed as uppercase 2-hex-digit tokens separated by single
  spaces (`3E 01 ...`).
- The gutter is padded to column 20; the label column ends at column 30;
  then opcode, params, and `;remark` follow.
- After the listing body, a blank separation and then a symbol table: each
  symbol name padded to 12 characters followed by its 4-hex value. asm80
  skips internal names (`__*` prefixes, `*$` suffixes); AZM has no such
  internals in its `SymbolEntry` output.
- Included files are listed inline at their inclusion point; there is no
  per-file header.
- Macro expansions are marked with `        **MACRO UNROLL - <name>` lines.

asm80 is not vendored in this repo, so these format claims are enforced two
ways: by the in-repo parser contract below, and (optionally, env-gated) by
the same real-asm80 harness used by `test/asm80/*_acceptance.test.ts`.

Compatibility contract already present in this repo:
`scripts/dev/listingRangeTools.mjs#parseListingWrittenRange` accepts any
line matching `^([0-9A-Fa-f]{4})\s+`, counts 2-hex-digit tokens inside
`line.slice(7, 31)` (at most 8 bytes), and unions `address .. address+count`.
The new writer must satisfy this parser exactly: every emitted byte must
appear on some line whose gutter starts with its address and stays inside
columns 7–30.

### Exact column rules (resolves the v1 contradiction)

- 0–4 byte tokens: gutter is `AAAA` + 3 spaces + tokens, padded with spaces
  to column 20; source text starts at column 20.
- 5–8 byte tokens: tokens end at column 30 at most (7 + 8×3 − 1); source
  text starts two spaces after the last token. (asm80 itself pushes the
  source right on long lines; we do the same but cap at 8 tokens.)
- More than 8 bytes emitted by one source line: first 8 tokens on the
  primary line with the source text, then continuation lines — address
  advanced by 8, next ≤8 tokens, **no source text** — until exhausted.
  asm80 dumps all bytes on one line, which its own range parser then
  undercounts; wrapping keeps every byte inside the parsed window. This is
  the one deliberate deviation — called out in the docs.
- Lines that emit nothing (comments, `equ`, labels-only, blank lines):
  no gutter, source text from column 20 (matching asm80's empty gutter).
- `ds` without fill: address gutter (`AAAA` + spaces, no byte tokens),
  source at column 20. The parser sees zero tokens and ignores the line,
  which is correct — reservations are not written bytes.
- Line endings `\n`, uppercase hex, trailing newline — consistent with the
  hex writer's conventions.

## Content decision: list the AZM source, not the lowered `.z80`

Unchanged from v1 (option A): the body is the user's AZM source lines
verbatim with the asm80-style gutter. This works for every AZM construct
(routines, types, imports, register contracts) because the right-hand side
is just the original text. Option B (a listing of the lowered `--asm80`
output) can be added later as a companion artifact if a need appears.

## Data sources

Verified against the code; items marked **(new)** must be added:

- `LogicalLine[]` **(new plumbing)** — `expandFile` in
  `src/node/source-host.ts` already returns the fully interleaved
  `{sourceName, line, text}` sequence: included/imported files appear at
  their inclusion site, in order, with repeats for repeated `.include` and
  dedup for repeated `.import`. `loadProgramNext` currently drops it after
  parsing. Add `logicalLines: readonly LogicalLine[]` to
  `LoadedProgramNext` (`src/tooling/api.ts`) and thread it into
  `emitAssemblyArtifacts`. This is the body driver.
  - Caveat: `expandFile` *replaces* each `.include`/`.import` directive
    line with the child lines, so the directive line itself is absent from
    `logicalLines`. The writer reconstructs it: when consecutive body lines
    from the same file skip line numbers, the skipped lines are fetched
    from `sourceTexts` and printed with an empty gutter (this also covers
    an `.import` of an already-imported file, which expands to nothing).
- `LoadedProgramNext.sourceTexts: ReadonlyMap<string, string>` — raw text
  of every loaded file, for the reconstruction above. Also needs threading
  into `emitAssemblyArtifacts`.
- `assembled.sourceSegments: EmittedSourceSegment[]` — address ranges
  `{start, end, file, line, column, kind}`. **Today only instructions and
  `align` emit segments** (see Phase 1). Op-expanded instructions carry
  `emittedSource.span` = the op call site with kind `'macro'`
  (`src/expansion/op-expand-selected.ts`), so expanded bytes already
  attribute to the source line the user wrote — exactly right for the
  listing.
- The **initialized** byte map — build with the existing
  `assembledInitializedImageToMap(bytes, origin, initializedAddresses,
  sourceSegments)` (the "sidecar map" in `src/api-artifacts.ts`), *not*
  `assembledImageToMap`. `ds`-without-fill addresses are absent from it;
  `ds`-with-fill, `align` padding, and all data/code bytes are present.
- `SymbolEntry[]` from `collectSymbolEntries` (`src/api-artifacts.ts`) —
  labels and constants for the trailer. Display-name qualification
  (`needsSourceQualifier` → `unit::name`) currently lives inside
  `toD8mSymbol` (`src/outputs/d8-helpers.ts`); extract the small
  name-formatting piece into a shared helper so the trailer and `.d8.json`
  agree on display names. Note string-valued equates never appear (they
  have no numeric value in `resolvedSymbols`) — so "skip nothing" is
  automatic, not a rule the writer implements.

## Phase 1 (prerequisite): segment coverage for data directives

In `src/assembly/program-emission.ts`, record source segments for the
emitters that currently don't:

- `emitDb` / `emitStringData`: one segment per directive spanning the bytes
  it wrote (`kind: 'data'`). Capture the start address before the value
  loop and the end after it.
- `emitDw`: same, spanning all words of the directive.
- `emitDs` **with fill**: segment over the filled range (`kind: 'data'`).
  `ds` without fill stays segment-free (reserved, not emitted) — the
  listing derives its address-only gutter from the item walk, not from a
  segment (see Rendering).
- `align` already emits `kind: 'directive'`; unchanged.

Consequences to check in the same commit:

- `.d8.json` gains `data` segments (they flow through the sidecar map into
  `write-d8.ts`). Update `test/unit/outputs/write-d8.test.ts` expectations
  and any differential/corpus baselines that pin segment lists. This is a
  strict improvement for debug80 (data addresses become mappable) but it
  is a visible output change — give it its own commit so it can be
  bisected/reverted independently of the listing.
- `clippedSourceSegments` sorts by address and clips to the
  `binfrom`/`binto` window; segments for code outside the window are
  dropped. Listing lines for clipped code therefore lose their gutter.
  Accept for v1 and document (the bytes are equally absent from `.bin`).

## Rendering algorithm

Inputs: `logicalLines`, `sourceTexts`, the initialized map (with
`sourceSegments`), `SymbolEntry[]`, and the item list (for `ds`
reservations only).

1. Index segments by `(file, line)` → sorted list of `{start, end}`;
   merge adjacent/overlapping ranges on the same line (multi-instruction
   lines and op expansions produce several segments per line; after
   merging, a typical line has one contiguous range).
   - Known limitation: a file textually `.include`d twice emits segments
     from both passes keyed to the same `(file, line)`. v1 of the writer
     prints the merged union on the first occurrence and an empty gutter on
     repeats. Correct per-occurrence attribution needs emission-order
     segment IDs; deferred (repeated `.include` of *emitting* code is rare
     and dubious — repeated `.import` is already deduped upstream).
2. Index `ds`-without-fill items by `(file, line)` → start address, from
   the item walk (`kind === 'ds'`, no fill). These lines get an
   address-only gutter.
3. Walk `logicalLines` in order, keeping a per-file cursor of the last
   printed line number:
   - If the current `LogicalLine`'s number is more than cursor+1, print the
     skipped lines from `sourceTexts` with an empty gutter (these are the
     swallowed `.include`/`.import` directive lines).
   - Print the line: look up its merged ranges; emit gutter per the column
     rules, reading byte values from the initialized map (addresses absent
     from the map within a range — possible only in pathological overlap
     cases — render as `??`; not expected in practice).
   - After the walk, for each file whose cursor is short of its
     `sourceTexts` line count, print the remaining lines with an empty
     gutter (covers text after `.end`, whose items are skipped by
     emission).
4. Trailer: blank line, then one row per symbol — shared display name
   (with `::` qualifier when `needsSourceQualifier`), padded to 12 columns
   (longer names overflow the pad, as asm80 does), then 4-hex value
   (labels: `address`, constants: `value`, masked to 16 bits). Sort by
   display name for deterministic output.

Notes:

- Overlapping writes (backwards `org` over an earlier region): the map
  holds final bytes, so an overwritten line shows the *final* memory
  content, not what it originally emitted. asm80 shows the originally
  emitted bytes. Accept and document; matching asm80 here would require
  per-item byte capture during emission and buys little for a debugging
  artifact whose bytes should agree with the `.hex`/`.bin`.
- Instructions emitted under data placement write bytes at both code and
  data addresses but record a segment only at the code address
  (`emitProgramInstruction`); the listing shows the code-side bytes, which
  is what the source line reads as. Fine for v1.

## Wiring changes

Verified against the actual files; the `--asm80` flag is the template for
every row:

| File | Change |
| --- | --- |
| `src/tooling/api.ts` | Add `logicalLines: readonly LogicalLine[]` to `LoadedProgramNext`; populate from `expanded.lines` in `loadProgramNext`. |
| `src/assembly/program-emission.ts` | Phase 1: segments for `db`/`dw`/`string-data`/`ds`-with-fill. |
| `src/outputs/types.ts` | Add `LstArtifact { kind: 'lst'; path?; text }`, `WriteLstOptions { sourceTexts; logicalLines; reservations }` (exact shape at implementation), extend the `Artifact` union, add optional `writeLst` to `FormatWriters` (optional member — additive, like `writeAsm80`). |
| `src/outputs/write-lst.ts` (new) | Pure formatter implementing the algorithm above: `writeLst(map, symbols, opts)` where `map` is the initialized sidecar map carrying `sourceSegments`. |
| `src/outputs/d8-helpers.ts` | Extract shared symbol display-name helper (qualifier logic) for reuse by the trailer. |
| `src/outputs/index.ts` | Register `writeLst` in `defaultFormatWriters`. |
| `src/api-compile.ts` | Add `emitLst?: boolean` to `CompileNextFunctionOptions`; pass `loaded.loadedProgram.sourceTexts` and `.logicalLines` through to `emitAssemblyArtifacts`. |
| `src/api-artifacts.ts` | Emit the `lst` artifact when `emitLst` is set and the writer is present (mirror the `emitAsm80` block, including the defaults handling in `compileArtifactDefaults`: `--lst` is opt-in and does not suppress the primary bin/hex/d8m defaults). Reuse `sidecarMap`. |
| `src/cli/parse-args.ts` | Add `{ flags: ['--lst'], apply: (state) => { state.emitLst = true; } }`. |
| `src/cli/usage.ts` | `      --lst             Emit asm80-style listing (.lst)`. |
| `src/cli/write-artifacts.ts` | Add `lst: `${base}.lst`` to the path map in `writeArtifacts`; add `emitLst: parsed.emitLst` to `buildCompileOptions`. |
| `src/cli/artifact-files.ts` | Add `lst` to the paths interface and a `byKind.get('lst')` text write, mirroring `asm80`. |
| `src/index.ts` | Export `LstArtifact` (and `WriteLstOptions` if public); the public surface test imports via `@jhlagado/azm/compile`, so re-export from `api-compile.ts` too. |

Default remains off (`--lst` opt-in) to keep build outputs stable for
existing users; flipping the default later is a one-line change.

## Tests

Corrected to real seams (the v1-cited stage-12/13/14 files do not exist):

- `test/unit/outputs/write-lst.test.ts` (new; sibling of
  `write-hex.test.ts` / `write-d8.test.ts`): golden-string cases for
  instructions, labels inline and on their own line, `org` gaps, `db`/`dw`
  runs incl. the >8-byte wrap and the 5–8-byte right-shifted source
  column, `ds` with and without fill, string directives, blank/comment/
  `equ` lines, an imported file interleaved at its import site (with the
  reconstructed `.import` line), text after `.end`, op-expansion bytes
  attributed to the call-site line, and the symbol trailer (qualifier
  names, >12-char overflow, sorting).
- Compatibility oracle, in the same unit file: import
  `parseListingWrittenRange` from `scripts/dev/listingRangeTools.mjs` and
  assert it recovers exactly `min(initializedAddresses) ..
  max(initializedAddresses)+1` for a representative program (note: the
  *initialized* range — the full-image `writtenRange` includes `ds` holes
  and would be wrong).
- Phase 1 coverage: extend `test/unit/outputs/write-d8.test.ts` (or the
  emission tests beside `program-emission.ts`'s existing suites) to pin
  the new `data` segments for `db`/`dw`/`ds`-fill/string directives.
- `test/public_api_surface.test.ts`: extend the `@jhlagado/azm/compile`
  usage to reference the new artifact kind if types are re-exported.
- `test/cli/cli_artifacts.test.ts`: `--lst` writes `<base>.lst`; absent
  flag writes nothing (mirror the existing `--asm80` cases).
- Optional (env-gated like `test/asm80/*_acceptance.test.ts`): assemble a
  lowered `.z80` with a real asm80 binary and compare address/byte columns
  of its `.lst` against ours for the shared corpus. Nice-to-have; not a
  gate, since the source column intentionally differs.

## Suggested commit sequence

1. Phase 1: data-directive source segments + d8m test updates (standalone,
   bisectable).
2. Thread `logicalLines`/`sourceTexts` to artifact emission (no behavior
   change).
3. `write-lst.ts` + unit tests + oracle test.
4. API/CLI wiring (`emitLst`, `--lst`, path map) + CLI/public-surface
   tests.
5. Docs + CHANGELOG.

## Docs

- `README.md` CLI section and
  `docs/codebase/05-interfaces-and-output-artifacts.md`: describe the
  artifact, the exact column rules, and the two deliberate deviations
  (>8-byte wrap; final-bytes-not-emitted-bytes on overlap).
- `CHANGELOG.md` entry.

## Out of scope (noted for later)

- `**MACRO UNROLL - <name>` marker lines for op expansions (the expansion
  already attributes bytes to the call site; markers are cosmetic).
- A `--lst-compact` variant (asm80's `compact` mode).
- Option B (lowered-`.z80` listing) as a companion artifact of `--asm80`.
- Per-occurrence gutters for files `.include`d more than once (see
  Rendering §1).
