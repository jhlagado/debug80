# Lanternfly language completeness review

Status: design analysis for the 0.4 working language

Lanternfly now covers the central executable vocabulary of a small structured
BASIC or Pascal: scalar values, declarations, expressions, decisions, loops,
routines, modules, fixed arrays and records. Version 0.4 adds character
literals and static C strings. The remaining gaps are concentrated around
safe access to variable-size regions, text mutation, small named types and
portable service contracts.

The [working specification](specification.md) governs accepted syntax and
semantics. This review ranks the next design work.

## Static text in 0.4

The first text facility uses the representation already consumed by common
Z80 and AZM routines:

```lanternfly
const banner as near cstr = "LANTERNFLY"
const digitZero as u8 = '0'

extern sub printText(text as near cstr)
extern sub printChar(value as u8)

sub showDigit(value as u8)
    printText(banner)
    printChar('0' + value)
end
```

A `cstr` is a non-null, read-only address-class value pointing to static bytes
terminated by zero. Its runtime value contains only the address-class
representation. This makes a literal suitable for AZM `.cstr` data and for
firmware routines that already accept a pointer to NUL-terminated bytes.

Character literals produce exact byte values, so existing routines that accept
`u8` receive them directly. Direct literal characters use ASCII. Named
platform encodings can be added later as explicit conversion or resource
steps, while `\xHH` records an exact target byte when needed.

The language defines `length(cstr)` and content comparison. Assignment copies
the view, while the referenced bytes remain immutable. Writable text continues
to use byte arrays until the language has a capacity-carrying view.

## Capability audit

| Capability                                      | 0.4 position                           | Assessment                                                                                 |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Fixed-width integers and Boolean values         | Specified                              | Sufficient for the current machine and game corpus                                         |
| Character literals                              | Specified as byte-valued literals      | Sufficient for ASCII-oriented firmware and display calls                                   |
| Static strings                                  | `near cstr` and `far cstr`             | Sufficient for messages, labels, command arguments and read-only native calls              |
| Mutable strings                                 | Byte arrays only                       | High-priority gap; safe routines need a buffer capacity                                    |
| String operations                               | Length and comparison                  | Copy, append, search and substring need bounded source and destination views               |
| Arrays and records                              | Fixed, exact and statically allocated  | Stronger than many early BASIC dialects and comparable to the relevant Pascal subset       |
| Variable-size array arguments                   | Exact-shape aggregate aliases only     | High-priority gap for reusable algorithms                                                  |
| Read-only parameters                            | Available only through `cstr`          | High-priority gap for constant arrays, records and general views                           |
| Routines and local scalars                      | Specified                              | Core procedural programming is covered                                                     |
| Local arrays and records                        | Aliases to existing storage            | Deliberate first-edition limit; Pascal-style owned locals need a frame and cost policy     |
| Output and in/out parameters                    | Not yet available for scalars          | A declared parameter mode would provide the feature without adding pointer values          |
| Aggregate and multiple results                  | Caller-owned storage only              | Parameter modes can cover the current corpus before aggregate return values are added      |
| Enumerations                                    | Constants only                         | Useful next type feature for states, directions, colours and selectors                     |
| Type aliases                                    | Absent                                 | Useful for imported layouts; lower priority than facilities required by current algorithms |
| Standard numeric library                        | `abs` and `sqrt`                       | Add `min`, `max`, `clamp` and bit count after the core numeric rules are implemented       |
| Standard input and output                       | Supplied by external/platform routines | The boundary is sound, but standard profile contracts still need names and semantics       |
| Compile-time data tables                        | Aggregate constants                    | Covers the useful role of BASIC `DATA`/`READ` for fixed programs                           |
| Assertions and controlled termination           | Runtime fault hooks only               | Add user-facing assertion syntax for tests and debug builds                                |
| Floating point                                  | Deferred capability                    | Important for some desktop BASIC programs, unnecessary for the current Z80 game corpus     |
| Heap values and dynamic collections             | Deferred                               | Consistent with the static-memory target and current evidence                              |
| Files, clocks, graphics, sound and random input | Platform libraries                     | Correctly remain outside the core language                                                 |

## Immediate companion: bounded views

Static strings expose why an exact-array-only parameter model is incomplete.
A routine that copies text needs three facts:

1. where the source begins;
2. where the destination begins;
3. how many bytes the destination can hold.

A terminating zero identifies the end of valid source text. It says nothing
about destination capacity. A routine that receives a start location without a
capacity can overrun the destination while still receiving a well-formed C
string.

The next storage design should introduce read-only and writable bounded views,
with a surface that preserves Lanternfly's address-free value model. A single
view abstraction can serve strings, sorting, table scans and partial array
operations:

```text
read view of u8
write view of u8
```

The runtime representation can remain an address plus element count. The
surface design must settle:

- read-only, output and in/out access;
- formation from fixed arrays and subranges;
- near and far address classes;
- whether `count(view)` is a runtime value;
- overlap rules for copying;
- bank-boundary restrictions.

This facility has higher priority than concatenation syntax. It creates the
contract needed to implement bounded copy, append and substring operations
while retaining static allocation.

## Portable text and console contracts

`print`, keyboard input and display control vary sharply across TEC-1G,
TRS-80, ZX81, ZX Spectrum, C and hosted BASIC targets. They should be ordinary
platform routines collected into named profiles rather than core statements.

A small console-style profile should define contracts equivalent to:

```lanternfly
extern sub writeChar(value as u8)
extern sub writeText(text as near cstr)
extern sub readChar() as u8
```

Targets can bind those signatures to firmware, emulator services, generated C
or BASIC runtime code. Screen coordinates, colours, key matrices and
nonblocking input belong to more specific profiles.

Writable text support should then add bounded library procedures with explicit
failure results. Copy and append must always receive destination capacity.
Search and substring should return a bounded view or an index rather than an
unrestricted pointer.

## Named scalar sets

Constants represent states today:

```lanternfly
const movingLeft as u8 = 0
const movingRight as u8 = 1
```

Nominal fixed-width enums would detect accidental mixing of unrelated state
families, improve debugger display and allow exhaustive `select` checking.
Their storage width must remain explicit so record layout and external ABI stay
predictable.

Enums rank behind bounded views because constants already express every
current program. They improve diagnostics rather than unlock algorithms.

## Parameter intent and results

Aggregate parameters currently alias mutable caller storage. Scalar output
requires a returned value or a future parameter mode; Lanternfly has no
first-class reference value. Every aggregate interface currently presents the
same mutable intent.

Parameter modes would provide three practical checks:

- an input cannot be written;
- an output must be assigned on every returning path;
- an in/out argument is visibly mutated at the call boundary.

This work should share its mutability vocabulary with bounded views. Two
separate designs for parameter intent and view access would create avoidable
conversion rules.

## Useful smaller additions

After views and parameter intent, several compact facilities would improve
ordinary programs:

- `assert condition` mapped to the target fault service in checked builds;
- `min`, `max`, `clamp` and bit-count operations with fixed integer rules;
- a post-test `repeat`/`until` loop if translations show repeated demand;
- type aliases for long imported layout types;
- an explicit way to embed binary resource data when aggregate literals or
  assembly data become unwieldy.

Each addition needs fixtures from real code. The first compiler can proceed
before this smaller group is designed.

## Deliberate boundaries

Aggregate constants provide the named, typed tables served by `DATA` and
`READ` in early BASIC. Platform profiles give `PRINT` and `INPUT` an explicit
terminal model for each display and keyboard. Structured control keeps line
numbers, implicit variables and unrestricted `goto` outside the core.

Heap strings, garbage collection, exceptions and dynamic collections belong
to a different deployment profile. A later profile can add them while
preserving the static `cstr` ABI.

## Recommended order

1. Implement character and C-string literals, `cstr` typing, comparison,
   `length` and AZM `.cstr` lowering in the first front end.
2. Design read-only and writable bounded views together with parameter intent.
3. Define one minimal console/text platform profile and bounded text library.
4. Add nominal fixed-width enums.
5. Reassess fixed-capacity owned strings, assertions and smaller standard
   operations using translated programs.

This order supports existing Z80 routines immediately and adds writable text
only after the language can state its capacity and mutation contract.
