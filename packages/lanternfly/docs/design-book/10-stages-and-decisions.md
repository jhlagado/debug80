# Language stages and decisions

Specification 0.4 is the implementation baseline. The stages divide one
language into useful compiler milestones; they are not smaller dialects and
cannot assign temporary meanings to later constructs.

The [implementation plan](../implementation-plan.md) gives executable gates.

## Stage K0: hosted bodies

K0 establishes the complete parser and the first Glimmer-hosted vertical
slice:

- versioned host-manifest and target-profile validation;
- all six integer types and canonical `boolean`;
- enums, subranges and checked ordinal conversion;
- byte-valued characters and static `cstring`;
- imported constants, storage, aggregates and routines;
- expressions, destination conversion and assignment;
- fixed-array domains, indexing and record fields;
- `size`, `count`, `lower`, `upper` and `offset`;
- `if`, ordinal `select`, both counted boundaries, `for each` and `while`;
- loop control and hosted `return`;
- imported calls, `clear`, `fill` and statement/module `asm`;
- typed effects, fault boundaries, AZM and composed source maps.

K0 may diagnose source-owned module storage, local declarations and
user-defined routines as later implementation stages. It still parses their
0.4 syntax. Such a build is a development slice, not a fully conforming 0.4
front end.

Counter, Dot, Slide, Trail and ordinary Glimmer rules are the first fixtures.

## Stage K1: structured storage

K1 adds:

- source-owned constants and static variables;
- enum-, subrange-, range- and count-indexed arrays;
- exact records and aggregate initializers;
- non-zero lower-bound normalization and complete path lowering;
- module import, visibility, export and startup installation;
- scalar locals and local aggregate aliases;
- aggregate assignment, `clear` and `fill`;
- wider Tetro and Pacmo storage fixtures.

The hidden carrier for an alias remains compiler-only throughout K1.

## Stage K2: routines

K2 implements:

- the single `sub` declaration with optional scalar result;
- scalar value and exact-shape aggregate-alias parameters;
- local scalar initialization and lifetime;
- early routine return;
- external bindings and standalone entry validation;
- target ABI descriptions and adapters;
- non-recursive bare-metal call graphs by default.

Bounded views and parameter intent do not block this stage. K2 uses writable
exact-shape aggregate parameters, optional scalar results and no source
reference values.

## Stage K3: target breadth and far memory

K3 tests the portability claims:

- far aggregate data, far C strings and far calls;
- bank or segment context;
- another CPU backend;
- a C semantic backend;
- one named BASIC dialect experiment;
- cross-backend conformance and cost comparison.

Near/far contracts exist before K3 so public storage interfaces do not need a
breaking redesign.

## Chosen first-edition rules

### Language character

- Lanternfly is independent of Glimmer.
- The surface is a structured BASIC with lowercase word syntax and explicit
  fixed-width types.
- Variables are declared; line numbers, implicit typing and general `goto` are
  absent.
- Glimmer and platform concepts arrive through typed interfaces rather than
  keywords.

### Values and expressions

- Integer widths and signedness run from `u8`/`i8` through `u32`/`i32`.
- Operator-specific result rules preserve byte products and differences.
- Operand compatibility may widen to a type already written in the expression
  but never invents a third common type.
- Fixed-width conversion has defined low-bit and two's-complement meaning.
- Comparisons produce one-byte `boolean`; conditions require `boolean`.
- Boolean `and` and `or` short-circuit, while integer word operators combine
  complete bit patterns.
- Character literals are exact bytes and `cstring` is immutable
  program-lifetime NUL-terminated text.

### Ordinal domains

- Enums are nominal, explicitly represented and sequential from ordinal zero.
- Enum members enter the value scope without qualification.
- Subranges are nominal checked types over an integer or enum host.
- `to` includes its upper value and `until` excludes its boundary.
- A range is a type or grammar form, not a runtime value.
- Array dimensions may use counts, explicit ranges, named subranges or enums.
- The complete normalized domain is part of array type identity.
- Range and bounds checks occur before a destination store; type proofs may
  remove redundant checks.

These choices were made before implementation because they affect name
resolution, type identity, layout, control, manifests, diagnostics, debug
symbols and every backend.

### Storage and identity

- Arrays and records have exact packed layout.
- Arrays are row-major and normalize each lower ordinal to element zero.
- Static aggregates are the default; scalar locals may be automatic.
- Declared paths and ordinal selectors preserve long-lived identity.
- Aggregate parameters and local aliases are temporary names for existing
  storage, never values.
- There are no source pointers, references, arrays of pointers, address-of,
  dereference or pointer arithmetic operations.
- Near, far and opaque device addresses remain distinct capabilities.

### Control, calls and artifacts

- `for ... to`, `for ... until`, `for each ... in` and `while` are the loop
  forms; `while true` is indefinite iteration.
- Bare `exit` and `continue` are loop-only.
- `return` leaves a routine or hosted body and preserves a host epilogue.
- Every routine is a `sub`; a trailing result type replaces a separate
  `function`.
- Calls use parentheses and need no `call` keyword.
- Generated substrate source, typed layouts, source maps and helper inventories
  are first-class artifacts.

## Provisional rules

The implementation follows these rules while keeping focused tests around
them:

- case-insensitive resolution with declaration spelling preserved;
- `//` comments;
- `var name as Type`;
- one bare `end` for structured blocks;
- one bracket operation supplying every dimension;
- `^` for integer power;
- defined zero/sign-fill overshifts;
- runtime integer narrowing warning by default;
- left-to-right argument evaluation;
- recursive-cycle rejection on initial bare-metal profiles;
- conservative effects for statement `asm`.

Evidence may change these in a later specification. A development build does
not reinterpret them.

## Bounded open questions

### Case and naming

Parser, imported-symbol and generated C/BASIC experiments will determine
whether case-insensitive lookup causes material collisions.

### Narrowing diagnostics

The conversion result is fixed. Corpus translation will decide whether the
default warning severity is practical and whether more proof cases should
suppress it.

### Local declaration placement

The current rule groups declarations before executable statements in a routine
or hosted body. Complete Tetro and Pacmo translations will show whether that
requires awkward hoisting from the point of first use.

### Aggregate parameter intent and bounded views

The first edition has writable exact-shape aggregate parameters. Reusable
sorting, bounded text and candidate-scan routines need a later view that can
state runtime extent without exposing its carrier.

Read-only, output and in/out parameter modes should share one mutability model
with those views.

### Checked-array mode

Conforming execution checks every dynamic access not proved safe. Emulator
cost evidence will determine whether an explicitly unsafe, nonconforming
unchecked mode is worth exposing.

### Labels and post-test loops

Restricted labels, named outer exits and `repeat`/`until` require a real
translation that becomes materially worse without them. No current game body
does.

### Floating point

An optional `float32` capability needs exact semantics, a motivating program
and code-size measurements. It is not part of the first edition.

## Deferred facilities

The first corpus does not require:

- dynamic allocation or garbage collection;
- aggregate automatic locals or aggregate returns;
- rich mutable string values;
- arbitrary packed bit fields;
- arrays spanning mapping contexts;
- recursion on bare-metal profiles;
- indirect calls, procedure values or closures;
- exceptions, generics or operator overloading.

Source pointers and references are a deliberate exclusion rather than routine
deferred work. Adding them would change the storage philosophy.

## Questions closed by evidence

The corpus established several requirements:

- Tetro's -3 spawn row needs signed eight-bit storage.
- Rushlight needs `u8 - u8` to preserve a signed difference.
- Skyfall needs defined low-bit destination conversion.
- masks need `and`, `or`, `xor`, `not`, shifts, division and `mod`.
- Snake and Pacmo benefit from nominal bounded selector types.
- Tetro and generated resources need multidimensional fixed data.
- Pacmo needs true six-byte record strides.
- Tetro collapse and Pacmo routines need non-escaping aggregate aliases.
- TMS9918 locations cannot be ordinary CPU storage addresses.
- hosted early return must preserve the Glimmer epilogue.
- none of the examined algorithms requires a heap or general pointer
  arithmetic.

## Implementation order

1. Establish source identity, diagnostics and versioned host/target schemas.
2. Parse the complete grammar.
3. Collect declarations and resolve enum, subrange and layout dependencies.
4. Type-check K0, including range proofs and effect summaries.
5. Interpret typed control-flow IR as the semantic oracle.
6. Emit and verify the first AZM vertical slice.
7. Add K1 arrays, records, paths, aliases and startup effects.
8. Translate one Tetro and one Pacmo fixture.
9. Add K2 source routines and adapters.
10. Use C, BASIC and another CPU to expose substrate assumptions.

The first coding change remains M0: package scaffolding, shared source and
diagnostic types, versioned schemas and one empty hosted-body result.

## Changing a chosen rule

A chosen rule needs stronger evidence than familiarity with another language.
Change is justified when a real program cannot be expressed faithfully, two
backends would otherwise assign contradictory meaning, a small example exposes
a serious foot gun, or an implementation experiment produces compelling cost
or complexity evidence.

The replacement must state its compatibility and migration consequences. In a
small language, every exception becomes part of what the whole language feels
like.
