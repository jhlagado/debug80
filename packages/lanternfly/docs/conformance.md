# Lanternfly 0.4 conformance and diagnostics

- Status: normative companion to the working 0.4 specification
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

1. A **0.4 front end** accepts and rejects source according to the
   specification and produces the required typed program, diagnostics and
   effect information.
2. A **target backend** preserves that typed program's behavior for one named
   target profile and passes every applicable semantic vector.
3. A **host integration** supplies a valid manifest, preserves hosted-body
   control flow and composes diagnostics and source mappings.

A backend may omit a profile capability such as far aggregate access or
recursion. It remains conforming only when it rejects uses of the unavailable
capability rather than changing their meaning.

Every fixture has a stable identifier. Future executable fixtures should keep
these identifiers even when their filenames or organization change.

## 2. Required compile-time errors

The front end must reject at least the following cases.

| ID               | Required rejection                                                                                                                                                                                         | Normative source             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `E-LEX-001`      | Invalid token, malformed numeric literal, unterminated literal or physical newline in quoted text                                                                                                          | Specification §2.4           |
| `E-TEXT-001`     | Empty or multi-byte character literal, unsupported direct character or escape, embedded NUL, or oversized C-string literal                                                                                 | §§2.4, 3.2                   |
| `E-TEXT-002`     | Invalid C-string conversion, operation, address-class combination or omitted required `near`/`far` qualifier                                                                                               | §3.2                         |
| `E-NAME-001`     | Unknown name, duplicate declaration, forbidden shadowing or case-only collision                                                                                                                            | §§2.1, 12.3                  |
| `E-NAME-002`     | Reserved keyword, built-in type or built-in operation used as a declaration name                                                                                                                           | §§2.4, 14                    |
| `E-NAME-003`     | Record type and callable routine share a case-insensitive name                                                                                                                                             | §§2.1, 4.5                   |
| `E-TYPE-001`     | Integer operands differ and neither may widen value-preservingly to the type already present on the other side                                                                                             | §3.1                         |
| `E-TYPE-002`     | Boolean/integer mixing, non-Boolean condition, invalid Boolean ordering or deferred `boolean(...)` conversion                                                                                              | §§3, 8.2, 8.4                |
| `E-TYPE-003`     | Invalid assignment, argument or return conversion                                                                                                                                                          | §§8.1, 11.3, 11.5            |
| `E-TYPE-004`     | A no-result `unit` invocation, `clear` or `fill` used where a value is required                                                                                                                            | §§8.5, 11.1–11.2             |
| `E-CONST-001`    | Constant division by zero, negative shift, negative power exponent or negative `sqrt` input                                                                                                                | §§3.1, 4.5, 8.3, 8.5         |
| `E-CONST-002`    | A required constant expression reads storage, calls a routine or has another observable effect                                                                                                             | §4.5                         |
| `E-CONST-003`    | Constant, extent, record-layout, placement or layout-query dependencies form a cycle                                                                                                                       | §§2.1, 4.5                   |
| `E-CONST-004`    | A constant declaration omits its required explicit type                                                                                                                                                    | §4.1                         |
| `E-INIT-001`     | Array initializer has the wrong rank, shape or element count                                                                                                                                               | §4.5                         |
| `E-INIT-002`     | Record initializer has an unknown, duplicate or missing field                                                                                                                                              | §4.5                         |
| `E-INIT-003`     | C-string-containing storage lacks complete valid initialization or an imported validity contract                                                                                                           | §§3.2, 4.1–4.2               |
| `E-INIT-004`     | A target cannot preload or write a placed initializer                                                                                                                                                      | §4.3                         |
| `E-INIT-005`     | A volatile/device initializer requires a startup write not explicitly supported by the profile                                                                                                             | §4.3                         |
| `E-INIT-006`     | Uninitialised compiler-owned storage has a type for which the target does not define an all-zero value                                                                                                     | §§4.2, 8.5                   |
| `E-LAYOUT-001`   | Non-positive or nonconstant array extent                                                                                                                                                                   | §6                           |
| `E-LAYOUT-002`   | Direct or mutual by-value record/array containment cycle                                                                                                                                                   | §5                           |
| `E-LAYOUT-003`   | Invalid `size`, `count` or `offset` operand, dimension or field path                                                                                                                                       | §8.5                         |
| `E-PATH-001`     | Constant array index is out of range or an index is not an integer                                                                                                                                         | §§6–7                        |
| `E-PATH-002`     | Volatile aggregate copy cannot be proven non-overlapping                                                                                                                                                   | §7                           |
| `E-PATH-003`     | An array access supplies a number of indices different from the selected array's rank                                                                                                                      | §§6–7                        |
| `E-COPY-001`     | Aggregate assignment has incompatible record type, element type, rank or dimensions                                                                                                                        | §7                           |
| `E-COPY-002`     | Assignment attempts to modify constant storage                                                                                                                                                             | §§4.1, 7                     |
| `E-COPY-003`     | `clear` target lacks a valid all-zero representation, or `fill` has an invalid target or value                                                                                                             | §8.5                         |
| `E-ALIAS-001`    | Alias target is not an exact aggregate storage path, or is constant or volatile                                                                                                                            | §§7.1, 11.4                  |
| `E-ALIAS-002`    | Exported aggregate parameter omits a leading `near` or `far`, a leading storage class appears on a scalar parameter, or an argument's storage class cannot bind to its parameter                           | §§7.1, 11.3                  |
| `E-LOCAL-001`    | Local `var` attempts to own a record or fixed array                                                                                                                                                        | §11.4                        |
| `E-LOCAL-002`    | A local declaration uses `volatile` or `at`                                                                                                                                                                | §§4.3–4.4, 11.4              |
| `E-LOCAL-003`    | A local alias declares a scalar or opaque-address type                                                                                                                                                     | §§7.1, 11.4                  |
| `E-CONTROL-001`  | Non-integer selection, or duplicate, overlapping, reversed, unrepresentable or type-incompatible `case` value/range                                                                                        | §9.2                         |
| `E-CONTROL-002`  | Invalid or volatile counted-loop control name, zero step, incompatible start/boundary, or a continuing value outside the control type                                                                      | §10.1                        |
| `E-CONTROL-003`  | Counted-loop body may write its control variable directly or through a call/native effect summary                                                                                                          | §10.1                        |
| `E-CONTROL-004`  | `exit` or `continue` has no enclosing loop                                                                                                                                                                 | §10.4                        |
| `E-CONTROL-005`  | `for each` operand is not a fixed-array storage path, its binding collides with a visible name, or the array is volatile                                                                                   | §10.2                        |
| `E-RETURN-001`   | Bare/value return used with the wrong routine result form, or a result-bearing path reaches `end`                                                                                                          | §11.5                        |
| `E-RETURN-002`   | A hosted-body `return` supplies a value                                                                                                                                                                    | §13.3                        |
| `E-CALL-001`     | Aggregate argument is a temporary/general expression or aliases constant or volatile storage                                                                                                               | §§4.4, 11.3                  |
| `E-CALL-002`     | Call cycle occurs on a profile without recursion capability                                                                                                                                                | §11.6                        |
| `E-MODULE-001`   | Import cycle, unresolved import or same-namespace visible export collision                                                                                                                                 | §§12.1–12.3                  |
| `E-MODULE-002`   | Exported declaration exposes a private type                                                                                                                                                                | §12.2                        |
| `E-EXTERN-001`   | External routine has no target binding, an unsupported `at`/`from` binding, or an incompatible ABI                                                                                                         | §§12.4, 13.2                 |
| `E-EXTERN-002`   | External routine is given a Lanternfly body or selected as the program entry                                                                                                                               | §§12.4, 12.6                 |
| `E-BOUNDARY-001` | Native or host contract cannot guarantee declared values, aggregate storage class/layout/lifetime, C-string termination/program lifetime or immutable storage, or requires a native-to-Lanternfly callback | §§3.2, 11.6, 12.4, 13.2–13.3 |
| `E-ENTRY-001`    | Executable manifest has no unique parameterless, result-free source-defined entry routine                                                                                                                  | §12.6                        |
| `E-TARGET-001`   | Required native service, scalar operation, address class or other target capability is unavailable                                                                                                         | §§12.4, 13.1–13.2            |
| `E-ASM-001`      | `asm` block is unclosed or appears where a block is not permitted                                                                                                                                          | §13.2.1                      |
| `E-ASM-002`      | Selected target has no compatible assembly-fragment pipeline                                                                                                                                               | §13.2.1                      |

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

| ID              | Warning                                                                                                                                                                                                                                    | Escalation                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `W-CONVERT-001` | Integer destination conversion in an assignment, initializer, argument, return, `fill` value or counted-loop start narrows or changes signedness and is neither proven value-preserving nor covered by the round-trip arithmetic exemption | Project may promote to error |
| `W-EXPR-001`    | Pure expression statement discards its result                                                                                                                                                                                              | Project may promote to error |
| `W-UNUSED-001`  | Private declaration is unused                                                                                                                                                                                                              | Project policy               |
| `W-CONTROL-001` | Unreachable statement or branch                                                                                                                                                                                                            | Project policy               |
| `W-COST-001`    | Costly helper appears in a known hot loop                                                                                                                                                                                                  | Target/budget policy         |
| `W-COST-002`    | Static object, aggregate copy, stack frame or startup initializer is unusually large                                                                                                                                                       | Target/budget policy         |
| `W-ADDRESS-001` | Near/far conversion has a mapping or bank-switch cost                                                                                                                                                                                      | Target policy                |
| `W-NATIVE-001`  | Native boundary uses conservative effects because its contract is incomplete                                                                                                                                                               | Project may promote to error |
| `W-ASM-001`     | Statement-level inline assembly receives the conservative read/write/call/fault/device-I/O/clobber contract                                                                                                                                | Project may promote to error |

A routine invocation is not considered pure merely because its result is
discarded. `W-ASM-001` is the specialized warning for a conservative
statement-level `asm` block and suppresses `W-NATIVE-001` for that same block;
module-level assembly receives neither warning because it has no execution
point. A compiler may add warnings, but a conforming profile documents their
identifiers and default severities.

## 4. Required runtime faults

These faults are non-returning and preserve their class and source location:

| ID                  | Runtime condition                                                     | Normative source |
| ------------------- | --------------------------------------------------------------------- | ---------------- |
| `F-BOUNDS`          | Dynamic array index is out of range                                   | §6               |
| `F-DIV-ZERO`        | Runtime divisor or `mod` divisor is zero                              | §3.1             |
| `F-NEGATIVE-SHIFT`  | Runtime shift count is negative                                       | §8.3             |
| `F-NEGATIVE-POWER`  | Runtime power exponent is negative                                    | §3.1             |
| `F-NEGATIVE-SQRT`   | Runtime `sqrt` operand is negative                                    | §8.5             |
| `F-LOOP-RANGE`      | A counted loop must store a continuing value outside its control type | §10.1            |
| `F-ADDRESS`         | Checked far-to-near C-string conversion cannot represent the address  | §3.2             |
| `F-INVALID-BOOLEAN` | Imported/native Boolean representation is not zero or one             | §3               |

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
6. **Tetro collision** — signed spawn coordinate, multidimensional indexing
   and early return.
7. **Tetro collapse** — plane selectors, local aggregate alias and
   overlapping-safe aggregate movement.
8. **Pacmo** — exact six-byte record, non-power-of-two runtime stride and
   composed byte arithmetic.
9. **TMS9918 boundary** — opaque device address passed to typed services
   without CPU dereference. Required for a target/profile claiming that device
   address-space contract.
10. **Static text** — character-byte arithmetic, empty and nonempty C-string
    literals, `length`, content comparison and an external print-style call.
11. **Hosted return** — bare `return` reaches the host epilogue and preserves
    host updates. Required for a host-integration claim, not a standalone
    backend claim.

The AZM Book 3 programs extend this minimum as algorithm-by-algorithm fixtures.
Where an original program has known output, Lanternfly and AZM executions must
agree on the compared result.

## 6. Mandatory semantic vectors

The suite includes focused positive and negative vectors in addition to the
eleven programs:

- every integer boundary, explicit conversion and destination conversion;
- direct negative literals at every signed minimum, both under an expected
  signed type and through an explicit signed conversion;
- every permitted value-preserving operand widening, plus rejected `u8 + i8`
  and `i16 + u16` cases that must not seek a third common type;
- chained byte expressions whose operator order selects a signed or unsigned
  16-bit intermediate;
- round-trip arithmetic assignments, arguments, returns and counted-loop starts
  without `W-CONVERT-001`, plus cross-type cases that retain the warning,
  including indexed updates whose index expressions have other types;
- all-literal default typing and expected-type propagation through
  initializers, assignments, scalar arguments, returns, `fill` values and
  counted-loop starts;
- oversized exact literals rejected in every destination context unless an
  explicit integer conversion requests low-bit truncation;
- exact target-address expressions at `$7fff`, `$8000`, `$ffff` and one
  profile-defined far address, including `$8000 + size(type Header)` and
  arithmetic over `count` and `offset`, plus fixed-width behaviour after a
  typed constant or explicit conversion enters the address expression;
- per-operator constant wrapping, including `(u16(65535) + 1) / 2 = 0`;
- constant folding of `abs`, `sqrt`, literal `length`, `size`, `count` and
  `offset`, with the same operand and fault rules as their runtime or layout
  forms;
- direct and escaped character literals at representative byte boundaries,
  with empty, multi-byte, malformed and non-ASCII cases rejected;
- empty and nonempty C-string literals, one appended NUL byte, escape decoding,
  literal pooling invariance, default/near/far placement, near-to-far
  conversion, identity conversion in each address class, explicit
  `far cstr(...)` widening, profile-default `cstr(...)` conversion,
  rejected near-to-far conversion on a profile unable to attach its mapping
  context, compile-time-proven constant far-to-near conversion, rejected
  unprovable constant narrowing, runtime `F-ADDRESS`, `u16` length and all six
  lexicographic comparisons;
- rejection of embedded NUL, unsupported direct characters, oversized text,
  integer/address conversion, missing public or stored address-class
  qualification and attempted mutation through `cstr`;
- signed division/remainder identities and zero divisors;
- shift counts at 0, width minus one, width, above width and negative;
- power at exponents 0 and 1, `0 ^ 0`, wrapping products and negative exponent;
- `abs` at every signed minimum and `sqrt` around consecutive perfect squares;
- canonical Boolean results, short-circuit traces and invalid imported values;
- exact nested initializer shape and source evaluation order;
- nested constant array/record initializers, with aggregate initializers
  rejected from scalar constant-expression contexts;
- case-insensitive recognition of keywords, Boolean literals, built-in types,
  built-in operations and contextual words, with canonical lowercase formatter
  output, while `type` remains a valid identifier outside its contextual
  position;
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
- `size`, `count` and `offset` on nested records, multidimensional arrays and
  local aggregate aliases, including `type` qualification when a type and value
  share a name, plus rejection of calls, nonconstant indices, out-of-range
  indices and faulting constant index expressions in an unevaluated layout
  path;
- exact index arity for every array rank, with partial, excessive and chained
  multidimensional indexing rejected;
- exact records of 3, 4, 6 and 8 bytes with no substrate padding;
- ordinary overlapping aggregate copy and ordered non-overlapping volatile
  copy;
- `clear` on zero-valid nested aggregates and `fill` on one- and
  multidimensional scalar arrays, including record-field declaration order and
  row-major array order in nested volatile `clear` traces, row-major `fill`
  writes, one converted fill value and at most one conversion warning, plus
  rejection of invalid targets and use of either procedure in a value context;
- direct paths, integer pool links, multidimensional replacement of regular
  pointer tables and selector-based dispatch for irregular fixed choices;
- aggregate parameters and local aggregate aliases, including one-time path
  evaluation, write-through access, nested aggregate calls, near/far storage
  constraints, copying from `destination = alias`, copying into
  `alias = source`, and rejection of scalar aliasing, constant targets and
  volatile targets;
- independent aggregate and element address classes, including acceptance of
  `far labels as near cstr[8]`, rejection when the argument array's storage
  cannot bind to `far`, rejection of an incompatible C-string element class
  and rejection of a leading storage class on a scalar parameter;
- rejected mixed-class opaque-address assignment/equality and rejection of
  every attempt to derive an opaque address from storage or a storage path from
  an opaque address;
- inclusive `to` and exclusive `until` with default and explicit steps,
  descending loops, zero iterations, unsigned controls with independently
  typed `step -1`, invalid control names, unsigned boundary termination and
  post-loop values, rejected volatile control storage, plus `u8` traversal to
  the exclusive exact boundary 256; a runtime preheader trace proves start and
  boundary evaluation precede the initial control-variable store, while the
  step has no runtime trace event;
- `for each` traversal over scalar, record, constant and multidimensional
  arrays in row-major order, including scalar read, comparison, copy, argument,
  return and write-through uses; aggregate copies and calls; `continue`,
  `exit`; nested binding scope and collision rejection; one effect trace
  proving that the complete collection path and all its indices run once; and
  rejected volatile arrays;
- `while false`, ordinary conditional iteration and `while true` with
  conditionally executed `continue` and `exit`;
- counted-loop rejection when a direct call, external effect contract or
  conservative inline-assembly barrier may write the control variable;
- left-to-right operands, arguments, paths and initializer fields, including a
  first-index bounds fault that prevents evaluation of a later effectful index;
- destination-path-before-source assignment evaluation;
- result-free and result-bearing routines, nested calls and early returns;
- rejected aggregate results, routine names used as values, indirect calls,
  `boolean(...)` conversions and constant declarations without `as Type`;
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
  host contracts that omit Boolean representation, aggregate
  storage-class/layout/lifetime guarantees, C-string termination or C-string
  program lifetime, including rejection of a temporary native C-string result,
  conservative host/native effects that block an unsafe counted loop call, and
  nonconforming providers that mutate immutable storage;
- preloaded and startup-copy placed initialization;
- verbatim module and statement `asm` emission, emission-only module-block
  metadata, conservative statement barriers, case-insensitive closing
  delimiters, arbitrary device-I/O effects, assembler-diagnostic mapping and
  rejection by an incompatible backend, with `W-ASM-001` alone on a
  conservative statement block and no runtime-effect warning on a module
  block;
- ordinary and early hosted-body completion, including bare `return` reaching
  the host epilogue and value-return rejection, repeated entries with freshly
  initialized locals, independent locals for overlapping entries and static
  scratch only under a non-overlap host contract;
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
- static C-string payloads, placement classes and source-byte mappings;
- selected helper/import list;
- external bindings and generated ABI adapters;
- read/write/call/fault/device-I/O summary;
- startup-initialization effects;
- routine-frame and static-scratch allocation;
- module-assembly emission/provenance ranges;
- statement-assembly ranges and conservative runtime effects;
- target assumptions and optional cost report.

A host integration additionally emits hosted early-return paths, the local-frame
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
- first-class storage references, pointers, address-of and dereference;
- stored, returned, nullable or scalar aliases;
- read-only aggregate parameters;
- bit fields and bank-spanning arrays;
- indirect calls, procedure values and closures;
- native or inline-assembly callbacks into source-defined Lanternfly routines;
- unrestricted labels or `goto`;
- exceptions;
- generics and operator overloading;
- rich dynamic strings;
- implicit writable-buffer-to-`cstr` conversion and unbounded string writes;
- unchecked indexing as conforming execution.

Recursion is accepted only by a profile that declares and tests the capability.
Future editions may move a feature out of this list through an explicit
specification and conformance change.
