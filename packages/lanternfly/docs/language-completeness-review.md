# Lanternfly language completeness review

Status: first-edition completeness review and post-0.4 backlog

Lanternfly now covers the central executable vocabulary of a small structured
BASIC or Pascal: scalar values, declarations, expressions, decisions, loops,
routines, modules, fixed arrays and records. Version 0.4 includes character
literals, owned counted strings, nominal enums, checked subranges and ordinal
array domains. The remaining gaps are concentrated around general access to
variable-size regions and parameter intent. Portable text input and output now
have a deliberately narrow standard-module contract.

The [specification](specification.md) governs accepted syntax and semantics.
The first compiler implements that baseline before adding the facilities
ranked here. The [implementation plan](implementation-plan.md) defines the
coding order.

## Text in 0.4

The first text facility uses the representation already consumed by common
Z80 and AZM routines:

```lanternfly
import "standard/text-output.lafy"

var banner as string[10] = "LANTERNFLY"
const digitZero as u8 = '0'

sub showDigit(value as u8)
    writeText(banner)
    writeCharacter(u8(digitZero + value))
end
```

A `string[N]` is owned counted storage whose payload always ends with a zero
byte. The maintained terminator makes the payload directly suitable for
firmware routines that already accept the address of NUL-terminated bytes,
while the length header serves counted consumers without a scan.

Character literals produce exact byte values, so existing routines that accept
`u8` receive them directly. Direct literal characters use ASCII. Named
platform encodings can be added later as explicit conversion or resource
steps, while `\xHH` records an exact target byte when needed.

The language defines `length`, content comparison, checked copy and append.
Literal payloads are immutable; every operation maintains the terminator, so
the payload is always valid NUL-terminated text.

## Capability audit

| Capability                                      | 0.4 position                            | Assessment                                                                                           |
| ----------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Fixed-width integers and Boolean values         | Specified                               | Sufficient for the current machine and game corpus                                                   |
| Character literals                              | Specified as byte-valued literals       | Sufficient for ASCII-oriented firmware and display calls                                             |
| Strings                                         | Sealed `string[N]` storage              | One text type: exact capacity, checked copy/append and a maintained NUL terminator                   |
| String operations                               | Length, comparison, copy, append, clear | Search, substring and truncating copy remain bounded-view work                                       |
| Arrays and records                              | Fixed, exact, ordinal-indexed storage   | Counts, explicit bounds, subranges and enums cover the relevant Pascal model                         |
| Variable-size array arguments                   | Exact-shape aggregate aliases only      | High-priority gap for reusable algorithms                                                            |
| Read-only parameters                            | General form absent                     | `writeText` has a narrow compiler-defined text source; arrays, records and general views remain open |
| Routines and local scalars                      | Specified                               | Core procedural programming is covered                                                               |
| Local arrays and records                        | Aliases to existing storage             | Deliberate first-edition limit; Pascal-style owned locals need a frame and cost policy               |
| Output and in/out parameters                    | General form absent                     | `readLine` has one narrow string destination; declared scalar and aggregate modes remain open        |
| Aggregate and multiple results                  | Caller-owned storage only               | Parameter modes can cover the current corpus before aggregate return values are added                |
| Enumerations and subranges                      | Nominal checked ordinal types           | Improve domain errors, traversal, selection and array bounds without changing packed layout          |
| Type aliases                                    | Absent                                  | Useful for imported layouts; lower priority than facilities required by current algorithms           |
| Standard numeric library                        | `abs` and `sqrt`                        | Add `min`, `max`, `clamp` and bit count after the core numeric rules are implemented                 |
| Standard input and output                       | Two optional standard text modules      | Character/text output plus bounded blocking character and line input, without streams or files       |
| Compile-time data tables                        | Aggregate constants                     | Covers the useful role of BASIC `DATA`/`READ` for fixed programs                                     |
| Assertions and controlled termination           | Runtime fault hooks only                | Add user-facing assertion syntax for tests and debug builds                                          |
| Floating point                                  | Deferred capability                     | Important for some desktop BASIC programs, unnecessary for the current Z80 game corpus               |
| Heap values and dynamic collections             | Deferred                                | Consistent with the static-memory target and current evidence                                        |
| Files, clocks, graphics, sound and random input | Future standard or target modules       | Correctly remain outside the core language                                                           |

## Immediate companion: general bounded views

Counted strings now cover ordinary writable text, but exact-shape aggregate
parameters remain incomplete for general algorithms. A routine that copies an
arbitrary region needs three facts:

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

Counted strings no longer wait on this facility. General array slices, sorting,
table scans, substring views and capacity-generic text routines still do.

## Chosen design: counted strings with a compatibility terminator

This first-edition design closes the ordinary mutable-string gap with a
Pascal-style counted string whose payload is always also a valid
zero-terminated string.

### Type and storage

```lanternfly
var name as string[24]
var line as string[80]

record Contact
    name as string[24]
    city as string[16]
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
with no runtime branch. The all-ones length is reserved in either form: 255 is
never a valid short length and 65,535 is never a valid long length. This gives
native-boundary checking a free corruption tripwire in the spirit of the
Boolean zero-or-one rule.

A per-value variable-width length, in the manner of UTF-8 or LEB128, was
considered and declined: it would put a header-width branch on every
operation and make payload offsets depend on runtime contents, breaking exact
layout to save one byte in rare long strings. That encoding remains
appropriate for serialized file and stream formats, where data is scanned
linearly anyway; in-memory working storage takes its width from the declared
type.

The invariant is that payload bytes before `L` are nonzero and every
language-performed write leaves a zero at `payload[L]`. The reserved extra cell
guarantees room for the terminator even at full capacity. Bytes past the
terminator are unspecified. All-zero storage is a valid empty string, so zero
initialization needs no special case and `clear` applies.

### Sealed representation

The header and terminator have no source-level storage path. A counted
string is not a byte array: no expression names its length byte, its
terminator cell or a payload position, so no program can set a length
directly, overwrite the terminator or desynchronize the two. Every read and
write of the representation goes through the language's own operations —
`length`, assignment, literals, `append`, comparison, `clear` and native
payload access — each of which knows the type's header form at
compile time and maintains all four invariants: the length within capacity,
nonzero payload, the terminator at `payload[L]`, and the reserved all-ones
length rule. This
is the same doctrine the language applies to alias carriers: the
representation exists in lowering, and source code cannot misuse what it
cannot spell.

### Operations

- `length(s)` reads the one- or two-byte header, zero-extends it to `u16` and
  performs no scan.
- All six comparisons compare content in byte-wise unsigned order; equality
  may short-circuit on unequal lengths.
- Assignment between counted strings copies length, payload and terminator.
  A source longer than the destination's capacity is a compile error when
  known and `F-RANGE` otherwise — the length is checked against the
  destination's capacity domain before any destination byte changes, in the
  same spirit as a subrange check.
- A string literal initializes or assigns any `string[N]` whose capacity
  holds it, checked at compile time.
- `append(destination, source)` and `append(destination, byteValue)` are
  standard procedures with the same capacity check. A byte value must be
  nonzero so the payload remains valid zero-terminated text.
- Where a native contract requires zero-terminated bytes, the adapter supplies
  the payload address. The invariant makes the payload a valid terminated
  sequence, so no payload copy is required.

### Consequences

Records of strings get defined storage — `Contact` above is exactly
`24 + 2 + 16 + 2` bytes — which is what fixed-memory data modelling has
wanted all along. Input services receive a destination whose capacity is
visible in its type, closing the overrun hole that a bare terminator
convention leaves open. On a Z80, the known length turns copies into block
moves and gives equality a short-header fast path. Capacities from 255 through
65,534 use the long form without changing the source operations.

### Naming

Counted strings use the plain word `string`: `string[24]` reads as declared
storage, which it is. The earlier read-only `cstring` view type was removed
rather than renamed. Its guarantee — valid NUL-terminated bytes for the
program's lifetime — is already carried by the sealed representation's
terminator, so a second text type earned nothing but a second set of rules.

### Open points

- the spelling of a deliberate truncating copy, as opposed to the checked
  one;
- byte indexing and slicing of a counted string, which likely waits for the
  bounded-view design rather than growing private rules here — noting that
  interior reads checked against the current length could not break the
  sealed invariants, while any general write access would need the same
  operation-only discipline as the header;
- ordinary capacity-generic string parameters, which are the bounded-view
  question in another costume — first-edition source declarations state their
  exact capacity, while standard `writeText` and `readLine` have narrow
  compiler-defined source and destination contracts.

The native-boundary question is closed for the first edition: writable
counted-string parameters are exact-capacity aggregate aliases, and an adapter
validates every possibly written representation before Lanternfly resumes.
Failure invokes `F-INVALID-STRING`.

## Portable text and console contracts

Character input and text output vary sharply across TEC-1G, TRS-80, ZX81, ZX
Spectrum, C and hosted BASIC targets. Lanternfly therefore standardizes a
small source contract while leaving the selected device and implementation to
the target profile.

A program imports only the half it needs:

```lanternfly
import "standard/text-output.lafy"
import "standard/text-input.lafy"

var key as u8
var command as string[32]
var lineFits as boolean

sub useConsole()
    writeCharacter('>')
    writeText("READY")
    writeNewline()
    key = readCharacter()
    lineFits = readLine(command)
end
```

Targets can bind those operations to firmware or monitor routines, a keyboard
and display, serial I/O, generated C or BASIC runtime code, or an injected test
service. `writeText` accepts a literal or any `string[N]` path through one
temporary compiler-only read-only carrier. `readLine` accepts any writable
`string[N]` path through an equivalent destination carrier. It returns `true`
when the line fits; otherwise it keeps the longest valid fitting prefix,
consumes the rest of the line and returns `false`. These service operands are
not source values or general bounded views.

The contract stops at character output, text output, a target-appropriate
newline, blocking character input and bounded line input. Screen coordinates,
colours, key matrices and nonblocking input belong to target-specific modules.
Streams, handles, buffering, files, directories and seeking remain undefined.
Future loading and saving facilities belong in separate modules rather than
expanding the meaning of the two text devices.

The counted-string operations already carry destination capacity and fault
before an invalid write. A later bounded-view library can add search,
substring and deliberate truncation; those operations should return a bounded
view, result status or index rather than an unrestricted pointer.

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
Enums retain explicit widths, and subranges retain their base representation,
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
- a post-test `repeat`/`until` loop if repeated translations require it;
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
preserving the fixed `string[N]` layout and its terminated-payload ABI.

## Post-0.4 design order

1. Implement the specified character and string facilities as part of the
   0.4 front end and AZM backend.
2. After K1, design read-only and writable bounded views together with
   parameter intent.
3. Implement the two settled optional standard text modules through one target
   profile and the interpreter service trace.
4. Reassess assertions and smaller standard operations using translated
   programs.

The first and third items implement existing rules. General views and the
remaining additions require specification, conformance and lowering updates
before coding.
