# Lanternfly language charter

## Purpose

Lanternfly is a compiled low-level language for game rules and other
straightforward program logic. It occupies the same programming territory as
C and Pascal: source declares exact types and storage, calls machine services,
and compiles ahead of time to native code. Its structured BASIC syntax uses
words for declarations and control so the program can be followed without
first learning a large punctuation vocabulary.

The compiler should be capable of replacing an assembler for ordinary program
logic. Generated code must retain the speed class, fixed-memory discipline,
and visible machine costs expected from a small native compiler. Direct
assembly remains available for hardware protocols, interrupt work, and
instruction-specific routines.

The first practical use is to replace assembly bodies in Glimmer programs.
Lanternfly also stands on its own: the same source model should be capable of
lowering to Z80, 6502, 8086, C, BASIC, and other substrates for which a backend
and runtime contract can be supplied.

The first implementation is a desktop-hosted compiler in the Debug80
monorepo. The long-term goal includes native compilers that run on selected
8-bit systems. A self-hosted compiler may use a smaller implementation subset,
but it must preserve the same source semantics and conformance results.

A Z80 backend can serve several platform profiles, including TEC-1G, TRS-80,
ZX81, and ZX Spectrum systems. CPU lowering and platform services are separate
parts of a target.

Lanternfly is the language name. A future integrated language may still be
presented to users as Glimmer.

## Glimmer boundary

**Direction:** Lanternfly contains no Glimmer-specific words or semantics.

Glimmer owns its reactive and platform-facing model:

- state and change tracking;
- triggers, pulses, timers, and bindings;
- compute, effect, and render scheduling;
- cards and navigation;
- display, sound, and resource declarations;
- source mapping through the generated program.

Lanternfly owns the code inside a routine or scheduled body:

- reading and writing named storage;
- arithmetic and comparisons;
- masks and binary operations;
- conditions and loops;
- structured memory access;
- calls and side effects supplied by its environment.

A Glimmer integration may make Glimmer-declared storage and routines visible
to Lanternfly through an ordinary typed interface. Lanternfly treats those names in the
same way as symbols supplied by an assembler, C program, BASIC environment, or
another host.

Host constants and records enter through the same typed interface. A host
resource is exposed as an ordinary Lanternfly constant, address, storage object
or routine; Lanternfly does not add a resource declaration category.

This boundary supports both directions of independence: Glimmer can host Lanternfly,
AZM, or another body language, and Lanternfly can run without Glimmer.

## Language character

**Direction:** Lanternfly is a streamlined structured BASIC with fixed-width
static types.

BASIC contributes:

- words such as `and`, `or`, `not` and `mod`;
- readable assignments and comparisons;
- direct structured control flow;
- a small conceptual vocabulary;
- ordinary numeric expressions rather than register manipulation.

Static systems languages contribute:

- declared widths and signedness;
- fixed-size arrays and records;
- compile-time storage layout;
- diagnostics for incompatible operations.

Lanternfly's core control structures use no labels or line numbers. Raw
assembly may still use the selected assembler's labels for low-level
destinations.

The loop vocabulary is deliberately small: inclusive `for ... to`, exclusive
`for ... until`, `for each ... in`, and `while`. `while true` supplies
indefinite iteration. `exit` leaves only the innermost loop, `continue` begins
its next iteration, and `return` leaves a routine or hosted body.

## Storage model

**Direction:** program storage is predominantly allocated in the static memory
map.

The initial model has:

- signed and unsigned fixed-width scalar values through 32 bits;
- byte-valued characters and static NUL-terminated text;
- opaque near and far address values;
- statically allocated arrays and records;
- zero-storage aliases for existing objects and subobjects;
- target-defined near and far address capabilities.

Programs use declared paths, multidimensional indices and integer pool indices
to locate data. Aggregate parameters and local aliases name existing storage
temporarily. Their names denote the aggregate itself; the backend carrier has
no source expression. Backends may use machine addresses to implement aliases
without exposing pointers in Lanternfly source.

This is a language boundary, not just an implementation shortcut for version
one. General pointer and reference values would invite a different style of
programming, so they are not planned extensions. A future feature may add a
bounded operation or view while still keeping its storage carrier hidden.

Heap allocation, garbage collection, object ownership, and unbounded recursive
structures lie outside the initial language. Fixed arrays, grids, tables, and
records cover the data structures expected in the Glimmer game corpus.

Aggregate storage receives priority over a sophisticated routine system.
Formal arguments and local variables remain part of the eventual language, but
the first useful Lanternfly can operate through named state and a simple call
convention.

## Portability

**Direction:** Lanternfly specifies program meaning; each backend specifies the
representation and calling convention used to implement it.

The language definition should not expose Z80 registers, an IX stack frame,
6502 zero-page allocation, 8086 segment registers, C pointer syntax, or a
particular BASIC runtime. These are backend concerns.

Portability does not require identical cost. A multiplication may become one
instruction, an inline sequence, a runtime call, or a host-language expression.
Generated output and optional cost diagnostics should keep expensive lowering
visible.

## Native substrate access

**Direction:** a program can retain direct substrate code where Lanternfly does
not yet express the required operation.

An `asm` block passes its contents unchanged to the selected assembler, and
`end` closes the block. Module blocks may provide directives, labels, routines
or data; statement blocks place target instructions at one point in generated
control flow. A module block has emission/provenance metadata but no runtime
execution effect. A statement block carries conservative
read/write/call/fault/device-I/O/clobber effects unless a later explicit
contract narrows them.

## Design priorities

The current priority order is:

1. storage layout, arrays, records, indexing and aliases;
2. scalar types, static text and expression semantics;
3. conditionals, loops and ordinary side effects;
4. backend and runtime contracts;
5. calls, formal arguments, and scalar local variables;
6. wider numeric and optional floating-point facilities.

Real Glimmer programs will test this order. Corpus evidence can move a feature
forward when existing game logic cannot be expressed cleanly without it.

The completed corpus pass moved signed bytes, multiple integer widths, local
aggregate aliases, multidimensional indexing and opaque device addresses into
the required model. Pointer tables in the source corpus are expressed through
regular multidimensional arrays or integer selectors in Lanternfly. A later
completeness review moved byte-valued character literals and static C strings
into the first edition. The
[research record](research.md) and [feature matrix](evidence/corpus-feature-matrix.md)
show the evidence.
