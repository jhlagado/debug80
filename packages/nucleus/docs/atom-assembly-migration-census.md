# Nucleus AZM-to-Atom assembly migration census

Status: measured compatibility census
Date: 2026-08-28
Repository: `debug80`
Branch: `main`
Measured HEAD: `13ce3cc9`

## Purpose

This census measures the handwritten Nucleus Z80 assembly under `packages/nucleus/asm` before any move from AZM source syntax to Atom source syntax. The result is a migration input, not an implementation step.

The migration target is:

- Atom assembles the Nucleus compiler image;
- the generated image remains byte-identical to the current AZM-built image;
- strict register-contract proofs still run;
- Nucleus source semantics and proof expectations do not change during translation.

## Measured source set

Measured files:

| Item | Measured value |
| --- | ---: |
| Assembly files, `.asm` and `.asmi` | 64 |
| Source lines | 28,585 |
| Defined symbols detected | 3,656 |
| Defined symbols longer than eight characters | 3,623 |
| Referenced identifier-like tokens longer than eight characters | 3,709 |

The source set is large enough that manual renaming without tooling is not credible.

## Directive census

| AZM directive | Measured count | Atom migration treatment |
| --- | ---: | --- |
| `.DB` | 2,271 | Mechanical: `DB` |
| `.DW` | 229 | Mechanical: `DW` |
| `.ORG` | 77 | Mechanical: `ORG` |
| `.END` | 13 | Mechanical: `END`, or omit only when proved unnecessary for that image |
| `.INCLUDE` | 201 | Mechanical to Atom host include syntax; keep included files as source parts where possible |
| `.IF` | 233 | Mechanical to host conditional assembly syntax |
| `.ELSE` | 138 | Mechanical to host conditional assembly syntax |
| `.ENDIF` | 233 | Mechanical to host conditional assembly syntax |
| `.ROUTINE` | 706 | Contract-only; translate to comment-form contract metadata for the proof runner |

The ordinary data and origin directives are low risk. The migration blockers are contract metadata and symbol length.

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

## Literal and expression forms

| Form | Measured count | Atom migration treatment |
| --- | ---: | --- |
| `$FFFF`-style hexadecimal | 909 | Supported by Atom; direct |
| `%01010101`-style binary | 3 | Supported by Atom with line-start directive disambiguation |
| Intel `1010B`-style binary-looking suffix tokens | 20 | Audit before translation; some may be identifiers or generated-source text |
| Character literals | 102 | Supported by Atom if the literal form matches Atom's accepted character syntax |

The `%` binary form is not a problem if Atom treats `%` as a directive marker only at directive position. Inside expressions it remains a numeric literal prefix.

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
| `.DB`, `.DW`, `.ORG`, `.END` | Mechanical | Atom has equivalent directive forms |
| `.INCLUDE` | Mechanical with resolver policy | Include structure needs source identities and proof compatibility |
| `.IF`, `.ELSE`, `.ENDIF` | Mechanical for current source set | Current expressions are simple flags |
| `.ROUTINE` | Contract-only | Must become proof metadata comments |
| Long labels | Requires generated ledger | Nearly every defined symbol exceeds Atom's limit |
| Proof JSON symbol references | Requires ledger join | External expected-symbol names must remain stable or be mapped |

## Required next implementation checks

Before converting source:

1. Build a converter dry-run that emits only a ledger and an error report.
2. Add tests that fail on an untranslatable directive, unledgered long symbol, unresolved include, or unsupported conditional expression.
3. Add a proof-manifest join that maps old exported proof symbol names to generated Atom symbols.
4. Prove one small proof image through Atom source while keeping the AZM-built image as the comparison target.
5. Only then scale the conversion to the full `packages/nucleus/asm` tree.

## Conclusion

The Nucleus assembly source is structurally compatible with Atom, but it is not ready for a direct rename-and-assemble migration. The conversion is mostly mechanical for instructions, data directives, includes, and simple conditionals. The hard work is the symbol ledger and the contract-comment path.

The migration should therefore start with tooling, not manual source edits.
