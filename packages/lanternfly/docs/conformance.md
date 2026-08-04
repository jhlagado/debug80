# Lanternfly 0.7 conformance and diagnostics

- Status: normative companion to the 0.7 implementation baseline
- Implementation status: fixtures not yet implemented

This document turns the language contract into a testable claim. The
[specification](specification.md) defines source meaning. This file
collects the required acceptances, rejections, warnings, faults and artifacts
that otherwise appear across individual sections. The
[implementation plan](implementation-plan.md) defines the order in which these
fixtures become executable.

When the two documents differ, the specification governs semantics and this
document governs the minimum conformance inventory and default diagnostic
severity.

## 1. Conformance claims

Implementations make claims at three boundaries:

1. A **0.7 front end** accepts and rejects source according to the
   specification and produces the required typed program, diagnostics and
   effect information.
2. A **target backend** preserves that typed program's behavior for one named
   target profile and passes every applicable semantic vector.
   control flow and composes diagnostics and source mappings.

A backend may omit a profile capability such as far aggregate access or
recursion. It remains conforming only when it rejects uses of the unavailable
capability rather than changing their meaning.

Every fixture has a stable identifier. Future executable fixtures should keep
these identifiers even when their filenames or organization change.

### 1.1 Development-stage claims

Levels 0, 1 and 2 are nested subsets of one language, as section 1 of the
specification defines them. A
development build may report that a construct belongs to a later milestone,
but it cannot claim a conforming 0.7 front end until it accepts every required
0.7 construct and passes the complete applicable inventory.

Milestone reports state:

```text
implemented milestone
passed conformance IDs
expected later-stage rejections
supported target/profile capabilities
known implementation defects
```

An expected later-stage rejection is distinct from a language error. Tests
must not record it under an `E-*` identifier reserved for invalid Lanternfly
source. Development builds use `D-STAGE-001` with error severity and name the
required milestone. This diagnostic disappears as the implementation advances
and is excluded from conformance claims.

### 1.2 Executable fixture contract

Each executable fixture records:

```text
stable conformance ID
language edition
minimum milestone
source and source identity
host manifest when applicable
target profile
expected diagnostics and related locations
expected typed facts
expected final storage
expected ordered service or fault trace
expected artifact assertions
```

Positive semantic fixtures compare final storage and ordered traces. They do
not require byte-for-byte generated source unless the fixture tests canonical
emission or provenance. Negative fixtures compare diagnostic ID, severity,
primary location, required related locations, and the absence of later
emission or execution.

The first executable sequence is Counter, static text,
Dot, Slide, Trail, focused numeric/control vectors, exact layout vectors,
Tetro and Pacmo storage bodies, then source-routine versions of those bodies.
The source-routine stage adds forward-declaration program fixtures: a
mutually recursive routine pair with correct results on a
recursion-capable profile and `E-CALL-002` on one without recursion, an
uncompleted forward declaration rejected under `E-FORWARD-001`, and a
mismatched completing header rejected under `E-FORWARD-002`.
This order supplies a vertical host-to-backend path before broadening the
language surface.

## 2. Required compile-time errors

A conforming compiler reports each condition below by its identifier. The
identifier is the contract; the message text is not. An implementation may
carry numeric codes alone and take their text from its environment, which is
what a self-hosting compiler on a small target does.

A conforming compilation must reject at least the following cases at the
responsible configuration, front-end, placement or backend stage.

| ID               | Required rejection                                                                                                                                                                                                                                                                                                                                                                                                 | Normative source                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `E-CONFIG-001`   | Malformed host manifest or target profile, unsupported format/version, missing required field, unknown field, invalid primitive field such as a representation byte outside 0 through 255, unknown provider-representation or address-validity-rule tag, or a union with a missing field or a field forbidden by its selected alternative                                                                          | Implementation plan §5           |
| `E-CONFIG-002`   | Duplicate configuration ID; well-shaped unresolved binding, validity-contract, provider-symbol, registry, component or placement-region reference; wrong provider byte length; invalid range/mask rule; inconsistent source span; impossible exact layout or memory region; invalid enum/subrange/array domain, aggregate constant or type composition; or address-class/representation-width/host-target mismatch | Implementation plan §5           |
| `E-LEX-001`      | Invalid token, malformed numeric literal, unterminated literal or physical newline in quoted text                                                                                                                                                                                                                                                                                                                  | Specification §2.4               |
| `E-PARSE-001`    | Token sequence does not match the 0.7 grammar, including a malformed declaration or statement, an unexpected delimiter, or a missing ordinary block `end`                                                                                                                                                                                                                                                          | Specification §15                |
| `E-TEXT-001`     | Empty or multi-byte character literal, unsupported direct character or escape, embedded NUL, or oversized string literal                                                                                                                                                                                                                                                                                           | §§2.4, 3.2                       |
| `E-TEXT-002`     | String capacity outside 1 through 65,534; oversized constant assignment or append; zero constant byte append; invalid string operation, parameter shape or attempted access to the sealed representation                                                                                                                                                                                                           | §3.2                             |
| `E-NAME-001`     | Unknown name, use before declaration, duplicate declaration, forbidden shadowing or case-only collision                                                                                                                                                                                                                                                                                                            | §§2.1, 12.3                      |
| `E-NAME-002`     | Reserved keyword, built-in type or built-in operation used as a declaration name                                                                                                                                                                                                                                                                                                                                   | §§2.4, 14                        |
| `E-NAME-003`     | Record, enum or range type and callable routine share a case-insensitive name                                                                                                                                                                                                                                                                                                                                      | §§2.1, 4.5                       |
| `E-TYPE-001`     | Integer operands differ and neither may widen value-preservingly to the type already present on the other side                                                                                                                                                                                                                                                                                                     | §3.1                             |
| `E-TYPE-002`     | Boolean/integer mixing, non-Boolean condition, invalid Boolean ordering or deferred `boolean(...)` conversion                                                                                                                                                                                                                                                                                                      | §§3, 8.2, 8.4                    |
| `E-TYPE-003`     | Invalid assignment, argument or return conversion, including a non-text `writeText` argument or a non-string, immutable or otherwise unwritable `readArgument` destination                                                                                                                                                                                                                              | §§8.1, 11.3, 11.5, 12.4.1–12.4.2 |
| `E-TYPE-004`     | A no-result `unit` invocation, `clear`, `fill` or `append` used where a value is required                                                                                                                                                                                                                                                                                                                          | §§8.5, 11.1–11.2                 |
| `E-TYPE-005`     | Invalid enum representation, empty or reversed subrange, incompatible ordinal family, or constant outside an enum/subrange domain                                                                                                                                                                                                                                                                                  | §3                               |
| `E-CONST-001`    | Constant division by zero, negative shift, negative power exponent or negative `sqrt` input                                                                                                                                                                                                                                                                                                                        | §§3.1, 4.5, 8.3, 8.5             |
| `E-CONST-002`    | A required constant expression reads storage, calls a routine, uses a provider-bound address value or contains another ineligible runtime value or observable effect                                                                                                                                                                                                                                               | §§4.5, 12.6                      |
| `E-CONST-004`    | An unannotated initializer produces neither an exact integer nor one scalar type, or a string, record, array or placed constant omits its required type                                                                                                                                                                                                                                                              | §4.1                             |
| `E-INIT-001`     | Array initializer has the wrong rank, shape or element count                                                                                                                                                                                                                                                                                                                                                       | §4.5                             |
| `E-INIT-002`     | Record initializer has an unknown, duplicate or missing field                                                                                                                                                                                                                                                                                                                                                      | §4.5                             |
| `E-INIT-004`     | A target cannot preload or write a placed initializer                                                                                                                                                                                                                                                                                                                                                              | §4.3                             |
| `E-INIT-005`     | A volatile/device initializer requires a startup write not explicitly supported by the profile                                                                                                                                                                                                                                                                                                                     | §4.3                             |
| `E-INIT-006`     | Uninitialised compiler-owned storage has a type whose all-zero value is invalid, including an address class whose selected validity rule rejects an all-zero representation; a derived cell is exempt under §17.5                                                                                                                                                                                                                                        | §§3, 4.2, 8.5                    |
| `E-LAYOUT-001`   | Empty, reversed, nonconstant or otherwise invalid array index domain                                                                                                                                                                                                                                                                                                                                               | §6                               |
| `E-LAYOUT-003`   | Invalid `byteSize`, `size`, `lower`, `upper` or `offset` operand, dimension or field path, including `size` on a record                                                                                                                                                                                                                                                                                                                             | §8.5                             |
| `E-PATH-001`     | Constant array index is out of range or an index has an incompatible ordinal type                                                                                                                                                                                                                                                                                                                                  | §§6–7                            |
| `E-PATH-002`     | Volatile aggregate copy cannot be proven non-overlapping                                                                                                                                                                                                                                                                                                                                                           | §7                               |
| `E-PATH-003`     | An array access supplies a number of indices different from the selected array's rank                                                                                                                                                                                                                                                                                                                              | §§6–7                            |
| `E-COPY-001`     | Aggregate assignment has incompatible record type, element type, rank or dimensions                                                                                                                                                                                                                                                                                                                                | §7                               |
| `E-COPY-002`     | Assignment attempts to modify constant storage                                                                                                                                                                                                                                                                                                                                                                     | §§4.1, 7                         |
| `E-COPY-003`     | `clear` target lacks a valid all-zero representation, or `fill` has an invalid target or value                                                                                                                                                                                                                                                                                                                     | §8.5                             |
| `E-ALIAS-001`    | Alias target is not an exact string, record or array storage path, or is constant or volatile                                                                                                                                                                                                                                                                                                                      | §§3.2, 7.1, 11.4                 |
| `E-ALIAS-002`    | Exported aggregate parameter omits a leading `near` or `far`, a leading storage class appears on a scalar parameter, or an argument's storage class cannot bind to its parameter                                                                                                                                                                                                                                   | §§7.1, 11.3                      |
| `E-LOCAL-002`    | A local declaration uses `volatile` or `at`                                                                                                                                                                                                                                                                                                                                                                        | §§4.3–4.4, 11.4                  |
| `E-LOCAL-003`    | A local alias declares a scalar or opaque-address type                                                                                                                                                                                                                                                                                                                                                             | §§7.1, 11.4                      |
| `E-CONTROL-001`  | Non-ordinal selection, or empty, duplicate, overlapping, reversed, unrepresentable or type-incompatible `case` value/range                                                                                                                                                                                                                                                                                         | §9.2                             |
| `E-CONTROL-002`  | Invalid or volatile counted-loop control name, zero step, incompatible start/boundary, or a continuing value outside the control type                                                                                                                                                                                                                                                                              | §10.1                            |
| `E-CONTROL-003`  | Counted-loop body may write its control variable directly or through a call/native effect summary                                                                                                                                                                                                                                                                                                                  | §10.1                            |
| `E-CONTROL-004`  | `exit` or `continue` has no enclosing loop                                                                                                                                                                                                                                                                                                                                                                         | §10.4                            |
| `E-CONTROL-005`  | `for each` operand is not a fixed-array storage path, its binding collides with a visible name, or the array is volatile                                                                                                                                                                                                                                                                                           | §10.2                            |
| `E-RETURN-001`   | Bare/value return used with the wrong routine result form, or a result-bearing path reaches `end`                                                                                                                                                                                                                                                                                                                  | §11.5                            |
| `E-FAIL-001`     | A failable invocation has no `or fail`, failure default or bound `on error` block, or appears nested inside a larger expression, argument list or non-outermost position                                                                                                                                                                                                                                             | §11.8                            |
| `E-FAIL-002`     | `fail` or `or fail` appears in a routine without a `fails` clause, or `or fail` propagates between different error-set types                                                                                                                                                                                                                                                                                        | §11.8                            |
| `E-FAIL-003`     | A `fails` operand is not a `u8`-representation enum, a `fail` operand is not a member of the declared error set, a failure default is type-incompatible with the result, contains a failable invocation or appears on a result-free call                                                                                                                                                                            | §11.8                            |
| `E-FAIL-004`     | An `on error` block binds to a statement with no failable invocation or one already carrying an `or` form, carries a colliding binding name, or can complete normally when bound to a local declaration initializer; `exit`/`continue` in a declaration-bound block is ordinary `E-CONTROL-004`                                                                                                                     | §§10.4, 11.8                     |
| `E-FAIL-005`     | A `fails` clause appears on an external routine                                                                                                                                                                                                                                                                                                                                                                   | §§11.8, 12.4                     |
| `E-DEFER-001`    | A `defer` appears inside a control structure, or its deferred statement contains a failable invocation, `fail`, `return`, `exit`, `continue`, an `or` form or an `on error` clause                                                                                                                                                                                                                   | §11.9                            |
| `E-CALL-001`     | Aggregate argument is a temporary/general expression or aliases constant storage for a writable parameter, or aliases volatile storage                                                                                                                                                                                                                                                                                                                       | §§4.4, 11.3                      |
| `E-CALL-002`     | A source call-graph cycle, direct or through forward-declared routines, occurs on a profile without recursion capability                                                                                                                                                                                                                                                                                           | §§11.6–11.7                      |
| `E-LOCAL-001`    | A per-invocation aggregate local is declared in a routine that belongs to a direct or mutual recursive cycle; the remedies are `static var`, a caller-supplied aggregate, or an explicit frame pool                                                                                                                                                                                                                | §11.4                            |
| `E-FORWARD-001`  | Module end is reached with a forward declaration that has no completing body                                                                                                                                                                                                                                                                                                                                       | §11.6                            |
| `E-FORWARD-002`  | Completing header differs from its forward declaration in name spelling, export status, parameter storage classes, names, types or order, result form or `fails` clause, or a forward form appears on a declaration category other than a source routine                                                                                                                                                           | §11.6                            |
| `E-MODULE-001`   | Root or import source-module path lacks the exact lowercase `.lafy` extension; import cycle, unresolved import or same-namespace visible export collision                                                                                                                                                                                                                                                          | §§12.1–12.3, 12.6                |
| `E-MODULE-002`   | Exported declaration exposes a private type                                                                                                                                                                                                                                                                                                                                                                        | §12.2                            |
| `E-MODULE-003`   | An `import` appears after a declaration or module assembly block instead of in the module's contiguous import prefix                                                                                                                                                                                                                                                                                               | §§12.1, 15                       |
| `E-EXTERN-001`   | External routine has no target binding, a callable or external-binding substrate symbol does not resolve, an `at`/`from` binding is unsupported, or a binding/ABI/adapter relationship is incompatible                                                                                                                                                                                                             | §§12.4, 13.2                     |
| `E-EXTERN-002`   | External routine is given a Lanternfly body or designated as a program's start                                                                                                                                                                                                                                                                                                                                       | §§12.4, 12.6                     |
| `E-BOUNDARY-001` | A well-shaped resolved provider or native value fails the address class's selected validity rule or a service cannot preserve it; a native or host contract cannot guarantee ordinal/Boolean/address validity, aggregate storage class/layout/lifetime, string layout/invariants or immutable storage; or the integration requires a native callback                                                               | §§3, 11.7, 12.4, 12.6, 13.2–13.3 |
| `E-ENTRY-001`    | A program has no scheduled body and no designated start                                                                                                                                                                                                                                                        | §12.6                            |
| `E-ENTRY-002`    | A designated start does not resolve, names an ineligible declaration, names a task type an `auto task` has already instantiated, or is omitted where the root module has no single eligible export; an `extern sub` named as a start reports `E-EXTERN-002` instead                                                                        | §12.6                            |
| `E-ENTRY-004`    | A program with no scheduled body imports `standard/instant-clock.lafy`                                                                                                | §§12.4.3, 12.6                   |
| `E-TASK-001`     | Task-typed record field or local, or an `auto task` that states parameters                                                                                             | §17.1                            |
| `E-TASK-002`     | `wait` appears outside a task body                                                                                                                                    | §§15, 17.2                       |
| `E-STATE-001`    | State declaration carrying `at` or `volatile`                                                           | §17.3                            |
| `E-STATE-002`    | A state cell is written, or a pulse raised, outside a prologue, an epilogue, a task body or a subroutine one of those calls; or a state cell is passed as a writable aggregate argument or bound by `alias`                                                                                                | §17.3                            |
| `E-PARAM-001`    | A write through an unmarked aggregate parameter, or `write` on a scalar, `extern sub` or task-type parameter                                                           | §§11.3, 15                       |
| `E-DERIVE-001`   | Circular reference among derivations                                                                                                                                  | §17.5                            |
| `E-DERIVE-002`   | A routine reachable from a derivation writes module storage                                                                                                           | §17.5                            |
| `E-WAIT-001`     | Constant `after` operand above 32,767                                                                                                                                 | §§12.6, 17.2                     |
| `E-BLOCK-001`    | A bounded- or unbounded-blocking external routine is called from a task body, a routine reachable from a derivation, or a subroutine one of those calls                                               | §§12.4, 12.6                     |
| `E-TARGET-001`   | Required native service, optional standard-module binding, program-termination outcome, callable profile availability, scalar operation, address class or other target capability is unavailable                                                                                                                                                                                                                    | §§12.4, 12.6, 13.1–13.2          |
| `E-CAP-001`      | A capability-gated word or facility, including a 32-bit integer type or string capacity above 254, is mentioned in a module that lacks its own enabling standard capability import, including gated use of another module's exports without the direct import                                                                                                                                                         | §§1.1, 3, 3.2                    |
| `E-PLACE-001`    | Source or build placement cannot fit a compatible target region because of address range, permissions, alignment, capacity, overlap or an unavailable initialization mechanism                                                                                                                                                                                                                                     | §4.3                             |
| `E-PLACE-002`    | Emitted substrate bytes, reserved addresses or symbols disagree with the validated placement plan, including output outside a region, at a wrong address or over another range                                                                                                                                                                                                                                     | §§4.3, 13.2                      |
| `E-MAP-001`      | A required generated-source map cannot be composed because an anchor is missing or duplicated, anchored text changed, or a provenance span lies outside its fragment                                                                                                                                                                                                                                               | §13.2.2                          |

Each error reports its originating input. A source error reports the original
Lanternfly file, line and column. A configuration error reports the build
manifest, host manifest or target-profile field that caused it, with a
line/column when that input format provides them. When a configuration error
also concerns a source declaration, the diagnostic includes that declaration
as a related source location. Import, call and all dependency-cycle errors
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
| `W-NATIVE-001`  | Native boundary omits effects or explicitly uses `{ kind: "conservative" }`                                                                                                                                                                | Project may promote to error |
| `W-NATIVE-002`  | An unbounded-blocking external routine is called                                                                                                                                                                                          | Project may promote to error |

A routine invocation is not considered pure merely because its result is
discarded.
module-level assembly receives neither warning because it has no execution
point. A compiler may add warnings, but a conforming profile documents their
identifiers and default severities.

## 4. Required runtime faults

These faults are non-returning and preserve their class and source location:

| ID                  | Runtime condition                                                     | Normative source |
| ------------------- | --------------------------------------------------------------------- | ---------------- |
| `F-BOUNDS`          | Dynamic array index is out of range                                   | §6               |
| `F-RANGE`           | A checked ordinal or string destination rejects its runtime value     | §§3, 8.1, 8.5    |
| `F-DIV-ZERO`        | Runtime divisor or `mod` divisor is zero                              | §3.1             |
| `F-NEGATIVE-SHIFT`  | Runtime shift count is negative                                       | §8.3             |
| `F-NEGATIVE-POWER`  | Runtime power exponent is negative                                    | §3.1             |
| `F-NEGATIVE-SQRT`   | Runtime `sqrt` operand is negative                                    | §8.5             |
| `F-LOOP-RANGE`      | A counted loop must store a continuing value outside its control type | §10.1            |
| `F-INVALID-BOOLEAN` | Imported/native Boolean representation is not zero or one             | §3               |
| `F-WAIT-RANGE`      | Runtime `after` operand exceeds 32,767                                | §§12.6, 17.2     |
| `F-INVALID-STRING`  | A native write leaves an invalid string representation                | §§3.2, 13.2      |

Overshifts are not faults; their defined zero or sign-fill results are tested
as numeric vectors. Ordinary fixed-width arithmetic overflow wraps and is not
a fault.

## 5. Minimum positive programs

Each claimed backend eventually runs every applicable program below and
compares final storage plus ordered service/fault traces:

1. **Counter** — byte state, arithmetic, comparison, Boolean condition and a
   warning-free round-trip narrowing store.
2. **Trail** — runtime array update, record-array field store and bounds check.
3. **Ordinal domains** — enum and subrange assignment, non-zero and
   enum-indexed arrays, matching counted traversal, eliminated proven checks
   and ordered `F-RANGE`/`F-BOUNDS` traces.
4. **Skyfall numeric case** — signed intermediate followed by deliberate byte
   wrap on assignment.
5. **Rushlight numeric case** — `u8 - u8` widened signed difference followed
   by `abs`.
6. **Snake** — fixed ring, masks, `select`, counted and search loops.
7. **Tetro collision** — signed spawn coordinate, multidimensional indexing
   and early return.
8. **Tetro collapse** — plane selectors, local aggregate alias and
   overlapping-safe aggregate movement.
9. **Pacmo** — exact six-byte record, non-power-of-two runtime stride and
   composed byte arithmetic.
10. **TMS9918 boundary** — a `near address` or `far address` value carrying
    target device-space metadata is passed to typed services without CPU
    dereference. Required for a target/profile claiming that device-space
    contract.
11. **Text** — character-byte arithmetic; empty and nonempty string literals;
    short and long strings; checked assignment and append; `length` and content
    comparison.
12. **Standard text I/O** — explicit standard-module imports; character, text
    and newline output in order; and nonblocking `pollCharacter` returning an
    injected byte and consuming it, against returning zero and consuming
    nothing, through injected target services. Each
    half is required only for a profile that claims the corresponding optional
    module.
13. **Program arguments** — zero, one and several launcher arguments;
    repeated reads; a fitting and overlong destination; an invalid index; and
    the invocation name excluded from the argument list. Required only for a
    profile that claims the optional program-arguments module.
    host updates. Required for a host-integration claim, not a standalone
    backend claim.
15. **Error handling** — an error-set enum; a failable parser exercising
    `fail` on each member; `or fail` propagation through an intermediate
    routine, including a tail-position propagation; a failure default; an
    `on error` block on a loop-body assignment ending in `continue` and on
    a local declaration initializer ending in `return` or `fail`; an
    exhaustive `select` over the caught code; and a `defer` whose cleanup
    runs on the ordinary return, the `fail` and the propagated exits,
    latest-registered first, with the propagated code preserved across
    cleanup; plus a failable designated subroutine whose successful
    and failed executions reach the profile's distinct termination outcomes. Level 1 only, because it
    requires source routines.

The Tetro and Pacmo programs exercise module storage and routine locals.
Level 1 reruns source-routine versions with parameters, per-call locals, ABI frames
and ordinary routine return.

The AZM Book 3 programs extend this minimum as algorithm-by-algorithm fixtures.
Where an original program has known output, Lanternfly and AZM executions must
agree on the compared result.

## 6. Mandatory semantic vectors

Every positive vector or fixture that mentions `u32`, `i32` or a string
capacity above 254 supplies the enabling `standard/wide32.lafy` or
`standard/long-strings.lafy` import in its source. The capability-gating
vectors are:

- each gated facility mentioned without its enabling import rejected under
  `E-CAP-001` at the gated mention;
- each enabled capability whose target requirements are unsatisfied rejected
  under `E-TARGET-001`: a missing representation width such as a `u32`
  declaration on a profile without 32-bit integers, an exceeded capacity or
  static-object limit, an unavailable scalar-operation category, and an
  unbound runtime component, including a gated use that selects no
  component;
- an imported but unused capability accepted, with no capability-component
  bytes in the emitted program and every kernel vector's observable
  behaviour unchanged, demonstrating monotone imports and use-selected cost;
- a module importing a `u32`-exporting module without
  `standard/wide32.lafy`, accepted while it mentions no gated facility and
  rejected under `E-CAP-001` at its first gated mention;
- a compiled export interface recording its required capability IDs, with
  separate compilation reproducing both cross-module results;
- diagnostic precedence: a gated word used as a declaration name reports
  the reserved-word error `E-NAME-002` whether or not the import is
  present; `E-CAP-001` applies to gated use, not to naming.

The suite includes focused positive and negative vectors in addition to the
programs above:

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
- unannotated exact integer constants preserved through exact arithmetic and
  later adopted by typed destinations; annotated constants applying their
  expected fixed-width rules; typed scalar inference for Boolean expressions,
  integer conversions, enum members and subrange values; exported exact
  integer constants retaining their mathematical value across modules;
- rejection of width-dependent `not`, `shr`, `and`, `or` and `xor` over only
  exact untyped operands, with acceptance once an operand supplies a type;
- `E-CONST-004` for an unannotated string, record, array or placed constant and
  for any other initializer that supplies neither one scalar type nor an exact
  integer result;
- oversized exact literals rejected in every destination context unless an
  explicit integer conversion requests low-bit truncation;
- exact target-address expressions at `$7fff`, `$8000`, `$ffff` and one
  profile-defined far address, including `$8000 + byteSize(type Header)` and
  arithmetic over `size` and `offset`, plus fixed-width behaviour after a
  typed constant or explicit conversion enters the address expression;
- per-operator constant wrapping, including `(u16(65535) + 1) / 2 = 0`;
- constant folding of `abs`, `sqrt`, literal `length`, `byteSize`, `size`,
  `lower`, `upper` and `offset`, with the same operand and fault rules as their
  runtime or layout forms, including enum members and typed ordinal
  `lower`/`upper` results;
- direct and escaped character literals at representative byte boundaries,
  with empty, multi-byte, malformed and non-ASCII cases rejected;
- empty and nonempty string literals, escape decoding,
  default/near/far placement of initialized string storage, `u16`
  length and all six lexicographic comparisons, including a 65,534-byte
  payload accepted by the language when the target can store the resulting
  65,537-byte long-form object, and a 65,535-byte payload rejected;
- rejection of embedded NUL, unsupported direct characters, oversized text
  and integer/address conversion;
- `string[1]`, `string[254]`, `string[255]` and `string[65534]` exact layouts,
  with short-form lengths from zero through capacity, long-form lengths from
  zero through capacity, lengths of 255 or more occurring only in long form,
  each form's all-ones length rejected, and `byteSize` folding to `N + 2` or
  `N + 3`;
- all-zero empty strings; literal and cross-capacity initialization;
  checked assignment from strings and literals; overlapping snapshot
  copies; `clear`; `append` from short/long strings, literals and nonzero bytes;
  constant and dynamic overflow before any destination write; and constant or
  dynamic zero-byte append rejection;
- string `length` as a header read returning `u16`, lexicographic
  comparison across capacities and against literals, and a native contract
  that reads the terminated payload directly after valid owner mutation;
- sealed string representation, with every attempted header, payload
  or terminator path rejected; exact-capacity aggregate aliases and parameters;
  `string[24][8]` layout; and rejected owned aggregate locals, by-value results,
  ordinary source-declared capacity-generic parameters, indexing, slicing and
  truncating copy;
- two `auto task` instances interleaving across instants in declaration order;
  a task suspending at `wait on` and resuming with its locals intact; a derive
  chain settling within one settle phase; a task's writes queued and visible
  only at the next instant; a pulse delivered once
  and cleared at the instant's end; a cross-module write to an exported state
  cell waking a dependent in a third module; the pass that runs every derive
  rule before the first instant; termination at quiescence; and `E-TASK-001`,
  an unmarked aggregate parameter accepted for reading, a state cell and a
  constant aggregate each passed to one, a `write` parameter mutating caller
  storage, and `E-PARAM-001` for every write path through it; a conditional expression grouping `if b then a else c + 1`
  with the addition inside the else branch, the same parenthesised, one
  inside a `derive` expression, and one as an `if` statement's condition; a
  `wait on` with two triggers resuming on either, and the pulse read as a
  Boolean in the instant it is delivered;
  a generic aggregate parameter receiving arrays of two different sizes, its
  `size` read from the carrier and used as a counted-loop limit, forwarded to
  a second generic routine, and a generic string grown by comparing `length`
  against `size`; changed bits raised once at a body's suspension rather than
  once per element written;
  `E-STATE-001`, `E-STATE-002`, `E-DERIVE-001`, `E-DERIVE-002`, `E-PARAM-001`,
  `E-WAIT-001`, `E-TASK-002` and `E-BLOCK-001`; a prologue and an epilogue around the
  instants, the epilogue running on quiescence and on an unhandled failure;
- explicit imports of `standard/text-output.lafy` and
  `standard/character-poll.lafy`; `writeCharacter` with exact and typed `u8`
  values; `writeText` over literals plus constant and mutable short- and
  long-form strings of different capacities; one-time path evaluation;
  read-only access with no source mutation; target-appropriate newline events;
  `pollCharacter` returning an injected `u8` and returning zero where the
  injected device has nothing waiting, consuming a byte in the first case and
  none in the second; ordered device-I/O traces; `E-TYPE-003` for a non-text
  `writeText` argument; and `E-TARGET-001` when the selected profile lacks a
  claimed binding;
- explicit import of `standard/instant-clock.lafy`; `instantCount` advancing
  by one each instant, a wrap-safe `after` deadline firing across the
  counter's wrap, and `E-ENTRY-004` when the program has no
  scheduled body;
- explicit import of `standard/program-arguments.lafy`; `argumentCount`
  returning zero, one and 255; `readArgument` with fitting short and long
  destinations, repeated reads of one index, one-time operand evaluation, an
  overlong or zero-containing argument storing the longest valid prefix and
  returning `false`, an invalid index clearing the destination and returning
  `false`, ordered launcher-input and destination-write traces, exclusion of
  the invocation name from index zero, `E-TYPE-003` for an invalid destination
  and `E-TARGET-001` for a missing claimed binding;
- signed division/remainder identities and zero divisors;
- shift counts at 0, width minus one, width, above width and negative;
- power at exponents 0 and 1, `0 ^ 0`, wrapping products and negative exponent;
- `abs` at every signed minimum and `sqrt` around consecutive perfect squares;
- canonical Boolean results; false-`and` and true-`or` traces proving that the
  right operand performs no call, storage access, check or fault; true-`and`
  and false-`or` traces proving one right-operand evaluation; both-operand
  traces for Boolean `xor` and every integer word operation; and invalid
  imported values;
- exact nested initializer shape and source evaluation order;
- nested constant array/record initializers, with aggregate initializers
  rejected from scalar constant-expression contexts;
- case-insensitive recognition of keywords, Boolean literals, built-in types,
  built-in operations and contextual words, with canonical lowercase formatter
  output, while `type` and `error` remain valid identifiers outside their
  contextual positions: an accepted `var error as u8` declaration and its
  ordinary reads and writes alongside an `on error` clause in the same
  routine, with `error` recognized as the contextual word only immediately
  after `on`;
- logical-newline termination for consecutive declarations, simple statements
  and closing `end` lines, with identical parsing at EOF whether or not the
  final physical line has a line-ending character, plus accepted zero-statement
  `if`, `else`, `case`, counted-loop, `for each` and `while` blocks and rejected
  malformed block structure under `E-PARSE-001`;
- local-name visibility after declaration, source-order local initializers and
  rejection of self- or forward-references;
- contiguous import prefixes, depth-first import resolution and imported
  exports available before local declarations, exact lowercase `.lafy` source
  module paths, rejection of another extension under `E-MODULE-001`, and a
  later import rejected; reserved `standard/` resolution that cannot be
  shadowed by a project search path, with no implicit standard imports;
- declaration-before-use for module types, constants, storage and routines,
  including earlier routine calls, direct self-calls and calls to
  forward-declared routines accepted, calls to unforwarded later routines
  rejected, forward completion and header match checked under `E-FORWARD-001`
  and `E-FORWARD-002`, and parameter/local/module shadowing plus record-field
  scope independence preserved;
- routine-body `case` values and loop steps using imported or earlier module
  constants, with later constants rejected under `E-NAME-001`; complete record
  and array layouts derived only from earlier types, with direct or mutual
  recursive containment rejected as use before declaration;
- unqualified enum members, automatic zero-based ordinals, explicit enum
  representation widths, nominal enum and subrange identity, base-type
  widening, checked ordinal conversion and `F-RANGE` before a failed
  destination store;
- inclusive `to` and exclusive `until` subranges over integers and enums,
  including a one-past-maximum integer boundary and rejection of empty,
  reversed, unrepresentable and cross-ordinal-family domains;
- `select` traces with one matching case body followed by the continuation
  after the final `end`, no execution of the following case body, shared case
  bodies for comma-separated values and `else` for an unmatched selector;
- type/callable case-insensitive name collision rejection;
- `byteSize`, `size`, `lower`, `upper` and `offset` on nested records,
  multidimensional arrays and local aggregate aliases, including `type`
  qualification when a type and value share a name, plus rejection of calls,
  nonconstant indices, out-of-range indices and faulting constant index
  expressions in an unevaluated layout path;
- exact index arity for every array rank, with partial, excessive and chained
  multidimensional indexing rejected;
- count shorthand, inclusive and exclusive array bounds, enum and named
  subrange index domains, non-zero lower-bound address calculation,
  initializer/traversal order, `lower`/`upper` queries and proof-based removal
  when an index type is contained by its dimension;
- exact records of 3, 4, 6 and 8 bytes with no substrate padding;
- ordinary overlapping aggregate copy and ordered non-overlapping volatile
  copy;
- repeated scalar volatile reads and writes preserved as distinct ordered trace
  events, including accesses separated by a call or another observable
  operation;
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
  `far handles as near address[8]`, rejection when the argument array's storage
  cannot bind to `far`, rejection of an incompatible address element class
  and rejection of a leading storage class on a scalar parameter;
- rejected mixed-class opaque-address assignment/equality and rejection of
  every attempt to derive an opaque address from storage or a storage path from
  an opaque address;
- inclusive `to` and exclusive `until` with default and explicit steps,
  descending loops, zero iterations from a mismatched step direction, unsigned
  controls with independently typed `step -1`, invalid control names, unsigned
  boundary termination and post-loop values, rejected volatile control
  storage, plus `u8` traversal to
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
- a repeated-path trace such as
  `array[nextIndex()] = array[nextIndex()] or mask`, proving that the destination
  and source are separate path occurrences and call `nextIndex()` twice in that
  order;
- result-free and result-bearing routines, nested calls and early returns;
  designated start selection by manifest, both with the declaration named and
  with it omitted where the root module has one eligible export; `E-ENTRY-001` and `E-ENTRY-002`;
  a prologue followed by instants in one program; a task that handles its own
  failure and returns while the program continues, against an unhandled task
  failure that ends the program immediately with the failing body's deferred
  statements run and the other tasks' left unrun; normal completion and `fail` from a
  designated subroutine carrying a `u8` error-set enum; zero-based error
  members preserved inside Lanternfly; and numeric-status profiles mapping
  success to zero and failed ordinal `n` to `n + 1`;
- rejected aggregate results, routine names used as values, indirect calls and
  `boolean(...)` conversions;
- rejected direct self-recursion on non-recursive profiles and independent
  per-invocation scalar state on recursive profiles — with save-around
  restore stubs preserving the whole return channel on success and failure
  paths — plus rejection of later-routine calls, mutual recursion without an
  explicit future facility and native-to-Lanternfly callback bindings;
- single-instruction volatile word access on targets that provide it, never
  split into byte accesses an interrupt could divide;
- module diamond import, collisions, cycle rejection, contiguous-prefix
  enforcement and one-time resolution/emission;
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
  non-ordinal selections;
- external routines bound by address, substrate symbol and profile name;
  `hostSymbol` and `targetBinding` callable implementations; direct and adapted
  ABI matches; all-target and selected-profile availability plus
  `E-TARGET-001` for another profile; omitted and explicit conservative effects
  normalized to the same read-all/write-all/unknown-call/fault/device-I/O/
  mapping-change/normal-return summary with `W-NATIVE-001`; declared effects;
  rejection of `pure: true` with nonempty or `allVisible` reads/writes, unknown
  calls, device I/O, mapping changes or a non-pure listed callable; independent
  pure `mayFault`; decoded quoted-string escapes; adapter metadata; missing
  binding and unresolved callable/external-symbol rejection; plus rejected
  native and host contracts that omit Boolean or address representation
  validity, aggregate storage-class/layout/lifetime guarantees, or string
  layout and sealed invariants, validation and `F-INVALID-STRING` after a
  declared native string write, conservative host/native effects that block an
  unsafe counted loop call, and nonconforming providers that mutate immutable
  storage;
- exact `externalBindings`, `callableAbiDefinitions`, `adapterDefinitions`,
  `runtimeComponents`, `faultBindings`, `substrateSymbolResolver`,
  `programTermination`,
  `callableCostMetadata`, `addressBindings` and `addressValidityContracts`
  registry names and closed records; external substrate-symbol and
  runtime-component alternatives; registry implementation-ID resolution;
  unique IDs; acyclic runtime dependencies; ABI and adapter endpoint
  resolution; matching external/component ABI; non-returning fault components;
  fixed, range and unknown cost metadata; numeric and nonnumeric program
  termination; and focused rejection for every unresolved or inconsistent
  reference;
- target memory regions and placement defaults with valid permissions,
  alignment and non-overlap; deterministic allocation around explicit `at`
  ranges; preloaded and startup-copy placed initialization; AZM `.org`
  independent origin; final addressed output accepted only when every
  initialized byte, reserved address and symbol agrees with the placement plan;
  and focused `E-PLACE-001` and `E-PLACE-002` failures;
  metadata, conservative statement barriers, case-insensitive closing
  delimiters, arbitrary device-I/O effects, assembler-diagnostic mapping and
  conservative statement block, no runtime-effect warning on a module block,
  and the contract requirement that statement assembly leave every visible
  enum, subrange, Boolean, address and string representation
  valid;
  the host epilogue and value-return rejection, repeated entries with freshly
  initialized locals, independent locals for overlapping entries and static
  scratch only under a non-overlap host contract;
  expressions; immutable aggregate host constants with ordinary initializer,
  type-identity and exact-layout rules; manifest enums, subranges, records and
  ordinal arrays with ordinary representation, nominal-domain and layout
  validation; aggregate storage class present on storage symbols and aggregate
  callable parameters but absent from type entries; provider-bound
  `near address` and `far address` constants whose host entries contain a
  declared type and one `ProviderAddressReference` holding only a binding ID;
  target-profile `ProviderAddressBinding` entries that supply the class, a
  closed `{ kind: "substrateSymbol", symbol }` or
  `{ kind: "bytes", bytes[] }` representation and optional `deviceSpaceId`;
  address-class capabilities that supply `representationWidth` and
  `validityContractId`; contract/class/manifest width agreement; byte values at
  zero and 255 plus rejected out-of-range bytes and wrong-length arrays;
  target-endian `unsignedRange` decoding; accepted and rejected examples of
  `allBitPatterns`, inclusive `unsignedRange`, and per-byte `maskedBytes`,
  including mask/expected lengths equal to `representationWidth / 8` and zero
  expected bits outside the mask; configuration- and link-phase
  `substrateSymbolResolver` fixtures; configuration-time byte validation and
  deferred link-time validation before emitted-program completion; unresolved
  provider symbols as `E-CONFIG-002`, unresolved callable or external-binding
  symbols as `E-EXTERN-001`, and resolved invalid provider bytes as
  `E-BOUNDARY-001`; zero-validity
  derived from each rule, including `E-INIT-006` for omitted initialization when
  zero is invalid; `E-CONFIG-001` for malformed closed-union shape or primitive
  bytes,
  `E-CONFIG-002` for well-shaped length, rule, ID, symbol, class or width errors,
  and `E-BOUNDARY-001` for a resolved value or service that fails the selected
  rule; class validation when each reference is resolved; the closed
  `TargetLimits` fields, a boundary capacity whose exact string object fits,
  `E-CONFIG-001` for missing or unknown limit fields, `E-CONFIG-002` for
  nonpositive, out-of-language-range or mutually inconsistent limits, and
  `E-TARGET-001` for source objects or decoded string literals beyond valid
  profile limits;
  acceptance of the bound value in ordinary runtime use but rejection from
  source constant expressions; and each host resource mapped to an ordinary or
  provider-bound constant, storage or callable category rather than a core
  `resource` declaration;
- failable-routine vectors: success and each failure member observed through
  every consumption form; the failure default evaluated only on failure and
  its side effects absent on success; the `on error` destination unwritten on
  failure; propagation returning the callee's code unchanged through one and
  two levels; Boolean `or` and the failure default distinguished by operand
  type in otherwise identical statements; deferred statements executed in
  reverse registration order on every exit class, with volatile accesses in
  their program order; each `E-FAIL` and `E-DEFER` rejection at its smallest
  distinguishing program; and a fault raised inside a failable routine
  remaining non-returning — never observed as a failure value.

## 7. Required artifacts

A source-generating backend emits:

- canonical generated substrate source;
- original-to-generated provenance with stable node IDs, source spans,
  generated roles and fragment-relative generated spans;
- deterministic generated anchor labels and anchored-fragment identities;
- generated-to-machine mapping where available;
- typed symbol and exact-layout data;
- validated memory-region and placement plan;
- final initialized-byte, reserved-address and symbol maps compared with that
  plan;
- string layouts, placement classes and
  source-byte mappings;
- selected helper/import list;
- selected standard modules and service bindings;
- external bindings and generated ABI adapters;
- read/write/call/fault/device-I/O summary;
- startup-initialization effects;
- routine-frame and static-scratch allocation;
- module-assembly emission/provenance ranges;
- statement-assembly ranges and conservative runtime effects;
- target assumptions and optional cost report.

or static-scratch strategy, and any non-overlap assumption used to justify
static scratch.

A single source node may map to several generated or machine ranges. Backend or
assembler diagnostics retain generated context and map back to the responsible
Lanternfly location.

For an AZM backend, required provenance fixtures also establish that:

- one source statement may own several non-contiguous machine ranges;
- a folded node may own no machine range and is not mapped to adjacent code;
- host glue without a Lanternfly origin remains attributed to generated AZM;
- inline assembly retains its original payload line and column;
- runtime helper code maps to runtime source while its call-site relation is
  retained;
- an assembler diagnostic selects the exact responsible Lanternfly span and
  preserves its generated AZM location;
- a missing anchor, duplicate anchor, changed fragment or out-of-fragment span
  reports `E-MAP-001` and produces no misleading partial map;
- identical inputs produce identical anchor names and composed mappings.

## 8. Deferred-feature rejection

The first implemented edition does not silently accept:

- floating point;
- dynamic allocation, a heap or garbage collection;
- owning aggregate automatic locals;
- aggregate return by value;
- first-class storage references, pointers, address-of and dereference;
- stored, returned, nullable or scalar aliases;
- output and in/out aggregate parameters outside the narrow
  standard `writeText` and `readArgument` service contracts;
- bit fields and bank-spanning arrays;
- indirect calls, procedure values and closures;
- native or inline-assembly callbacks into source-defined Lanternfly routines;
- unrestricted labels or `goto`;
- unwinding exceptions or any caught-region form;
- `fails` on external routines, error-set inclusion across distinct enums,
- generics and operator overloading;
- resizable or heap-backed strings;
- implicit byte-array-to-string conversion and unbounded string writes;
- general streams, file handles and file-system operations;
- unchecked indexing as conforming execution.

Recursion is accepted only by a profile that declares and tests the capability.
Future editions may move a feature out of this list through an explicit
specification and conformance change.
