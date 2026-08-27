# Nucleus AZM-to-Atom assembly migration census

Status: measured compatibility census
Date: 2026-08-28
Repository: `debug80`
Branch: `main`
Initial census HEAD: `13ce3cc9`

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
| Assembly files, `.asm` and `.asmi` | 66 |
| Source lines | 29,259 |
| Defined assembler symbols detected | 3,781 |
| Defined assembler symbols longer than eight characters | 3,748 |
| Preprocessor-only feature symbols | 8 |
| Proof-limit symbols using `$10000` | 3 |
| Late textual includes | 177 |
| Current dry-run blockers | 3,925 |

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
  --issues-out build/nucleus-atom-issues.json
```

It can also write a generated Atom-preview assembly tree without modifying the source tree:

```bash
npm run atom:migration:census -w nucleus -- \
  --translated-root build/nucleus-atom-preview
```

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

## Directive census

| AZM directive | Measured count | Atom migration treatment |
| --- | ---: | --- |
| `.DB` | 2,794 | Mechanical: `DB` |
| `.DS` | 10 | Mechanical: `DS` |
| `.DW` | 352 | Mechanical: `DW` |
| `.EQU` | 1,106 | Mechanical: `EQU` |
| `.ORG` | 77 | Mechanical: `ORG` |
| `.END` | 13 | Preview translation omits terminal instances as `;@AZM-END`; every current instance has no source after it |
| `.INCLUDE` | 201 | Mechanical to Atom host include syntax; keep included files as source parts where possible |
| `.IF` | 233 | Mechanical to host conditional assembly syntax |
| `.ELSE` | 138 | Mechanical to host conditional assembly syntax |
| `.ENDIF` | 233 | Mechanical to host conditional assembly syntax |
| `.ROUTINE` | 706 | Contract-only; translate to comment-form contract metadata for the proof runner |

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
| `$10000` hexadecimal limit constants | 3 | Blocked until represented without exceeding Atom's 16-bit expression range |
| `%01010101`-style binary | 3 | Supported by Atom with line-start directive disambiguation |
| Intel `1010B`-style binary-looking suffix tokens | 20 | Audit before translation; some may be identifiers or generated-source text |
| Character literals | 102 | Supported by Atom if the literal form matches Atom's accepted character syntax |

The `%` binary form is not a problem if Atom treats `%` as a directive marker only at directive position. Inside expressions it remains a numeric literal prefix.

The three `$10000` constants are real migration blockers for Atom-preview assembly. They occur in memory-limit definitions, where AZM accepts a value one past the 16-bit address space. Atom's current expression domain is 16-bit, so the migration either needs a safe source rewrite for these limit constants or a deliberate Atom expression-range extension.

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

Atom's current `%INCLUDE` form is header-only. Nucleus AZM source uses textual includes after source has begun in 177 places. That is not a syntax typo; it reflects the proof-image layout style. The migration now has a temporary preview path that lowers one proof entry into a generated flat Atom source file, while preserving source-boundary comments for later provenance work.

The long-term migration still needs one of these decisions before the source tree itself can become Atom-native:

1. move Nucleus assembly includes into leading dependency headers where the order is semantically equivalent;
2. keep the Nucleus-specific preview mode that lowers late textual includes before invoking Atom and formalize its provenance mapping; or
3. extend Atom's host include policy, which would be a product decision because Atom currently treats late host directives as invalid source.

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

The migration needs a generated naming ledger before any permanent source rewrite.

Recommended ledger fields:

| Field | Meaning |
| --- | --- |
| Original symbol | Full AZM symbol |
| Atom symbol | Generated eight-character symbol |
| Scope class | Global, private/local, proof-only, generated fixture, or exported proof symbol |
| Owning file | Logical source identity |
| Public obligation | Whether tests, proof JSON, D8 maps, or external scripts refer to the name |
| Collision group | Other original names that would collide under the selected shortening rule |

Recommended shortening policy:

1. Reserve readable stems for public symbols used by tests and proof manifests.
2. Generate private implementation names mechanically from a per-file prefix plus a base-40 or base-36 counter.
3. Keep source labels and proof-export labels in separate namespaces where the proof runner permits it.
4. Fail the conversion on any unledgered long symbol.
5. Regenerate the ledger from source in CI so manual edits cannot create an accidental collision.

No truncation rule is acceptable. Truncation would create silent collisions in exactly the files where proof diagnostics are most important.

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
| `.INCLUDE` | Requires resolver or lowering decision | Most Nucleus includes are textual and late relative to Atom's header-only policy |
| `.IF`, `.ELSE`, `.ENDIF` | Mechanical for current source set | Current expressions are simple flags |
| `.ROUTINE` | Contract-only | Must become proof metadata comments |
| Long labels | Requires generated ledger | Nearly every defined symbol exceeds Atom's limit |
| Proof JSON symbol references | Requires ledger join | External expected-symbol names must remain stable or be mapped |
| `$10000` limit constants | Requires source or Atom expression decision | Atom currently rejects literals above `65535` |
| Leading grouped immediates | Mechanical | Current `LD rr,(A<<8)|B` forms translate safely to `LD rr,A<<8|B` for Atom |
| Resolved preview aliases and differences | Preview-only bridge | The proof comparer lowers `EQU` aliases and `SYMBOL-SYMBOL` terms only when the current assembler's resolved symbols prove the value |

## Required next implementation checks

Before converting source:

1. Keep extending the converter dry-run ledger and error report until every proof image has a deterministic migration path.
2. Add tests for each newly discovered untranslatable directive, unledgered long symbol, unresolved include, or unsupported conditional expression.
3. Add a proof-manifest join that maps old exported proof symbol names to generated Atom symbols.
4. Decide how the three one-past-address-space constants should be represented for Atom.
5. Decide whether the late textual include lowering remains only a preview bridge or becomes a formal Nucleus source-preparation mode.
6. Scale the successful flattened preview comparison from `compiler-slice-proof.asm` to the rest of the proof-image set.
7. Only then scale the conversion to the full `packages/nucleus/asm` tree.

## Pilot preview results

The generated preview tree can assemble `vertical-slice/dispatcher-offset-direct-measurement.asm` with Atom after the proof-limit and terminal-`.END` translation rules. This is not a proof-image success. That file is a dispatcher measurement artifact, and its AZM output does not provide a reliable byte-identity target for ordinary Atom assembly because the measurement source overlaps selection-table bytes and code bytes. Do not use it as the first byte-identity proof.

The first real proof-image pilot now succeeds through the flattened preview path:

| Entry | Atom bytes | Current assembler bytes | Result |
| --- | ---: | ---: | --- |
| `vertical-slice/compiler-slice-proof.asm` | 37,055 | 37,055 | Byte-identical |

This is a measured proof-image compatibility result, not a full migration. It
shows that the current line translator, symbol ledger substitutions,
proof-limit handling, terminal `.END` handling, late textual include lowering,
and simple conditional evaluation are sufficient for one substantial proof image.
It does not yet prove all proof images, strict contract metadata translation, or
proof-manifest symbol remapping.

The first scaled proof-image comparison uses generated multipart Atom preview
source, so no generated part exceeds Atom's 16-bit source-offset range. Current
routine bounded-matrix result:

| Status | Count |
| --- | ---: |
| Byte-identical proof images | 9 |
| Skipped known budget blockers | 16 |
| Skipped measurement artifacts | 3 |
| Atom-preview errors | 0 |

Byte-identical proof images:

- `array-z80-slice-proof.json`
- `call-z80-slice-proof.json`
- `compiler-slice-proof.json`
- `loop-compiler-slice-proof.json`
- `loop-z80-slice-proof.json`
- `memory-map-proof.json`
- `nobj-runner-proof.json`
- `stage7-ll1-engine-proof.json`
- `z80-slice-proof.json`

Skipped measurement artifacts:

- `dispatcher-measurement.json`
- `dispatcher-offset-direct-measurement.json`
- `dispatcher-offset-trampoline-measurement.json`

Known budget blockers are listed in `proofs/atom-migration-preview-budgets.json`
with an explicit skip reason. The comparer skips them during the routine matrix
so that the command remains bounded. Passing one of those manifests with
`--entry` overrides the skip and measures that proof directly.

Measured remaining blocker groups:

| Group | Representative generated line | Consequence |
| --- | --- | --- |
| Larger preview execution budget | `aggregate-z80-slice-proof.json`, `expression-z80-slice-proof.json`, `flat-target-z80-slice-proof.json`, `structured-control-z80-slice-proof.json`, `stage7-ll1-aggregate-call-z80-slice-proof.json`, `stage7-ll1-parser-coverage-proof.json`, `stage8-failure-z80-slice-proof.json`, `stage9-conformance-z80-slice-proof.json`, `typed-expression-z80-slice-proof.json`, plus the flat-target proof variants | Atom preview assembly exceeds the comparison script's current execution budget before reporting a source diagnostic or byte comparison; measure explicitly with `--entry` before raising a per-entry budget |

The source-capacity blocker from single-file flattening is resolved by generated
multipart preview parts. The grammar-generated keyword constants are now included
in the ledger through transitive include scanning. Unresolved dead `EQU`
definitions are masked in the proof-preview stream rather than assigned invented
aliases; if an active statement later uses one, Atom still reports the use site.
The proof comparer also folds proven `SYMBOL+SYMBOL` and `SYMBOL-SYMBOL`
expressions before invoking Atom.

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
| `stage7-ll1-engine-proof.json` | Byte-identical | 37,695,198 | 361,752,509 |
| `flat-target-z80-slice-proof.json` | Reaches execution budget | 200,000,000 | 2,000,000,000 |
| `structured-control-z80-slice-proof.json` | Reaches execution budget with legacy unordered output | 200,000,000 | 1,926,034,192 |

The next migration work should address the preview execution budget with
per-entry measured budgets, then return to any source diagnostics exposed after
those entries run further.

## Conclusion

The Nucleus assembly source is structurally compatible with Atom, but it is not ready for a direct rename-and-assemble migration. The conversion is mostly mechanical for instructions, data directives, includes, and simple conditionals. The hard work is the symbol ledger and the contract-comment path.

The migration should therefore start with tooling, not manual source edits.
