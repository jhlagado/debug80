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

Lanternfly is a small-system language first. The governing implementation is
a self-hosted compiler on an 8-bit machine (project codename Candlemoth): a
single-pass compiler of roughly sixteen kilobytes that reads declaration-ordered
source once and emits native code directly. The desktop-hosted compiler in the
Debug80 monorepo ships first chronologically, but it follows the small
compiler's architecture and accepts exactly the same programs. A hosted
implementation may not use its host's conveniences — unbounded recursion,
garbage collection, deferred resolution — in ways the small compiler could not
mirror. The philosophy runs in one direction: a language that compiles well in
sixteen kilobytes of Z80 is trivially strong on larger systems, and ports to
C, Rust or another host inherit a design that never assumed a lazy runtime.

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

A host may make its storage and routines visible to Lanternfly through an
ordinary typed interface. The same name-resolution rules apply to symbols
supplied by an assembler, C program, BASIC environment, or another host.

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

The syntax aims to read as executable pseudocode. Structured BASIC already
occupies that role in practice: when a coding exercise asks for
language-neutral pseudocode, what comes out resembles the structured BASIC line — words for declarations and control,
one statement per line, no punctuation vocabulary to learn first. Lanternfly
is Pascal-inflected in its type discipline but BASIC in its philosophical
grounding, particularly in the exclusion of source-level pointers and manual
memory management.

Modules are written in dependency order. Imports come first; every local type,
constant, storage object and routine must be declared before use. A routine
may call itself after its signature has been checked, and a forward
declaration supplies a routine's signature ahead of its body, so mutually
recursive routines remain expressible in declaration order. A forward
signature must be completed by a body later in the same module; the compiler
resolves calls to it by backpatching, the same mechanism that resolves a
forward branch. The rule
supports a single-pass compiler without dictating how many internal passes a
desktop implementation uses.

The loop vocabulary is deliberately small: inclusive `for ... to`, exclusive
`for ... until`, `for each ... in`, and `while`. `while true` supplies
indefinite iteration. `exit` leaves only the innermost loop, `continue` begins
its next iteration, and `return` leaves a routine or hosted body.

## Small systems first

**Direction:** the reference compiler architecture is single pass, direct
emitting and self-hostable; every language rule must be affordable inside it.

The reference architecture reads each module once in declaration order,
keeps a compact symbol table, emits machine code as it goes and resolves
forward jumps and forward calls by backpatching. Statement structure compiles
iteratively against an explicit block stack; expressions compile through an
operator-precedence loop with explicit operand and operator stacks. Bounded
stacks and indexed pools replace host recursion and heap allocation, so the
compiler itself is written in the storage style the language prescribes.

A feature enters the language only when its cost inside the reference
compiler is understood and acceptable. The small compiler's core budget —
on the order of sixteen kilobytes of code — is a standing design constraint,
in the tradition of compilers that were judged by how well they compiled
themselves. Toolchain facilities that cannot meet this bar, such as
whole-program optimization, provenance mapping and rich diagnostics, remain
host-side toolchain services rather than language requirements; an
error-code-and-location diagnostic surface is a conforming implementation.

The Lanternfly toolchain contains no relocating link editor. Libraries
reach a program in three forms, all linker-free: source imports compiled
into the whole program in dependency order; compiled export-interface
images that restate a module's public symbols without re-reading its
source; and fixed-address libraries — on banked systems, ROM libraries —
whose code is already placed and whose interface image simply binds names
to addresses. Relocatable object formats and link editors are permanently
out of scope for the Lanternfly toolchain itself; a substrate toolchain
downstream of a backend, such as a C compiler's, may use its own placement
mechanism to carry the validated placement plan.

On-target backends emit machine code directly to memory or to an image file.
Assembly-text generation through AZM or another assembler remains a
transparency and portability backend, not the primary path, and the self-hosted
compiler does not contain an assembler.

The language divides into an irreducible kernel and a closed set of standard
capability modules. The kernel is the self-hosting closure: the constructs
the reference compiler is itself written in, and the constructs every module
form is expressed in, so it is prior to every import. No kernel feature
places bytes in a program that does not use it; runtime helpers such as
multiplication, string operations and bounds checks are included only on
use, so use, not configuration, selects their cost. A capability module is
a pseudo-module in the tradition of Oberon's `SYSTEM`: an import the front
end handles at source level, which legalizes an optional facility — 32-bit
integers, long strings, a floating-point tier — and binds its helper
components through the selected target profile. A capability module exports
no names, and its authorization is module-local: importing a user module
does not confer the capabilities that module uses. The explicit imports
determine each program's tier, and the build reports each capability's
cost.

Capability imports are monotone: an import may make more programs legal, but
it may never change the meaning of a program that was already legal.
Operators are typed families resolved statically, so a capability type
extends an operator's domain without altering any existing operation, and no
implicit conversion crosses type families. The counted string is the one
text representation with literal syntax and operators; alternative
representations, such as zero-terminated byte arrays, are ordinary libraries
over `u8` storage. The capability set is closed and toolchain-versioned;
user modules never define operator meanings or literal forms.

**Direction:** program storage is predominantly allocated in the static memory
map.

The initial model has:

- 8- and 16-bit signed and unsigned scalar values in the kernel, with the
  32-bit widths supplied by a standard capability module;
- nominal enums and checked subranges;
- byte-valued characters and sealed counted strings with maintained NUL
  terminators;
- opaque near and far address values;
- statically allocated arrays with ordinal index domains, and exact records;
- zero-storage aliases for existing objects and subobjects;
- target-defined near and far address capabilities.

Programs use declared paths, multidimensional indices and ordinal pool indices
to locate data. Aggregate parameters and local aliases name existing storage
temporarily. Their names denote the aggregate itself; the backend carrier has
no source expression. Backends may use machine addresses to implement aliases
without exposing pointers in Lanternfly source.

This language boundary applies beyond the first implementation. General
pointer and reference values would establish a different programming model, so
they are not planned extensions. A future feature may add a bounded operation
or view while still keeping its storage carrier hidden.

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

Target profiles also define the legal memory map. Build configuration selects
origins for generated classes within those regions, while `at` reserves an
exact source object. An assembler directive such as AZM `.org` carries the
completed placement plan into one backend; it does not define the plan.

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

## Standard text input and output

**Direction:** portable text transfer is an optional standard-module
capability rather than a core statement or a complete operating-system
interface.

These are standard service modules: they share the profile binding and cost
reporting used by the capability modules described under small systems
first, but they export ordinary names and gate no language facilities. The
export-free capability modules form a separate category.

Programs explicitly import small standard text-input and text-output modules.
The selected target may connect them to a keyboard and display, a serial
terminal, firmware or monitor routines, or a host adapter. The portable
contract covers character output, fixed-string output, a target-appropriate
newline, blocking character input and bounded line input into writable
fixed-capacity strings.

The contract defines no streams, handles, buffering, files, directories or
portable line editor. Future loading and saving facilities belong in separate
modules after real storage systems provide a stable model.

## Program invocation and termination

**Direction:** executable programs use a fixed entry signature, with launcher
arguments and termination outcomes expressed through explicit contracts.

An executable build selects `main` in the root module when its manifest omits
an entry name; an explicit entry name supports tests, firmware and other build
arrangements. The selected routine has no parameters or result. Programs that
need launcher arguments import `standard/program-arguments.lafy` and copy each
argument into caller-declared fixed-capacity string storage. This keeps command
lines out of targets that have none and introduces no pointer array or hidden
allocation.

The entry may declare `fails` with an ordinary `u8` error-set enum. Normal
completion reports success; `fail` reports one opaque error member. Numeric
exit-status profiles map success to zero and a failed member's zero-based
ordinal `n` to `n + 1`. Other targets preserve the same two outcomes through
their monitor, firmware or host termination contract.

## Design priorities

The current priority order is:

1. storage layout, arrays, records, indexing and aliases;
2. scalar types, static text and expression semantics;
3. conditionals, loops and ordinary side effects;
4. backend and runtime contracts;
5. calls, formal arguments, and scalar local variables;
6. wider numeric and optional floating-point facilities.

Real Glimmer programs will test this order. Corpus evidence can move a feature
forward when existing game logic cannot be expressed cleanly without it. The
small-system gate works in the other direction: a proposal that cannot state
its cost inside the reference single-pass compiler is not ready for the
language, whatever a desktop implementation could absorb.

The completed corpus pass moved signed bytes, multiple integer widths, local
aggregate aliases, multidimensional indexing and opaque device addresses into
the required model. Pointer tables in the source corpus are expressed through
regular multidimensional arrays or ordinal selectors in Lanternfly. A later
completeness review moved byte-valued character literals and sealed counted
strings into the first edition. Before implementation began,
a further design review
adopted Pascal-style enums, subranges and ordinal array domains, expressed
with BASIC words rather than symbolic range punctuation. The
[research record](research.md) and [feature matrix](evidence/corpus-feature-matrix.md)
show the evidence.
