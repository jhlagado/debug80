# Lanternfly language completeness review

Status: post-0.4 design backlog; not a blocker for K0 or K1

Lanternfly now covers the central executable vocabulary of a small structured
BASIC or Pascal: scalar values, declarations, expressions, decisions, loops,
routines, modules, fixed arrays and records. Version 0.4 includes character
literals, static C strings, nominal enums, checked subranges and ordinal array
domains. The remaining gaps are concentrated around safe access to
variable-size regions, text mutation and portable service contracts.

The [specification](specification.md) governs accepted syntax and semantics.
The first compiler implements that baseline before adding the facilities
ranked here. The [implementation plan](implementation-plan.md) defines the
coding order.

## Static text in 0.4

The first text facility uses the representation already consumed by common
Z80 and AZM routines:

```lanternfly
const banner as near cstring = "LANTERNFLY"
const digitZero as u8 = '0'

extern sub printText(text as near cstring)
extern sub printChar(value as u8)

sub showDigit(value as u8)
    printText(banner)
    printChar('0' + value)
end
```

A `cstring` is a non-null, read-only address-class value for static bytes
terminated by zero. Its runtime value contains only the address-class
representation. This makes a literal suitable for AZM `.cstr` data and for
firmware routines that already accept the address of NUL-terminated bytes.

Character literals produce exact byte values, so existing routines that accept
`u8` receive them directly. Direct literal characters use ASCII. Named
platform encodings can be added later as explicit conversion or resource
steps, while `\xHH` records an exact target byte when needed.

The language defines `length(cstring)` and content comparison. Assignment copies
the view, while the referenced bytes remain immutable. Writable text continues
to use byte arrays until the language has a capacity-carrying view.

## Capability audit

| Capability                                      | 0.4 position                           | Assessment                                                                                  |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Fixed-width integers and Boolean values         | Specified                              | Sufficient for the current machine and game corpus                                          |
| Character literals                              | Specified as byte-valued literals      | Sufficient for ASCII-oriented firmware and display calls                                    |
| Static strings                                  | `near cstring` and `far cstring`       | Sufficient for messages, labels, command arguments and read-only native calls               |
| Mutable strings                                 | Byte arrays only                       | High-priority gap; safe routines need a buffer capacity                                     |
| String operations                               | Length and comparison                  | Copy, append, search and substring need bounded source and destination views                |
| Arrays and records                              | Fixed, exact, ordinal-indexed storage  | Counts, explicit bounds, subranges and enums cover the relevant Pascal model                |
| Variable-size array arguments                   | Exact-shape aggregate aliases only     | High-priority gap for reusable algorithms                                                   |
| Read-only parameters                            | Available only through `cstring`       | High-priority gap for constant arrays, records and general views                            |
| Routines and local scalars                      | Specified                              | Core procedural programming is covered                                                      |
| Local arrays and records                        | Aliases to existing storage            | Deliberate first-edition limit; Pascal-style owned locals need a frame and cost policy      |
| Output and in/out parameters                    | Not yet available for scalars          | A declared parameter mode would provide the feature without adding pointer values           |
| Aggregate and multiple results                  | Caller-owned storage only              | Parameter modes can cover the current corpus before aggregate return values are added       |
| Enumerations and subranges                      | Nominal checked ordinal types          | Improve domain errors, traversal, selection and array bounds without changing packed layout |
| Type aliases                                    | Absent                                 | Useful for imported layouts; lower priority than facilities required by current algorithms  |
| Standard numeric library                        | `abs` and `sqrt`                       | Add `min`, `max`, `clamp` and bit count after the core numeric rules are implemented        |
| Standard input and output                       | Supplied by external/platform routines | The boundary is sound, but standard profile contracts still need names and semantics        |
| Compile-time data tables                        | Aggregate constants                    | Covers the useful role of BASIC `DATA`/`READ` for fixed programs                            |
| Assertions and controlled termination           | Runtime fault hooks only               | Add user-facing assertion syntax for tests and debug builds                                 |
| Floating point                                  | Deferred capability                    | Important for some desktop BASIC programs, unnecessary for the current Z80 game corpus      |
| Heap values and dynamic collections             | Deferred                               | Consistent with the static-memory target and current evidence                               |
| Files, clocks, graphics, sound and random input | Platform libraries                     | Correctly remain outside the core language                                                  |

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

## Provisional proposal: counted strings with a compatibility terminator

**Provisional.** This section records a concrete design for the mutable-string
gap: a Pascal-style counted string whose payload is always also a valid
zero-terminated string. Capping the payload at 254 bytes buys both interfaces
from one representation.

### Type and storage

```lanternfly
var name as string[24]
var line as string[80]

record Contact
    var name as string[24]
    var city as string[16]
end
```

`string[N]` declares an owned, writable counted string with payload capacity
`N`. The capacity is part of the type, exactly as an array's index domain is,
and it selects the header width at compile time: a capacity through 254 uses a
one-byte length, and a larger capacity through 65,534 uses a two-byte length.
The common form occupies `N + 2` bytes inline:

```text
offset 0        current length L (u8, 0 <= L <= N)
offset 1..N     payload bytes
offset 1 + L    zero terminator (maintained invariant)
```

The wide form is identical with a two-byte length at offset 0 and `N + 3`
total bytes. Because the header width follows from the declared capacity, it
is a static fact of the type: `size` folds exactly, record layouts stay
derivable by eye, and `length(s)` lowers to a plain one- or two-byte load
with no runtime branch. In the one-byte form, a stored length of 255 is never
valid, which gives native-boundary checking a free corruption tripwire in the
spirit of the Boolean zero-or-one rule.

A per-value variable-width length, in the manner of UTF-8 or LEB128, was
considered and declined: it would put a header-width branch on every
operation and make payload offsets depend on runtime contents, breaking exact
layout to save one byte in rare long strings. That encoding remains
appropriate for serialized file and stream formats, where data is scanned
linearly anyway; in-memory working storage takes its width from the declared
type.

The invariant is that every language-performed write leaves a zero at
`payload[L]`. The reserved extra cell guarantees room for the terminator even
at full capacity. Bytes past the terminator are unspecified. All-zero storage
is a valid empty string, so zero initialization needs no special case and
`clear` applies.

### Sealed representation

The header and terminator have no source-level storage path. A counted
string is not a byte array: no expression names its length byte, its
terminator cell or a payload position, so no program can set a length
directly, overwrite the terminator or desynchronize the two. Every read and
write of the representation goes through the language's own operations —
`length`, assignment, literals, `append`, comparison, `clear` and the
zero-terminated payload view — each of which knows the type's header form at
compile time and maintains all three invariants: the length within capacity,
the terminator at `payload[L]`, and the one-byte form's never-255 rule. This
is the same doctrine the language applies to alias carriers: the
representation exists in lowering, and source code cannot misuse what it
cannot spell.

### Operations

- `length(s)` reads the length byte: constant time, no scan.
- All six comparisons compare content under the same byte-wise unsigned
  order as static strings; equality may short-circuit on unequal lengths.
- Assignment between counted strings copies length, payload and terminator.
  A source longer than the destination's capacity is a compile error when
  known and `F-RANGE` otherwise — the length is checked against the
  destination's capacity domain before any destination byte changes, in the
  same spirit as a subrange check.
- A string literal initializes or assigns any `string[N]` whose capacity
  holds it, checked at compile time.
- Assignment from a zero-terminated static string scans its length first,
  checks capacity, then copies; the fault precedes any destination write.
- `append(destination, source)` and `append(destination, byteValue)` are
  standard procedures with the same capacity check.
- Used where a zero-terminated string is expected, a counted string supplies
  its payload view at no cost: the invariant makes `payload` a valid
  terminated string, so every existing print-style contract works unchanged.
  This conversion is the design's point, and it is free.

### Consequences

Records of strings get defined storage — `Contact` above is exactly
`24 + 2 + 16 + 2` bytes — which is what fixed-memory data modelling has
wanted all along. Input services receive a destination whose capacity is
visible in its type, closing the overrun hole that a bare terminator
convention leaves open. On a Z80, the known length turns copies into block
moves and gives equality a one-byte fast path. Text longer than 254 bytes
remains the business of zero-terminated statics and explicit byte buffers,
which open-ended streams need anyway.

### Naming

With counted strings as the everyday type, the plain word `string` goes to
them — `string[24]` reads as declared storage, which it is. The read-only
zero-terminated view then deserves a mechanism-named word; `zstring`
(zero-terminated, in the ASCIIZ lineage) says what it is without pointing at
another language's culture, where `cstring` points at C. Whether the view
keeps `cstring` or becomes `zstring` is an open naming decision.

### Open points

- the spelling of a deliberate truncating copy, as opposed to the checked
  one;
- byte indexing and slicing of a counted string, which likely waits for the
  bounded-view design rather than growing private rules here — noting that
  interior reads checked against the current length could not break the
  sealed invariants, while any general write access would need the same
  operation-only discipline as the header;
- capacity-generic string parameters, which are the bounded-view question in
  another costume — first-edition parameters state their exact capacity;
- the native-boundary contract wording for services that fill a counted
  string.

## Portable text and console contracts

`print`, keyboard input and display control vary sharply across TEC-1G,
TRS-80, ZX81, ZX Spectrum, C and hosted BASIC targets. They should be ordinary
platform routines collected into named profiles rather than core statements.

A small console-style profile should define contracts equivalent to:

```lanternfly
extern sub writeChar(value as u8)
extern sub writeText(text as near cstring)
extern sub readChar() as u8
```

Targets can bind those signatures to firmware, emulator services, generated C
or BASIC runtime code. Screen coordinates, colours, key matrices and
nonblocking input belong to more specific profiles.

Writable text support should then add bounded library procedures with explicit
failure results. Copy and append must always receive destination capacity.
Search and substring should return a bounded view or an index rather than an
unrestricted pointer.

## Ordinal types in 0.4

The first edition follows Pascal in treating small ordered domains as types.
An enum gives related names one nominal type and an explicit representation
width. A subrange narrows an integer or enum domain and checks every value that
enters it.

That choice reaches beyond nicer names. The same ordinal domain can define an
array dimension, a counted loop and a `select` range. Non-zero and one-based
arrays no longer need manual index translation, while an enum-indexed table
can be traversed in declaration order. The compiler can also remove an array
bounds check when the index type is already contained by the dimension.

Ranges use the BASIC words `to` and `until`; they are not runtime values.
Enums retain explicit widths, and subranges retain their host representation,
so neither feature changes packed layout or external ABI unexpectedly.

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
preserving the static `cstring` ABI.

## Post-0.4 design order

1. Implement the specified character and C-string facilities as part of the
   0.4 front end and AZM backend.
2. After K1, design read-only and writable bounded views together with
   parameter intent.
3. Define one minimal console/text platform profile and bounded text library.
4. Reassess fixed-capacity owned strings, assertions and smaller standard
   operations using translated programs.

The first item is implementation of an existing rule. The remaining items are
language or library changes and require specification, conformance, and
lowering updates before coding.
