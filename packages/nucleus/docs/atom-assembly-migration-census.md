# Nucleus AZM-to-Atom assembly migration census

Status: measured compatibility census
Date: 2026-08-28
Repository: `debug80`
Branch: `main`
Initial census HEAD: `13ce3cc9`
Current census HEAD: `fc233f5a`

## Purpose

This census measures the handwritten Nucleus Z80 assembly under `packages/nucleus/asm`, plus transitive assembly includes reached from that tree, before any move from AZM source syntax to Atom source syntax. The result is a migration input, not an implementation step.

The migration target is:

- Atom assembles the Nucleus compiler image;
- the generated image remains byte-identical to the current AZM-built image;
- strict register-contract proofs still run;
- Nucleus source semantics and proof expectations do not change during translation.

## Measured source set

Measured files:

| Item | Measured value |
| --- | ---: |
| Assembly files, `.asm` and `.asmi` | 69 |
| Source lines | 29,389 |
| Defined assembler symbols detected | 3,797 |
| Defined assembler symbols longer than eight characters | 3,764 |
| Long labels classed as dot-local candidates | 995 |
| Long symbols still needing global treatment | 2,769 |
| Preprocessor-only feature symbols | 8 |
| Proof-limit symbols using `$10000` | 4 |
| Include-after-header violations | 143 |
| Current dry-run blockers | 143 |
| Permanent Atom source readiness | Blocked |
| Compatibility-lowered Atom readiness | Ready |
| Compatibility-blocking issues | 0 |
| Proof-manifest symbol mappings | 146 |
| One-past-address-space proof-limit mappings | 4 |

The source set is large enough that manual renaming without tooling is not credible.

Regenerate the dry-run report with:

```bash
npm run atom:migration:census -w nucleus
```

Run the same tool without `--report-only` when the ledger becomes complete and the migration should fail CI on any remaining unmapped construct:

```bash
npm run atom:migration:dry-run -w nucleus
```

The tool can also write machine-readable outputs for the next migration stage:

```bash
npm run atom:migration:census -w nucleus -- \
  --ledger-out build/nucleus-atom-ledger.json \
  --issues-out build/nucleus-atom-issues.json \
  --include-report-out build/nucleus-atom-includes.json
```

It can also write a generated Atom-preview assembly tree without modifying the source tree:

```bash
npm run atom:migration:census -w nucleus -- \
  --translated-root build/nucleus-atom-preview
```

It can also write the proof-manifest symbol join needed by the proof harness:

```bash
npm run atom:migration:census -w nucleus -- \
  --proof-symbol-map-out build/nucleus-atom-proof-symbols.json
```

The proof-symbol map keeps each existing proof-manifest name and records the
corresponding generated preview symbol and permanent Atom symbol. Current
measurement: 146 proof-facing symbols are mapped, and 142 of those need a
different Atom-safe name.

It can also write the proof-limit map for one-past-address-space constants:

```bash
npm run atom:migration:census -w nucleus -- \
  --proof-limit-map-out build/nucleus-atom-proof-limits.json
```

Current measurement: four source definitions use `$10000` as a proof boundary:
two `AddressSpaceLimit` definitions and two `ProofMemoryEnd` definitions. Atom
must not treat these as ordinary 16-bit `EQU` values. The preview translator
lowers each one to `EQU 0` plus `;@ATOM-PROOF-LIMIT <name> 65536`; the generated
proof-limit map carries the real external value for proof memory profiles and
manifest joins.

For proof images that still depend on AZM-style textual includes, the tool can
also lower a single entry into one generated Atom-preview source file:

```bash
npm run atom:migration:census -w nucleus -- \
  --flatten-entry vertical-slice/compiler-slice-proof.asm \
  --flatten-out build/nucleus-atom-preview/compiler-slice-proof.atom.asm
```

The proof-image byte comparison can be rerun with:

```bash
npm run atom:migration:proof-compare -w nucleus
```

The dry-run intentionally reports two readiness states:

- permanent Atom source is still blocked while emitted-content includes remain
  after the header; and
- compatibility-lowered Atom source is ready when those late includes are the
  only remaining issues.

Compatibility lowering is now the formal bridge for existing Nucleus proof
assembly. It preserves the current textual insertion points while producing
Atom-preview source for byte comparison. It is not the preferred shape for new
Nucleus assembly source.
```

## Directive census

| AZM directive | Measured count | Atom migration treatment |
| --- | ---: | --- |
| `.DB` | 2,797 | Mechanical: `DB` |
| `.DS` | 10 | Mechanical: `DS` |
| `.DW` | 358 | Mechanical: `DW` |
| `.EQU` | 1,112 | Mechanical: `EQU` |
| `.ORG` | 79 | Mechanical: `ORG` |
| `.END` | 13 | Preview translation omits terminal instances as `;@AZM-END`; every current instance has no source after it |
| `.INCLUDE` | 201 | Mechanical to Atom host include syntax; keep included files as source parts where possible |
| `.IF` | 233 | Mechanical to host conditional assembly syntax |
| `.ELSE` | 138 | Mechanical to host conditional assembly syntax |
| `.ENDIF` | 233 | Mechanical to host conditional assembly syntax |
| `.ROUTINE` | 709 | Contract-only; translate to comment-form contract metadata for the proof runner |

The ordinary data and origin directives are low risk. The migration blockers are contract metadata, symbol length, and include placement.

## Conditional assembly census

All detected `.IF` expressions are simple feature flags:

| Expression | Measured count |
| --- | ---: |
| `TargetStreamingOutput` | 100 |
| `AggregateCallSlices` | 68 |
| `HybridLL1Full` | 22 |
| `LegacyCompilerSlices` | 18 |
| `LegacyEncoders` | 10 |
| `SegmentedOutput` | 7 |
| `Stage7LL1` | 5 |
| `RuntimeProofServices` | 3 |

This is a good fit for Atom's host-level conditional assembly. The converter does not need a general expression evaluator for this source set. It needs exact handling for defined feature flags, `.ELSE`, and `.ENDIF`.

In flattened preview mode, these feature-flag definitions and conditionals are
handled before Atom sees the source. Feature flags are treated as preprocessor
state, not assembler constants, and inactive branches are omitted from the
generated preview.

## Literal and expression forms

| Form | Measured count | Atom migration treatment |
| --- | ---: | --- |
| `$FFFF`-style hexadecimal | 909 | Supported by Atom; direct |
| `$10000` hexadecimal limit constants | 4 | Blocked until represented without exceeding Atom's 16-bit expression range |
| `%01010101`-style binary | 3 | Supported by Atom with line-start directive disambiguation |
| Intel `1010B`-style binary-looking suffix tokens | 20 | Audit before translation; some may be identifiers or generated-source text |
| Character literals | 102 | Supported by Atom if the literal form matches Atom's accepted character syntax |

The `%` binary form is not a problem if Atom treats `%` as a directive marker only at directive position. Inside expressions it remains a numeric literal prefix.

The four `$10000` constants are real migration blockers for direct Atom source.
They occur in memory-limit definitions, where the current source uses a value
one past the 16-bit address space. Atom's current expression domain is 16-bit,
so permanent source either needs a safe source rewrite for these limit constants
or a deliberate Atom expression-range extension. The preview translator already
handles the known proof-limit forms explicitly.

## Include structure

Measured include directives: 201.

Unique include arguments detected: 39.

Representative include arguments:

- `"stage7-ll1-parser.asm"`
- `"stage7-ll1-actions.asm"`
- `"memory-map.asmi"`
- `"loop-compiler-state.asmi"`
- `"loop-z80-state.asmi"`
- `"source-adapter.asm"`
- `"loop-tokenizer.asm"`
- `"loop-semantic-sink.asm"`
- `"loop-symbols.asm"`
- `"loop-parser.asm"`
- `"loop-z80-sink.asm"`
- `"typed-expression-z80.asm"`
- `"aggregate-z80.asm"`
- `"loop-keywords.asmi"`
- `"proof-z80-runtime.asm"`

The include graph should be converted through the shared source-preparation resolver, not through anonymous textual concatenation. If a proof image still requires textual inclusion, the converter must record that as a temporary compatibility mode.

The scanner follows transitive `.include` directives under the Nucleus package root. This matters for generated grammar files such as `grammar/stage7-tables.asmi`, which sit outside `packages/nucleus/asm` but are part of the real assembly stream.

The selected Nucleus migration policy is header-only include semantics. An
include is part of source preparation: the host reads the directive, builds the
ordered source set, and removes or masks the directive before the resident
assembler sees bytes. The include header is deliberately simple: comments,
blank lines, and `.INCLUDE` directives only. `EQU`, `.IF`, `.ELSE`, `.ENDIF`,
`.ORG`, labels, data, instructions, and contract annotations all close the
header.

This avoids magic. A file that needs shared constants, feature settings, memory
maps, generated tables, or target layout should include a file that provides
those facts. It should not put local definitions before includes and rely on
the include resolver to interpret that as a special configuration scope.

This does not weaken `ORG` for ROM development. `ORG` remains available after
the header closes, and an included source file may contain its own `ORG` when it
owns a ROM section or fixed-address table. The restriction is only that `ORG`
must not participate in dependency discovery. The source-preparation layer
decides which files are present; ordinary assembly then decides where their
bytes land.

The existing proof assembly still has compatibility debt: many proof images use
`.INCLUDE` as textual paste after assembly has already begun, often to insert
shared memory maps, state layouts, generated tables, runtime helpers, or proof
fixtures at a specific point in the assembled stream.

That is the include-after-header issue. It is not a capitalization or punctuation
problem. The long-term answer is not to preserve two include meanings. Nucleus
source should converge on the same header-only model as Atom. Until the old
proof files are reorganized, translating those mid-file `.INCLUDE` lines to
header includes would change assembled order and therefore risk changing bytes.

The migration now has a temporary preview path that lowers one proof entry into
a generated flat Atom source file. That preserves byte identity for comparison,
but it is not yet a good permanent source format. Permanent source needs either
header imports plus a source reorganization that preserves assembled order, or a
formal Nucleus-specific lowering stage that records where each pasted region
came from.

The dry-run report groups include-after-header cases by source file and by
target include. It also classifies each target recursively as layout-only, code,
data, or mixed code/data. A wrapper include that contains only `.INCLUDE` lines
inherits the emitted-content class of its nested includes. Generate the report
with:

```bash
npm run atom:migration:census -w nucleus -- \
  --include-report-out build/nucleus-atom-includes.json
```

The largest current source groups are proof harnesses that include compiler
modules after an `.ORG` and section label:

| Source file | Measured violations | First line |
| --- | ---: | ---: |
| `vertical-slice/flat-target-z80-slice-proof.asm` | 11 | 18 |
| `vertical-slice/aggregate-z80-slice-proof.asm` | 10 | 15 |
| `vertical-slice/stage7-ll1-aggregate-call-z80-slice-proof.asm` | 10 | 16 |
| `vertical-slice/stage7-parser-coverage-proof.asmi` | 10 | 14 |
| `vertical-slice/stage8-failure-z80-slice-proof.asm` | 10 | 16 |
| `vertical-slice/stage9-conformance-z80-slice-proof.asm` | 10 | 17 |

The largest current target groups show why this is not a safe blind move:

| Target include | Measured uses | Target class |
| --- | ---: | --- |
| `vertical-slice/source-adapter.asm` | 15 | code |
| `vertical-slice/loop-keywords.asmi` | 13 | data |
| `vertical-slice/loop-parser.asm` | 13 | mixed code/data |
| `vertical-slice/loop-semantic-sink.asm` | 13 | code |
| `vertical-slice/loop-symbols.asm` | 13 | code |
| `vertical-slice/loop-tokenizer.asm` | 13 | mixed code/data |
| `vertical-slice/loop-z80-sink.asm` | 12 | mixed code/data |
| `vertical-slice/proof-z80-runtime.asm` | 12 | code |

The first cleanup pass moved the state-layout includes into strict headers by
adding small proof-mode config includes for `SegmentedOutput`. That removed the
34 layout-only late includes without changing emitted bytes. The remaining
late includes all emit code or data, including nested wrapper includes such as
`proof-z80-runtime.asm`, so they are not safe blind moves. Executable-code and
data-table includes need a separate section-ownership decision: either each
module owns its own `ORG`/section placement, or the compatibility lowering stage
remains responsible for preserving the current textual insertion point.

The long-term migration still needs one of these implementation paths before
the source tree itself can become Atom-native:

1. move Nucleus assembly includes into leading dependency headers where the order is semantically equivalent;
2. keep a Nucleus-specific compatibility lowering stage for the existing proof assembly while new source uses header-only includes.

## Symbol-length problem

Atom's eight-character symbol limit is the dominant migration risk.

Longest examples:

| Symbol | Length |
| --- | ---: |
| `ParserParseScalarProgramDeclarationAfterPrepare` | 47 |
| `ParserParseScalarProgramDeclarationAfterU8` | 42 |
| `Stage7AggregateConstantIncompleteSourceEnd` | 42 |
| `Stage7AggregateConstantScalarTypeSourceEnd` | 42 |
| `AggregateElementCapacityAcceptedSourceEnd` | 41 |
| `AggregateElementCapacityRejectedSourceEnd` | 41 |
| `Stage7AggregateConstantWrongTypeSourceEnd` | 41 |
| `NucleusRuntimeCheckAggregateRegionOffset` | 40 |
| `Stage7ParameterRoutineCollisionSourceEnd` | 40 |
| `Stage8AggregateArgumentFailableSourceEnd` | 40 |
| `TargetSinkSourceProvenanceSinglePartCode` | 40 |

The migration needs a generated naming ledger before any permanent source
rewrite. The current dry-run ledger now has two separate Atom names for long
symbols:

- `atom`, the deterministic generated global name used by byte-comparison
  previews; and
- `permanentAtom`, the proposed permanent-source name when the tool can classify
  the symbol safely.

For byte-comparison previews, every long symbol still has a deterministic
eight-character global name of the form `N0000000`, `N0000001`, and so on. That
keeps the preview mechanically safe. For permanent source, the tool now
classifies 995 long labels as dot-local candidates. Those labels are defined
once, are not proof-public, are not referenced from another file, and all their
detected uses fall inside one surrounding global-label scope. The scope test
uses every definition of every surrounding global, including repeated
conditional definitions, because any emitted global label closes the current
Atom private-label scope.

The remaining 2,769 long symbols now have deterministic permanent global
abbreviations. Manual curation is still useful for public names, proof-facing
names, and heavily read module entry points, but it is no longer a migration
blocker by itself.

| Kind | Measured count | Required treatment |
| --- | ---: | --- |
| Proof-public symbols | 142 | Generated abbreviation now; curate where proof manifests or public diagnostics should remain readable |
| Cross-file labels | 1,039 | Generated global abbreviation, because callers may be outside the local scope |
| `EQU` constants | 169 | Generated global abbreviation; constants do not change Atom private-label scope |
| Other generated/proof globals | 1,419 | Generated global abbreviation unless promoted to a clearer human name |

Translated preview source now documents renamed global declarations with
structured comments:

```asm
N0000000: ;@NUC-GLOBAL TargetOutputEmitByte PERMANENT TRGTOTPT
```

Preview source deliberately continues to use generated `N0000000`-style global
names for every long symbol. That keeps the temporary flattened proof-comparison
artifact safe even when a generated source part begins inside a future
dot-local scope. The `PERMANENT` field records the name to use when the real
source tree is rewritten into Atom-shaped source parts.

Dot-local candidates are not annotated in permanent source. They should be
short, contextual, and readable at the point of use. The ledger records their
original identity and surrounding global scope for proof tooling and review,
but the assembly source does not need a comment beside every local branch
target.

The global comments are not assembler semantics. They are there so humans,
diagnostics, proof tooling, and future D8/source-map generation can recover the
original Nucleus identity while the assembler sees only short Atom-safe global
names.

Recommended ledger fields:

| Field | Meaning |
| --- | --- |
| Original symbol | Full AZM symbol |
| Atom symbol | Generated eight-character preview symbol |
| Permanent Atom symbol | Proposed permanent-source symbol, including dot-local names where safe |
| Migration kind | Local label, proof-public abbreviation, cross-file abbreviation, `EQU` abbreviation, or generated global |
| Scope class | Global, private/local, proof-only, generated fixture, or exported proof symbol |
| Owning file | Logical source identity |
| Public obligation | Whether tests, proof JSON, D8 maps, or external scripts refer to the name |
| Local scope | Surrounding global label when the permanent source can use a dot-local label |
| Collision group | Other original names that would collide under the selected shortening rule |

Recommended shortening policy:

1. Reserve readable stems for public symbols used by tests and proof manifests.
2. Convert private implementation labels to dot-local labels when all detected
   uses stay inside one surrounding global-label scope.
3. Keep source labels and proof-export labels in separate namespaces where the proof runner permits it.
4. Generate deterministic global abbreviations from the original symbol, then add a suffix when needed to avoid case-insensitive collisions.
5. Regenerate the ledger from source in CI so manual edits cannot create an accidental collision.

No plain truncation rule is acceptable. Every generated abbreviation must be
checked against existing short names and earlier generated names, because silent
collisions would corrupt exactly the files where proof diagnostics are most
important.

## Contract metadata

The 706 `.ROUTINE` lines are not assembler semantics. They are proof metadata.

Atom should not implement the AZM contract language inside the Z80 assembler. The migration should instead use comment-form metadata such as:

```asm
;@ROUTINE IN A OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE
TOKENNEXT:
```

The host-side proof tool can translate those comments back into the contract-checker input format until a shared contract verifier exists.

This keeps the Atom assembler small and keeps proof ownership outside the assembler core.

## Migration classification

| Area | Classification | Reason |
| --- | --- | --- |
| Ordinary Z80 instructions | Direct or near-direct | Atom already targets byte-identical Z80 encoding |
| `.DB`, `.DS`, `.DW`, `.ORG` | Mechanical | Atom has equivalent directive forms |
| `.END` | Terminal metadata | Current instances can be omitted in preview source after recording `;@AZM-END` |
| `.INCLUDE` | Header-only for permanent source; compatibility-lowered for current proofs | Current emitted-content include-after-header cases are preserved by the lowering bridge |
| `.IF`, `.ELSE`, `.ENDIF` | Mechanical for current source set | Current expressions are simple flags |
| `.ROUTINE` | Contract-only | Must become proof metadata comments |
| Long labels | Classified | 995 can become dot-local labels; the rest have generated permanent global abbreviations |
| Proof JSON symbol references | Mapped | The dry-run emits a proof-symbol map from existing proof names to preview and permanent Atom names |
| `$10000` limit constants | Mapped as proof metadata | Atom source lowers these to `EQU 0` plus `;@ATOM-PROOF-LIMIT`, and the proof-limit map carries `65536` |
| Leading grouped immediates | Mechanical | Current `LD rr,(A<<8)|B` forms translate safely to `LD rr,A<<8|B` for Atom |
| Resolved preview aliases and differences | Preview-only bridge | The proof comparer lowers `EQU` aliases and `SYMBOL-SYMBOL` terms only when the current assembler's resolved symbols prove the value |

## Required next implementation checks

Before converting source:

1. Keep extending the converter dry-run ledger and error report for any newly discovered unmapped construct.
2. Add tests for each newly discovered untranslatable directive, unresolved include, unsupported conditional expression, or long symbol that cannot be classified as local or global.
3. Integrate the proof-symbol map into the proof harness path that consumes Atom-built images.
4. Integrate the proof-limit map into the proof harness path that consumes Atom-built images.
5. Convert strict register-contract metadata comments into the proof harness input path.
6. Start permanent source conversion on a small proof image whose source does not require emitted-content include lowering.
7. Keep emitted-content include lowering as a compatibility path for older proof assembly until those files are reorganized around explicit section ownership.

## Pilot preview results

The generated preview tree can assemble `vertical-slice/dispatcher-offset-direct-measurement.asm` with Atom after the proof-limit and terminal-`.END` translation rules. This is not a proof-image success. That file is a dispatcher measurement artifact, and its AZM output does not provide a reliable byte-identity target for ordinary Atom assembly because the measurement source overlaps selection-table bytes and code bytes. Do not use it as the first byte-identity proof.

The first real proof-image pilot now succeeds through the flattened preview path:

| Entry | Atom bytes | Current assembler bytes | Result |
| --- | ---: | ---: | --- |
| `vertical-slice/compiler-slice-proof.asm` | 37,055 | 37,055 | Byte-identical |

This is a measured proof-image compatibility result, not a full migration. It
shows that the current line translator, symbol ledger substitutions,
proof-limit handling, terminal `.END` handling, include-after-header lowering,
and simple conditional evaluation are sufficient for one substantial proof image.
It does not yet prove all proof images, strict contract metadata translation, or
proof-manifest symbol remapping.

The first scaled proof-image comparison uses generated multipart Atom preview
source, so no generated part exceeds Atom's 16-bit source-offset range. Current
routine bounded-matrix result:

| Status | Count |
| --- | ---: |
| Byte-identical proof images | 26 |
| Skipped known budget blockers | 0 |
| Skipped measurement artifacts | 3 |
| Atom-preview errors | 0 |

Byte-identical proof images:

- `aggregate-z80-slice-proof.json`
- `array-z80-slice-proof.json`
- `banked-target-entry1-z80-slice-proof.json`
- `banked-target-trap-z80-slice-proof.json`
- `banked-target-z80-slice-proof.json`
- `call-z80-slice-proof.json`
- `chapter21-target-z80-slice-proof.json`
- `compiler-slice-proof.json`
- `expression-z80-slice-proof.json`
- `flat-target-loaded-z80-slice-proof.json`
- `flat-target-trap-z80-slice-proof.json`
- `flat-target-unhandled-z80-slice-proof.json`
- `flat-target-z80-slice-proof.json`
- `loop-compiler-slice-proof.json`
- `loop-z80-slice-proof.json`
- `memory-map-proof.json`
- `nobj-runner-proof.json`
- `source-provenance-proof.json`
- `stage7-ll1-aggregate-call-z80-slice-proof.json`
- `stage7-ll1-engine-proof.json`
- `stage7-ll1-parser-coverage-proof.json`
- `stage8-failure-z80-slice-proof.json`
- `stage9-conformance-z80-slice-proof.json`
- `structured-control-z80-slice-proof.json`
- `typed-expression-z80-slice-proof.json`
- `z80-slice-proof.json`

Skipped measurement artifacts:

- `dispatcher-measurement.json`
- `dispatcher-offset-direct-measurement.json`
- `dispatcher-offset-trampoline-measurement.json`

`proofs/atom-migration-preview-budgets.json` now has measured per-entry
execution budgets for every non-measurement proof image in the bounded matrix.
The only routine skips are dispatcher measurement artifacts, not migration
blockers.

The source-capacity blocker from single-file flattening is resolved by generated
multipart preview parts. The grammar-generated keyword constants are now included
in the ledger through transitive include scanning. Unresolved dead `EQU`
definitions are masked in the proof-preview stream rather than assigned invented
aliases; if an active statement later uses one, Atom still reports the use site.
The proof comparer also folds proven `SYMBOL+SYMBOL`,
`SYMBOL-SYMBOL`, and known parenthesized constant expressions before invoking
Atom. Parenthesized folding is needed for generated Nucleus address operands
such as `LD A,(BASE+ENTRY_SIZE*2+FIELD_OFFSET)`, which must be lowered as one
expression rather than as an unsafe pairwise symbol rewrite.

The Nucleus preview comparer uses a Node-only native Atom memory layout with a
larger symbol arena:

| Arena | Range |
| --- | --- |
| Symbol records | `$4100..$BFFF` |
| Pending records | `$C000..$DFFF` |
| Source-part descriptors | `$E000..` |

This is not a native CP/M or TEC memory claim. It is a desktop migration-runner
configuration that lets the current Atom core process Nucleus-sized proof images
without changing assembler semantics.

The comparer also defaults to a Nucleus-preview-only legacy output sink. That
sink accepts non-overlapping IMAGE records in any order so old proof files that
emit high proof storage before lower runtime storage can still be compared for
syntax and byte identity. Atom's normal append-only sink remains available with
`--strict-output-order`, and native Atom source must still be ordered for
streaming output.

Focused follow-up measurement after that change:

| Entry | Result | Native Atom instructions | Native Atom cycles |
| --- | --- | ---: | ---: |
| `aggregate-z80-slice-proof.json` | Byte-identical | 214,828,050 | 2,067,715,176 |
| `expression-z80-slice-proof.json` | Byte-identical | 242,417,549 | 2,334,786,804 |
| `stage7-ll1-engine-proof.json` | Byte-identical | 37,695,198 | 361,752,509 |
| `stage7-ll1-aggregate-call-z80-slice-proof.json` | Byte-identical | 493,133,150 | 4,735,667,554 |
| `stage7-ll1-parser-coverage-proof.json` | Byte-identical | 358,854,958 | 3,449,529,065 |
| `stage8-failure-z80-slice-proof.json` | Byte-identical | 535,185,080 | 5,142,343,705 |
| `stage9-conformance-z80-slice-proof.json` | Byte-identical | 437,446,853 | 4,200,990,412 |
| `flat-target-z80-slice-proof.json` | Byte-identical | 553,400,734 | 5,303,254,267 |
| `structured-control-z80-slice-proof.json` | Byte-identical | 236,696,029 | 2,278,272,577 |
| `typed-expression-z80-slice-proof.json` | Byte-identical | 257,233,479 | 2,476,572,861 |

The seven other proof manifests that use
`vertical-slice/flat-target-z80-slice-proof.asm` now share the same measured
Atom-preview account as `flat-target-z80-slice-proof.json` and are
byte-identical under the same 700,000,000-instruction / 7,000,000,000-cycle
budget.

The next migration work should move from proof-image preview compatibility to
the shared host boundary: identify which Nucleus harness/provider services match
Atom's native host API directly, which need adapters, and which belong in a
shared Debug80 Z80 services package.

## Conclusion

The Nucleus assembly source is structurally compatible with Atom, but it is not
ready for a direct rename-and-assemble migration. The compatibility-lowered
Atom path is proven byte-identical for the full non-measurement proof set. The
remaining permanent-source work is proof-manifest symbol remapping, contract
comment integration, `$10000` proof-limit representation, and eventual
section-owned replacement for emitted-content include-after-header proof source.

The migration should therefore start with tooling, not manual source edits.
