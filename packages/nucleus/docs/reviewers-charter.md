# Nucleus reviewer's charter

## Purpose

This charter defines the terms for reviewing Nucleus 0.1. It records the
project directions that a reviewer must preserve, the implementation choices
that remain open to measurement, and the evidence required for a proposed
change.

Nucleus is a small, statically typed language compiled directly to Z80 machine
code for practical programs on constrained systems. The first compiler is a
handwritten Z80 program whose executable core and required immutable data must
fit in one 16 KiB bank. That constraint governs implementation work. It does
not authorise a reviewer to remove settled language facilities or create an
unnamed smaller dialect.

This charter does not replace either specification. It provides instructions
for review work within them. When the charter and a specification appear to
conflict, the reviewer must report the discrepancy and leave the rule
unchanged until the project owner resolves the authority conflict.

## Authority

Apply the following authority order:

1. The [Nucleus 0.1 Language Specification](specification.md) governs source
   syntax, static semantics, runtime meaning, diagnostics, traps, and language
   conformance.
2. The [Nucleus Target System Specification](target-system-specification.md)
   governs target profiles, program images, startup, entry, and banked-program
   composition.
3. The [Nucleus Z80 Runtime and Backend Contract](z80-runtime-contract.md)
   governs packed representation, direct-code integrity, runtime services,
   trap records, and direct Z80 execution.
4. Explicit project-owner decisions govern work that the specifications still
   mark as open.
5. Executable tests, analyzers, and measurements provide evidence. They do not
   amend a specification when they disagree with it.
6. Design notes, old reports, implementation sketches, and repository history
   are non-normative.

Review the current revisions of both authorities. Do not reconstruct the
design from old commits, superseded notes, or historical discussions.

## Project objective

Nucleus must be small enough for a real Z80 while remaining safe, structured,
and pleasant to use. The project is not an exercise in deleting features until
some compiler fits. The implementation must preserve the admitted language,
and measurements must identify whether the selected compiler architecture can
meet the bank gate.

If a faithful implementation exceeds the limit, investigate parser structure,
metadata representation, shared routines, lowering strategy, workspace
organisation, and the frontend/direct-backend boundary. Removing a settled facility is a
language redesign and requires a separate decision.

## Settled design principles

### One language

Nucleus 0.1 has one normative language. It has no levels, profiles, optional
standard subsets, or implementation-selected dialects. An implementation may
publish bounded capacities, but those limits do not change accepted syntax or
program meaning. Every conforming implementation must satisfy the minimum
conformance corpus.

### Static and bounded operation

The system uses fixed-width scalars, fixed-layout nominal records, fixed
arrays, bounded strings, statically allocated aggregate storage, bounded
compiler tables, and bounded activation storage.

Nucleus has no source-visible pointer type, null reference, pointer arithmetic,
heap, garbage collector, variable-sized local object, reflection, runtime type
test, open array, slice, or unrestricted dynamic allocation. These exclusions
are part of the small-system architecture rather than temporary omissions in
an otherwise dynamic design.

### Compile-time knowledge before runtime machinery

The compiler performs every source-safety check whose outcome is available
during compilation. A source-safety condition that depends on runtime data uses
one of the specified traps. The compiler retains source types, aggregate
extents, record identities, array lengths, string capacities, routine
signatures, and alias categories. Generated programs therefore need no runtime
type tags.

### Streaming compilation

The first compiler processes one ordered logical token stream. It retains
bounded declarations, signatures, types, source positions, fixups, expression
state, and other information required for correct emission, but it does not
need a complete syntax tree or general whole-program inference.

Declarations precede use. Explicit forward routine declarations permit direct
and mutual call cycles without a second source pass. An external build driver
reads a flat ordered manifest and supplies a multipart logical source stream;
the compiler contains no filesystem search, import resolver, or dependency
reordering algorithm.

### Source semantics are independent of representation

An implementation represents an aggregate alias as an address-sized word, but
source code cannot inspect or preserve that carrier. The compiler may use Z80
registers, static locations, the hardware stack, shared helpers, or another
private representation. These choices must preserve source types,
evaluation order, failures, traps, and observable effects.

An implementation economy is welcome when it preserves the complete source
contract. A change to accepted source or observable meaning is not an economy;
it is a redesign.

### Target placement and interrupt boundary

Nucleus source contains no physical placement, and a target description
contains no source-symbol reference. The external source manifest orders
declarations. The target profile supplies bounded regions and may assign source
parts to banks by manifest ordinal. The compiler assigns offsets, selects local
or far calls, and reports the resulting addresses.

A banked ROM is one compilation and one program distributed across banks. It
has one `main`, one startup, one writable region outside the bank window, and
one entry pair. Cross-bank aggregate restrictions protect address-only carriers
without adding bank identity to source types. Generated code uses the
RAM-resident runtime vectors and never exposes a raw bank address to source.
The entry bank contains the final mainline source part; library declarations
precede it in the logical stream even when they occupy other banks. Every bank
contains the complete selected runtime helper image so one runtime identity and
one helper-offset layout apply throughout the program.

Nucleus defines no interrupt routine, interrupt or restart vector declaration,
interrupt-reentrant activation model, or interrupt-safe service guarantee. The
compiler emits no interrupt vector table. Interrupt handlers and machine reset
bindings belong to the monitor, adapter, or other machine code outside Nucleus.
A handler must preserve the program's machine state and cannot enter a Nucleus
routine or service.

### Measurement before assertion

Z80 size and timing claims require assembled code and executable evidence.
Source-line counts, host executable sizes, and intuition are not target
measurements. Estimates must be labelled as estimates.

Report resource accounts separately:

- compiler executable code and required immutable data;
- compiler writable workspace;
- input, output, and source-map storage;
- target-runtime code and data;
- activation storage; and
- external build-driver or host tooling.

Moving required compiler code or tables into another account does not satisfy
the 16 KiB compiler-core gate.

## Settled language directions

### Names, declarations, and source assembly

Identifiers are case-sensitive and preserve their spelling. Keywords use
their lowercase reserved spellings. Nucleus rejects duplicate declarations
and does not use Forth-style latest-definition lookup. Local declarations do
not shadow visible ordinary names.

A forward declaration supplies the complete routine signature once. Its later
definition uses the abbreviated `sub NAME` body header. Do not restore a
second copy of the parameter list merely to imitate another language.

Nucleus source has no `import` or `include` statement. A flat ordered manifest
belongs to the external build driver. Missing files, forgotten dependencies,
and incorrect order receive explicit diagnostics; the compiler does not search
for alternative files or reorder source parts.

### Scalar types

The scalar types are `u8`, `u16`, and `boolean`. Boolean is distinct from both
integer types. The language provides no Boolean/integer conversion.

The only implicit declared-type conversion is `u8` to `u16`. Narrowing through
`u8(expression)` is checked. Nucleus has no arbitrary cast, low-byte
reinterpretation, same-width type punning, or word/address interchange.

Integer constants have no declared width. Their declarations retain an exact
integer value, which must fit the type selected by each use. Boolean constants
retain Boolean type and never participate in integer resolution.

Compile-time evaluation must agree with runtime evaluation, including operand
width, modular wraparound, short-circuit behaviour, and invalid constant
operations. Reducing compiler size does not justify a second arithmetic
language for constants.

### Aggregate types

Nucleus admits nominal records, one-dimensional fixed arrays, and `string[N]`.
Arrays may contain scalars, records, or bounded strings, but not arrays.
Records have nominal identity; equal field sequences do not create structural
compatibility.

Nucleus does not admit record subtyping, interface inheritance, generic record
parameters, open arrays, slices, variant records, unions, or general aggregate
comparison. Task-oriented syntax may later desugar to ordinary routines with a
scalar state and a task-specific data record. It must not introduce a second
record type system.

Bounded strings retain a current length, permit embedded zero bytes, support
`.length`, checked byte access, byte replacement, and exact-type aggregate
assignment. They have no append, insertion, resize, truncation, open capacity,
or general comparison operation.

### Structured initializers

Program-variable declarations may contain complete, constant-only positional aggregate
initializers. Parentheses group record components; brackets group array
elements. The nesting follows the finite declared type tree. Every component
must be present and compatible. The compiler reports incorrect counts,
incorrect nesting, incompatible constants, and overlong string literals.

Structured initializers establish static storage images. They are not general
runtime record constructors or aggregate expressions.

### Aggregate storage, aliases, and copying

An aggregate object is a fixed region of storage with one exact static type.
Top-level variables own all program-lifetime aggregate storage. Aggregate
fields and array elements are inline subobjects. A routine cannot declare an
aggregate local, whether as owned storage or as a local alias.

An aggregate parameter is a fixed typed alias to caller-provided storage. It
is neither nullable nor reseatable. A routine that needs aggregate destination
or scratch storage receives it from its caller or addresses a top-level
object. Every local variable is scalar and belongs to its activation.

Assignment between identical aggregate types copies the complete object. The
left side supplies the destination storage and the right side supplies the
source storage. Assignment through an alias changes its referent and never
changes the binding. Self-assignment has no effect.

An aggregate routine result is a transient typed alias to program-lifetime
storage. The caller may discard it, forward it as an argument or result,
select or index it, or use it immediately as the source of exact-type
aggregate assignment. Source code cannot store the carrier as a pointer or use
the result to establish a persistent source binding. Assignment is the
materialisation operation. The compiler must preserve or stage a transient
carrier when another call could overwrite it before consumption.

### Control flow, calls, failure, and traps

Nucleus retains structured conditionals, `while`, counted `for`, constant
`step`, innermost-loop `exit` and `continue`, early return, typed routines, and
direct and mutual recursion. Do not remove one of these forms merely to shrink
the first compiler.

A counted-loop counter is a predeclared scalar local and is read-only to source
statements while its loop is active. A nested counted loop cannot reuse that
local as its counter. Program variables and parameters are not counted-loop
counters. This rule keeps calls from changing loop progress without effect
analysis and lets lowering rely on the comparison that admitted the active
iteration. A program that controls its progress variable explicitly uses
`while`.

Recoverable failure is explicit through `fails`, `fail`, `else fail`, and the
same-line `handle NAME ... end` form. Nucleus has no exception search or
general unwinding. Safety traps remain distinct from recoverable errors.

## Compiler implementation direction

The first compiler uses a packed LL(1) interpreter for declaration and
statement structure. Generated tables contain the prediction rows,
productions, and semantic-action directory. Precedence expressions,
type-directed aggregate initializers, and name-led statements remain explicit
external islands because their decisions depend on retained type and symbol
information. A review must regenerate the tables and rerun the grammar
analyzer after a grammar change. Backtracking and abstract syntax trees remain
outside the first compiler plan. The packed LL(1) parser is the only active
Stage 7 implementation path.

The first compiler uses one precedence-driven loop and a compact operator
table for binary expressions. Comparison's single-use rule and Boolean
short-circuit emission remain explicit cases. Primary, postfix, unary, and
right-recursive `not` retain separate parsing where their structures differ.

The compiler parses an assignment source or return source once and then checks
the completed result category. It does not fork the grammar in advance for
scalar values, aggregate paths, aggregate results, and failable calls. At an
eligible boundary, the reserved pair `else fail` terminates the expression, and
the checker requires the complete expression to be one direct failable call.

Compact inline type descriptors and interned type ordinals are both permitted
implementation candidates. One demonstrated structural descriptor fits every
admitted type in four bytes, including arrays of records and bounded strings.
Repeated types can make one-byte interned ordinals cheaper. The selection must
count retained bytes, construction, lookup, equality, interning, capacity
checks, and exhaustion diagnostics.

Required source diagnostics remain part of the compiler contract. Replacing a
typed delimiter stack with a depth counter, for example, is not a
semantics-preserving saving when it removes required mismatch diagnostics.

## Direct-Z80 implementation direction

Direct Z80 emission is the sole active implementation path. The compiler's
semantic-operation transcript is private bounded workspace, not bytecode and
not a compatibility promise. Do not propose a portable intermediate machine as
routine cleanup; that would reverse a settled architecture decision and reopen
an interpreter, validator, image, and publication cost already retired.

Generated programs use little-endian scalars, packed records, contiguous fixed
arrays, counted bounded strings, and 16-bit address carriers for aggregate
aliases. Registers and compiler-managed locations have no runtime source type.
The compiler retains every type and extent needed to select code and checks.

Calls preserve distinct active scalar values and aggregate carriers through
ordinary and recursive invocations. The physical arrangement may use the
hardware stack, a bounded arena, saved static locations, or a measured
combination. An activation-capacity excess occurs after source arguments have
been evaluated and before a callee or caller state changes.

Exact-type aggregate assignment first checks the complete source and
destination extents. The backend may then use straight-line loads and stores,
a counted loop, `LDIR`, or a shared helper. It measures complete compiler,
generated-program, runtime, workspace, and timing effects before selecting the
policy. The source-visible copy and failure ordering do not change.

The implementation may share arithmetic tails or helpers when complete
width-specific behavior remains identical. Byte addition, subtraction,
multiplication, negation, and complement retain modulo-256 behavior; word forms
retain modulo-65,536 behavior. An economy is measured against the complete
direct compiler and runtime path, not against an isolated instruction sketch.

## Open implementation questions

The following choices remain open because they can preserve the complete
language and direct-Z80 runtime contracts:

- inline type descriptors versus interned ordinals;
- the exact shared-helper organization for scalar operations;
- inline sequences versus helper calls for width-specific operations;
- final symbol, signature, fixup, expression, and source-map capacities;
- aggregate-copy lowering in the direct backend;
- helper calls versus inlined hot paths;
- physical Z80 register allocation;
- activation-state placement;
- fixup, target-map, and generated-output organization; and
- the complete measured size and timing of the compiler and target runtime.

An experiment may change one of these choices only after preserving conformance
and reporting the relevant resource accounts. Introducing a portable bytecode
or interpreter requires an explicit project-owner redesign decision.

## Review duties

A substantive review must examine the complete current language specification
and the complete current Z80 runtime and backend contract in reader order.
Search results and old summaries are insufficient substitutes for that read.

Reviewers should test the following boundaries aggressively:

1. Cross-chapter agreement among grammar, types, storage, lifetime, calls,
   failures, traps, and examples.
2. Predictive parser feasibility and the bounded state required for every
   semantic decision.
3. Agreement between compile-time evaluation and runtime operations.
4. Correct lowering of every source category to direct Z80 and the specified runtime helpers.
5. Alias categories, aggregate-result staging, recursion, and activation failure.
6. Atomic failure behaviour for checks, copies, calls, services, and traps.
7. Capacity diagnostics before truncation, wraparound, dropped state, or
   changed meaning.
8. Agreement between the prose, machine-readable trap and service assignments,
   generated-code proofs, grammar analyzer, and conformance examples.
9. Evidence behind every Z80 byte and timing claim.
10. Prose quality under the project's human-writing standard: exact agency,
    direct wording, stable terms, verified examples, no stale history or
    provenance, and no mechanical filler.

## Finding classes

Classify every substantive finding before proposing a change.

### Correctness repair

A correctness repair resolves a contradiction, missing rule, invalid example,
unsafe transition, or authority mismatch while preserving the settled design.
State the affected locations, the governing rule, the consequence, and the
smallest complete correction.

### Semantics-preserving economy

A semantics-preserving economy changes parser structure, metadata,
organisation, lowering, helper sharing, or physical representation while
preserving accepted source and observable behaviour. Supply a concrete design,
identify every affected resource account, and provide assembled measurements
before claiming a saving.

### Language or runtime redesign

A redesign changes accepted source, type compatibility, storage duration,
alias behaviour, evaluation order, failure timing, trap behaviour, runtime
contract, generated-code validity, or observable effects. Report it separately. Do not
implement it without an explicit project-owner decision.

## Directions reviewers must not reopen implicitly

Do not present any of the following as a routine correction or size cleanup:

- language levels, profiles, or optional normative subsets;
- removal of admitted syntax to meet the bank gate;
- case-insensitive names or latest-definition lookup;
- source imports or filesystem resolution inside the compiler;
- repeated forward signatures;
- Boolean/integer interchange or arbitrary casts;
- general pointers, null, heap allocation, or pointer arithmetic;
- record subtyping, structural interfaces, generics, or inheritance;
- automatic aggregate copying for routine arguments;
- aggregate assignment that rebinds an alias;
- activation-lifetime aggregate objects;
- routine-local aggregate declarations, whether owning storage or binding an alias;
- program-variable, parameter, or source-writable counted-loop counters;
- general runtime aggregate constructors;
- arrays of arrays, open arrays, or slices;
- exception unwinding;
- interrupt routines, vector declarations, raw bank-address operations, or
  bank selectors in source;
- a portable bytecode or interpreter as an active path;
- removal of required diagnostics without explicit approval;
- conflation of compiler, workspace, target-runtime, and activation budgets;
- estimates presented as Z80 measurements; or
- historical and provenance material in the current-system books.

Any of these may be proposed as a future version or an explicit redesign. The
review report must identify that status clearly and must not blend the proposal
into repairs for Nucleus 0.1.

## Review report format

Order findings by consequence:

1. normative contradiction or unsafe behaviour;
2. source/runtime mismatch or impossible lowering;
3. grammar, capacity, or diagnostic defect;
4. unmeasured implementation cost or semantics-preserving economy;
5. example, cross-reference, or conformance gap; and
6. prose and presentation fault.

For each finding, give its class, exact location, evidence, consequence, and
smallest credible response. Distinguish confirmed defects from hypotheses that
need measurement. Finish with decisions that require the project owner; do not
convert those decisions into silent edits.
