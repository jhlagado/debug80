# Lanternfly language charter

## Purpose

Lanternfly is a small imperative language for game rules and other straightforward
program logic. It should read like executable pseudocode and require roughly
the programming knowledge expected of an early BASIC programmer. Static types,
fixed memory layouts, and predictable lowering give it more structure than
classic BASIC.

The first practical use is to replace assembly bodies in Glimmer programs.
Lanternfly also stands on its own: the same source model should be capable of
lowering to Z80, 6502, 8086, C, BASIC, and other substrates for which a backend
and runtime contract can be supplied.

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

This boundary supports both directions of independence: Glimmer can host Lanternfly,
AZM, or another body language, and Lanternfly can run without Glimmer.

## Language character

**Direction:** Lanternfly combines BASIC-like source with Pascal- or C-like static
typing.

BASIC contributes:

- words such as `AND`, `OR`, `NOT`, and `MOD`;
- readable assignments and comparisons;
- direct structured control flow;
- a small conceptual vocabulary;
- ordinary numeric expressions rather than register manipulation.

Static systems languages contribute:

- declared widths and signedness;
- fixed-size arrays and records;
- typed references;
- compile-time storage layout;
- diagnostics for incompatible operations.

Lanternfly uses labels where low-level control still needs a named destination. Line
numbers play no part in the language.

## Storage model

**Direction:** program storage is predominantly allocated in the static memory
map.

The initial model has:

- signed and unsigned fixed-width scalar values through 32 bits;
- opaque near and far address values;
- statically allocated arrays and records;
- zero-storage aliases for existing objects and subobjects;
- runtime references for locating existing storage;
- target-defined near and far address capabilities.

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

**Direction:** a program can retain direct substrate code where Lanternfly does not
yet express the required operation.

The exact pass-through syntax is open. Its role is narrow and explicit:
platform initialisation, device access, carefully tuned loops, interrupt code,
and operations unique to a target. Native code remains a boundary facility
rather than a source of implicit Lanternfly semantics.

## Design priorities

The current priority order is:

1. storage layout, arrays, records, indexing, aliases, and references;
2. scalar types and expression semantics;
3. conditionals, loops, and ordinary side effects;
4. backend and runtime contracts;
5. calls, formal arguments, and scalar local variables;
6. wider numeric and optional floating-point facilities.

Real Glimmer programs will test this order. Corpus evidence can move a feature
forward when existing game logic cannot be expressed cleanly without it.

The completed corpus pass did move signed bytes, multiple integer widths,
arrays of references, local aggregate aliases, multidimensional indexing and
opaque device addresses into the required model. The
[research record](research.md) and [feature matrix](evidence/corpus-feature-matrix.md)
show the evidence.
