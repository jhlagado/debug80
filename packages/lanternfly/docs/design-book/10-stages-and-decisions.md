# Language stages and decisions

Lanternfly should become useful in slices. The first slice must already have a stable
meaning; later slices add source power without redefining old programs.

## Stage K0: hosted bodies

K0 replaces straightforward assembly inside an existing Glimmer body.

Required:

- imported scalar and aggregate declarations;
- the six integer types;
- literals, conversions and pure expressions;
- assignment;
- fixed array indexing and record fields;
- one- and two-dimensional paths in the language model;
- `IF`, `SELECT CASE`, `FOR`, `WHILE`, post-test `DO`;
- imported procedure and pure-function calls;
- scalar compiler temporaries;
- `EXIT BODY`;
- standard scalar functions and `FILL`/`COPY`;
- generated AZM and composed source maps;
- direct AZM bodies beside Lanternfly.

K0 need not expose user-declared parameters or locals. The compiler still uses
internal temporaries to lower expressions. Larger algorithms may use static
scratch declared by the host.

K0 is enough for Counter, Dot, Slide, Trail and most rule bodies.

## Stage K1: structured storage

K1 makes the native game engines readable:

- Lanternfly-owned static arrays and records;
- exact initializers;
- arrays of references;
- local scalar `DIM`;
- local `ALIAS`;
- near reference variables;
- reference parameters in imported interfaces;
- explicit address-space types;
- broader path lowering.

K1 covers the central Tetro and Pacmo memory patterns even before user-defined
routines are mature.

## Stage K2: routines

K2 adds:

- `SUB` and `FUNCTION`;
- scalar value parameters;
- reference parameters;
- scalar/reference return;
- definite assignment;
- early return;
- target ABI description and adapters;
- non-recursive call graph by default;
- bounded aggregate views or an explicit reference-and-count equivalent;
- scalar output and in/out parameter contracts.

This moves Snake helpers, the Tetro engine and Pacmo routines into Lanternfly.

Formal arguments are lower priority than structured memory, but they are not a
different language direction. K0/K1 deliberately reserve the syntax and type
rules needed by K2.

## Stage K3: far memory and target breadth

K3 makes the portability promise substantial:

- far data references;
- far calls and procedure references;
- bank/segment context rules;
- 6502 and/or 8086 backend;
- C reference backend;
- one named BASIC dialect experiment;
- cross-backend conformance suite;
- cost comparison.

Near/far types are specified before K3 so storage interfaces do not need a
breaking redesign.

## Deferred exploration

The following have no first-corpus requirement:

- floating point;
- recursion on bare-metal targets;
- aggregate returns and copies;
- nullable references;
- dynamic allocation;
- strings as a rich runtime type;
- packed bit fields;
- arrays spanning memory banks;
- indirect procedure calls;
- exceptions;
- user-defined operator overloading;
- generic types.

Nullable references remain deferred, but Book 3 shows that they can support
statically allocated linked structures without introducing a heap.

Deferral is not a promise to add them.

## Chosen decisions

The current book chooses:

1. Lanternfly is independent of Glimmer.
2. Glimmer-specific operations do not become Lanternfly keywords.
3. Source style is BASIC-like and statically typed.
4. Variables must be declared.
5. `INTEGER` is signed 16-bit; compact signed and unsigned variants are
   explicit.
6. Addition, subtraction, division, remainder and comparison use a range-based
   common type of at least 16 bits; multiplication, masks and shifts have
   width-specific rules.
7. Fixed-width stores narrow by defined low-bit truncation, with diagnostics.
8. Comparisons produce canonical all-bits-one truth and conditions accept any
   nonzero value.
9. `AND`, `OR`, `XOR` and `NOT` are one eager binary/Boolean family.
10. Arrays are zero-based, count-declared and row-major.
11. Records and arrays have exact sizes with no hidden padding.
12. Static aggregates are the default.
13. Aggregate local names alias existing storage; they do not allocate copies.
14. References are typed and do not expose general pointer arithmetic.
15. Near, far and device addresses are distinct capabilities.
16. Two dynamic indices are meaningful source even if an early backend asks
    for staging.
17. Structured control is primary; line numbers do not exist.
18. `EXIT BODY` preserves a host epilogue.
19. Calls are source-uniform whether lowered inline, natively or through a
    helper.
20. Runtime helpers link on demand.
21. Generated substrate source and composed mappings are first-class artifacts.

These decisions are ready to guide a prototype.

## Provisional decisions

The implementation should begin with these rules, but keep focused tests and
version notes around them:

- source is case-insensitive while preserving declaration spelling;
- comments begin with `REM`;
- `DIM name[count] AS type` is the declaration form;
- blocks use `END IF`, `END SELECT`, `END WHILE`, `END SUB` and
  `END FUNCTION`;
- arrays permit both comma and chained indexing, with comma canonical;
- `^` is integer power;
- overshifts return defined zero/sign-fill results;
- runtime narrowing warns but compiles;
- non-null references are the only initial reference kind;
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

### Public reference qualification

The source spelling is `REF TO T`, optionally qualified by `NEAR` or `FAR`.
The open decision is whether public declarations must always state the
qualification.

Evidence needed: interface examples across Z80 and C. The semantic split is
settled.

### Exposing checked array mode

Working choice: a compiler/profile mode, not a distinct source type.

Evidence needed before ratification: emulator debugging and cost. Constant
checks remain unconditional.

### String boundary

Working direction: encoded static bytes, explicit framing and bounded library
operations. The remaining decision is whether a minimal static string or
string-view type improves contracts enough to justify distinct syntax.

Evidence available: AZM Book 3 string algorithms and the current TETRO/PACMO
LCD scripts. Dynamic string allocation is not in scope. A translation and
lowering experiment should settle the source type.

### Bounded aggregate views

Working requirement: reusable algorithms must accept a bounded region of
existing aggregate storage without allocation.

Open design: spell this as a view type or as a checked reference-and-count
convention. The insertion-sort, bounded-string and PACMO candidate scans are
the decision fixtures. Exact-shape references remain available.

### Named scalar sets

Working choice: constants remain sufficient for the first storage prototype.

Open design: add nominal, explicitly sized enums for directions, states and
selectors. The experiment must show useful type errors and exhaustive
selection without changing packed layout or complicating numeric conversion.

### Reference parameter intent and scalar outputs

The type model already permits references to scalar and aggregate storage.
The remaining design has two parts:

- whether source interfaces distinguish read-only, output and in/out access;
- whether a scalar output is an alias-like parameter mode or an explicitly
  dereferenced scalar reference.

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
- arrays of references and local aggregate aliases are real requirements.
- exact non-power-of-two record indexing occurs in Pacmo.
- two-dimensional indexing occurs in generated resources and video buffers.
- a heap is not required.
- reusable algorithms need a bounded aggregate parameter convention.
- scalar output parameters can carry secondary results without tuple returns,
  but their write-through syntax is not settled.
- device addresses cannot be modelled as ordinary CPU pointers.
- early body exit must preserve Glimmer's update epilogue.

## Prototype order

A documentation-driven prototype should proceed:

1. freeze the lexical and declaration subset used by Counter through Trail;
2. parse and type-check without generating code;
3. define a small typed IR for that subset;
4. generate canonical AZM and explicit maps;
5. execute differential fixtures against existing examples;
6. add exact records and array paths;
7. translate one Tetro routine and one Pacmo routine;
8. add user routines only after storage paths and diagnostics are reliable;
9. attempt C and BASIC lowering to expose hidden substrate assumptions.

The compiler is outside this documentation goal. This sequence exists so the
documents end at an implementable edge rather than at a list of aspirations.

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
