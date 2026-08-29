# Nucleus AZM-to-Atom assembly migration census

Status: measured compatibility census
Date: 2026-08-29
Repository: `debug80`
Branch: `main`
Initial census HEAD: `13ce3cc9`
Current reusable-transform baseline HEAD: `75a18313`

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
| Assembly files, `.asm` and `.asmi` | 179 |
| Source lines | 29,901 |
| Defined assembler symbols detected | 4,070 |
| Defined assembler symbols longer than eight characters | 3,910 |
| Long labels classed as dot-local candidates | 771 |
| Long symbols still needing global treatment | 3,139 |
| Preprocessor-only feature symbols | 8 |
| Proof-limit symbols using `$10000` | 4 |
| Include-after-header violations | 77 |
| Forward-dependent emitted-statement symbol arithmetic sites | 0 |
| Current permanent-source blockers | 77 |
| Permanent Atom source readiness | Blocked |
| Compatibility-lowered Atom readiness | Ready |
| Compatibility-blocking issues | 0 |
| Permanent blocker: forward-dependent emitted-statement symbol arithmetic | 0 |
| Permanent blocker: include after header | 77 |
| Permanent blocker: feature definition after Atom entry header | 0 |
| Proof-manifest symbol mappings | 146 |
| One-past-address-space proof-limit mappings | 4 |
| Routine contract metadata mappings | 709 |
| Proof manifests classified | 29 |
| Atom permanent-ready proof manifests | 23 |
| Atom-preview-only proof manifests | 0 |
| Proof manifests blocked by overlapping proof memory | 3 |
| Proof manifests blocked by late emitted-content includes | 0 |
| Measurement-artifact proof manifests | 3 |

The source set is large enough that manual renaming without tooling is not credible.
Dot-local candidates are restricted to labels whose references stay within the
same global-label scope in the defining file. Labels used across a later global
label remain global abbreviations, even when they are proof-only, because Atom
evicts pending private-label references at the next global label.

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

Preview output uses generated comparison-safe symbol names. For strict
header-include source that is being prepared as permanent Atom source, select
the permanent abbreviation/local-label names explicitly:

```bash
npm run atom:migration:census -w nucleus -- \
  --translated-root build/nucleus-atom-permanent \
  --translated-symbols permanent
```

Do not use permanent symbols for flattened preview output. Flattening can split
inside private-label scopes, so it deliberately remains on generated preview
symbols.

Generated permanent Atom source hoists top-level feature definitions into the
entry definition header before `%INCLUDE`, `%IF`, `ORG`, labels, code, data, and
contract comments. The raw Nucleus source still reports those placements as
permanent-source blockers until the source files themselves are reorganized.
Proof-entry feature settings now live in explicit `*-config.asmi` files included
at the start of each proof source. `loop-parser.asm` now receives
`HybridLL1Full` from the including context instead of deriving it internally, and
the standalone runtime link context gets its default aggregate-call setting from
an explicit config include. Feature-definition placement is no longer a
permanent-source blocker.
The proof and target runtime wrappers now use the same config-header pattern for
`RuntimeProofServices`, removing their wrapper late includes while preserving
the existing permanent Atom runtime transforms.
The Stage 7 LL(1) parser coverage entry wrapper now carries its feature settings
in a config header as well, leaving only emitted-content section includes in the
remaining blocker set.
The Stage 7 LL(1) parser now owns its generated-table boundary explicitly:
`stage7-ll1-parser.asm` includes a core part, the generated grammar table, and a
table-end marker from its header. That removes the parser module's own late
include while keeping the existing core/table extent labels.
The typed-expression parser now follows the same section-owner pattern: its core
parser source and structured-control extension are header includes, while the
core file retains the permanent Atom alias lowering for its packed constants.
The aggregate-call parser uses selected owner files for its conditional Stage 7
extension: the base owner includes only the parser core, while the Stage 7 owner
includes the same core plus the LL(1) parser and action modules. Callers select
the required owner by filename instead of wrapping header includes in a
conditional block.
The array Z80 proof now uses the physical version of the generated section-owner
layout: the entry file is an ordered include list, and each measured region
boundary lives in an adjacent fragment. This preserves the assembled proof image
while removing the proof's late includes from the permanent-source blocker set.
The call Z80 proof now uses the same physical section-owner layout. Its
diagnostic offset checks use short aliases inside the proof-body fragment, so the
entry file remains an include-only owner and the permanent Atom path no longer
needs generated fragments for that proof.
The compiler-slice proof now uses the same physical layout. The owner includes
the compiler modules from the header, and the malformed-source size check uses a
short alias in the proof-body fragment.
The expression Z80 proof now uses the same physical layout. Its proof-body
fragment owns the short diagnostic-offset aliases for expression, duplicate,
unknown, malformed, and symbol-capacity cases.

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

It can also write the routine-contract map for the proof checker:

```bash
npm run atom:migration:census -w nucleus -- \
  --contract-map-out build/nucleus-atom-contracts.json
```

Current measurement: 709 `.ROUTINE` metadata lines are mapped to the following
routine label, and every entry has a target. Conditional contract variants stay
as separate entries for the same target label. Atom source represents the
contract line as `;@ROUTINE ...`; the assembler ignores it, and the host proof
tool consumes the generated contract map.

It can also write the proof selection matrix:

```bash
npm run atom:migration:census -w nucleus -- \
  --proof-matrix-out build/nucleus-atom-proof-matrix.json
```

Current measurement: 23 proof manifests are ready for permanent Atom-source
execution through the migration runner. Three dispatcher measurement manifests
remain measurement artifacts rather than proof-image migration targets. Three
large proof manifests are still excluded from permanent-ready execution because
their resident source blocks overlap the runtime/proof-output memory regions
used by the current harness configuration. The Stage 7 aggregate-call and
Stage 8 failure proofs, and the Stage 9 conformance proof now have
permanent-layout Atom source that assembles byte-identically with the legacy
unordered proof-output sink; their remaining blocker is only the known memory
overlap.

The proof harness accepts the generated metadata through
`runProofManifest(..., { atomMigration })`. That path builds a manifest-facing
symbol view over an Atom-style assembled symbol table: original proof names can
resolve through generated preview names or permanent Atom abbreviations, and the
known `$10000` proof-boundary constants are restored from the proof-limit map.
The current AZM proof route remains unchanged; this is the join point for
Atom-built proof images.

The target runtime link entry now also has a permanent Atom layout. Its entry
source owns the target-runtime feature definitions, includes the link context in
the header, then brackets the target runtime wrapper with generated section
parts. The translated `nucleus-target-runtime-link.asm` assembles
byte-identically with the current runtime link image.

It can also run a proof with Atom as the selected assembler when the caller
supplies an already translated Atom source tree:

```ts
await runProofManifest("proofs/memory-map-proof.json", {
  assembler: {
    kind: "atom-permanent",
    root: "build/nucleus-atom-permanent",
    entry: "vertical-slice/memory-map-proof.asm",
  },
  atomMigration: {
    proofSymbolMap,
    proofLimitMap,
  },
});
```

AZM remains the default assembler. The Atom mode is explicit because permanent
source requires strict leading includes and permanent symbol names; it is not
safe to infer those from the existing AZM source tree.

For integration work, prefer one consolidated bundle instead of several loose
files:

```bash
npm run atom:migration:census -w nucleus -- \
  --migration-bundle-out build/nucleus-atom-migration.json
```

The bundle uses schema `nucleus-atom-migration/v1` and contains the readiness
split, measurements, issue list, include report, long-symbol ledger,
proof-symbol map, proof-limit map, routine-contract map, and proof selection
matrix.

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

Run the executable Atom-preview proof gate with:

```bash
npm run atom:migration:proof-run -w nucleus
```

The dry-run intentionally reports two readiness states:

- permanent Atom source is still blocked while emitted-content includes remain
  after the header, while emitted statements still use two-symbol arithmetic
  before both symbols are defined, and while feature definitions would translate
  to `%DEFINE` outside Atom's entry definition header in the source tree; and
- compatibility-lowered Atom source is ready when those late includes are the
  only hard issues, because preview lowering can resolve existing symbol
  arithmetic from the comparison symbol table and consume feature definitions
  before Atom receives the generated preview source. Emitted arithmetic is not
  itself a blocker when it uses an index register, a numeric literal addend, or
  two symbols that are already defined at the statement that uses them; Atom can
  assemble those expressions in one pass.

Compatibility lowering is now the formal bridge for existing Nucleus proof
assembly. It preserves the current textual insertion points while producing
Atom-preview source for byte comparison. It is not the preferred shape for new
Nucleus assembly source.

### Atom expression policy

This census keeps Atom's expression model single-pass. Atom can assemble
emitted expressions such as `End-Start` when both labels have already been
defined at the statement that uses them. It can also assemble ordinary
single-symbol addends such as `Start+$05` and index displacements such as
`IX+Field` when the field constant is already known. It cannot patch a
forward-dependent two-symbol expression such as `Later-Start`, because the
pending patch record does not retain two unresolved symbol identities and an
operation. The migration tool therefore reports only forward-dependent emitted
two-symbol expressions as permanent-source blockers. Existing proof-preview
lowering may still resolve those expressions from the comparison symbol table,
but permanent source needs an explicit alias, a source rewrite, or an ordering
change.

`target-output.asm`, `loop-z80-sink.asm`, and `aggregate-call-parser.asm` now
carry the first source-level examples of that policy. Short aliases such as
`TOUTRNL`, `TOUTRUN`, `LZBKRO`, `LZTNUM`, and `ACPRLEN` name runtime-state
extents, target-state offsets, segmented output fields, and parser workspace
spans that were formerly written inline. They are AZM-compatible `EQU` aliases,
produce no bytes, and keep the permanent Atom transform from relying on hidden
rewrites for those repeated expressions.

The proof harness also has an explicit `atom-preview` assembler mode. That mode
uses the compatibility-lowered source produced by the migration tools, assembles
it with Atom, maps generated Atom symbols back to proof-manifest names, and then
runs the normal Debug80 proof observations and extent checks. This proves that
Atom can execute an existing proof image before the underlying source has become
permanent Atom source. It is deliberately separate from `atom-permanent`, which
only accepts a real translated Atom source tree and does not flatten late textual
includes.

## Remaining permanent-source blockers

The late emitted-content includes are not one uniform problem. Current measured
grouping:

| Batch | Files | Late includes | Risk | Recommendation |
| --- | ---: | ---: | --- | --- |
| Proof composition files | 9 | 71 | Medium | Source-layout blockers are cleared for several proof rows, including `stage7-ll1-aggregate-call-z80-slice-proof.asm`, `aggregate-z80-slice-proof.asm`, and `flat-target-z80-slice-proof.asm`; remaining proof entries should keep using the same section-owned include layout as they move from preview to permanent Atom source. |
| Module composition files | 2 | 6 | High | Second batch. These includes occur inside parser/codegen implementation modules (`loop-parser`, `typed-expression-z80`). Treat these as real module-boundary work, not mechanical line moves. |
| Runtime wrapper files | 1 | 1 | Low to medium | The target runtime link entry has a permanent Atom layout and byte-equivalence proof. The raw source still records one wrapper include until the permanent source tree replaces the current source tree. |

The first permanent-source batch should be the proof composition files, because
they account for most of the count and are structurally repetitive:

- `vertical-slice/stage7-parser-coverage-proof.asmi` — 10
- `vertical-slice/stage8-failure-z80-slice-proof.asm` — 10
- `vertical-slice/stage9-conformance-z80-slice-proof.asm` — 10
- `vertical-slice/structured-control-z80-slice-proof.asm` — 9
- `vertical-slice/typed-expression-z80-slice-proof.asm` — 9
- `vertical-slice/loop-z80-slice-proof.asm` — 8
- `vertical-slice/loop-compiler-slice-proof.asm` — 6
- `vertical-slice/z80-slice-proof.asm` — 6
- `vertical-slice/stage7-ll1-engine-proof.asm` — 2

Do not move those include lines to the top and assume correctness. Many of
the current files use surrounding labels such as `TokenizerCodeStart` /
`TokenizerCodeEnd` to measure the emitted size of the included module. A safe
permanent-source rewrite needs those extent symbols to remain byte-equivalent.
The proof-comparison command is the required guard after each batch.

The current safe convention is therefore:

1. keep compatibility lowering for existing proof-composition files until their
   section ownership has been made explicit;
2. allow permanent source to use header-only `%INCLUDE` only when dependency
   order does not affect placement, or when the included module owns its own
   `ORG` and extent labels; and
3. do not place feature `EQU` declarations before includes to control dependency
   bodies. Put shared build constants in an explicit constants source, or pass
   them through the host preprocessor environment, so include order has no hidden
   magic.

The first layout pilot applies that convention to `compiler-slice-proof`, and
the migration tool now records it as a named permanent-layout transform rather
than as ad hoc source rewriting. The transform writes a small generated
`compiler-slice-code-begin.asmi` source part that owns `ORG CompilerCoreBase`
and `CompilerCodeStart`. The root proof source then lists the compiler modules
as leading `%INCLUDE`s, so Atom's dependency-before-importer order emits the
modules before `CompilerCodeEnd`. The proof's
`MalformedSourceEnd-MalformedSource` emitted expression is rewritten as
`LD DE,MalformedSourceSize`, with the size equate resolved later. This keeps the
assembler source single-symbol at the patch site while preserving the exact
emitted bytes. The proof now runs from Atom-permanent source through the
permanent-ready Atom proof gate.

The second proof-composition transform applies the same model to
`z80-slice-proof`. That wrapper has two emitted regions, so the transform splits
the proof source into generated section parts: compiler code start, sink
boundary, post-sink immutable data, proof source text, runtime start, and proof
body. All includes then appear in the header of the rewritten root source while
the emitted order remains byte-equivalent. This proof now runs through the
permanent-ready Atom proof gate.

The third transform promotes `stage7-ll1-engine-proof`. It first makes the
generated Stage 7 grammar table Atom-friendly by replacing emitted
`LABEL-BASE` and `Token+$80` terms with named single-symbol constants whose
`EQU` definitions carry the arithmetic. The `stage7-ll1-parser.asm` translated
module then owns a generated parser-core part, the generated table include, and
a table-end part. The proof wrapper owns the measured front-end stubs and
proof-only action aliases as explicit section parts. This is the first
implementation-module late include converted under the permanent layout model.

The next implementation-module transform applies that same model to
`aggregate-call-parser.asm`. The translated module now owns a generated
`aggregate-call-parser-core.asmi` part, while the packed LL(1) parser and action
includes move into the rewritten root header under the original `Stage7LL1`
condition. The transform also gives the module's emitted descriptor offsets,
workspace span, and packed type/class constants short named aliases so permanent
Atom source emits one symbol per operand. `stage7-ll1-actions.asm` receives the
same treatment for its local packed constants. This clears those two files as
transitive blockers; the dependent proof manifests remain blocked by their own
entry-wrapper and other shared-module late includes.

The following low-risk source-module aliases clear two more transitive blockers:
`aggregate-parser.asm` now names its packed aggregate record-type mask, and
`aggregate-call-z80.asm` now names the target-state trap-offset displacement.
These are source-expression rewrites only; they do not split emitted sections or
change proof-manifest status by themselves.

`loop-z80-sink.asm` is handled the same way for the segmented-output and
target-state cluster. Permanent Atom source now names the generated read-only
backup offset, segment-entry base/limit expressions, indexed segment-table field
operands, and trap/run-state displacements. This removes that shared sink from
dependent proof blockers without changing the proof-entry wrappers that still
own their own late includes and source-position arithmetic.

The typed-expression shared modules now have the same expression-only treatment.
`typed-expression-parser.asm` names its packed symbol-class, semantic-operation,
and scalar-meta constants; `typed-expression-z80.asm` names its target-state
frame displacements; and `loop-keywords.asmi` names the packed Stage 8 service
signature flag combinations. The typed parser and backend modules then split
their terminal structured-control and aggregate-call includes into rewritten
root headers plus generated core/tail parts, preserving the original emitted
order while clearing those shared module-boundary blockers. Proof-entry wrappers
still own their separate late includes and source-position arithmetic.

A follow-up proof-wrapper pass applies the same single-symbol operand rule to
the smaller permanent-layout proof entries. `stage7-ll1-engine-proof.asm`,
`typed-expression-z80-slice-proof.asm`,
`stage9-conformance-z80-slice-proof.asm` now names its proof-stack boundary,
trap offsets, metadata constants, generated read-only-data offsets, and segment
field addresses before those values are emitted.

`stage7-ll1-aggregate-call-z80-slice-proof.asm` now uses the physical
section-owner layout. Its source fragment keeps the resident source fixtures,
its backup-source fragment owns the overflow fixtures placed at `BackupLimit`,
and its proof-body fragment owns the diagnostic offsets, generated read-only
data offsets, and segment-entry aliases used by the byte-equivalence proof.

`aggregate-z80-slice-proof.asm` now uses the physical section-owner layout too.
Its proof-body fragment owns the static-image length, aggregate field-table
probes, symbol-table probes, and diagnostic-offset aliases. The aliases make
each emitted operand a single short symbol while leaving the existing proof
layout and byte output unchanged.

`flat-target-z80-slice-proof.asm` now uses the same physical section-owner
layout as the other promoted proof entries. Its generated-base compatibility
fragment supplies the legacy `GeneratedBase` alias before `loop-z80-state.asmi`,
and its proof-body fragment owns the captured descriptor, context, and target
map aliases used by the flat target-output checks.

The two dispatcher offset measurement artifacts now name their page-local table
offsets with single-symbol aliases. This closes the
forward-dependent emitted-statement symbol arithmetic class across the measured
source set. Permanent source is still blocked by include/header placement, not
by emitted two-symbol operands.

Two previously Atom-preview-only proof manifests were promoted by replacing
direct emitted two-forward-symbol differences with one forward size symbol and a
later resolved size equate:

- `nobj-runner-proof.json` now emits `DW NobjAdapterSize`, with
  `NobjAdapterSize EQU NobjAdapterEnd-NobjAdapterLog` after the log.
- `source-provenance-proof.json` now emits `DW SourceProvenanceSize`, with
  `SourceProvenanceSize EQU SourceProvenanceEnd-SourceProvenanceLog` after the
  log.

This pattern keeps Atom's single-symbol forward patch format intact. Direct
emitted two-forward-symbol differences remain unsupported permanent Atom source;
preview lowering can still prove their bytes from the comparison symbol table.

## Directive census

| AZM directive | Measured count | Atom migration treatment |
| --- | ---: | --- |
| `.DB` | 2,797 | Mechanical: `DB` |
| `.DS` | 10 | Mechanical: `DS` |
| `.DW` | 358 | Mechanical: `DW` |
| `.EQU` | 1,246 | Mechanical: `EQU` |
| `.ORG` | 79 | Mechanical: `ORG` |
| `.END` | 13 | Preview translation omits terminal instances as `;@AZM-END`; every current instance has no source after it |
| `.INCLUDE` | 215 | Mechanical to Atom host include syntax; keep included files as source parts where possible |
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

Measured include directives: 215.

Unique include arguments detected: 41.

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
assembler receives bytes. The include header is deliberately simple: comments,
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
| `vertical-slice/stage7-parser-coverage-proof.asmi` | 10 | 13 |
| `vertical-slice/stage8-failure-z80-slice-proof.asm` | 10 | 13 |
| `vertical-slice/stage9-conformance-z80-slice-proof.asm` | 10 | 16 |
| `vertical-slice/structured-control-z80-slice-proof.asm` | 9 | 12 |

The largest current target groups show why this is not a safe blind move:

| Target include | Measured uses | Target class |
| --- | ---: | --- |
| `vertical-slice/source-adapter.asm` | 8 | code |
| `vertical-slice/loop-keywords.asmi` | 7 | data |
| `vertical-slice/loop-parser.asm` | 7 | mixed code/data |
| `vertical-slice/loop-semantic-sink.asm` | 7 | code |
| `vertical-slice/loop-symbols.asm` | 7 | code |
| `vertical-slice/loop-tokenizer.asm` | 7 | mixed code/data |
| `vertical-slice/loop-z80-sink.asm` | 6 | mixed code/data |
| `vertical-slice/proof-z80-runtime.asm` | 6 | code |

The first cleanup pass moved the state-layout includes into strict headers by
adding small proof-mode config includes for `SegmentedOutput`. That removed the
34 layout-only late includes without changing emitted bytes. The later
permanent-layout passes proved the large proof-composition entries and the
target runtime link entry by giving each inserted code or data section an
explicit generated owner. Remaining late includes that emit code or data need
the same section-ownership decision: either the module owns its own
`ORG`/section placement, or the compatibility lowering stage remains
responsible for preserving the current textual insertion point.

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
classifies 751 long labels as dot-local candidates. Those labels are defined
once, are not proof-public, are not referenced from another file, and all their
detected uses fall inside one surrounding global-label scope. The scope test
uses every definition of every surrounding global, including repeated
conditional definitions, because any emitted global label closes the current
Atom private-label scope.

The remaining 3,159 long symbols now have deterministic permanent global
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
original Nucleus identity while the assembler receives only short Atom-safe global
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

The 709 `.ROUTINE` lines are not assembler semantics. They are proof metadata.

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
| `.ROUTINE` | Mapped as proof metadata | Atom source uses `;@ROUTINE`; the generated contract map ties each contract to the target routine label |
| Long labels | Classified | 751 can become dot-local labels; the rest have generated permanent global abbreviations |
| Proof JSON symbol references | Mapped | The dry-run emits a proof-symbol map from existing proof names to preview and permanent Atom names |
| `$10000` limit constants | Mapped as proof metadata | Atom source lowers these to `EQU 0` plus `;@ATOM-PROOF-LIMIT`, and the proof-limit map carries `65536` |
| Leading grouped immediates | Mechanical | Current `LD rr,(A<<8)|B` forms translate safely to `LD rr,A<<8|B` for Atom |
| Resolved preview aliases and differences | Preview-only bridge | The proof comparer lowers `EQU` aliases and `SYMBOL-SYMBOL` terms only when the current assembler's resolved symbols prove the value |

## Required next implementation checks

Before converting source:

1. Keep extending the converter dry-run ledger and error report for any newly discovered unmapped construct.
2. Add tests for each newly discovered untranslatable directive, unresolved include, unsupported conditional expression, or long symbol that cannot be classified as local or global.
3. Feed an Atom-built proof image into `runProofManifest` using the migration
   metadata symbol view instead of only byte-comparing it externally.
4. Integrate the contract map into the strict register-contract proof path that
   consumes Atom-built images.
5. Expand permanent source conversion beyond the small memory-map proof pilot.
6. Keep emitted-content include lowering as a compatibility path for older proof
   assembly until those files are reorganized around explicit section ownership.

## Pilot results

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

The first permanent-source pilot also succeeds without flattened include
lowering:

| Entry | Include shape | Symbol mode | Result |
| --- | --- | --- | --- |
| `vertical-slice/memory-map-proof.asm` | Header `%INCLUDE` source parts | Permanent Atom names | Byte-identical |

That pilot exercises the intended permanent-source path: generated Atom source
files remain separate, the normal Atom host resolver follows the leading
`%INCLUDE`, and Atom assembles the entry byte-identically to the current
assembler path. It is deliberately small; emitted-content late includes remain
on the compatibility-lowered path until those proof sources are reorganized.

The same entry now also runs through the Nucleus proof harness with Atom selected
as the assembler. The proof harness executes the Atom-built HEX image and uses
the migration metadata to resolve manifest-facing symbol names and the
`$10000` proof boundary.

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
proof harness now also runs every non-measurement, non-overlapping-memory proof
manifest that has a permanent Atom layout. The remaining permanent-source work
is to remove the preview-only bridge from the source tree itself: section-owned
replacement for emitted-content include-after-header source, entry-header
placement for feature definitions, explicit aliases or source rewrites for
forward-dependent emitted-statement symbol arithmetic, and final curation of
human-facing permanent symbol names.

The migration should therefore start with tooling, not manual source edits.
