# Lanternfly project handover for an LLM

This document is the fastest route into the Lanternfly project. It records the
project's purpose, current state, design commitments, unresolved questions,
evidence base and repository map. Follow the reading order below before
changing the language design or starting implementation.

## Thirty-second orientation

Lanternfly is a small, statically typed, BASIC-like imperative language for
ordinary game logic and other straightforward low-level programs. Its first
use is expected to be replacing handwritten AZM assembly inside Glimmer bodies.
It is nevertheless independent of Glimmer and is intended to lower through
different backends to Z80 or other assembly languages, C and possibly selected
BASIC dialects.

Lanternfly is currently a documentation-only design project. There is no
parser, type checker, IR, interpreter, code generator, runtime or Glimmer
integration yet.

The central idea is:

```text
Glimmer owns reactive structure and hosting
                    |
                    v
        typed host manifest and bodies
                    |
                    v
              Lanternfly
                    |
                    v
      typed, target-neutral program/IR
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
      AZM/Z80       C         BASIC or
                              another CPU
```

Lanternfly has no keyword or special semantic for Glimmer state, pulses,
effects, renders, cards, bindings, displays or resources. Glimmer supplies
ordinary typed imports and retains responsibility for scheduling, dependency
tracking, wrappers and update epilogues.

The name **Lanternfly** now belongs to the language. The former Glimmer Book 2
game named Lanternfly has been renamed **Rushlight**. Do not reintroduce the old
game name when discussing evidence.

## Current repository state

The project lives at `packages/lanternfly` in the
[Debug80 monorepo](https://github.com/jhlagado/debug80).

At the time of this handover:

- `packages/lanternfly` is an uncommitted, untracked package in the local
  Debug80 worktree;
- the root `README.md` and `package-lock.json` contain uncommitted Lanternfly
  registration changes;
- the sibling `debug80-docs` repository contains the completed
  Lanternfly-to-Rushlight game rename;
- its current worktree contains the opening Lanternfly teaching book and its
  site integration;
- the npm package manifest uses the unqualified name `lanternfly`, is version
  `0.0.0` and remains private;
- no npm package has been published or reserved by this work;
- all content under this package is design and research material, not an
  implemented compiler.

Preserve these changes. Inspect `git status` in both repositories before
editing, rebasing or performing any cleanup.

## Fast reading route

### First 15 minutes

Read these files in order:

1. [Package overview](../README.md) for the short description and priorities.
2. [Language charter](charter.md) for the product boundary and design
   philosophy.
3. [Research record](research.md) for the evidence and empirical conclusions.
4. [Language stages and decisions](design-book/10-stages-and-decisions.md) for
   chosen, provisional, open and deferred points.

After this pass, an LLM should be able to explain why Lanternfly exists, what
belongs to Glimmer, why structured memory has priority over formal routines and
which rules must not be casually reopened.

### First hour

Continue with:

5. [Design book](design-book/index.md), especially:
   - [Language and boundaries](design-book/01-language-and-boundaries.md)
   - [Numbers, truth and expressions](design-book/02-numbers-and-expressions.md)
   - [Storage and addressing](design-book/03-storage-and-addressing.md)
   - [Control flow and routines](design-book/04-control-and-routines.md)
   - [Lowering and portability](design-book/06-lowering-and-portability.md)
   - [Hosting Lanternfly inside Glimmer](design-book/07-glimmer-hosting.md)
6. [Working language specification](specification.md) for the current semantic
   contract and grammar sketch.
7. [Lowering, backend and runtime contract](lowering-and-runtime.md) for the
   typed boundaries that a prototype should implement.

### Before changing a rule

Read the evidence dossier associated with that rule. The
[reading ledger](evidence/reading-ledger.md) records the complete source pass.
The most useful entry points are:

- [Glimmer book notes](evidence/glimmer-book-notes.md)
- [Glimmer corpus analysis](evidence/glimmer-corpus-analysis.md)
- [Corpus feature matrix](evidence/corpus-feature-matrix.md)
- [Generated output analysis](evidence/generated-output-analysis.md)
- [Glimmer integration analysis](evidence/glimmer-integration-analysis.md)
- [AZM and ZAX analysis](evidence/azm-zax-analysis.md)
- [AZM Book 3 and native game analysis](evidence/azm-book3-and-native-games.md)

## Authority of the documents

Use this order when two documents appear to differ:

1. The [working specification](specification.md) states current language
   meaning.
2. The [lowering contract](lowering-and-runtime.md) states compiler, host,
   backend and runtime responsibilities.
3. The [decision chapter](design-book/10-stages-and-decisions.md) states whether
   a point is chosen, provisional, open or deferred.
4. The rest of the [design book](design-book/index.md) explains rationale and
   examples.
5. The [research record](research.md) and [evidence](evidence/reading-ledger.md)
   explain where requirements came from. They are not a second specification.

The documents use three recurring status labels:

- **Direction:** accepted design direction.
- **Provisional:** the best current proposal, expected to be tested during a
  prototype.
- **Open:** a bounded question requiring evidence, an experiment or a user
  decision.

The specification also marks features as **Deferred**. Deferral is not a
promise that the feature will be added later.

## Core design commitments

### Language character

- BASIC-like, grammatical source without line numbers. Labels are reserved for
  cases where structured control does not provide a clear solution.
- Static types and declarations before local use.
- Structured `IF`, selection, counted loops and conditional loops.
- Source describes program meaning, not registers, flags or instruction forms.
- No Glimmer-specific vocabulary.
- Direct native/substrate code remains available through an explicit boundary.
- Formal routines are part of the direction but structured storage comes
  first.

### Integer and truth model

The chosen scalar integer types are:

| Type      | Width | Signedness |
| --------- | ----: | ---------- |
| `BYTE`    |     8 | unsigned   |
| `SBYTE`   |     8 | signed     |
| `INTEGER` |    16 | signed     |
| `WORD`    |    16 | unsigned   |
| `LONG`    |    32 | signed     |
| `DWORD`   |    32 | unsigned   |

Important numeric rules:

- byte-only addition, subtraction, division, remainder and comparison use a
  range-based common type of at least 16 bits;
- narrowing stores use defined low-bit truncation and normally warn;
- comparisons produce canonical all-bits-one truth;
- conditions accept any nonzero value;
- `AND`, `OR`, `XOR` and `NOT` form one eager numeric truth/bitwise family,
  closer to classic BASIC than C;
- shifts, integer division, remainder and integer power are language
  operations;
- integer square root is a visible standard operation rather than assumed CPU
  support;
- floating point is deferred and would be a target capability, not an initial
  requirement.

Three fixtures protect this model:

- Skyfall deliberately narrows a negative intermediate back into byte state;
- Rushlight and Sprite Chase require subtraction to widen before `ABS`;
- Tetro uses a genuine signed byte value of -3 while a piece enters the board.

Do not let C, BASIC or target-CPU arithmetic silently redefine these results.

### Storage and addressing model

- Arrays are fixed-size, zero-based, count-declared and row-major.
- Records and arrays have exact sizes with no semantic padding.
- Runtime indexing must multiply by the true stride, including values such as
  six-byte Pacmo records.
- Multidimensional paths are meaningful language constructs even if an early
  backend stages their address calculation.
- Static aggregate storage is the default.
- Scalar locals may own automatic storage.
- Aggregate local names are aliases to existing storage, not local aggregate
  copies.
- Aggregate parameters are typed references.
- References are typed and do not expose unrestricted pointer arithmetic.
- Bounded views or an explicit reference-and-count convention are still being
  designed for reusable algorithms.
- The initial language has no heap or garbage collector.

Address classes are semantic capabilities:

- a near reference is directly usable in the target's ordinary address
  context;
- a far reference may require bank, segment or other context;
- the physical representation is target-defined and need not always be 32
  bits;
- opaque device address spaces, such as TMS9918 VRAM, are not ordinary CPU
  pointers even when their numeric offsets fit in 16 bits.

### Control and routine model

- Structured control is primary; unrestricted `GOTO` is not enabled.
- `EXIT BODY` must transfer to the host epilogue. It must never become a direct
  machine return that bypasses Glimmer updates.
- Calls have one source form whether a backend lowers them inline, through a
  helper, through an ABI adapter or to a host-language function.
- User routines eventually support scalar value parameters, typed reference
  parameters, scalar/reference results and scalar locals.
- Aggregate automatic locals and implicit aggregate copies are excluded.
- Recursive call cycles are initially rejected on bare-metal profiles unless
  a profile explicitly supports and costs them.
- Evaluation order is part of the language contract, not left to a substrate.

### Libraries and native code

Lanternfly separates four layers:

1. core language semantics;
2. a small visible standard library;
3. target or platform services;
4. hidden runtime helpers selected by a backend.

A Z80 backend may need helpers for multiplication, division, power, square
root, 32-bit arithmetic, far access or complex indexing. A C backend may not
need those helpers. The source meaning remains identical and helpers link only
when used.

Randomness, display, input, sound, VRAM and firmware calls are platform
services, not core keywords. Native declarations and native blocks make the
substrate boundary visible and typed.

### Debugging and cost

Generated substrate source is a first-class artifact. A useful implementation
must preserve:

- Lanternfly source to generated-source provenance;
- generated-source to machine mapping where applicable;
- typed symbol and exact layout data;
- selected helpers and imports;
- target-qualified code-size, cycle and temporary-storage information when
  available.

When Glimmer hosts a body, its source map and Lanternfly's source map must be
composed. Backend or AZM diagnostics must map back to the responsible
Lanternfly construct.

## Implementation stages

The accepted staging is described fully in the
[decision chapter](design-book/10-stages-and-decisions.md).

### K0: hosted bodies

Parse, type-check and lower imported state, expressions, assignments, array
and record paths, structured control, imported calls, standard operations and
`EXIT BODY`. Emit AZM plus maps. K0 does not require user-declared parameters
or locals.

Target fixtures: Counter, Dot, Slide, Trail and ordinary Glimmer rule bodies.

### K1: structured storage

Add Lanternfly-owned static arrays and records, initializers, arrays of
references, scalar locals, local aliases, reference variables and broader path
lowering.

Target fixtures: central Tetro and Pacmo storage patterns.

### K2: routines

Add procedures, functions, value/reference parameters, results, definite
assignment, bounded aggregate views or an equivalent convention and ABI
adapters.

Target fixtures: Snake helpers, Tetro engine routines and Pacmo routines.

### K3: target breadth and far memory

Add far data and calls, bank/segment context, at least one additional CPU
backend, a C reference backend, a named BASIC experiment and cross-backend
conformance testing.

## Recommended first implementation

The current architecture recommends this order:

1. define the host manifest schema and backend-facing type descriptors;
2. implement a parser and type checker for K0;
3. implement the small typed IR described in the
   [lowering contract](lowering-and-runtime.md#4-suggested-lanternfly-ir);
4. build a typed IR interpreter as the semantic oracle;
5. lower scalar state and structured control to canonical AZM;
6. compose source maps and implement the Glimmer body epilogue;
7. add exact arrays, records and path lowering;
8. add the helper registry, cost-report skeleton, aliases and references;
9. add user routines only after storage paths and diagnostics are reliable;
10. use C and BASIC experiments to find assumptions that accidentally belong
    to the first backend rather than the language.

The interpreter should use arbitrary-precision host integers followed by
explicit Lanternfly width operations. Backends and the interpreter can then
run the same fixtures and compare storage plus service traces.

## Open and provisional work

Do not present these points as settled without an explicit decision:

- case-insensitive identifiers with spelling preservation;
- `REM` comment syntax;
- module, import and export syntax;
- read-only, output and in/out reference spelling;
- whether public references must state `NEAR` or `FAR`;
- one-line `IF` and `PASS`;
- source file extension;
- default warning severity for narrowing;
- native declaration syntax;
- local declaration placement;
- checked-array profile controls;
- minimal static string or string-view support;
- bounded aggregate view syntax;
- nominal fixed-width enums;
- scalar output parameter syntax;
- restricted labels;
- optional `FLOAT32` semantics.

The [working specification](specification.md#24-remaining-specification-decisions)
lists the points that block a frozen syntax edition. The
[decision chapter](design-book/10-stages-and-decisions.md#bounded-open-questions)
contains the broader experiments and evidence required.

## Evidence fixtures worth knowing

| Fixture         | Why it matters                                                                |
| --------------- | ----------------------------------------------------------------------------- |
| Counter and Dot | smallest hosted scalar bodies and platform calls                              |
| Slide           | imported curves and simple arithmetic                                         |
| Trail           | runtime indexing, records and rendering loops                                 |
| Skyfall         | intentional byte wrap and host updates                                        |
| Rushlight       | widened signed coordinate difference and TMS9918 services                     |
| Sprite Chase    | a second widened-subtraction fixture                                          |
| Snake           | fixed circular storage, masks, search and helper routines                     |
| Tetro           | signed spawn coordinates, references, aliases, early returns and exact planes |
| Pacmo           | packed rows, six-byte record stride, fixed candidates and service-heavy logic |
| AZM Book 3      | sorting, bounded strings, records, recursion and static pointer structures    |
| ZAX             | scalar locals, stack parameters, aggregate aliases and typed address lowering |

The [feature matrix](evidence/corpus-feature-matrix.md) connects individual
fixtures to language facilities and implementation stages.

## Source and repository map

### Lanternfly package

- [Package README](../README.md)
- [Documentation index](index.md)
- [Charter](charter.md)
- [Design book](design-book/index.md)
- [Specification](specification.md)
- [Lowering contract](lowering-and-runtime.md)
- [Research record](research.md)
- [Reading ledger](evidence/reading-ledger.md)

### Glimmer in the Debug80 monorepo

- [Glimmer package](../../glimmer/README.md)
- [Language overview](../../glimmer/docs/glimmer.md)
- [Grammar reference](../../glimmer/docs/reference/glim-grammar.md)
- [Compiler pipeline](../../glimmer/docs/codebase/02-compile-pipeline.md)
- [Examples](../../glimmer/examples/)
- [Historical corpus](../../glimmer/corpus/README.md)
- [Compiler source](../../glimmer/src/)
- [Tests](../../glimmer/test/)

The examples should be read in increasing order of language pressure:
Counter, Dot, Slide, Trail, Snake, Sprite Chase and Tetro.

### AZM in the Debug80 monorepo

- [AZM package](../../azm/README.md)
- [AZM declarations and routines](../../azm/docs/reference/azm-0.3-declarations-and-routines.md)
- [AZM grammar](../../azm/docs/reference/azm-grammar.md)
- [AZM compiler documentation](../../azm/docs/codebase/index.md)
- [AZM source](../../azm/src/)
- [AZM tests](../../azm/test/)

AZM is Lanternfly's first substrate, not its semantic model. Use AZM layouts,
ops, modules and strict routine contracts as backend facilities. Do not expose
Z80 registers or AZM instruction concerns in Lanternfly source.

### Teaching book and source books

The local sibling checkout is
[`debug80-docs`](../../../../debug80-docs/README.md), with:

- [Lanternfly Book 1](../../../../debug80-docs/lanternfly-book/book1/index.md)
- [Glimmer Book 1](../../../../debug80-docs/glimmer-book/book1/index.md)
- [Glimmer Book 2](../../../../debug80-docs/glimmer-book/book2/index.md)
- [Rushlight chapter](../../../../debug80-docs/glimmer-book/book2/04-building-rushlight.md)
- [Rushlight source](../../../../debug80-docs/public/glimmer-book/book2/code/rushlight.glim)
- [AZM Book 1](../../../../debug80-docs/azm-book/book1/index.md)
- [AZM Book 2](../../../../debug80-docs/azm-book/book2/index.md)
- [AZM Book 3](../../../../debug80-docs/azm-book/book3/index.md)

Public entry points are [the Glimmer books](https://debug80.com/glimmer-book/)
and [the AZM books](https://debug80.com/azm-book/). The source repository is
[jhlagado/debug80-docs](https://github.com/jhlagado/debug80-docs).

### ZAX

The local sibling checkout is [`ZAX`](../../../../ZAX/docs/README.md). Begin
with:

- [ZAX book](../../../../ZAX/docs/zax-book/index.md)
- [Functions and the IX frame](../../../../ZAX/docs/zax-book/part1/11-functions-and-the-ix-frame.md)
- [Arrays and loops](../../../../ZAX/docs/zax-book/part2/02-arrays-and-loops.md)
- [Records](../../../../ZAX/docs/zax-book/part2/05-records.md)
- [Addressing model](../../../../ZAX/docs/addressing-model.md)
- [ZAX specification](../../../../ZAX/docs/zax-spec.md)
- [Lowering documentation](../../../../ZAX/docs/zax-codebase/part5/10-lowering.md)

Repository baseline: commit
[`8b7d4a9f`](https://github.com/jhlagado/ZAX/tree/8b7d4a9f714196d5d1ed8fdda0a91e731a091251).
The later exact-size lowering exists at commit
[`e40b75a2`](https://github.com/jhlagado/ZAX/commit/e40b75a21edda2a039430d11f36e6ba6aada3afb).

ZAX is evidence, not a template to copy wholesale. Its later exact-size model
supports Lanternfly. Older power-of-two storage restrictions are historical
backend compromises and must not become Lanternfly semantics.

### Production TETRO and PACMO

The local sibling checkout is [`tetro`](../../../../tetro/README.md). Use:

- [Shared codebase guide](../../../../tetro/docs/shared-codebase.md)
- [TETRO guide](../../../../tetro/docs/tetro-codebase.md)
- [PACMO guide](../../../../tetro/docs/pacmo-codebase.md)
- [TETRO source](../../../../tetro/src/tetro/)
- [PACMO source](../../../../tetro/src/pacmo/)
- [Shared source](../../../../tetro/src/shared/)

Repository baseline: commit
[`53ef6e06`](https://github.com/jhlagado/tetro/tree/53ef6e0648a7a95a2a038a0f6f40ab94d8831a41).

Read production source in the inclusion order documented by each guide. Do not
mistake register preservation, flag protocols, address arithmetic or display
timing for game-state concepts that Lanternfly needs to expose.

## Baselines used by the design study

| Source                      | Baseline                                   |
| --------------------------- | ------------------------------------------ |
| Debug80 monorepo            | `b8a152010b005aa618e8c0de75f25faf76b4c653` |
| Glimmer package             | 0.6.2                                      |
| AZM package                 | 0.3.8                                      |
| Debug80 documentation       | `524bf2226bd4a4674273680d992781894ae68a3b` |
| ZAX current main            | `8b7d4a9f714196d5d1ed8fdda0a91e731a091251` |
| ZAX exact-size line         | `e40b75a21edda2a039430d11f36e6ba6aada3afb` |
| TETRO production repository | `53ef6e0648a7a95a2a038a0f6f40ab94d8831a41` |

Use the baselines when verifying an existing claim. If current source has
moved, record the new commit and distinguish changed evidence from the
original study rather than silently rewriting history.

## Working rules for another LLM

1. Read the charter, research record and decision chapter before proposing
   syntax.
2. Search the specification and evidence before treating a topic as open.
3. Keep Glimmer and Lanternfly responsibilities separate.
4. Derive facilities from real fixtures. Do not expand the language merely
   because another language has a familiar feature.
5. Preserve exact storage layouts and target-independent arithmetic meaning.
6. Treat generated source, source maps and cost visibility as product
   requirements rather than afterthoughts.
7. Mark a new statement as chosen, provisional, open or deferred.
8. When changing a chosen rule, name the fixture, backend conflict, foot gun or
   implementation evidence that justifies it.
9. Update the specification, design rationale, decision status and affected
   evidence together. Avoid letting one document become a competing spec.
10. Preserve unrelated worktree changes and never clean an untracked
    Lanternfly package without explicit authority.

## Validation

From the Debug80 repository root:

```sh
npx prettier --check \
  packages/lanternfly/README.md \
  packages/lanternfly/package.json \
  'packages/lanternfly/**/*.md'

npm run check:links
git diff --check
```

The repository link checker obtains Markdown files through `git ls-files`.
Until the Lanternfly package is tracked, it will not validate these new files.
Check new relative links directly or add the package to the index intentionally
before relying on that command's count.

For the Glimmer book rename, run from the sibling `debug80-docs` checkout:

```sh
npm run sidebar
npm run diagrams:glimmer
npm run links
npm run symbols
npm run diagrams:check
npm run build
```

At this handover point those documentation checks pass, the generated site has
no stale Lanternfly game references and Rushlight's 16-character LCD title is
`RUSHLIGHT` followed by seven spaces.

## Best next conversation

Before implementation, confirm whether the next goal is:

- freezing the nine syntax decisions that block a first edition;
- designing the host manifest and type descriptors;
- building the K0 parser and type checker;
- translating a focused fixture set into canonical Lanternfly;
- or creating the typed IR interpreter as a semantic oracle.

If no narrower goal is supplied, the most coherent implementation start is
the manifest/type-descriptor schema followed by a K0 parser and type checker.
That sequence tests the documented boundaries without prematurely committing
to Z80 code-generation details.
