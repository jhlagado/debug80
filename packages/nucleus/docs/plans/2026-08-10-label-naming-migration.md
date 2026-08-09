# Plan: compact Nucleus assembly labels

Status: deferred; do not implement during active language construction
Date: 2026-08-10
Planning baseline: `77c0f4e`

## Purpose

The Nucleus assembly uses long Pascal-case labels that often repeat the file,
subsystem, operation, phase, and outcome. The names are precise, but many push
the operand field far to the right and make the assembly harder to scan.

This plan records a possible migration to shorter labels after the compiler has
reached a more stable point. It authorises no source changes now. Label cleanup
must not compete with Stage 8 implementation or obscure semantic work in a
large mechanical diff.

The migration is a readability change, not a compiler-size optimisation. AZM
does not place symbol names in the generated program, so a pure rename must
leave every assembled byte unchanged.

## Evidence behind the proposal

A review of an earlier Stage 7 tree counted 2,156 labels and equates across 35
assembly and interface files. The measured name-length distribution was:

| Length | Count | Share |
| --- | ---: | ---: |
| 8 or fewer | 17 | 1% |
| 9–12 | 104 | 5% |
| 13–16 | 266 | 12% |
| 17–20 | 559 | 26% |
| 21–25 | 723 | 34% |
| 26 or more | 487 | 23% |

The mean was 21.5 characters, the median was 21, and the longest measured name
had 47 characters. Only 6% met the proposed twelve-character target.

That review also classified 876 labels, 41% of the measured set, as branch
targets referenced only within one owning routine. AZM already supports this
case: a label beginning with `_` belongs to the nearest preceding non-local
label in the same source ownership unit. The reviewed Nucleus sources did not
use that facility. Routine-local labels therefore provide the largest coherent
improvement without cross-file coordination.

The remaining measured reference classes were:

| Reference class | Count | Share |
| --- | ---: | ---: |
| Cross-file | 642 | 30% |
| Referenced from no more than one scope | 408 | 19% |
| File-internal | 124 | 6% |
| External proof or test interface | 106 | 5% |

These figures are planning evidence, not the current census. Compression and
the Z80 terminology sweep changed the source after the measurement. Phase 0
must reproduce the census from the chosen migration baseline before any label
is renamed.

## Timing and entry conditions

Begin this migration only when all of the following are true:

- the project owner explicitly reactivates the plan;
- no semantic stage is in progress;
- the current compiler increment has passed correctness and size review;
- all proof manifests assemble and execute from a clean checkout;
- the rename tooling and byte-comparison gate are ready; and
- the first pilot can be reviewed and reverted independently.

The preferred time is after the compiler structure has stabilised, either
between completed stages or during final source cleanup. If Stage 8 work still
adds or removes substantial routines, defer the migration.

## Naming scheme

### Global labels

Use this general form:

```text
<Module><Verb><Object>
```

Aim for 10–12 characters where the result remains immediately recognisable.
This is a soft readability target, not a validity limit. A clear fourteen-
character name is better than an obscure eight-character code.

Suggested module prefixes:

| Area | Prefix |
| --- | --- |
| tokenizer | `Tok` |
| parser | `Prs` |
| symbols | `Sym` |
| semantic transcript | `Sem` |
| typed expressions | `Ty` |
| structured control | `Ctl` |
| aggregates | `Agg` |
| Stage 7 call and carrier paths | `S7` |
| runtime | `Rt` |
| proofs | `Prf` |

Do not add a target prefix to every emitter. `EmitByte` and `EmitWord` are
already clear in a compiler that has one output path. Use `Z80` only when a
name must distinguish a target-specific contract from a target-independent
one.

Suggested abbreviations:

| Word | Form | Word | Form |
| --- | --- | --- | --- |
| aggregate | `Agg` | capacity | `Cap` |
| Boolean | `Bool` | declaration | `Decl` |
| diagnostic | `Diag` | expression | `Expr` |
| forward | `Fwd` | frame | `Frm` |
| initializer | `Init` | offset | `Off` |
| parameter | `Parm` | parser | `Prs` |
| program | `Prog` | routine | `Rtn` |
| scalar | `Scl` | source | `Src` |
| statement | `Stmt` | string | `Str` |
| symbol | `Sym` | token | `Tok` |

Reserve `Str` for string and `Prs` for parser. Use `Ctl` for structured
control and `Parm` for parameter so the abbreviations remain unambiguous.

### Routine-local labels

Use a leading underscore and a small, repeated role vocabulary:

```text
_fail  _err  _loop  _next  _done  _skip
_yes   _no   _word  _byte  _const _dyn
```

Routine-local names should normally fit within eight characters. A local name
needs only enough meaning within its owning routine. `_elemFail` is appropriate
when `_fail` would not distinguish two failure arms in the same routine.

### Names retained for reports

Keep measurement boundaries and proof-observation names explicit. Names such
as `CompilerCoreEnd`, `TypedSinkCodeEnd`, `ProofStatus`, and `GeneratedSize`
appear in manifests, tests, and human-readable measurement reports. Shortening
them would reduce report clarity and enlarge the external migration surface.

## Examples

The final names require a fresh collision check, but the intended style is:

| Current | Proposed |
| --- | --- |
| `ParserParseScalarProgramDeclarationAfterPrepare` | `PrsProgDecl` with `_afterPrep` |
| `AggregateParseInitializerElementFailure` | `_elemFail` under `AggParseInit` |
| `AggregateRecordInitializerExpectClose` | `_recClose` |
| `TypedExpressionBeginConstant` | `TyExprConst` |
| `TypedReadTrapPosition` | `TyRdTrapPos` |
| `TypedParseLocalDeclaration` | `TyParseLocal` |
| `Stage7BindParameter` | `S7BindParm` |
| `TypedStoreLocal16` | `TyStLoc16` |
| `StructuredParseElseIf` | `CtlParseElif` |
| `EncodeAggregateProgramWithinLimit` | `EncAggLim` |

The examples illustrate the scheme; they are not an approved rename map.

## Migration phases

### Phase 0: remeasurement and tooling

1. Recount labels, equates, lengths, and reference classes from the chosen
   baseline.
2. Generate a proposed old-to-new map without modifying the source.
3. Add a collision audit and a byte-comparison gate.
4. Record baseline binaries and measurement extents for every affected proof.

The tooling must make no naming decision by itself. A person reviews the map
before application.

### Phase 1: one-module pilot

Apply routine-local names in one module only. `typed-expression-z80.asm` is a
reasonable pilot because it has a dedicated executable proof and a bounded
target-specific surface. If another module has a cleaner local-label set when
the work begins, use that module instead.

The pilot answers two questions before the wider migration:

- Does the convention make the assembly easier to read?
- Does the tooling prove that the change is byte-identical and complete?

Do not continue if either answer is uncertain.

### Phase 2: routine-local labels

Convert true routine-local branch targets module by module. Each commit should
contain one coherent module or another comparably small ownership unit. No
cross-file symbol belongs in this phase.

### Phase 3: file-internal labels

Rename labels referenced across routines but confined to one file. Review the
complete file call graph and data references before applying each batch.

### Phase 4: cross-file labels

Rename one module interface per commit. Update `.asm` and `.asmi` declarations
and every consumer together. A cross-file rename is an interface change even
when the assembled bytes remain identical.

### Phase 5: proof and test interfaces

Rename externally observed symbols last. Each batch must update assembly,
`proofs/*.json`, and `test/*.ts` together. Retain measurement-boundary names
unless there is a specific readability problem.

## Rename-tool requirements

The tool must enforce these rules before writing any file:

1. Replace complete identifier tokens, never substrings.
2. Apply a batch across `.asm`, `.asmi`, `.json`, `.ts`, and relevant comments.
3. Reject exact and case-insensitive duplicates. AZM supports
   case-insensitive fallback resolution, so names that differ only by case are
   unsafe.
4. Reject Z80 mnemonics, registers, and conditions, case-insensitively. The
   rejection set must include instructions such as `ADD`, `AND`, `CALL`, `CP`,
   `IN`, `OR`, `OUT`, `RET`, `SET`, and `SUB`; registers and pairs; and
   conditions such as `NZ`, `Z`, `NC`, `PO`, `PE`, `P`, and `M`.
5. Reject a routine-local name used twice beneath the same owning label.
6. Confirm that every old definition and reference in the batch has gone.
7. Leave source formatting unchanged apart from the selected identifier
   tokens.

Comments that name a changed label must change in the same batch. A stale
comment is a failed migration even when it cannot alter machine code.

## Byte-identity gate

Every batch follows the same sequence:

1. Assemble every affected proof from the unmodified baseline and retain its
   complete generated image and measured extents.
2. Apply one reviewed rename map.
3. Assemble the same proofs again.
4. Compare each complete before and after image byte for byte.
5. Run the focused Nucleus proof gate and package tests.

A pure rename must produce identical images, sizes, instruction counts, and
T-state counts. Any difference stops the batch. Do not explain away a binary
difference as harmless; restore the baseline and locate the incomplete rename,
collision, or accidental constant change.

The proof harness must also resolve every renamed external symbol. A missing
manifest symbol is a failed batch, not a test update to postpone.

## Acceptance gates

Each commit must satisfy:

- byte-identical output for every affected proof;
- all then-current Nucleus proof fixtures passing;
- the complete Nucleus package suite passing;
- Nucleus typecheck passing;
- case-insensitive label and reserved-word audits passing;
- no old identifier from the batch remaining in code or comments;
- unchanged compiler-core, workspace, generated-program, runtime, instruction,
  and T-state measurements; and
- `git diff --check` passing.

The final migration also receives a read-only adversarial review focused on
symbol resolution, local-label ownership, external proof references, and binary
identity.

## Commit and rollback discipline

Use one module or one small interface per commit. Do not combine label changes
with instruction selection, size compression, documentation restructuring, or
semantic work. This separation keeps each commit mechanically verifiable and
easy to revert.

If the convention proves less readable during the pilot, abandon the migration
without carrying partial abbreviations into later modules. The plan records an
option, not a requirement.

## Deferred work record

No rename script, pilot, or source edit belongs in the current stage. When the
project owner reactivates this plan, Phase 0 starts from the then-current tree;
the historical counts in this document remain evidence for the idea rather
than substitutes for that measurement.
