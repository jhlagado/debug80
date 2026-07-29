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
| `E-LEX-001` | Invalid token, malformed numeric literal, unterminated import string or physical newline in a string | Specification §2.4 |
| `E-NAME-001` | Unknown name or duplicate declaration, including a case-only collision | §§2.1, 12.3 |
| `E-NAME-002` | Reserved keyword or built-in operation used as a declaration name | §§2.4, 14 |
| `E-TYPE-001` | Mixed-width or mixed-signedness integer operands without an explicit conversion | §3.1 |
| `E-TYPE-002` | Boolean/integer mixing, non-Boolean condition or invalid Boolean ordering | §§3, 8.2, 8.4 |
| `E-TYPE-003` | Invalid assignment, argument or return conversion | §§8.1, 11.3, 11.5 |
| `E-TYPE-004` | A no-result `unit` invocation used where a value is required | §§11.1–11.2 |
| `E-CONST-001` | Constant division by zero, negative shift, negative power exponent or negative `sqrt` input | §§3.1, 4.5, 8.3, 8.5 |
| `E-CONST-002` | A required constant expression reads storage, calls a routine or has another observable effect | §4.5 |
| `E-INIT-001` | Array initializer has the wrong rank, shape or element count | §4.5 |
| `E-INIT-002` | Record initializer has an unknown, duplicate or missing field | §4.5 |
| `E-INIT-003` | Reference-containing storage lacks complete valid initialization or an imported validity contract | §§4.1–4.2, 7.1 |
| `E-INIT-004` | A target cannot preload or write a placed initializer | §4.3 |
| `E-INIT-005` | A volatile/device initializer requires a startup write not explicitly supported by the profile | §4.3 |
| `E-LAYOUT-001` | Non-positive or nonconstant array extent | §6 |
| `E-LAYOUT-002` | Direct or mutual by-value record/array containment cycle | §5 |
| `E-LAYOUT-003` | Invalid `size`, `count` or `offset` operand, dimension or field path | §8.5 |
| `E-PATH-001` | Constant array index is out of range or an index is not an integer | §§6–7 |
| `E-PATH-002` | Volatile aggregate copy cannot be proven non-overlapping | §7 |
| `E-COPY-001` | Aggregate assignment has incompatible record type, element type, rank or dimensions | §7 |
| `E-COPY-002` | Assignment attempts to modify constant storage | §§4.1, 7 |
| `E-REF-001` | Null reference, reference to owned scalar local, or unsupported reference conversion | §7.1 |
| `E-REF-002` | Reference is formed from constant storage before read-only references exist | §7.1 |
| `E-REF-003` | Stored/public reference omits `near` or `far` | §7.1 |
| `E-REF-004` | Constant declaration has a type that contains a reference | §4.1 |
| `E-LOCAL-001` | Local `var` attempts to own a record or fixed array | §11.4 |
| `E-CONTROL-001` | Duplicate, overlapping or type-incompatible `case` value/range | §9.2 |
| `E-CONTROL-002` | Zero counted-loop step or start/limit incompatible with the control variable | §10.2 |
| `E-CONTROL-003` | Counted-loop body writes or exposes its control variable through a writable alias | §10.2 |
| `E-CONTROL-004` | `exit` or `continue` has no enclosing loop | §10.3 |
| `E-RETURN-001` | Bare/value return used with the wrong routine result form, or a result-bearing path reaches `end` | §11.5 |
| `E-RETURN-002` | `return` appears in a hosted body, or `exit body` appears outside one | §13.3 |
| `E-CALL-001` | Aggregate argument is a temporary/general expression or aliases constant storage | §11.3 |
| `E-CALL-002` | Call cycle occurs on a profile without recursion capability | §11.6 |
| `E-MODULE-001` | Import cycle, unresolved import or visible export collision | §§12.1–12.3 |
| `E-MODULE-002` | Exported declaration exposes a private type | §12.2 |
| `E-ENTRY-001` | Executable manifest has no unique parameterless, result-free entry routine | §12.5 |
| `E-TARGET-001` | Required native service, scalar operation, address class or other target capability is unavailable | §§13.1–13.2 |

Each error reports original source file, line and column. Import, call-cycle
and containment-cycle errors also report the relevant path. Hosted diagnostics
identify the containing host body.

## 3. Default warnings

Warnings do not change program meaning. The following are enabled by default:

| ID | Warning | Escalation |
| --- | --- | --- |
| `W-CONVERT-001` | Integer store/argument/return narrows or changes signedness without proof that the value is preserved | Project may promote to error |
| `W-EXPR-001` | Pure expression statement discards its result | Project may promote to error |
| `W-UNUSED-001` | Private declaration is unused | Project policy |
| `W-CONTROL-001` | Unreachable statement or branch | Project policy |
| `W-COST-001` | Costly helper appears in a known hot loop | Target/budget policy |
| `W-COST-002` | Static object, aggregate copy, stack frame or startup initializer is unusually large | Target/budget policy |
| `W-ADDRESS-001` | Near/far conversion has a mapping or bank-switch cost | Target policy |
| `W-NATIVE-001` | Native boundary uses conservative effects because its contract is incomplete | Project may promote to error |

A routine invocation is not considered pure merely because its result is
discarded. A compiler may add warnings, but a conforming profile documents
their identifiers and default severities.

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

1. **Counter** — byte state, arithmetic, comparison, Boolean condition and
   narrowing store.
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
8. **Pacmo** — exact six-byte record and non-power-of-two runtime stride.
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

- every integer boundary, explicit conversion and assignment conversion;
- all-literal default typing and expected-type propagation;
- per-operator constant wrapping, including `(u16(65535) + 1) / 2 = 0`;
- signed division/remainder identities and zero divisors;
- shift counts at 0, width minus one, width, above width and negative;
- power at exponents 0 and 1, `0 ^ 0`, wrapping products and negative exponent;
- `abs` at every signed minimum and `sqrt` around consecutive perfect squares;
- canonical Boolean results, short-circuit traces and invalid imported values;
- exact nested initializer shape and source evaluation order;
- `size`, `count` and `offset` on nested records and multidimensional arrays;
- exact records of 3, 4, 6 and 8 bytes with no substrate padding;
- ordinary overlapping aggregate copy and ordered non-overlapping volatile
  copy;
- scalar/aggregate references, arrays of references, `value(reference)`,
  rebind, near/far equality and checked narrowing;
- ascending default-`+1` and explicit-step loops, descending loops, zero
  iterations, unsigned boundary termination and post-loop values;
- left-to-right operands, arguments, paths and initializer fields;
- destination-path-before-source assignment evaluation;
- result-free and result-bearing routines, nested calls and early returns;
- rejected recursion cycles on non-recursive profiles and independent frames
  on recursive profiles;
- module diamond import, collisions, cycle rejection and one-time emission;
- preloaded and startup-copy placed initialization;
- ordinary and early hosted-body completion.

## 7. Required artifacts

A source-generating backend emits:

- canonical generated substrate source;
- original-to-generated provenance;
- generated-to-machine mapping where available;
- typed symbol and exact-layout data;
- selected helper/import list;
- read/write/call/fault summary;
- startup-initialization effects;
- target assumptions and optional cost report.

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
- unrestricted labels or `goto`;
- exceptions;
- generics and operator overloading;
- rich dynamic strings;
- unchecked indexing as conforming execution.

Recursion is accepted only by a profile that declares and tests the capability.
Future editions may move a feature out of this list through an explicit
specification and conformance change.
