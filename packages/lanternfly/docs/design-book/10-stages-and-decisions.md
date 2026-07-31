# Language stages and decisions

> [!IMPORTANT]
> This chapter records the implementation staging behind
> [the 0.4 specification](../specification.md). The specification governs
> whenever an example here omits a semantic detail.

Specification 0.4 is the implementation baseline. The stages below divide the
compiler into useful slices; they do not define smaller language editions or
permit a stage to reinterpret a construct assigned to later work. Detailed
delivery gates are in the [implementation plan](../implementation-plan.md).

## Stage K0: hosted bodies

K0 establishes the complete front end and the first hosted vertical slice. It
replaces straightforward assembly inside an existing Glimmer body.

Required:

- versioned host-manifest and target-profile validation;
- complete 0.4 parsing, including syntax assigned to later semantic stages;
- imported scalar and aggregate declarations;
- the six integer types;
- byte-valued character literals and static C-string literals;
- literals, conversions and pure expressions;
- assignment;
- fixed array indexing and record fields;
- one- and two-dimensional paths in the language model;
- `if`, `select`, `for ... to`, `for ... until`, `for each ... in` and
  `while`;
- imported procedure and pure-function calls;
- scalar compiler temporaries;
- hosted `return`;
- standard scalar functions and `FILL`/`COPY`;
- generated AZM and composed source maps;
- direct AZM bodies beside Lanternfly.

K0 may report an implementation-stage diagnostic for user-defined routines,
owned module storage, or local declarations while those later stages are under
construction. Such a build cannot yet claim a conforming 0.4 front end.
Compiler temporaries remain internal.

K0 is enough for Counter, Dot, Slide, Trail and most rule bodies.

## Stage K1: structured storage

K1 makes the native game engines readable:

- Lanternfly-owned static arrays and records;
- exact initializers;
- startup initialisation effects;
- module imports, visibility, and deterministic installation;
- multidimensional arrays and integer selectors;
- local scalar `var`;
- local aggregate `alias`;
- near and far aggregate parameters in imported interfaces;
- explicit address-space types;
- broader path lowering.

K1 covers the central Tetro and Pacmo memory patterns even before user-defined
routines are mature.

## Stage K2: routines

K2 adds:

- one `sub` form with an optional result;
- scalar value parameters;
- aggregate alias parameters;
- scalar return;
- definite assignment;
- early return;
- external routine bindings and standalone entry validation;
- target ABI description and adapters;
- non-recursive call graph by default.

This moves Snake helpers, the Tetro engine and Pacmo routines into Lanternfly.

Formal arguments are lower priority than structured memory, but they are not a
different language direction. K0/K1 deliberately reserve the syntax and type
rules needed by K2.

Bounded aggregate views and scalar output/in/out parameter contracts remain
post-0.4 design work. The initial routine ABI proceeds with scalar value
parameters, optional scalar results, and exact-shape aggregate aliases.

## Stage K3: far memory and target breadth

K3 makes the portability promise substantial:

- far aggregate access and far calls;
- bank/segment context rules;
- 6502 and/or 8086 backend;
- C semantic backend;
- one named BASIC dialect experiment;
- cross-backend conformance suite;
- cost comparison.

Near/far types are specified before K3 so storage interfaces do not need a
breaking redesign.

## Deferred exploration

The following have no first-corpus requirement:

- floating point;
- recursion on bare-metal targets;
- aggregate returns;
- dynamic allocation;
- strings as a rich runtime type;
- packed bit fields;
- arrays spanning memory banks;
- indirect calls, procedure values and closures;
- exceptions;
- user-defined operator overloading;
- generic types.

Deferral is not a promise to add them.

First-class references and pointers are not merely deferred conveniences.
Lanternfly deliberately keeps them out of its source value model. Direct
paths, integer indices, multidimensional arrays and non-escaping aggregate
aliases are the intended alternatives. Adding pointer values later would
change that philosophy rather than complete an unfinished first-edition
feature.

## Chosen decisions

The current book chooses:

1. Lanternfly is independent of Glimmer.
2. Glimmer-specific operations do not become Lanternfly keywords.
3. Lanternfly is a streamlined structured BASIC with fixed-width static types.
4. Variables must be declared.
5. Integer types state width and signedness explicitly from `u8` through
   `i32`.
6. Operator-specific result rules preserve useful byte ranges and never
   inherit promotion from the backend language.
7. Fixed-width stores narrow by defined low-bit truncation, with diagnostics.
8. Comparisons produce one-byte `boolean` values, and conditions require
   `boolean`.
9. `and`, `or`, `xor` and `not` form one type-directed family. Boolean `and`
   and `or` short-circuit; integer uses combine bits.
10. Arrays are zero-based, count-declared and row-major.
11. Records and arrays have exact sizes with no hidden padding.
12. Static aggregates are the default.
13. Aggregate local names alias existing storage; they do not allocate copies.
14. Direct paths and integer indices are the persistent identity model.
    Aggregate parameters and local aliases are temporary names, not values.
15. Near, far and device addresses are distinct capabilities.
16. Two dynamic indices are meaningful source even if an early backend asks
    for staging.
17. Structured control is primary; line numbers do not exist.
18. `exit` is loop-only; hosted `return` preserves the host epilogue.
19. Inclusive `for ... to`, exclusive `for ... until`, `for each ... in` and
    `while` cover the first-edition loop model. `while true` replaces a bare
    indefinite loop.
20. Calls are source-uniform whether lowered inline, natively or through a
    helper.
21. Runtime helpers link on demand.
22. Generated substrate source and composed mappings are first-class artifacts.

These decisions form the 0.4 implementation baseline.

## Provisional decisions

The implementation follows these 0.4 rules and keeps focused tests around
them. Experience may justify a later specification change:

- source is case-insensitive while preserving declaration spelling;
- comments begin with `//`;
- `var name as Type` is the declaration form;
- bare `end` closes structured blocks;
- one bracket supplies every index of a multidimensional array;
- `^` is integer power;
- overshifts return defined zero/sign-fill results;
- runtime narrowing warns but compiles;
- routine arguments evaluate left to right;
- recursive call cycles are rejected by initial bare-metal profiles;
- recursion-capable profiles report frame size and bounded maximum stack use;
- native blocks conservatively read and write visible memory unless annotated.

Syntax prototypes and parser ergonomics can still improve these without
changing the semantic model.

## Bounded open questions

### Ratifying case and naming

Working choice: case-insensitive identifiers with preserved spelling.

Evidence needed before ratification: collisions in imported AZM/Glimmer
symbols and experience with generated C/BASIC. Case-sensitive lookup remains
the fallback if interoperation exposes material collisions.

### Ratifying narrowing diagnostics

Working choice: warning by default; explicit conversion or proof of range
suppresses it.

Evidence needed before ratification: translate all corpus stores and count
intentional versus provably safe narrowing. The semantic result is already
fixed; only default diagnostic severity remains open.

### Ratifying local declaration placement

Working choice: declarations may occur at the start of any block, before its
executable statements.

Evidence needed before ratification: complete Tetro and Pacmo translations and
measure whether this restriction causes artificial blocks or hoisted
temporaries.

### Public aggregate-storage qualification

Exported aggregate parameters state `near` or `far`. Private unqualified
aggregate parameters use the target profile's default storage class.

Evidence from Z80, banked targets and C will test whether this rule remains
practical.

### Exposing checked array mode

Working choice: a compiler/profile mode, not a distinct source type.

Evidence needed before ratification: emulator debugging and cost. Constant
checks remain unconditional.

### String boundary closed in 0.4

The 0.4 specification chooses byte-valued character literals and `cstr`, a
non-null, read-only near/far view of NUL-terminated static bytes. AZM `.cstr`
data and existing firmware text routines use the same representation.

Writable strings remain part of the bounded-view question because a
terminator does not state destination capacity.

### Bounded aggregate views

Working requirement: reusable algorithms must accept a bounded region of
existing aggregate storage without allocation.

Open design: add a view type whose internal address carrier remains
inaccessible to source code. The insertion-sort, bounded-string and PACMO
candidate scans are the decision fixtures. Exact-shape aggregate aliases
remain available.

### Named scalar sets

Working choice: constants remain sufficient for the first storage prototype.

Open design: add nominal, explicitly sized enums for directions, states and
selectors. The experiment must show useful type errors and exhaustive
selection without changing packed layout or complicating numeric conversion.

### Parameter intent and scalar outputs

Aggregate parameters already alias caller storage. The remaining design has
two parts:

- whether source interfaces distinguish read-only, output and in/out access;
- whether a scalar output uses an alias-like parameter mode or an ordinary
  returned value.

The ring buffer and production search routines provide concrete fixtures.

### User labels

Decision: omit `GOTO`, admit a restricted local form, or provide a lower-level
structured state construct.

Evidence needed: a real algorithm that becomes worse without it. No current
game body requires one.

### Floating point

Decision: optional `FLOAT32` capability and exact semantics.

Evidence needed: a game or platform calculation that fixed integers cannot
reasonably express, plus code-size measurements. It is not part of initial
implementation.

## Questions closed by the corpus

Several issues no longer need to remain vague.

- Signed 8-bit storage is required by Tetro's -3 spawn row.
- Unsigned integers remain required for bytes, word masks and full 16-bit
  ranges.
- `AND`, `OR` and `NOT` are needed for both conditions and masks.
- `XOR` is useful for toggles and masks.
- shifts are core operations.
- `/` and `MOD` semantics must be defined even when constant cases optimize.
- fixed arrays and records are central.
- local aggregate aliases and runtime selection among fixed aggregates are
  real requirements; multidimensional arrays and integer selectors cover the
  current pointer tables.
- exact non-power-of-two record indexing occurs in Pacmo.
- two-dimensional indexing occurs in generated resources and video buffers.
- a heap is not required.
- reusable algorithms need a bounded aggregate parameter convention.
- scalar output parameter modes may carry secondary results without tuple
  returns, but their syntax is not settled.
- device addresses cannot be modelled as ordinary CPU pointers.
- early hosted return must preserve Glimmer's update epilogue.

## Implementation order

The first compiler proceeds:

1. define source identity, diagnostics, host-manifest and target-profile
   schemas;
2. parse the complete 0.4 grammar;
3. type-check the K0 hosted subset without generating code;
4. define and interpret the typed control-flow IR;
5. generate canonical AZM and compose explicit maps;
6. execute differential fixtures against the interpreter and existing
   examples;
7. add exact records, arrays, startup effects and path lowering;
8. translate one Tetro routine and one Pacmo routine;
9. add user routines after storage paths and diagnostics are reliable;
10. attempt C and BASIC lowering to expose substrate assumptions.

The first coding change is limited to the boundary: TypeScript package
scaffolding, shared source and diagnostic types, versioned schemas, and an
empty hosted-body result. The implementation plan defines the acceptance gate
for every later milestone.

## Criteria for changing a chosen rule

A chosen rule changes only when:

- a real corpus program cannot be expressed faithfully;
- two backends cannot implement it without contradictory meaning;
- a simple source example exposes a serious foot gun;
- an implementation experiment produces compelling cost or complexity
  evidence;
- the replacement is stated with migration consequences.

Personal familiarity with another language is not enough. Lanternfly is small enough
that each exception becomes a noticeable part of the language.
