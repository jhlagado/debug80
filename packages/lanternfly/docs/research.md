# Lanternfly research record

This document records the evidence pass and the design consequences. It is a
map to the detailed notes rather than a second specification.

## Baselines

The study used:

| Source                       | Baseline                                   |
| ---------------------------- | ------------------------------------------ |
| Debug80 monorepo             | `b8a152010b005aa618e8c0de75f25faf76b4c653` |
| Glimmer package              | 0.6.2                                      |
| AZM package                  | 0.3.8                                      |
| Debug80 documentation        | `524bf2226bd4a4674273680d992781894ae68a3b` |
| ZAX current main             | `8b7d4a9f714196d5d1ed8fdda0a91e731a091251` |
| ZAX exact-size lowering line | `e40b75a21edda2a039430d11f36e6ba6aada3afb` |
| TETRO production repository  | `53ef6e0648a7a95a2a038a0f6f40ab94d8831a41` |

The [reading ledger](evidence/reading-ledger.md) lists every completed source
group and line count.

## Evidence set

The study read:

- both Glimmer books, exercises and appendices;
- Glimmer language, grammar, profile, build and compiler-pipeline documents;
- every current monorepo `.glim` example;
- current native Snake and Tetro libraries;
- Book 2 Skyfall and Rushlight source;
- representative generated AZM for Dot, Trail, Snake, Tetro and Sprite Chase;
- Glimmer parser/generator/build tests relevant to body integration;
- the complete historical shared, Tetro, Pacmo and TMS9918 corpus;
- current AZM grammar, layouts, ops and routine-contract model;
- relevant ZAX book, specification, implementation and exact-size branch;
- AZM Books 1–3 and every Book 3 algorithm example;
- the current sibling TETRO repository guides and complete TETRO, PACMO and
  shared production source.

Detailed records:

- [Glimmer book notes](evidence/glimmer-book-notes.md)
- [Corpus dossiers](evidence/glimmer-corpus-analysis.md)
- [Feature matrix](evidence/corpus-feature-matrix.md)
- [Generated output analysis](evidence/generated-output-analysis.md)
- [Glimmer integration analysis](evidence/glimmer-integration-analysis.md)
- [AZM/ZAX comparison](evidence/azm-zax-analysis.md)
- [AZM algorithms and native game evidence](evidence/azm-book3-and-native-games.md)

## Main empirical finding

Most game logic consists of:

- scalar reads and writes;
- addition, subtraction, masks and shifts;
- comparisons and numeric conditions;
- counted and conditional loops;
- fixed arrays and exact records;
- integer selectors and temporary aliases for existing global storage;
- platform service calls.

The apparent complexity of the assembly engines comes largely from register
allocation, field offsets, stride calculation, value preservation across calls
and flag conventions. Those are lowering work.

The corpus does not need heap allocation, garbage collection, dynamic
containers, closures, exceptions or general pointer arithmetic.

## Glimmer boundary finding

Glimmer requires no magic word in its body language. Its preprocessor already
owns:

- scheduling and dependency structure;
- reactive state/update behaviour;
- resources and profiles;
- wrapper routines;
- update epilogues.

Lanternfly can therefore remain independent. Glimmer supplies a typed host manifest
and embeds generated body code.

A body falls through. A Lanternfly early exit must target the compiler/host epilogue;
it must not emit a direct machine return that skips Glimmer updates.

## Numeric findings

Three corpus cases determine the numeric model.

### Byte wrapping

Skyfall stores a negative subtraction back into byte state and relies on low
eight-bit wrap.

### Signed intermediate

Rushlight and Sprite Chase subtract unsigned byte coordinates before `ABS`.
The subtraction must widen before it wraps.

### Signed byte storage

Historical Tetro uses `$FD` as the genuine value -3 while a piece enters the
board. A signed 8-bit storage type makes the algorithm legible.

The selected reconciliation is:

- provide `BYTE` and `SBYTE`;
- evaluate byte-only addition, subtraction, division, remainder and comparison
  at a range-based type of at least 16 bits;
- define narrowing stores as low-bit truncation;
- warn at implicit narrowing;
- permit explicit conversion to document intended wrap.

Masks and compound conditions justify BASIC-style `AND`, `OR`, `NOT` and
`XOR`. The language uses one eager bitwise/numeric-truth family.

## Structured-memory findings

### Fixed arrays

- Snake uses `Body[64]` as a circular buffer.
- Tetro uses eight-byte planes and piece tables.
- Pacmo uses fixed packed rows and point candidates.
- TMS9918 demos use fixed pattern/motion tables.

### Exact records

- framebuffer rows have exact plane fields;
- Pacmo monsters are exactly six bytes;
- point pairs and LCD commands have compact external layouts.

A six-byte monster array requires runtime multiplication by six. Power-of-two
semantic padding would waste memory and change external layouts. The backend
must generate the multiplication.

### Runtime selection and aliases

The Tetro assembly selects board planes through an address table and then
aliases the selected plane during row collapse. Lanternfly needs the
underlying operations, not the assembly representation:

- multidimensional arrays for regular planes and shape tables;
- integer selectors plus `select` for irregular named objects;
- local aggregate aliases that allocate no aggregate storage;
- aggregate parameters that alias caller storage temporarily.

### Multiple dimensions

Generated shape tables and TMS9918 name shadows use more than one dimension.
The language must admit two dynamic indices. An early Z80 backend may suggest
staging through a row alias if its implementation is incomplete.

## Address findings

Near/far is a capability distinction:

- near normally means a direct 16-bit Z80 address;
- far on TEC-1G can mean bank plus offset;
- far on 8086 can mean segment plus offset;
- far may collapse to near on a flat target.

TMS9918 VRAM proves that not every 16-bit address is a CPU pointer. Device
addresses need nominal address-space types passed to services.

## ZAX findings

ZAX demonstrates:

- named stack parameters and scalar locals;
- aggregate parameters as one reference-sized value;
- non-scalar locals as aliases only;
- typed effective-address paths;
- structured control over assembly;
- useful explicit source maps.

Its history also contains a resolved design lesson. The older spec/main
lowering uses power-of-two composite storage in several paths. The later
exact-size line implements non-power-of-two stride multiplication by
shift-and-add, and the current book teaches exact records. Lanternfly takes the
later principle while recording the repository inconsistency accurately.

ZAX's runtime-atom budget is useful implementation discipline but too narrow as
a permanent Lanternfly law. Common `grid[row, column]` access is semantically valid.

## AZM findings

AZM provides:

- exact assembler-time layouts;
- arrays, records, unions, `sizeof` and offsets;
- inline typed-ish ops;
- modules/import visibility;
- explicit `.routine` register contracts;
- inspectable generated source and maps.

It does not provide Lanternfly's runtime expression or path semantics. Runtime array
index scaling must be emitted by the Lanternfly backend.

AZM's strict routine contracts are a verification gate for generated Z80.
Registers and flags do not become Lanternfly source concepts.

## Algorithm and production-game findings

AZM Book 3 adds reusable algorithms to the layout evidence. Its insertion
sort, string routines and table walks need a bounded region rather than a
name for one exact fixed-array type. The storage can remain static. A future
bounded-view feature could pair hidden storage access with a count while still
denying the program a pointer value.

The ring buffer and the production games also need operations that return
success while writing a scalar result. Lanternfly can avoid tuple returns and
processor flags. A later design must choose between explicit scalar parameter
modes and a result convention; exposing scalar pointers is not among the
first-edition options.

The current TETRO and PACMO sources confirm:

- exact six-byte record indexing and arrays of exact records;
- packed world rows addressed through masks and shifts;
- fixed point, piece, score and command tables;
- sentinel framing;
- local selection of global aggregate storage;
- small direction and state sets that may benefit from nominal enums;
- no requirement for heap allocation.

Book 3's linked list and tree use statically allocated nodes. Nullable
self-references may therefore remain compatible with a heap-free language, but
the games still favour arrays, indexes and sentinels. Recursion is similarly a
later profile capability: a backend that admits it must report frame and stack
costs.

For text, the combined evidence favours encoded static bytes, explicit framing
and bounded library operations over a rich dynamic string type. The 0.4
working language adopts byte-valued character literals and read-only
NUL-terminated `cstring` views. Bounded writable operations remain follow-up work.

## Translation threshold

The examples divide into implementation stages:

### Scalar body subset

Counter, Dot, Slide and most Glimmer rule bodies require imported state,
expressions, conditions and calls.

### Structured body subset

Trail and rendering bodies add arrays, records and loops.

### Engine subset

Snake, Tetro and Pacmo add locals, routines, selectors, aliases, nested paths
and early returns.

### Native residual

Startup, port I/O, ROM entry, fixed scan timing and selected tuned loops remain
native or platform services.

## Decisions accepted

- language name: Lanternfly;
- streamlined structured BASIC source with static types;
- no Glimmer-specific vocabulary;
- exact static layouts;
- zero-based count-declared row-major arrays;
- six fixed integer types through 32 bits;
- byte-valued character literals and static C strings;
- minimum-width arithmetic plus defined narrowing wrap;
- one-byte Boolean values and type-directed binary/Boolean operators;
- shifts, integer division/remainder and integer power;
- visible integer square-root service;
- structured control including `select`, `for ... to`, `for ... until`,
  `for each ... in` and `while`;
- scalar locals;
- local and parameter aggregate aliases without first-class pointer values;
- no initial heap;
- near/far and opaque device address types;
- explicit native boundary;
- backend-selected helpers linked on demand;
- composed source maps and cost visibility.

The [decision chapter](design-book/10-stages-and-decisions.md) separates chosen,
provisional and deferred points.

## Work deliberately not performed

This package contains no:

- parser;
- type checker;
- IR;
- code generator;
- runtime implementation;
- Glimmer integration change.

The documentation stops at schemas, semantic rules, translations and a staged
implementation edge, as requested.
