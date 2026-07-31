# Lanternfly project handover for an LLM

This document is the fastest route into the Lanternfly project. It records the
project's purpose, current state, design commitments, unresolved questions,
evidence base and repository map. Follow the reading order below before
changing the language design or starting implementation.

## Thirty-second orientation

Lanternfly is a streamlined, statically typed structured BASIC for fixed-memory
game logic and other straightforward low-level programs. Its first
use is expected to be replacing handwritten AZM assembly inside Glimmer bodies.
It is nevertheless independent of Glimmer and is intended to lower through
different backends to Z80 or other assembly languages, C and possibly selected
BASIC dialects.

Lanternfly is currently a documentation-only design project. There is no
parser, type checker, IR, interpreter, code generator, runtime or Glimmer
integration yet. Specification 0.4 is now the implementation baseline, and the
[implementation plan](implementation-plan.md) defines the first coding change,
package seams, milestone gates and completion criteria.

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

- `packages/lanternfly` is tracked on `main` in the Debug80 monorepo;
- commit `3b31fe4` (`Rewrite Lanternfly as a structured BASIC`) is present on
  `origin/main`;
- the sibling `debug80-docs` repository contains the published Lanternfly
  teaching book and the completed Lanternfly-to-Rushlight game rename;
- the npm package manifest uses the unqualified name `lanternfly`, is version
  `0.0.0` and remains private;
- no npm package has been published or reserved by this work;
- all content under this package is specification, implementation planning,
  design and research material, not an implemented compiler.

Inspect `git status` in both repositories before editing, rebasing or
performing any cleanup.

## Latest completed work

Specification 0.4 rewrote Lanternfly around the agreed streamlined structured
BASIC model. The rewrite covered the specification, conformance contract,
charter, lowering notes, research record, decision chapter, package overview
and a new language-completeness review.

The implementation-readiness rewrite then:

- declared 0.4 as the coding baseline for K0 through K2;
- added a TypeScript package architecture and an exact M0 first change;
- separated development milestones from conformance claims;
- defined versioned host-manifest and target-profile schema responsibilities;
- split the front end into source, syntax, declaration, layout, type and effect
  passes;
- made the typed IR interpreter the semantic oracle before AZM optimisation;
- gave every milestone an executable acceptance gate;
- moved bounded views, parameter modes and floating point out of the K0 and K1
  critical path;
- replaced the stale `ReferenceValue` IR name with a compiler-only aggregate
  alias base.

A later first-edition decision added Pascal's ordinal model without adopting
Pascal's symbolic range syntax. Lanternfly now has nominal, explicitly sized
enums, nominal checked subranges and fixed arrays with ordinal index domains.
The words `to` and `until` retain their inclusive and exclusive meanings in
subrange declarations, array dimensions, `select` cases and counted loops.
This is part of the 0.4 implementation baseline rather than post-0.4 work.

The most important boundary concerns storage identity. Lanternfly source has
no general pointer or reference values. Programs keep persistent identity in
declared paths, multidimensional indices and ordinal selectors. Aggregate
parameters and local `alias` declarations provide temporary access to existing
aggregate storage. An alias denotes its record or array for field access,
indexing, copying and nested calls; the backend carrier has no source
expression and cannot be stored, returned, compared, converted or rebound.
First-class pointers are not listed as routine future work because adding them
would change the language's value model.

Aggregate storage class is written before a parameter name:

```lanternfly
export sub moveActor(near actor as Actor, deltaX as i16)
end

export sub showLabels(far labels as near cstring[8])
end
```

The second example keeps two distinct facts visible: `labels` names an array
in far storage, while each element is a `near cstring`.

The same rewrite settled the first-edition loop surface:

- `for index = first to last` includes `last`;
- `for index = first until boundary` excludes `boundary`;
- `for each item in items` traverses fixed arrays in row-major order;
- `while condition` covers conditional and indefinite loops, with
  `while true` as the indefinite form;
- `exit` leaves the nearest loop and never terminates the program;
- `continue` advances or retests the nearest loop.

Four complete read-only review rounds examined the specification and
conformance contract sentence by sentence under the human-writing rules. The
reviews found and repaired twelve issues involving alias semantics,
collection traversal, C-string lifetime and conversion, loop boundaries,
near/far parameter syntax, volatile controls and conformance coverage. The
fourth review returned `NO FINDINGS`.

An independent implementation-readiness audit after the Book 2 rewrite closed
the next set of cross-document gaps. It:

- removed `resource` as a namespace-facing manifest symbol kind while allowing
  scalar and immutable aggregate host constants;
- made manifest enums, subranges, records and ordinal arrays obey the ordinary
  source type and layout rules;
- defined manifest `near address` and `far address` constants as provider-bound
  runtime values: the host constant declares its type and contains one
  `ProviderAddressReference`, whose only field is the binding ID, while the
  target profile's `ProviderAddressBinding` owns the class, the closed
  `{ kind: "substrateSymbol", symbol }` or `{ kind: "bytes", bytes[] }`
  representation and optional `deviceSpaceId`; the address-class capability
  owns `validityContractId`, whose closed rule is `allBitPatterns`,
  `unsignedRange` or `maskedBytes`; validation resolves the binding and checks
  its class, width and representation, while zero-validity is derived by
  applying the rule to all-zero bytes and invalid omitted initialization uses
  `E-INIT-006`; source IR still has no opaque-address offset or load/store path;
- assigned malformed provider/rule union shape to `E-CONFIG-001`, well-shaped
  length, rule, ID, symbol, class and width errors to `E-CONFIG-002`, and a
  resolved value or service that fails its selected rule to `E-BOUNDARY-001`;
- closed manifest callables over scalar-value and aggregate-alias parameters,
  `hostSymbol` or `targetBinding` implementations, explicit ABI records,
  optional declared-or-conservative effects, all-target or profile-list
  availability, and optional target-owned callable cost metadata; omitted or
  explicit conservative effects emit `W-NATIVE-001`, while invalid pure
  declarations are rejected;
- defined the exact `externalBindings`, `callableAbiDefinitions`,
  `adapterDefinitions`, `runtimeComponents`, `faultBindings`,
  `substrateSymbolResolver`, `callableCostMetadata`, `addressBindings` and
  `addressValidityContracts` target registries and their closed records;
- validated literal provider bytes during configuration and gave provider
  substrate symbols configuration- or link-phase resolution to exact bytes
  before validity checking: unresolved provider symbols use `E-CONFIG-002`,
  resolved invalid values use `E-BOUNDARY-001`, and unresolved callable or
  external-binding symbols use `E-EXTERN-001`;
- preserved separate destination and source path evaluation in
  read-modify-write statements, including repeated written paths;
- admitted visible module and manifest enum members plus all five layout queries
  in constant expressions while excluding provider-bound opaque addresses;
- added a stable parser diagnostic, zero-statement block coverage and ordinary
  scalar volatile traces;
- fixed the exact C-string payload and terminator boundary without limiting a
  provider's containing storage region;
- carried enum/subrange validity through inline assembly and standardized the
  public `F-INVALID-BOOLEAN` fault.

Validation after the 0.4 rewrite and this handover update passes:

- Prettier on the changed Lanternfly files;
- `git diff --check`;
- the Debug80 Markdown link checker over 140 tracked Markdown files.

## Fast reading route

### First 15 minutes

Read these files in order:

1. [Package overview](../README.md) for the short description and priorities.
2. [Language charter](charter.md) for the product boundary and design
   philosophy.
3. [Research record](research.md) for the evidence and empirical conclusions.
4. [Language stages and decisions](design-book/10-stages-and-decisions.md) for
   chosen, provisional, open and deferred points.
5. [Implementation plan](implementation-plan.md) for the package layout,
   milestone gates and exact first coding change.

After this pass, an LLM should be able to explain why Lanternfly exists, what
belongs to Glimmer, why structured memory has priority over formal routines and
which rules must not be casually reopened.

### First hour

Continue with:

6. [Working language specification](specification.md) for the consolidated
   lowercase syntax and semantic contract.
7. [Conformance and diagnostics](conformance.md) for the required errors,
   warnings, faults and cross-backend fixtures.
8. [Language completeness review](language-completeness-review.md) for the
   BASIC/Pascal baseline and ranked follow-up work.
9. [Design book](design-book/index.md), especially:
   - [Language and boundaries](design-book/01-language-and-boundaries.md)
   - [Numbers, truth and expressions](design-book/02-numbers-and-expressions.md)
   - [Storage and addressing](design-book/03-storage-and-addressing.md)
   - [Control flow and routines](design-book/04-control-and-routines.md)
   - [Lowering and portability](design-book/06-lowering-and-portability.md)
   - [Hosting Lanternfly inside Glimmer](design-book/07-glimmer-hosting.md)
10. [Lowering, backend and runtime contract](lowering-and-runtime.md) for the
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

1. The [working specification](specification.md) states current source syntax
   and semantics.
2. The [conformance contract](conformance.md) states the minimum diagnostics,
   faults, fixtures and artifacts required for a conformance claim.
3. The [lowering contract](lowering-and-runtime.md) states compiler, host,
   backend and runtime responsibilities.
4. The [implementation plan](implementation-plan.md) states delivery order and
   milestone gates without changing source semantics.
5. The [decision chapter](design-book/10-stages-and-decisions.md) states whether
   a point is chosen, provisional, open or deferred.
6. The rest of the [design book](design-book/index.md) explains rationale and
   examples.
7. The [research record](research.md) and [evidence](evidence/reading-ledger.md)
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

- Streamlined structured BASIC source without line numbers. Labels are
  reserved for native assembly.
- Canonical lowercase keywords and built-in types, lower camel case value and
  routine names and Pascal case user-defined type names.
- `//` introduces a line comment, including after a statement.
- Static types and declarations before local use.
- `var` and `const` declarations with `as` type clauses.
- Nominal enums and subranges provide checked ordinal types without becoming
  runtime range objects.
- Character literals produce exact byte values. Static double-quoted text
  produces read-only NUL-terminated `cstring` values with near/far address
  classes.
- Structured `if`, `select`, inclusive `for ... to`, exclusive
  `for ... until`, `for each ... in` and `while`, closed by bare `end`.
  A structured block may contain zero statements without a placeholder word.
- `while true` supplies indefinite iteration. `exit` leaves only a loop;
  `continue` begins its next iteration and `return` leaves a routine or hosted
  body.
- Direct paths and indices are the normal identity model. Aggregate parameters
  and local aliases provide temporary storage access without first-class
  pointers, reference values or function values.
- Source describes program meaning, not registers, flags or instruction forms.
- No Glimmer-specific vocabulary.
- Direct native/substrate code remains available through an explicit boundary.
- `asm`/`end` passes raw target assembly through an assembly-source backend,
  with conservative effects and source mapping.
- Formal routines are part of the direction but structured storage comes
  first.

### Integer and truth model

The current scalar integer spellings are:

| Type  | Width | Signedness |
| ----- | ----: | ---------- |
| `u8`  |     8 | unsigned   |
| `i8`  |     8 | signed     |
| `u16` |    16 | unsigned   |
| `i16` |    16 | signed     |
| `u32` |    32 | unsigned   |
| `i32` |    32 | signed     |

Important numeric rules:

- integer arithmetic has target-independent result and narrowing rules;
- a narrower operand may widen implicitly to a value-preserving type already
  present on the other side;
- the compiler never invents a third common type, so `u8 + i8` and
  `i16 + u16` still require an explicit conversion;
- comparisons produce `boolean`;
- `boolean` is exactly one byte with canonical stored values zero and one;
- conditions require `boolean`;
- `and`, `or`, `xor` and `not` form one type-directed Boolean/bitwise family;
- Boolean `and` and `or` short-circuit;
- narrowing destinations use defined low-bit truncation and normally warn;
- same-type arithmetic stored, passed or returned at its original width uses
  the round-trip exemption and does not warn;
- shifts, integer division, remainder and integer power are language
  operations;
- integer square root is a visible standard operation rather than assumed CPU
  support;
- `size`, `count`, `lower`, `upper` and `offset` expose exact compile-time
  layout and index domains without pointer arithmetic;
- `fill` and `clear` provide typed repeated aggregate stores;
- floating point is deferred and would be a target capability, not an initial
  requirement.

Three fixtures protect this model:

- Skyfall deliberately narrows a negative intermediate back into byte state;
- Rushlight and Sprite Chase require subtraction to widen before `abs`;
- Tetro uses a genuine signed byte value of -3 while a piece enters the board.

Do not let C, BASIC or target-CPU arithmetic silently redefine these results.

### Storage and addressing model

- Arrays are fixed-size and row-major, with compile-time ordinal index domains.
  A count is shorthand for a zero-based exclusive domain; explicit `to` and
  `until` bounds, named subranges and enums provide the other forms.
- Records and arrays have exact sizes with no semantic padding.
- Runtime indexing must multiply by the true stride, including values such as
  six-byte Pacmo records.
- Equal fixed arrays and records are assignable values and copy their complete
  fixed-size contents.
- Aggregate `const` declarations provide immutable tables and maps.
- `at` places static storage or constant data at a target address.
- `volatile` preserves every observable memory-mapped read and write.
- Multidimensional paths are meaningful language constructs even if an early
  backend stages their address calculation.
- Static aggregate storage is the default.
- Scalar locals may own automatic storage.
- Aggregate local names are explicit aliases to existing storage, not local
  aggregate allocations.
- Aggregate parameters alias existing typed storage.
- An alias name denotes its aggregate for copying and access. Its hidden
  carrier has no source expression, and Lanternfly exposes no first-class
  storage reference or pointer type.
- Bounded aggregate views are still being designed for reusable algorithms.
- The initial language has no heap or garbage collector.

Address classes are semantic capabilities:

- a near aggregate alias is directly usable in the target's ordinary storage
  context;
- a far aggregate alias may require bank, segment or other context;
- the physical representation is target-defined and need not always be 32
  bits;
- source-visible opaque values have only the `near address` and `far address`
  types;
- a device-space identity such as TMS9918 VRAM is target metadata on a binding
  or service contract, not a nominal source type or permission to derive,
  offset or dereference storage.

### Control and routine model

- Structured control is primary; unrestricted `GOTO` is not enabled.
- `for ... to` is inclusive, `for ... until` is exclusive, `for each ... in`
  traverses fixed arrays and `while true` covers indefinite iteration.
- `exit` is loop-only. Bare hosted `return` transfers to the host epilogue and
  must never become a direct machine return that bypasses host updates.
- Every routine uses `sub`; an optional trailing result type replaces a
  separate `function` declaration.
- Parentheses identify invocation. There is no `call` keyword.
- General expression statements are legal and discard their final values.
- User routines eventually support scalar value parameters, aggregate aliases,
  optional results and scalar locals.
- Aggregate automatic locals remain excluded.
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

`extern sub` declares a typed target routine without a Lanternfly body. `at`
binds an absolute routine address, `from` names a substrate symbol and an
unqualified declaration delegates binding to the target profile. The profile
also supplies the native ABI, effects and clobber contract.

The first raw boundary is `asm`/`end`. It accepts module-level directives/data
and statement-level assembly for the selected assembler, and emits either
payload verbatim. A statement-level block acts as a conservative compiler
barrier; a module-level block has no execution point or runtime effect summary.
Non-assembly backends reject either form unless their profile supplies an
assembly-fragment pipeline.

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

Parse the complete 0.4 grammar, then type-check and lower imported state,
expressions, assignments, array and record paths, structured control, imported
calls, standard operations and hosted `return`. Pass through inline `asm`,
emit AZM plus maps and preserve assembler diagnostics at original source
lines. K0 does not yet implement user-declared parameters or locals.

Target fixtures: Counter, Dot, Slide, Trail and ordinary Glimmer rule bodies.

### K1: structured storage

Add Lanternfly-owned static arrays and records, initializers,
module imports and visibility, multidimensional arrays, ordinal selectors,
hosted-body scalar locals, hosted-body local aliases and broader path lowering.

Target fixtures: central Tetro and Pacmo storage patterns.

### K2: routines

Add parameterised subs, optional scalar results, scalar-value and
aggregate-alias parameters, source-routine scalar locals, external bindings,
standalone entry validation and ABI adapters. Bounded aggregate views and
parameter modes remain post-0.4 design work and do not block this stage.

Target fixtures: Snake helpers, Tetro engine routines and Pacmo routines.

### K3: target breadth and far memory

Add far data and calls, bank/segment context, at least one additional CPU
backend, a C semantic backend, a named BASIC experiment and cross-backend
conformance testing.

## Recommended first implementation

The [implementation plan](implementation-plan.md) defines the complete route.
Begin with M0 only:

1. convert the private package to the TypeScript, Vitest, ESLint and Prettier
   conventions used by AZM and Glimmer;
2. add stable source-span and diagnostic types;
3. add versioned host-manifest and target-profile JSON Schemas;
4. add schema and semantic validation;
5. accept one valid empty hosted body and reject focused invalid requests;
6. return the abstract host epilogue, source identity and an empty effect
   summary;
7. add build, typecheck, lint, test and format scripts.

M0 establishes the compiler boundary before parser, IR or backend choices can
leak into it. M1 parses the complete 0.4 grammar. M2 type-checks K0, M3 adds the
IR interpreter, M4 completes the AZM vertical slice, M5 adds K1 storage and M6
adds user routines.

Translate the AZM Book 3 programs alongside these stages. Each translation
should run against the same expected result as its AZM source, turning the
algorithms book into a conformance corpus rather than a separate documentation
exercise.

The interpreter should use arbitrary-precision host integers followed by
explicit Lanternfly width operations. Backends and the interpreter can then
run the same fixtures and compare storage plus service traces.

## Open and provisional work

Do not present these points as settled without an explicit decision:

- read-only, output and in/out aggregate-parameter spelling;
- one-line `if`;
- source file extension;
- source syntax for narrowing an external routine's effect contract;
- syntax for an explicitly unsafe, nonconforming unchecked-array mode;
- read-only bounded views and writable text-buffer support — a concrete
  counted-string design (`string[N]` with capacity-derived header width,
  sealed representation and a compatibility terminator) awaits ratification
  in the
  [language completeness review](language-completeness-review.md#provisional-proposal-counted-strings-with-a-compatibility-terminator),
  along with the open `cstring`-versus-`zstring` naming decision for the
  read-only view;
- bounded aggregate view syntax;
- scalar output parameter syntax;
- restricted labels;
- optional `float32` semantics.

The [working specification](specification.md#16-decisions-to-revisit) records
the remaining source-level questions. The
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
| Tetro           | signed spawn coordinates, selectors, aliases, early returns and exact planes  |
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
10. Preserve unrelated worktree changes and never remove Lanternfly material
    without explicit authority.

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
Check a new untracked document directly or stage it before relying on that
command's count.

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

## Next coding session

The next session should implement M0 from the implementation plan. It should
not start the parser, typed IR or AZM emitter in the same change. M0 is complete
when package checks pass, the two versioned boundary schemas are executable,
an empty hosted-body request returns stable identity and epilogue metadata, and
focused malformed requests report stable configuration diagnostics.

## Paste-ready session prompt

The following prompt gives another LLM enough context to begin without
repeating the design study:

```text
Work on the Lanternfly language in the Debug80 monorepo.

Repository:
  /Users/johnhardy/projects/debug80

Begin by reading this handover in full:
  packages/lanternfly/docs/handover.md

Then follow its fast reading route. Treat these documents as authoritative in
this order:
  1. packages/lanternfly/docs/specification.md
  2. packages/lanternfly/docs/conformance.md
  3. packages/lanternfly/docs/lowering-and-runtime.md
  4. packages/lanternfly/docs/design-book/10-stages-and-decisions.md

The current language checkpoint began with specification 0.4 at commit
3b31fe4. The package is now ready for M0 from
packages/lanternfly/docs/implementation-plan.md.
Lanternfly is a streamlined, statically typed structured BASIC for fixed-memory
systems. It is independent of Glimmer even though Glimmer bodies are its first
expected use.

Preserve the storage model. Lanternfly has no source-level pointer or reference
values, address-of operation, dereference operation, function values or
closures. Persistent identity uses declared paths, multidimensional indexing
and ordinal selectors. Aggregate parameters and local aliases are temporary,
non-escaping names for existing aggregate storage. Their hidden backend
carriers are not source values. Do not reintroduce REF syntax, pointer
arithmetic, reference variables or arrays of pointers.

The first edition includes nominal enums, checked subranges and fixed arrays
with ordinal index domains. `to` is inclusive and `until` is exclusive in
subrange declarations, array dimensions, selection and counted loops. Ranges
are type and grammar forms, not runtime values.

The current loop vocabulary is inclusive `for ... to`, exclusive
`for ... until`, `for each ... in`, `while`, loop-only `exit`, and `continue`.
`while true` is the indefinite loop. There is no bare `loop`, `do`, `repeat`,
`break`, `call`, separate `function` declaration or general `goto`.

Implement M0 only: TypeScript package scaffolding, shared source-span and
diagnostic types, versioned host-manifest and target-profile schemas, their
validators, and the empty hosted-body request/result. Do not start the parser,
IR, interpreter, runtime or AZM emitter in the same change.

Preserve existing user changes. Work on main, run package and repository
checks, commit significant work, and push it.

Before making changes, report the current Git status and confirm that the
bounded task is M0. Stop and report the discrepancy if the implementation plan
or authoritative contracts no longer match this handover.
```
