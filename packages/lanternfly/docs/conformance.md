# Lanternfly 0.3 conformance and diagnostics

- Status: normative companion to the working 0.3 specification
- Implementation status: fixtures not yet implemented

This document turns the language contract into a testable claim. The
[working specification](specification.md) defines source meaning. This file
collects the required acceptances, rejections, warnings, faults and artifacts
that otherwise appear across individual sections.

When the two documents differ, the specification governs semantics and this
document governs the minimum conformance inventory and default diagnostic
severity.

## 1. Conformance claims

Implementations make claims at three boundaries:

1. A **0.3 front end** accepts and rejects source according to the
   specification and produces the required typed program, diagnostics and
   effect information.
2. A **target backend** preserves that typed program's behavior for one named
   target profile and passes every applicable semantic vector.
3. A **host integration** supplies a valid manifest, preserves hosted-body
   control flow and composes diagnostics and source mappings.

A backend may omit a profile capability such as far references or recursion.
It remains conforming only when it rejects uses of the unavailable capability
rather than changing their meaning.

Every fixture has a stable identifier. Future executable fixtures should keep
these identifiers even when their filenames or organization change.

## 2. Required compile-time errors

The front end must reject at least the following cases.

| ID | Required rejection | Normative source |
| --- | --- | --- |
| `E-LEX-001` | Invalid token, malformed numeric literal, unterminated compile-time string or physical newline in a string | Specification §2.4 |
| `E-NAME-001` | Unknown name, duplicate declaration, forbidden shadowing or case-only collision | §§2.1, 12.3 |
| `E-NAME-002` | Reserved keyword, built-in type or built-in operation used as a declaration name | §§2.4, 14 |
| `E-NAME-003` | Record type and callable routine share a case-insensitive name | §§2.1, 4.5 |
| `E-TYPE-001` | Integer operands differ and neither may widen value-preservingly to the type already present on the other side | §3.1 |
| `E-TYPE-002` | Boolean/integer mixing, non-Boolean condition, invalid Boolean ordering or deferred `boolean(...)` conversion | §§3, 8.2, 8.4 |
| `E-TYPE-003` | Invalid assignment, argument or return conversion | §§8.1, 11.3, 11.5 |
| `E-TYPE-004` | A no-result `unit` invocation, `clear` or `fill` used where a value is required | §§8.5, 11.1–11.2 |
| `E-CONST-001` | Constant division by zero, negative shift, negative power exponent or negative `sqrt` input | §§3.1, 4.5, 8.3, 8.5 |
| `E-CONST-002` | A required constant expression reads storage, calls a routine or has another observable effect | §4.5 |
| `E-CONST-003` | Constant, extent, record-layout, placement or layout-query dependencies form a cycle | §§2.1, 4.5 |
| `E-CONST-004` | A constant declaration omits its required explicit type | §4.1 |
| `E-INIT-001` | Array initializer has the wrong rank, shape or element count | §4.5 |
| `E-INIT-002` | Record initializer has an unknown, duplicate or missing field | §4.5 |
| `E-INIT-003` | Reference-containing storage lacks complete valid initialization or an imported validity contract | §§4.1–4.2, 7.1 |
| `E-INIT-004` | A target cannot preload or write a placed initializer | §4.3 |
| `E-INIT-005` | A volatile/device initializer requires a startup write not explicitly supported by the profile | §4.3 |
| `E-INIT-006` | Uninitialised compiler-owned storage has a type for which the target does not define an all-zero value | §§4.2, 8.5 |
| `E-LAYOUT-001` | Non-positive or nonconstant array extent | §6 |
| `E-LAYOUT-002` | Direct or mutual by-value record/array containment cycle | §5 |
| `E-LAYOUT-003` | Invalid `size`, `count` or `offset` operand, dimension or field path | §8.5 |
| `E-PATH-001` | Constant array index is out of range or an index is not an integer | §§6–7 |
| `E-PATH-002` | Volatile aggregate copy cannot be proven non-overlapping | §7 |
| `E-PATH-003` | An array access supplies a number of indices different from the selected array's rank | §§6–7 |
| `E-COPY-001` | Aggregate assignment has incompatible record type, element type, rank or dimensions | §7 |
| `E-COPY-002` | Assignment attempts to modify constant storage | §§4.1, 7 |
| `E-COPY-003` | `clear` target lacks a valid all-zero representation, or `fill` has an invalid target or value | §8.5 |
| `E-REF-001` | Null reference, reference to owned scalar local or volatile storage, or unsupported reference conversion | §§4.4, 7.1 |
| `E-REF-002` | Reference is formed from constant storage before read-only references exist | §7.1 |
| `E-REF-003` | A stored/public reference or any routine result omits `near` or `far` | §7.1 |
| `E-REF-004` | Constant declaration has a type that contains a reference | §4.1 |
| `E-LOCAL-001` | Local `var` attempts to own a record or fixed array | §11.4 |
| `E-LOCAL-002` | A local declaration uses `volatile` or `at` | §§4.3–4.4, 11.4 |
| `E-LOCAL-003` | A local collection alias names a scalar, opaque-address or bare typed-reference referent | §§7.1, 11.4 |
| `E-CONTROL-001` | Non-integer selection, or duplicate, overlapping, reversed, unrepresentable or type-incompatible `case` value/range | §9.2 |
| `E-CONTROL-002` | Invalid counted-loop control name, zero step or start/limit incompatible with the control variable | §10.2 |
| `E-CONTROL-003` | Counted-loop body may write its control variable directly, through a writable alias or through a call/native effect summary | §10.2 |
| `E-CONTROL-004` | Bare `exit` or `continue` has no enclosing loop; hosted `exit body` is not a match | §§10.3, 13.3 |
| `E-RETURN-001` | Bare/value return used with the wrong routine result form, or a result-bearing path reaches `end` | §11.5 |
| `E-RETURN-002` | `return` appears in a hosted body, or `exit body` appears outside one | §13.3 |
| `E-CALL-001` | Aggregate argument is a temporary/general expression or aliases constant or volatile storage | §§4.4, 11.3 |
| `E-CALL-002` | Call cycle occurs on a profile without recursion capability | §11.6 |
| `E-MODULE-001` | Import cycle, unresolved import or same-namespace visible export collision | §§12.1–12.3 |
| `E-MODULE-002` | Exported declaration exposes a private type | §12.2 |
| `E-EXTERN-001` | External routine has no target binding, an unsupported `at`/`from` binding, or an incompatible ABI | §§12.4, 13.2 |
| `E-EXTERN-002` | External routine is given a Lanternfly body or selected as the program entry | §§12.4, 12.6 |
| `E-BOUNDARY-001` | Native or host contract cannot guarantee declared value representation, reference validity/lifetime or immutable storage, or requires a native-to-Lanternfly callback | §§11.6, 12.4, 13.2–13.3 |
| `E-ENTRY-001` | Executable manifest has no unique parameterless, result-free source-defined entry routine | §12.6 |
| `E-TARGET-001` | Required native service, scalar operation, address class or other target capability is unavailable | §§12.4, 13.1–13.2 |
| `E-ASM-001` | `asm` block is unclosed or appears where a block is not permitted | §13.2.1 |
| `E-ASM-002` | Selected target has no compatible assembly-fragment pipeline | §13.2.1 |

Each error reports its originating input. A source error reports the original
Lanternfly file, line and column. A configuration error reports the build
manifest, host manifest or target-profile field that caused it, with a
line/column when that input format provides them. When a configuration error
also concerns a source declaration, the diagnostic includes that declaration
as a related source location. Import, call and all dependency-cycle errors
also report the relevant path. Hosted source diagnostics identify the
containing host body.

## 3. Default warnings

Warnings do not change program meaning. The following are enabled by default:

| ID | Warning | Escalation |
| --- | --- | --- |
| `W-CONVERT-001` | Integer destination conversion in an assignment, initializer, argument, return, `fill` value or counted-loop start/limit narrows or changes signedness and is neither proven value-preserving nor covered by the round-trip arithmetic exemption | Project may promote to error |
| `W-EXPR-001` | Pure expression statement discards its result | Project may promote to error |
| `W-UNUSED-001` | Private declaration is unused | Project policy |
| `W-CONTROL-001` | Unreachable statement or branch | Project policy |
| `W-COST-001` | Costly helper appears in a known hot loop | Target/budget policy |
| `W-COST-002` | Static object, aggregate copy, stack frame or startup initializer is unusually large | Target/budget policy |
| `W-ADDRESS-001` | Near/far conversion has a mapping or bank-switch cost | Target policy |
| `W-NATIVE-001` | Native boundary uses conservative effects because its contract is incomplete | Project may promote to error |
| `W-ASM-001` | Statement-level inline assembly receives the conservative read/write/call/fault/device-I/O/clobber contract | Project may promote to error |

A routine invocation is not considered pure merely because its result is
discarded. `W-ASM-001` is the specialized warning for a conservative
statement-level `asm` block and suppresses `W-NATIVE-001` for that same block;
module-level assembly receives neither warning because it has no execution
point. A compiler may add warnings, but a conforming profile documents their
identifiers and default severities.

## 4. Required runtime faults

These faults are non-returning and preserve their class and source location:

| ID | Runtime condition | Normative source |
| --- | --- | --- |
| `F-BOUNDS` | Dynamic array index is out of range | §6 |
| `F-DIV-ZERO` | Runtime divisor or `mod` divisor is zero | §3.1 |
| `F-NEGATIVE-SHIFT` | Runtime shift count is negative | §8.3 |
| `F-NEGATIVE-POWER` | Runtime power exponent is negative | §3.1 |
| `F-NEGATIVE-SQRT` | Runtime `sqrt` operand is negative | §8.5 |
| `F-ADDRESS` | Checked far-to-near conversion cannot represent the address | §7.1 |
| `F-INVALID-BOOLEAN` | Imported/native Boolean representation is not zero or one | §3 |

Overshifts are not faults; their defined zero or sign-fill results are tested
as numeric vectors. Ordinary fixed-width arithmetic overflow wraps and is not
a fault.

## 5. Minimum positive programs

Each claimed backend eventually runs every applicable program below and
compares final storage plus ordered service/fault traces:

1. **Counter** — byte state, arithmetic, comparison, Boolean condition and a
   warning-free round-trip narrowing store.
2. **Trail** — runtime array update, record-array field store and bounds check.
3. **Skyfall numeric case** — signed intermediate followed by deliberate byte
   wrap on assignment.
4. **Rushlight numeric case** — `u8 - u8` widened signed difference followed
   by `abs`.
5. **Snake** — fixed ring, masks, `select`, counted and search loops.
6. **Tetro collision** — signed spawn coordinate, reference indexing and early
   return.
7. **Tetro collapse** — array of references, local aggregate alias and
   overlapping-safe aggregate movement.
8. **Pacmo** — exact six-byte record, non-power-of-two runtime stride and
   composed byte arithmetic.
9. **TMS9918 boundary** — opaque device address passed to typed services
   without CPU dereference. Required for a target/profile claiming that device
   address-space contract.
10. **Hosted exit** — `exit body` reaches the host epilogue and preserves host
    updates. Required for a host-integration claim, not a standalone backend
    claim.

The AZM Book 3 programs extend this minimum as algorithm-by-algorithm fixtures.
Where an original program has known output, Lanternfly and AZM executions must
agree on the compared result.

## 6. Mandatory semantic vectors

The suite includes focused positive and negative vectors in addition to the ten
programs:

- every integer boundary, explicit conversion and destination conversion;
- direct negative literals at every signed minimum, both under an expected
  signed type and through an explicit signed conversion;
- every permitted value-preserving operand widening, plus rejected `u8 + i8`
  and `i16 + u16` cases that must not seek a third common type;
- chained byte expressions whose operator order selects a signed or unsigned
  16-bit intermediate;
- round-trip arithmetic assignments, arguments, returns and counted-loop
  boundaries without `W-CONVERT-001`, plus cross-type cases that retain the
  warning, including indexed and reference-based updates whose address-only
  index/reference expressions have other types;
- all-literal default typing and expected-type propagation through
  initializers, assignments, scalar arguments, returns, `fill` values and
  counted-loop boundaries;
- oversized exact literals rejected in every destination context unless an
  explicit integer conversion requests low-bit truncation;
- exact target-address expressions at `$7fff`, `$8000`, `$ffff` and one
  profile-defined far address, including `$8000 + size(type Header)` and
  arithmetic over `count` and `offset`, plus fixed-width behaviour after a
  typed constant or explicit conversion enters the address expression;
- per-operator constant wrapping, including `(u16(65535) + 1) / 2 = 0`;
- constant folding of `abs`, `sqrt`, `size`, `count` and `offset`, with the
  same operand and fault rules as their runtime or layout forms;
- signed division/remainder identities and zero divisors;
- shift counts at 0, width minus one, width, above width and negative;
- power at exponents 0 and 1, `0 ^ 0`, wrapping products and negative exponent;
- `abs` at every signed minimum and `sqrt` around consecutive perfect squares;
- canonical Boolean results, short-circuit traces and invalid imported values;
- exact nested initializer shape and source evaluation order;
- recursive constant array/record initializers, with aggregate initializers
  rejected from scalar constant-expression contexts;
- case-insensitive recognition of keywords, Boolean literals, built-in types,
  built-in operations and contextual words, with canonical lowercase formatter
  output, while `type` and `body` remain valid identifiers outside their
  contextual positions;
- logical-newline termination for consecutive declarations, simple statements
  and closing `end` lines, with identical parsing at EOF whether or not the
  final physical line has a line-ending character;
- local-name visibility after declaration, source-order local initializers and
  rejection of self- or forward-references;
- module-wide visibility for types and routine bodies, source-ordered
  constant/storage initializer references, parameter/local/module shadowing
  rejection, imported exports preceding local initializer eligibility,
  hosted-manifest collision and shadowing rules and record-field scope
  independence;
- later module constants accepted in routine-body `case` values and loop steps,
  later same-module constants rejected when referenced from module declaration
  expressions, and dependency cycles across constants, extents, record
  layouts, placements and layout queries rejected with their path;
- record/callable case-insensitive name collision rejection;
- `size`, `count` and `offset` on nested records and multidimensional arrays,
  including `type` qualification when a type and value share a name, plus
  type-only `size`/`count` traversal through a typed reference, rejection of an
  `offset` path that crosses a reference field, and rejection of calls,
  `value(...)`, nonconstant indices, out-of-range indices and faulting constant
  index expressions in an unevaluated layout path;
- terminal typed-reference layout queries, including referent size from
  `size(reference)`, array extent from `count(arrayReference)` and reference
  representation size from `size(type near ref T)`;
- exact index arity for every array rank, with partial, excessive and chained
  multidimensional indexing rejected;
- exact records of 3, 4, 6 and 8 bytes with no substrate padding;
- ordinary overlapping aggregate copy and ordered non-overlapping volatile
  copy;
- `clear` on zero-valid nested aggregates and `fill` on one- and
  multidimensional scalar arrays, including record-declaration and row-major
  nested volatile `clear` traces, row-major `fill` writes, one converted fill
  value and at most one conversion warning, plus rejection of invalid targets
  and use of either procedure in a value context;
- scalar/aggregate references, arrays of references, `value(reference)`,
  rebind, same-class near/far equality, rejected mixed-class opaque-address
  assignment/equality, rejected references/aliases/aggregate arguments rooted
  in volatile storage and checked typed-reference narrowing, including
  near-only and far-only storage formation, expected far conversion from a
  near path and rejected expected near formation from a far path. On a
  near-default profile the shorthand rejects a far argument; on a far-default
  profile it accepts a compatible far argument;
- constant reference formation from a direct static root through by-value
  fields and constant indices, rejection of traversal through a stored
  reference, and accepted far-to-near constant conversion only when the target
  proves representability at compile time;
- assignment through a field or index path rooted in a typed-reference-returning
  invocation, with the invocation evaluated once before the source expression,
  and whole-referent assignment requiring `value(invocation())`;
- ascending default-`+1` and explicit-step loops, descending loops, zero
  iterations, unsigned controls with independently typed `step -1`, invalid
  control names, unsigned boundary termination and post-loop values, plus a
  runtime preheader effect trace proving start and limit evaluation precede
  the initial control-variable store; the step is folded and zero-checked at
  compile time and has no runtime trace event;
- counted-loop rejection when a direct call, external effect contract or
  conservative inline-assembly barrier may write the control variable;
- left-to-right operands, arguments, paths and initializer fields, including a
  first-index bounds fault that prevents evaluation of a later effectful index;
- destination-path-before-source assignment evaluation;
- result-free and result-bearing routines, nested calls and early returns;
- rejected unqualified typed-reference results in both private and exported
  routines, plus rejected `boolean(...)` conversions and constant declarations
  without `as Type`;
- rejected recursion cycles on non-recursive profiles and independent frames
  on recursive profiles, plus rejection of native-to-Lanternfly callback
  bindings;
- module diamond import, collisions, cycle rejection and one-time emission;
- recursive private-type exposure rejection for exported constants, variables,
  routine parameters/results and fields of exported records;
- deterministic depth-first module installation plus declaration-order startup
  writes for placed and compiler-allocated storage, including record-field
  declaration order and row-major array leaves within an observable aggregate,
  compared as an ordered startup-effect trace, with an unplaced
  source-imported variable receiving ordinary zero initialization, an
  uninitialized placed source-imported variable retaining its target-supplied
  value, and host/native-supplied storage retaining its supplied value;
- accepted ascending `select` ranges and mixed-width constants representable
  in the selected type, plus rejected unrepresentable, reversed, duplicate and
  overlapping values/ranges after normalization to the selected type,
  rejection of the independently typed all-literal case `65535 + 1`,
  acceptance and zero normalization of `u16(65535) + 1`, and rejected
  non-integer selections;
- external routines bound by address, substrate symbol and profile name,
  including decoded quoted-string escapes, adapter metadata, conservative
  incomplete effects and missing binding rejection, plus rejected native and
  host contracts that omit Boolean/reference representation or lifetime
  guarantees, conservative host/native effects that block an unsafe counted
  loop call, and nonconforming providers that mutate immutable storage;
- preloaded and startup-copy placed initialization;
- verbatim module and statement `asm` emission, emission-only module-block
  metadata, conservative statement barriers, case-insensitive closing
  delimiters, arbitrary device-I/O effects, assembler-diagnostic mapping and
  rejection by an incompatible backend, with `W-ASM-001` alone on a
  conservative statement block and no runtime-effect warning on a module
  block;
- ordinary and early hosted-body completion, including hosted `exit body`
  without `E-CONTROL-004`, repeated entries with freshly initialized locals,
  independent locals for overlapping entries and static scratch only under a
  non-overlap host contract;
- typed host constants in hosted `case`, range and counted-loop-step constant
  expressions, manifest records with ordinary exact layout, and each host
  resource mapped to an existing constant, address, storage or routine
  category rather than a core `resource` declaration.

## 7. Required artifacts

A source-generating backend emits:

- canonical generated substrate source;
- original-to-generated provenance;
- generated-to-machine mapping where available;
- typed symbol and exact-layout data;
- selected helper/import list;
- external bindings and generated ABI adapters;
- read/write/call/fault/device-I/O summary;
- startup-initialization effects;
- routine-frame and static-scratch allocation;
- module-assembly emission/provenance ranges;
- statement-assembly ranges and conservative runtime effects;
- target assumptions and optional cost report.

A host integration additionally emits hosted early-exit paths, the local-frame
or static-scratch strategy, and any non-overlap assumption used to justify
static scratch.

A single source node may map to several generated or machine ranges. Backend or
assembler diagnostics retain generated context and map back to the responsible
Lanternfly location.

## 8. Deferred-feature rejection

The first implemented edition does not silently accept:

- floating point;
- dynamic allocation, a heap or garbage collection;
- owning aggregate automatic locals;
- aggregate return by value;
- read-only or nullable references;
- references to owned scalar locals;
- bit fields and bank-spanning arrays;
- indirect calls and procedure references;
- native or inline-assembly callbacks into source-defined Lanternfly routines;
- unrestricted labels or `goto`;
- exceptions;
- generics and operator overloading;
- rich dynamic strings;
- unchecked indexing as conforming execution.

Recursion is accepted only by a profile that declares and tests the capability.
Future editions may move a feature out of this list through an explicit
specification and conformance change.
