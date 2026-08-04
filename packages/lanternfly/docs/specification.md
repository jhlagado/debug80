# Lanternfly language specification

Edition: 0.7 draft — task-first revision in progress; sections not yet
rewritten carry the earlier baseline text
Implementation status: no compiler exists
Normative status: source-language contract for the first compiler

This edition adopts the charter's small-systems-first direction. The reference
implementation architecture is a single-pass, self-hostable compiler that
emits native code directly, and every rule in this contract must remain
affordable inside that architecture. An implementation accepts exactly
the programs that the reference architecture accepts.

The companion [conformance and diagnostics contract](conformance.md) collects
the mandatory errors, warnings, runtime faults, semantic vectors and program
fixtures for this edition. The
[implementation plan](implementation-plan.md) divides the contract into
buildable milestones without changing the meaning of accepted programs.

This edition recasts the language as a streamlined structured BASIC. It keeps
the readable control forms and word operators associated with structured
Microsoft BASIC, but uses fixed-width types, exact layouts and one closing
`end`. It neither claims Visual Basic compatibility nor copies features that
do not suit fixed-memory targets.

Implementation may expose a defect in this contract. A semantic change then
requires a specification change, a conformance fixture, and an explanation of
its compatibility effect. Unsupported work-in-progress features must be
diagnosed; an implementation stage cannot silently assign them different
semantics.

**Must** states a semantic requirement. **Should** states a strong toolchain
recommendation. **Provisional** marks a rule that still requires implementation
or corpus evidence. **Deferred** marks a facility outside the first
implementation.

## 1. Language scope

Lanternfly is a statically typed structured BASIC for fixed-memory systems. It
can replace ordinary AZM program logic in standalone programs as well as
Glimmer bodies.

The complete 0.7 language includes:

- fixed-width signed and unsigned integers;
- nominal enums and checked subrange types;
- Boolean values and binary masks;
- byte-valued character literals and fixed-capacity counted strings;
- constants and statically allocated variables;
- exact records and fixed arrays with ordinal index domains;
- field access, runtime indexing and temporary storage aliases;
- assignment and general expressions;
- `if`, `select`, counted, collection and conditional loops;
- routines with optional parameters, local scalar storage and optional
  results;
- forward routine declarations, so mutually recursive routines remain
  expressible in declaration order;
- failable routines over error-set enums, with `fail`, statement-level
  propagation and defaults, `on error` handling blocks and `defer` cleanup;
- source modules with private declarations and explicit exports;
- optional standard modules for portable text output, nonblocking character
  input and the instant counter;
- direct native-code emission as the reference lowering path, with AZM,
  another assembler, C or a selected BASIC dialect as transparency and
  portability backends.

Lanternfly has three levels, nested subsets of one language. **Level 0** is
what a compiler can be written in — integers, arrays, records, subroutines,
control flow, `extern` and `asm`. **Level 1** is full structured
programming. **Level 2** adds the tasks, state cells, pulses and derivations
of sections 12.6 and 17. A level-2 implementation accepts all three, because
a level-0 program is a Lanternfly program that uses fewer features.

The levels also describe the bootstrap. Each is enough to write a compiler
for the level above it, so the reference compiler's own source stays at
level 0 while what it accepts grows. An implementation may reject what it
has not yet accepted, identifying the limitation as an implementation-level
or target-capability diagnostic. A stage is a development milestone rather than a
smaller edition of the language: it may reject what it has not yet
implemented, but it must identify the limitation as an implementation-stage
or target-capability diagnostic.

The 0.7 revision adds task types and their instances, state cells, pulses,
single-line derivations, the conditional expression, and the instant-based
execution model of sections 12.6 and 17.

Lanternfly is independent of Glimmer. Glimmer's cards, host loop and drawing
services remain host concerns, and Glimmer may provide imported storage and
routines to a Lanternfly body. The state, pulse, derivation and task
constructs
named above are the language's own.

The BASIC lineage is syntactic and educational rather than compatible. Source
uses short English words, `name as Type` declarations, assignment with `=`,
word operators, `if ... then`, `select`, `for` and `while`. Lanternfly leaves
behind line numbers, implicit declarations, variant values, `goto`, optional
parentheses and dialect-specific UI facilities. Arithmetic and comparison keep
their familiar symbols; block punctuation, semicolon terminators and curly
braces do not enter the language.

The first edition uses fixed storage and whole-program compilation. Programs
identify persistent objects by their declared paths or by ordinal indices into
fixed pools. Aggregate parameters and local aliases may name existing storage
for the duration of a call. A bare alias denotes that storage for field access,
indexing and aggregate copying. Its backend carrier is not a value and has no
source syntax.

Lanternfly has no source-level pointer or reference type, address-of operator,
dereference operator, function value or closure. Backends remain free to
implement an aggregate parameter or alias with a machine address. That
representation is lowering machinery and does not enter the language's value
model.

Heap allocation, garbage collection, unwinding exceptions, dynamic collections
and indirect calls are outside the first edition; section 11.8 handles
expected failure with ordinary values and branches instead. Fixed multidimensional arrays
and indexed pools cover the initial programs that assembly would otherwise
express through pointer tables.

### 1.1 Kernel and capability tiers

The language divides into an irreducible kernel and a closed set of standard
capability modules.

The kernel is every ungated source-language facility this specification
defines. The classification is categorical rather than an inventory;
representative kernel facilities include the lexical
structure; declarations, modules and imports; the control forms; routines
and forward declarations; records, fixed arrays, enums and subranges;
`boolean`, the 8- and 16-bit integer types and counted strings of capacity
1 through 254; opaque near and far addresses; aliases and volatile storage;
the standard operations and layout queries; assignment, comparisons and
integer arithmetic; placement, external routines and inline assembly.
Declarations introduced by user modules and by standard service modules lie
outside the kernel/capability partition: their imports introduce names and
bindings, not language semantics.
Three properties hold for the kernel. First, the kernel is the self-hosting
closure: the reference compiler is written in it, and every module form is
expressed in it, so it is prior to every import. Second, no kernel feature
places bytes in a program that does not use it; runtime helpers such as
multiplication, division, string operations and bounds checks are included
only when used, so use, not configuration, selects their cost. Third,
kernel constructs have one meaning in every conforming implementation and
every program. For inline assembly and external bindings, that invariant
meaning is their Lanternfly boundary contract of block rules, value
invariants and effect obligations; payloads and bindings remain
target-specific inside that contract.

A standard capability module legalizes an optional facility that the
language defines at source level. The 32-bit integer types are enabled by
`standard/wide32.lafy`, and string capacities from 255 through 65,534 by
`standard/long-strings.lafy`; future floating-point tiers follow the same
form. A capability module exports no names: its import legalizes gated
words, representations and typed operations and nothing else, so it can
introduce no collision. Gated words remain reserved in every program.
Mentioning a gated word or facility without the enabling import is
`E-CAP-001`.

Capability authorization is module-local. A module that mentions a gated
type, representation or operation states the enabling import in its own
import prefix. Importing a user module does not confer that module's
capabilities: a module may import one whose exports use `u32` without
importing `standard/wide32.lafy`, but every gated mention in its own source,
including a call whose argument, result or storage type is gated, requires
the direct import. A capability's ID is its canonical import path, such as
`standard/wide32.lafy`. A compiled export-interface artifact records, in
its `requiredCapabilities` field, the capability IDs its exported
declarations require, so separate compilation under section 12.5 enforces
the same rule. Capability imports otherwise obey the ordinary import rules
of section 12.1.

Each capability states target requirements: representation widths, capacity
and static-object limits, scalar-operation categories and required
component bindings. The selected target profile must satisfy every
requirement that a program's gated uses impose, with component bindings
resolved under section 13.2. Any unsatisfied requirement is `E-TARGET-001`,
including for a gated use that selects no runtime component. The explicit
imports determine a program's tier, and a build reports each capability's
emitted cost.

Three categories share this machinery and must not be conflated. Capability
modules are export-free source-language gates. The service modules of sections 12.4.1 to
12.4.3 export ordinary names and bind services through the same profile
registry and cost reporting, but they gate no words and change no typing
rules; `standard/character-input.lafy` is an ordinary module rather than a
service module. Target-profile support claims
such as recursion, address classes and far storage are target capabilities,
which no import controls.

Capability imports are monotone: an import may make more programs legal,
but it may never change the meaning of a program that was already legal.
Each operator is a family of typed operations resolved statically by
operand type. A capability module extends an operator's domain with new
typed operations; it does not alter any operation the kernel or another
module defines, and no implicit conversion crosses type families. The
capability-module set is closed and versioned by the toolchain. User
modules export types, storage and routines; they never define operator
meanings or literal forms. Examples elsewhere in this specification that
use a gated facility assume its enabling import.

## 2. Source style and names

### 2.1 Case

Keywords and built-in type names have canonical lowercase spellings. Ordinary
program names use lower camel case. User-defined type names use Pascal case.

```lanternfly
const actorCount as u8 = 8
var playerScore as u16 = 0

record Actor
    currentFrame as u8
    active as boolean
end

sub updatePlayer()
    playerScore = playerScore + 1
end
```

Keywords, Boolean literals, built-in types and built-in operation names are
recognised case-insensitively. Their canonical spelling is lowercase, and the
formatter rewrites them in that form. User-defined names are also resolved
case-insensitively, but tools preserve and display their declaration spelling:

- `if`, `var` and every other keyword are written in lowercase;
- `u8`, `i16`, `boolean` and other built-in types are lowercase;
- variables, constants, fields, parameters and routines begin lowercase;
- user-defined records, enums and ranges begin uppercase;
- tools display an identifier using the spelling at its declaration;
- declarations that differ only in case conflict within the same namespace.

Capitalization is a reading convention rather than a semantic distinction.
Types and values occupy separate name-resolution contexts, so this is valid in
a case-insensitive language:

```lanternfly
var actor as Actor
```

One cross-namespace collision is forbidden: a record, enum or range type and a
callable routine, including an external routine, may not share the same
case-insensitive name. This keeps `Point(...)` and checked ordinal conversions
unambiguous with calls. A storage name may still match its type, as `actor`
and `Actor` do above.

Each module has one type scope and one value scope. Record, enum and range
declarations enter the type scope; enum members enter the value scope.
Constants, variables and routines also enter the value scope, so an enum
member, storage declaration and callable routine cannot share a name.

Module visibility follows declaration order. Imports form one contiguous
prefix and contribute their exports when each import has been resolved. After
that prefix, a declaration may use imported names and earlier local
declarations only. A type, constant, enum member, storage name or external
routine becomes available after its complete declaration has been checked. A
`sub` signature becomes available after its header has been checked and before
its body, which permits a direct self-call. A `forward sub` declaration makes
a signature available in the same way before its body has appeared, under the
rules in section 11.6. A routine body may call imported routines, earlier
local routines, itself and any visible forward-declared routine; it cannot
call a routine whose signature appears later.

There are no implicit forward references, and `forward sub` is the only
explicit one. A type annotation cannot name a later type, an initializer
cannot name its own or a later declaration, and a routine body cannot use a
later constant, variable or unforwarded routine. No declaration category
other than a source routine has a forward form. An implementation may retain a complete syntax tree and perform
several internal passes, but accepted source must have the same visibility as
a compiler that processes declarations in order.

This ordering also settles declaration dependencies. Constant initializers,
subrange bounds, string capacities, array domains, record fields, placement
expressions and layout queries can depend only on declarations whose values
and layouts are already complete. Direct and mutual source-declaration cycles
cannot be formed. Import cycles remain a separate module error under section
12.1.

A routine has one value scope containing its parameters and locals. Parameter
names are distinct, and a parameter or local may not shadow any visible module
or imported value. A local may not reuse a parameter or earlier local name.
Its declaration-order visibility remains defined in section 4.2. A `for each`
binding adds one nested value name for its body. It may not shadow a visible
module value, parameter, local or enclosing `for each` binding. Nested
traversals therefore use distinct binding names. The same rules apply when the
enclosing value scope belongs to a routine. Record fields occupy a separate
scope belonging to their record; fields need only be unique within that record
and are resolved only after a field-selection dot.

### 2.2 Identifiers

The canonical style is lower camel case for values and Pascal case for
user-defined types:

```text
player
playerScore
updatePlayer
Actor
GameState
```

Identifiers may contain underscores. The formatter preserves the declared
spelling of every user-defined name. A tool may report noncanonical camel- or
Pascal-case style, but changing an identifier is an explicit rename
refactoring that checks every affected namespace for collisions.

### 2.3 Blocks

Every structured block closes with the single keyword `end`:

```lanternfly
if active then
    updateActor()
end
```

The parser closes the innermost open block. The formatter emits canonical
indentation, while the parser treats indentation as whitespace.

Structured blocks may contain zero statements. A clause delimiter or closing
`end` immediately after a block header represents an empty block; no separate
placeholder statement is required.

### 2.4 Lexical rules and comments

The first-edition source character set is UTF-8, but language identifiers use
ASCII letters for portable interoperation. An identifier begins with `A`–`Z`
or `a`–`z`; later characters may also be digits or `_`. Keywords and built-in
operation names are reserved under case-insensitive comparison. The contextual
word `type` is reserved only in the positions defined in section 14.

Integer and character literals use these forms:

```lanternfly
42          // decimal
$2a         // hexadecimal
%00101010   // binary
'A'         // encoded byte value
'\n'        // byte value 10
```

A leading `+` or `-` is a unary operator, not part of the literal. Digit
separators and octal literals are absent initially.

A character literal uses single quotes and represents one byte. Its contents
must be one printable ASCII character or one of these escapes:

```text
\0  \n  \r  \t  \'  \"  \\  \xHH
```

`HH` is exactly two hexadecimal digits. The resulting value is an exact,
untyped integer from zero through 255. It adopts an integer type by the same
contextual rules as a numeric literal. Empty, multi-character, non-ASCII and
unterminated character literals are invalid.

A double-quoted literal contains a sequence of nonzero bytes. Direct characters
range from ASCII space through `~`; the character escapes above are accepted
except `\0` and `\x00`. A hexadecimal escape contributes its exact byte without
declaring a character encoding. The payload initializes, assigns to, appends
to or compares with a `string[N]` value. The maximum payload is 65,534 bytes.
An embedded zero, a physical newline, a non-ASCII character or a 65,535-byte
payload is invalid. Section 3.2 defines the string type.

Import paths and external substrate-symbol names use the same double-quoted
token in compile-time text positions. Within those positions, only `\"` and
`\\` are accepted. The compiler decodes both escapes before resolving the path
or looking up the external symbol. A compile-time text position does not
allocate runtime string storage.

`//` begins a line comment outside a string literal and consumes through the
physical newline. It may occupy a line or follow a statement:

```lanternfly
// Advance the animation after the delay.
if frameDelay = 0 then
    currentFrame = currentFrame + 1  // Wraps when stored to u8.
end
```

There are no block comments in the first edition.

A physical newline ends a declaration or statement except while inside
parentheses or square brackets. A multiline expression outside those
delimiters must add parentheses. Blank lines are ignored. Spaces and tabs
separate tokens but are otherwise insignificant; indentation is formatting,
not grammar. There is one statement per logical line and no semicolon
separator.

End of file supplies a final logical newline when the last physical line
contains tokens but has no line-ending character. Files with and without a
trailing line ending therefore parse identically.

## 3. Built-in types

The first integer family uses explicit widths:

| Type      | Meaning           |
| --------- | ----------------- |
| `u8`      | unsigned 8-bit    |
| `i8`      | signed 8-bit      |
| `u16`     | unsigned 16-bit   |
| `i16`     | signed 16-bit     |
| `u32`     | unsigned 32-bit   |
| `i32`     | signed 32-bit     |
| `boolean` | `true` or `false` |

Width and signedness remain invariant across targets.

`u32` and `i32` are capability-gated under section 1.1: the words are
reserved in every program, and their use requires
`import "standard/wide32.lafy"`. Every 32-bit rule in this specification
applies whenever that import is present.

`true` and `false` are lowercase Boolean literals. They are reserved literals,
not user-defined constants.

`boolean` occupies exactly one byte. Its only valid stored representations are
zero for `false` and one for `true`. Comparisons and Boolean operators always
produce those canonical values, and zero-initialized Boolean storage begins as
`false`. Imported routines and storage contracts must also supply zero or one;
observing any other representation through such a contract invokes
`F-INVALID-BOOLEAN`. `boolean` is not an integer type and has no implicit
integer conversion.

Opaque address values use explicit near and far types:

```lanternfly
var screenBuffer as near address
var bankedImage as far address
```

Their physical representations remain target-defined.

Each address class has one closed capability record:

```text
AddressClassCapability
  { supported: true, representationWidth, validityContractId }
  or { supported: false, representationWidth: null,
       validityContractId: null }

AddressValidityContract
  id
  representationWidth
  rule:
    { kind: "allBitPatterns" }
    or { kind: "unsignedRange", min, max }
    or { kind: "maskedBytes", mask[], expected[] }
```

For a supported class, the width is a positive multiple of eight and the
selected contract has the same width. An unsupported class has null width and
contract fields.

`allBitPatterns` accepts every representation of that width. `unsignedRange`
decodes the bytes as one unsigned integer in the target profile's endianness and
accepts the inclusive interval from `min` through `max`. Both endpoints must fit
the width, and `min` must not exceed `max`. For `maskedBytes`, both arrays have
exactly one entry per representation byte. Every entry lies from zero through
255, expected bits outside their mask are zero, and byte `i` is valid exactly
when `(bytes[i] and mask[i]) = expected[i]`.

The selected rule governs every value of its address class, including provider
constants, ordinary storage and native results. Applying the rule to an
all-zero byte sequence determines whether zero initialization is valid.
Compiler-owned address storage without an initializer is rejected when zero is
invalid; no independent zero-validity flag exists.

Malformed representation or rule union shape is `E-CONFIG-001`. A well-shaped
wrong byte length, invalid rule, unresolved ID or substrate symbol, or
class/width mismatch is `E-CONFIG-002`. A resolved provider or native value that
fails the selected rule, or a service that cannot preserve it, is
`E-BOUNDARY-001`.

### Ordinal types and ranges

Lanternfly's first edition has three kinds of ordinal type:

- fixed-width integer types;
- nominal enumeration types;
- nominal subrange types constrained to part of another ordinal type.

An ordinal type has a finite ordered domain. Ranges use the words `to` for an
inclusive upper bound and `until` for an exclusive upper boundary. They are
type and grammar forms, not runtime values: a range cannot be stored, passed,
returned or placed in an array element.

Ordinal compatibility follows a root family. All fixed-width integers belong
to the integer family and retain the conversion rules in section 3.1. Each
enum begins a distinct family, and a subrange belongs to the family of its
base type. This permits ordinary integer indices of different widths while
keeping unrelated enums distinct.

An enumeration declares a nominal type with an explicit integer
representation:

```lanternfly
enum Colour as u8
    red
    green
    blue
end
```

The representation type may be any integer type. The first member has ordinal
zero and each following member has the next ordinal. The last ordinal must fit
the representation type. The enum name enters the type scope; its members
enter the surrounding value scope and are written without qualification.
Members follow the ordinary case-insensitive collision and export rules.

Enumeration values support assignment, all six comparisons, `select`,
counted loops and array indexing. They do not support integer arithmetic or
bitwise operations. An explicit conversion to the representation type exposes
the ordinal value. Converting an integer to an enum is checked: an invalid
constant is a compile error and an invalid runtime value causes `F-RANGE`.

A subrange defines a named subset of a base ordinal type:

```lanternfly
range ScreenColumn as u8 = 0 until 32
range WarmColour as Colour = red to blue
```

The lower endpoint and an inclusive `to` endpoint must belong to the base
type's domain. An exclusive integer `until` boundary is a compatible
mathematical integer and may be one beyond the base type's highest value
because it is not a member of the subrange. An enum boundary remains a member
of the base enum. After the boundary is normalized, every included value must
belong to the base type and the range must contain at least one value. Its
representation and ordering come from its base type, while its name declares a
distinct type.

A value of a subrange type may be used wherever its base type is accepted.
Assignment, initialization, argument passing, return and explicit conversion
from the base type into a subrange check the destination domain. A value
outside it is a compile-time error when known and otherwise causes `F-RANGE`
before the destination changes. Integer arithmetic on an integer subrange uses
the base integer type and produces the result prescribed for that type;
assigning the result back performs the range check.
An enum subrange retains the enum's non-arithmetic operations.

The all-zero representation is valid for an enum or subrange only when its
domain contains ordinal zero. Compiler-owned uninitialized storage of another
ordinal type therefore requires an initializer.

### 3.1 Integer arithmetic

Integer operations have target-independent widths and signedness. A backend
must not inherit the promotion rules of C, JavaScript, BASIC or its target CPU.

An integer literal begins as an exact, untyped value. It adopts the other
operand's integer type when its value fits. When an all-literal subtree has an
expected integer type from an initializer, assignment, scalar argument,
return, `fill` value or counted-loop start, that type propagates to its literal
leaves. An exact literal in an expected-type context that does not fit is a
compile error; it does not fall back to `i16` and then narrow with a warning.
Deliberate low-bit conversion must be written explicitly, as `u8(300)`.

An unannotated scalar constant initializer supplies no expected type. A
subtree made entirely from exact values remains exact through unary `+`, unary
`-`, `+`, `-`, `*`, `/`, `mod`, `^` and `shl`, using mathematical evaluation.
`not` requires a typed operand, `shr` requires a typed left operand, and
`and`, `or` and `xor` require at least one typed operand because their meaning
depends on a finite width. A typed operand, explicit conversion or
standard value operation applies the ordinary fixed-width rules to its
containing operation. Outside an unannotated constant initializer and the
target-address expressions below, literal integer operations without an
expected type default to `i16`; a value that does not fit requires an explicit
conversion.

An `at` placement or absolute external binding requires a target-address
constant expression rather than an ordinary integer expression. It may contain
integer literals, parentheses, previously declared integer constants, explicit
integer conversions and layout queries. Its operators are limited to unary
`+` and `-`, plus `+`, `-`, `*`, `/`, `mod`, `^`, `shl`, `shr`, `and`, `or`
and `xor`. It may not contain comparisons, Boolean values or operations, or
opaque address values. The layout queries include `lower` and `upper` under
their result rules in section 8.5.

Integer literals and the results of `byteSize`, `size`, `offset`, and
integer-domain `lower` and `upper` are exact, untyped values in this context.
Enum- and named-subrange-domain `lower` and `upper` retain their typed ordinal
results. A subtree made entirely from exact values remains exact through unary
`+`, unary `-`, `+`, `-`, `*`, `/`, `mod`, `^` and `shl`. The compiler
evaluates that subtree mathematically rather than applying a fixed-width result
table; exact `shl` multiplies by a power of two. Division by zero, a negative
power or a negative shift is a compile error. `shr`, `and`, `or` and `xor`
require at least one typed operand because their meaning depends on a finite
width.

A typed constant or explicit integer conversion ends exact evaluation in its
containing operation. The ordinary operand, result-width and folding rules
then apply, with exact operands adopting the written integer type when they
fit. The selected profile validates the final exact or typed value against its
address space and representation. Thus `at $8000 + byteSize(type Header)` remains
exact, while `at u16($8000) + byteSize(type Header)` performs ordinary `u16`
arithmetic. `at $8000` is valid on a profile that accepts that address even
though `$8000` does not fit `i16`.

Unary minus range-checks an immediately following exact literal as one negative
value. It does not first require the positive magnitude to fit the selected
signed type. An expected signed type may therefore represent its complete
minimum value, and an uncontextualised negative literal uses `i16` when the
whole negative value fits. An explicit signed conversion supplies this context
to a directly negated literal:

```lanternfly
const byteMinimum as i8 = -128
const wordMinimum as i16 = -32768
const longMinimum as i32 = i32(-2147483648)
```

The exception applies only to a literal immediately below unary minus. Other
unary expressions type their operand before applying the operator.

Thus `if 1 < 2 then` compares two `i16` values, while
`const mask as u16 = 1 shl 15` evaluates in the expected `u16` context. Boolean
literals always have type `boolean`.

For arithmetic, bitwise and integer comparison operators other than shifts and
power, matching operand types use the result table below. A narrower operand
may also widen implicitly to the type already present on the other side when
that conversion preserves every source value:

| Source | Permitted wider operand type |
| ------ | ---------------------------- |
| `u8`   | `u16`, `i16`, `u32`, `i32`   |
| `i8`   | `i16`, `i32`                 |
| `u16`  | `u32`, `i32`                 |
| `i16`  | `i32`                        |

The rule converts only to an operand type already written into the expression.
It never searches for a third common type, so `u8 + u16` evaluates as
`u16 + u16`, while `u8 + i8` and `i16 + u16` require an explicit conversion.
A 32-bit operation requires an existing `u32` or `i32` operand, and only such
an operation may select a wide helper.

The result table for matching operand types is:

| Operator             | `u8` result  | `i8` result  | 16/32-bit result |
| -------------------- | ------------ | ------------ | ---------------- |
| `+`, `*`, `/`, `mod` | `u16`        | `i16`        | operand type     |
| `-`                  | `i16`        | `i16`        | operand type     |
| `and`, `or`, `xor`   | operand type | operand type | operand type     |
| `shl`, `shr`         | left type    | left type    | left type        |
| `^`                  | `u16`        | `i16`        | base type        |
| comparisons          | `boolean`    | `boolean`    | `boolean`        |

The `u8 - u8` rule preserves the complete mathematical range from -255 through
255 required by coordinate-difference programs. Arithmetic results wrap in the
selected result width.

The widening rule lets byte arithmetic compose after an intermediate grows:

```lanternfly
elementNumber = row * 20 + column
delta = x - y + adjustment
```

If `row` and `column` are `u8`, the product is `u16` and `column` widens to
`u16` for the addition. If `x`, `y` and `adjustment` are `u8`, `x - y`
produces `i16` and `adjustment` widens to `i16`.

Operator order still determines the intermediate type. With `u8` inputs,
`x + 1 - y` performs the addition as `u16` and the later subtraction also
uses `u16`, including its wrapping rule. A calculation that needs a negative
final range can select it explicitly as `i16(x) + 1 - i16(y)`.

Unary `+` retains the operand type. Unary `-` produces `i16` from `u8` or `i8`,
retains `i16` or `i32`, and is invalid for `u16` or `u32` until the programmer
converts to a signed type. `not` retains an integer operand's type and
complements every bit.

Integer conversions use the target type as a call-like operator:

```lanternfly
var signedValue as i16
var unsignedValue as u16

i32(signedValue) + i32(unsignedValue)
```

Widening a signed value sign-extends it; widening an unsigned value zero-extends
it. Narrowing retains the low destination-width bits. A same-width signedness
conversion preserves the bit pattern. A conversion to a signed type interprets
that pattern as two's complement. An explicit integer conversion applied
directly to an exact integer value takes its residue modulo the destination
width, so `u8(300)` is 44; a signed destination then interprets those bits as
two's complement. All `boolean(expression)` conversions, and conversions
between `boolean` and an integer type, are deferred and rejected by the first
implementation.

A full-width 32-bit product from 16-bit inputs requires explicitly widening the
inputs before multiplication.

Division truncates toward zero. `mod` satisfies:

```text
left = (left / right) * right + (left mod right)
```

Division or remainder by constant zero is a compile error. A runtime zero
divisor invokes the target arithmetic-fault service.

For shifts, the right operand may have any integer type and is interpreted as
a mathematical count; it is not converted to the left type. For
`base ^ exponent`, the exponent may likewise have any integer type but must be
non-negative. Power's result type is shown in the table and remains fixed
through repeated products. `x ^ 0` is one in that result type, including when
`x` is zero. A negative exponent is a compile-time or runtime arithmetic
fault. Intermediate and final power values wrap in the result type.

### 3.2 Strings

`string[N]` is the language's one text type: an owned, fixed-capacity counted
string in the Pascal tradition, whose payload additionally always ends with a
zero byte. `N` is a positive constant capacity from 1 through 65,534 and is
part of the type:

```lanternfly
var playerName as string[24]

const prompt as string[6] = "READY?"

record Address
    name as string[24]
    city as string[32]
end
```

A double-quoted literal initializes, assigns to, appends to or compares with
a string. Direct source characters use their ASCII byte values, and escapes
use the values listed in section 2.4. The empty literal `""` denotes the
empty value.

The declared capacity fixes the representation. A capacity from 1 through 254
uses the short form:

```text
offset 0        current length L as u8, 0 <= L <= N
offset 1..N     payload capacity
offset 1 + L    zero terminator
exact size      N + 2 bytes
```

A capacity from 255 through 65,534 uses the long form. Its length `L` is a
target-endian `u16` at offset zero, its payload begins at offset two, and
its exact size is `N + 3`. Declaring a capacity above 254 requires
`import "standard/long-strings.lafy"` under section 1.1. The import
legalizes the long form and changes nothing about either representation. A
value whose length is 255 or greater is therefore necessarily a long
string. The short encoding never uses length byte 255, and the long
encoding never uses length word 65,535. The declared capacity, not the current
contents, fixes the form, so `string[255]` remains long even while it contains
only a few bytes.

Every valid representation satisfies all of these invariants:

- `0 <= L <= N`;
- payload bytes before `L` are nonzero;
- the byte immediately after the payload is zero;
- the short form never stores 255 as its length, and the long form never stores
  65,535.

Bytes after the terminator are unspecified. All-zero storage is the valid
empty value. The length header, payload cells and terminator are sealed: no
source path can select them. A string is not a byte array, and `fill` cannot
expose or overwrite its representation. Language operations and native
contracts must preserve all four invariants.

The maintained terminator is the reason the representation is also valid
NUL-terminated text: a native or substrate contract that consumes
zero-terminated bytes may read the payload directly, at no conversion cost,
under the rules in section 13.2. An ordinary `u8` array carries no such
invariant and is not a string.

The following operations are defined:

- `length(text)` reads the stored length and returns it as `u16` without
  scanning the payload; a literal operand folds to its known payload length;
- comparison between two strings, or between a string and a literal, compares
  unsigned payload bytes lexicographically, so equality compares text content
  rather than storage identity;
- assignment from another string or a literal copies content after checking
  that it fits the destination capacity, so capacities need not match;
- a string literal initializes or assigns a string when its payload fits;
- `append(destination, source)` appends another string's or a literal's
  payload;
- `append(destination, byte)` appends one nonzero `u8` byte;
- `clear(destination)` establishes the all-zero empty representation.

A known oversized literal or constant source is a compile-time error. A
dynamic assignment or append that would exceed capacity, and a dynamic byte
append whose value is zero, invokes `F-RANGE` before any destination byte
changes. String assignment has snapshot semantics when source and destination
storage overlap.

For storage ownership, storage classes, parameters and local aliases,
`string[N]` follows the aggregate rules. String storage is static, placed,
or native, in a near or far class like any aggregate; a
per-invocation string local occupies overlay-colored static storage and
becomes empty at its declaration under section 11.4's aggregate-local
rules. A parameter states its exact capacity and aliases
writable caller storage; an exported parameter also states `near` or `far`
before its name. A local `alias` may name an existing string of exactly the
declared capacity. Strings cannot be returned by value. Arrays may use a
string element type; for example, `string[24][8]` is an eight-element array
of `string[24]`, with the capacity brackets belonging to the element type.

Byte indexing, slicing, general read-only
string parameters and deliberate truncating copy are deferred. They require a
bounded-view design and do not weaken the sealed representation in this
edition. Ordinary source and external routine parameters therefore continue
to state an exact capacity and alias writable storage.

The optional standard service modules once needed a narrow exception for
capacity-generic text. They no longer do: `writeText(text as string[])`
and `readArgument(write destination as string[])` are ordinary signatures that any
program could write, under the generic aggregate parameters of section 11.3.
A string literal is accepted as a read-only argument. The compiler may form temporary carriers
containing the storage class, payload location and known layout information. A
carrier exists only for its call, is not a source value and cannot be stored,
returned, compared, converted or rebound. These service contracts do not
introduce general read-only, output or in/out parameters or bounded views.

## 4. Constants and variables

### 4.1 Constants

`const` declares a compile-time value:

```lanternfly
const warehouseCapacity = 5000
const visibleMask as u8 = %10000000
const debuggingEnabled = false
```

An annotation is optional for a scalar constant. If an unannotated initializer
remains an exact integer expression under section 3.1, the declaration creates
an exact, untyped integer constant. It adopts a fixed integer type when a later
typed expression or destination requires one. If the initializer already has a
scalar type, the constant retains it. A Boolean expression therefore produces
a `boolean` constant, and an enum member produces a constant of its nominal
enum type:

```lanternfly
enum ReportMode as u8
    compact
    detailed
end

const defaultMode = compact
```

The `ReportMode` representation remains explicit on the enum declaration.
There is no untyped enum constant.

An explicit `as Type` supplies the initializer's expected type and applies the
ordinary conversion and range rules. It is required for string, record and
array constants, for placed constants and whenever an initializer has neither
one scalar type nor an exact integer result. Violating this rule is
`E-CONST-004`.

A scalar constant normally occupies no storage. An exact untyped integer has
no stored representation. Explicit placement or target export requirements
may force a typed scalar constant to have a stored representation. A
`string[N]` constant is immutable aggregate storage initialized from a fitting
literal or string constant.

An aggregate `const` declares immutable static data:

```lanternfly
const movementCost as u8[4] = [1, 1, 2, 255]

const smallMap as u8[2, 4] = [
    [0, 0, 1, 1],
    [2, 2, 3, 3]
]
```

Constant arrays and records have exact ordinary layout and may be indexed and
exported. Assignment through any path to constant storage is a compile error.
An aggregate parameter is read-only unless marked `write`, so constant
aggregate storage may be passed to any parameter that is not marked. A target may place constant aggregate data in ROM.

### 4.2 Variables

`var` declares storage:

```lanternfly
var score as u16 = 0
var lives as u8 = 3
var gameOver as boolean = false
```

`as` introduces the type.

Module-level variables own static storage. Compiler-allocated static storage
without an explicit initializer begins with all bits zero when every leaf
accepts that representation. Integers, Booleans and strings do — an
uninitialized string begins empty — while an enum or subrange does only when
its domain contains ordinal zero. The selected validity contract determines
whether zero is valid for each opaque address type. A declaration whose type
lacks an all-zero value requires an initializer. A derived cell is the
exception: its formula supplies its value, evaluated before the first
instant under section 17.5, and it carries no initializer of its own. Placed storage, host storage
and native storage without an initializer retain the value supplied by the
target environment; the compiler performs no startup write. Importing a source
module does not change a declaration's storage class: an unplaced variable in
that module remains compiler-allocated and uses the ordinary
zero-initialization rule, while an uninitialized placed variable retains its
target-supplied value under section 4.3.

Local scalar variables use the same syntax inside a routine:

```lanternfly
sub addScore(amount as u16)
    var previousScore as u16 = playerScore
    var nextScore as u16 = previousScore + amount

    playerScore = nextScore
end
```

The initial implementation requires local declarations before executable
statements. A local name becomes visible after its declaration, so an
initializer may use parameters, module declarations and earlier locals but
cannot name itself or a later local. Local initializers execute once per
invocation in declaration order. An owned scalar local without an initializer
is set to all bits zero when its declaration is reached; a type whose scalar
leaves do not accept zero requires an initializer. An owned aggregate local
holds its type's zero value when its declaration is reached and takes no
initializer in the first edition; section 11.4 states its rules, including
the recursive-cycle rejection and the `static var` alternative.

`const` declarations are module-level in the first edition. A routine can use
a module constant without allocating storage.

### 4.3 Placement

`at` gives module-level static storage or constant data a target address:

```lanternfly
var workspace as u8[256] at $8000
const glyph as u8[2] = [$00, $7e] at $4000
```

The address is a target-address constant expression under section 3.1. The
complete object must fit one compatible target memory region. The target
profile validates its address space, range, alignment, permissions and overlap
with every other placed or allocated object. A placed declaration has the same
type and access rules as ordinary storage.

`at` is the only first-edition Lanternfly placement clause. Ordinary
declarations do not name sections or origins. Raw module assembly remains
substrate text and may use target location directives under the checks below.
The target profile defines the available memory regions and default
destinations for generated code, constants, writable storage and static
scratch. A standalone build request, or the host of an embedded body, may
select another permitted region or starting address through build
configuration. The same validation applies to defaults and overrides.

The compiler reserves every explicit `at` range before allocating ordinary
objects. It then produces a deterministic placement plan for source routines,
module storage, constants, module assembly, startup code, runtime helpers,
adapters and static scratch. The backend obtains the size and any explicit
addressed ranges of module assembly before completing the plan. Source
components use depth-first first-encounter module order from the root, then
declaration order within each module. Generated components use stable backend
IDs. The plan records every range, its alignment, its memory region and the
source or generated component that owns it. Failure to fit the plan is
`E-PLACE-001`.

An assembly-source backend serializes that completed plan with assembler
location directives. For AZM, it emits `.org` at the start of each contiguous
segment. The first `.org` is therefore an output of placement, not the memory
map policy itself. Labels and ordinary assembler fixups resolve within the
planned segments. After assembly, the compiler compares AZM's initialized-byte
map, reserved-address set and symbol table with the plan. Each planned emitted
or reserved range must have its exact address span, every initialized or
reserved address must belong to exactly one such range, and each exported or
generated component symbol must have its planned address. Missing, extra,
displaced or overlapping output is `E-PLACE-002`.

A non-AZM backend must carry the same plan through its substrate toolchain's
placement mechanism and return equivalent occupancy and symbol artifacts for
validation. A backend that cannot preserve the selected target's
placement contract reports `E-TARGET-001` rather than silently choosing
addresses.

A module assembly block has no independent origin. It reports its code,
data, helper and scratch requirements to the host, which places the combined
program and performs the same final-map validation. An inline module `asm`
block may contain target location directives, but its emitted ranges remain
subject to the target memory map and final-map check.

A placed variable with an initializer is installed before the program's start
runs. The
target profile declares, for each relevant address space, whether installation
means bytes preloaded by the program image/loader or generated startup writes.
If neither mechanism can establish the value, compilation fails. The generated
listing and cost report identify startup copies or writes.

Observable startup writes have a fixed order. Starting at the root module, the
compiler visits imports depth first in their source order, visits each resolved
module only on its first encounter, and installs a module after its imports.
Within that module, every initializer implemented by runtime writes or copies
runs in declaration order, whether its storage is placed or
compiler-allocated. Preloaded image bytes need not be written at runtime, but
the startup-effect artifact records them in the same order. The startup-effect artifact ends at the last initializer write. A
prologue's writes, and the evaluation of every derivation before the first
instant, are ordinary program execution: they follow the artifact in the
order section 12.6 gives them, the prologue first and the derivations after
it, and the artifact does not record them.

Within one aggregate initializer, observable scalar-leaf writes follow storage
layout rather than the initializer's written field order. Record fields are
visited recursively in declaration order. Array elements are visited
recursively in row-major order. These rules also order the corresponding
entries in the startup-effect artifact.

A placed variable without an initializer is an existing external object and is
not zeroed. In particular, merely declaring a volatile memory-mapped register
never writes to that register. A volatile or device-mapped initializer is
accepted only when the profile explicitly permits its startup write; that
write is an observable initialization effect reported in compiler artifacts.

Target profiles interpret `at`. A banked target may accept a far address
expression, and an address-space profile may accept a qualified device
address. A region intended only for explicit placement is never used by the
ordinary allocator. Portable modules should normally leave placement to the
build manifest or target defaults. A local declaration, `static var` included, cannot use `at`.

### 4.4 Volatile storage

`volatile` marks storage whose accesses are observable:

```lanternfly
volatile var keyboardStatus as u8 at $9000
export volatile var videoControl as u8 at $9001
```

Every source read must perform a storage read and every source write must
perform a storage write. The compiler must not cache, combine, remove or
reorder volatile accesses across another observable operation.

Volatility follows field and index paths into a volatile aggregate. A whole
aggregate copy involving volatile storage performs the corresponding ordered
element accesses rather than an unobservable bulk substitution.

On a target that recognizes interrupts at instruction boundaries, a volatile
scalar access no wider than the target's single-instruction transfer width
must be performed by one instruction; a backend must not split a volatile
16-bit access into separate byte accesses where an interrupt could
intervene. A volatile aggregate copy is not atomic — its ordered element
accesses may be separated by interrupts — so storage shared with an
interrupt handler and wider than the single-instruction width requires an
access protocol rather than a bulk copy.

The first implementation permits `volatile` only on module-level storage and
imported or native storage contracts; volatile local variables are
rejected, `static var` included.
It also rejects a local aggregate alias to volatile storage and rejects passing
volatile storage as an aggregate argument. Volatile accesses remain available
through the original declared storage path. A later parameter-effect contract
may permit volatile aggregate calls without weakening access ordering.

### 4.5 Initializers and constant expressions

A constant or module-variable initializer has one of four forms:

```lanternfly
const lives as u8 = 3
const prompt as string[6] = "READY?"
const origin as Point = Point(x = 0, y = 0)
const row as u8[4] = [1, 2, 3, 4]
```

A scalar initializer is an expression. A string initializer is a literal or a
previously declared string constant whose compile-time content fits the
destination capacity. An array or record initializer may also be the name of
a previously declared constant of the identical aggregate type, whose
compile-time value becomes the initial image.

A `const` or module `var` whose initializer is a record initializer may
omit its `as` clause: the declared type is the type the initializer
names, already written on the declaration line. Every other declaration
states its type — the rule removes repetition, never distance, so a
constant-name initializer still requires the `as` clause. An array initializer contains exactly one initializer
for each element at its current dimension; nested brackets must match the
declared rank and shape exactly. A record initializer names every field
exactly once. Unknown, duplicate or omitted fields are compile errors. Record
fields may be written in any order, although storage layout continues to
follow declaration order.

The leading name resolves in the type namespace. Section 2.1 forbids a
case-insensitive collision between that record type and a callable routine, so
the same token sequence cannot also resolve as an invocation.

Initializer expressions are evaluated in source order. For a record
initializer, that is the written field order; for an array initializer, it is
left to right at each dimension. Each value must be assignable to its
destination type.

Every string capacity, array dimension, case value, case-range endpoint
and counted-loop step is a scalar constant expression. A placement uses the target-address constant
expression defined in section 3.1. A `const` or module-level `var` instead
uses a constant initializer: one scalar constant expression, one string
initializer, an array/record initializer whose nested values are themselves
constant initializers, or the name of a previously declared aggregate
constant of identical type. This distinction keeps aggregate values out of scalar
contexts. A local `var` initializer is an ordinary runtime expression; an aggregate
local takes no initializer in the first edition (section 11.4), while a
`static var` takes a constant initializer under the module rules above.

A constant expression in a module declaration may contain literals, names of
eligible previously declared constants and enum members, parentheses, the
integer and Boolean operators in this specification, comparisons, explicit
scalar conversions, the pure standard operations `abs`, `sqrt` and `length`,
and the layout queries `byteSize`, `size`, `lower`, `upper` and `offset`.
`length` is constant only when the operand resolves to a literal or to
immutable string storage whose payload is known to the compiler. A constant
expression may not read variable storage, invoke a routine, use a volatile
object or perform any other observable operation.

For a constant expression inside a routine body, eligible names include
imported constants, earlier module constants and enum members, as defined in
section 2.1. A later declaration is unavailable even if the compiler has
already parsed the complete file. Scalar imported
constants other than opaque address bindings, and every visible manifest enum
member, also satisfy these constant-expression contexts.

Except for the exact subtrees permitted in an unannotated constant initializer
or target-address expression under section 3.1, the compiler resolves every
operator's operand and result types before folding it. Each folded operation
applies the same wrapping, shift, conversion and fault rules as runtime
evaluation. An untyped literal, exact layout-query result or exact integer
constant remains exact until an expected context, a width-dependent operation
or the ordinary `i16` default gives it a type. Consequently, if
`maximum as u16` is 65535, `(maximum + 1) / 2` is zero, not 32768. Division by
zero, an invalid shift, a negative power or a negative `sqrt` operand is a
compile error in a constant expression.

## 5. Records

`record` declares a Pascal-cased nominal type:

```lanternfly
record Point
    x as i16
    y as i16
end

record Actor
    position as Point
    velocity as Point
    image as u8
    active as boolean
end
```

Each field is a bare `name as Type` line; no keyword introduces it, because
the record declares layout rather than storage. A `var` declaration allocates
instance storage:

```lanternfly
var player as Actor
```

Record layout is exact:

- fields appear in declaration order;
- no padding is inserted implicitly;
- nested records are stored inline;
- every offset and total size is known during compilation;
- a field type must already be complete, so direct and mutual recursive
  containment cannot be declared;
- exporting a record exports its complete field layout.

Naming the record currently being declared, or any later record, as a field
type is use before declaration under `E-NAME-001`.

## 6. Fixed arrays and index domains

Every array dimension declares an ordinal index domain. A lone positive
constant remains the count shorthand and begins at zero:

```lanternfly
const actorCount as u8 = 8
const boardRows as u8 = 12
const boardColumns as u8 = 20

var actors as Actor[actorCount]
var board as u8[boardRows, boardColumns]
```

`Actor[8]` is therefore identical to `Actor[0 until 8]`. An explicit range
sets any constant lower bound:

```lanternfly
var samples as u8[10 to 20]
var tiles as Tile[1 to boardRows, 1 to boardColumns]
```

The first array has eleven elements indexed from 10 through 20. `to` includes
the written upper value; `until` excludes it. A named subrange or enum type can
supply a complete dimension:

```lanternfly
var pixels as Colour[ScreenColumn]
var palette as u8[Colour]
```

An enum dimension contains one element for every member in declaration order.
A subrange dimension uses that type's complete domain. An array:

- has fixed, nonempty compile-time index domains;
- stores elements contiguously;
- is stored inline;
- may contain scalars, strings or records;
- may appear as a record field.

The normalized index domain is part of the array type. Arrays with equal
element counts but different lower bounds or different enum/subrange index
types are not assignment-compatible. When the element type is `string[N]`, its
capacity brackets precede the array dimensions: `string[24][8]` contains eight
strings of capacity 24.

Array initializers use square brackets:

```lanternfly
var movementCost as u8[4] = [1, 1, 2, 255]

var smallMap as u8[2, 4] = [
    [0, 0, 1, 1],
    [2, 2, 3, 3]
]
```

Initializer positions follow ascending ordinal order in each dimension. The
first value corresponds to the lower bound, and the rightmost dimension
changes fastest. The same order governs `for each` traversal.

Multidimensional arrays use row-major layout. The rightmost dimension is
contiguous:

```lanternfly
board[row, column]
```

For `u8[12, 20]`, the element number is `row * 20 + column`. In
`u8[1 to 12, 1 to 20]`, it is `(row - 1) * 20 + (column - 1)`. An enum index
uses its zero-based ordinal. A non-power-of-two element size uses its true size
in the address calculation.

One bracket operation supplies exactly one index for every dimension of the
array it selects. `board[row, column]` is valid for a rank-two array;
`board[row]`, `board[row, column, extra]` and `board[row][column]` are not.
Indexing selects an element, never a partial row or subarray. A later bracket
may follow only after another path segment reaches a different array.

An index must belong to the dimension's root ordinal family. Any integer type
may index an integer domain; an enum domain accepts its enum and subrange
types, but not an unrelated enum or integer. Constant out-of-range indices are
compile errors. Every dynamic index is checked unless its type or value
analysis proves that its domain is contained by the array dimension. An
out-of-range access invokes the target bounds-fault service before any load or
store occurs. A target-specific unchecked mode may exist as an explicitly
unsafe extension, but code compiled in that mode is not a conforming execution
of this specification.

Index evaluation and checking are interleaved. Within one bracket operation,
the compiler evaluates the first index and checks it before evaluating the
second, continuing from left to right. Across a longer path, each index is
checked before the next field or index segment is evaluated. If a check
faults, no later index or path segment runs.

## 7. Field access, indexing and collection assignment

A dot selects a field and brackets index an array:

```lanternfly
player.position.x
actors[index].active
animations[animationIndex].frames[frameIndex]
board[row, column]
```

Paths may be read or assigned:

```lanternfly
player.position.x = player.position.x + 1
actors[index].active = false
```

Records and fixed arrays are assignable values when their types match:

```lanternfly
actors[0] = actors[1]
destination = source
```

Such an assignment copies the complete fixed-size value. A backend may inline
the copy, emit a loop or call a runtime helper. Generated listings and cost
reports expose its size and cost.

For ordinary storage, copying has snapshot semantics: the result is as if the
complete source value were read before any destination byte changed. A backend
may implement this with direction-aware movement rather than an actual
temporary, so partially overlapping source and destination remain well
defined.

If either side is volatile, the compiler must prove that the regions do not
overlap. It then traverses record fields in declaration order and arrays in
row-major order, reading and writing each scalar element before advancing to
the next. Failure to prove non-overlap is a compile error for a volatile
aggregate copy.

Collection assignment is rejected when:

- record types differ;
- array element types, ranks or dimensions differ;
- the destination is immutable;
- a future type is explicitly non-copyable.

### 7.1 Storage paths and aliases

A storage path names a declared object or one of its fields or elements:

```lanternfly
player.position.x
actors[selectedActor]
board[row, column]
```

Paths and ordinal indices are Lanternfly's normal way to retain identity. A
program that needs a persistent link between fixed pool entries stores the
destination index, not an address. Multidimensional arrays describe regular
shapes directly rather than through arrays of row pointers.

```lanternfly
var boardPlanes as u8[planeCount, boardRows]

boardPlanes[selectedPlane, row] = rowMask
```

For irregular fixed choices, the program stores a selector and uses `select`
to choose the named object. The backend may still emit an address table when
that is the cheapest implementation; source semantics remain selectors,
indices and declared storage.

An aggregate parameter gives a routine a temporary name for caller storage.
A local `alias` can give a shorter name to a repeated aggregate path:

```lanternfly
sub updateSelected()
    alias actor as Actor = actors[selectedActor]

    actor.position.x = actor.position.x + 1
end
```

The initializer must be a writable storage path whose selected type exactly
matches the declared record, fixed-array or string type. Its base and indices are
evaluated and checked once when execution reaches the declaration. The alias
then denotes that same storage until the routine returns. Field access,
indexing and aggregate assignment through the alias use the ordinary path and
copy rules.

Every source use of an aggregate alias denotes the aggregate storage, never
the hidden carrier used by a backend. A bare alias on the right of aggregate
assignment copies from its referent, and a bare alias on the left copies into
its referent:

```lanternfly
destination = actor
actor = source
```

Passing an alias to a compatible aggregate parameter creates another temporary
name for the same storage. Field access and indexing likewise begin at the
referent. Source code has no expression for the carrier itself, so it cannot
rebind, store, return, compare or convert that carrier. Aggregate return and
aggregate comparison remain deferred under their ordinary type rules. The
first edition permits `alias` declarations only for records, fixed arrays and
strings; scalar code uses ordinary values and direct indexed assignment.

Constant storage cannot initialize a writable alias. Volatile storage also
requires direct access until the language has a parameter contract that can
preserve volatile ordering. Alias targets have static or caller-provided
lifetime, so heap lifetime and nullability do not arise.

Every static storage root has a target storage class. Ordinary
compiler-allocated storage uses the profile default; placed, banked
and native storage obtains its class from its region contract. Aggregate
parameters in private routines use the default class unless qualified:

```lanternfly
export sub drawMap(far map as TileMap)
    drawRow(map.rows[0])
end
```

`near` and `far` before an aggregate parameter's name constrain the storage
that may bind to that alias. A near path may bind to a far parameter when the
target can attach its current mapping context. Far storage cannot bind to a
near parameter. An unqualified parameter takes the profile's default class,
exported or not, so the words appear only as a deliberate override — and on a
profile without the far-storage capability, never. This is the same
distinction `near address` and `far address` draw, applied to where storage
lives rather than to what an address refers to. Local aliases inherit the
class of their initializer and do not spell it separately.

The storage carrier chosen for an alias is not observable in Lanternfly. A Z80
backend may use a register pair for a near aggregate and a bank-plus-offset
carrier for a far aggregate. A C backend may use a pointer. Source code cannot
inspect, copy or perform arithmetic on any of those representations.

`near address` and `far address` remain opaque native values. Assignment and
equality require identical classes: near with near or far with far. There is no
implicit widening, explicit language conversion or mixed-class equality.
Opaque addresses support neither field access nor indexing nor arithmetic.
Only a target routine can interpret one as a device or machine address.
Lanternfly cannot derive an opaque address from storage or derive a storage
path from an opaque address.

A target profile may attach a device-space identity to an address binding or
service contract. That identity is target metadata, not a nominal Lanternfly
type: source-visible compatibility remains `near address` with `near address`
or `far address` with `far address`. Device-space metadata does not permit
source arithmetic, indexing, dereference or conversion to a storage path.

## 8. Assignment and expressions

### 8.1 Assignment

`=` assigns when it forms an assignment statement:

```lanternfly
playerScore = playerScore + 10
player.position.x = player.position.x + 1
```

Assignment is not an expression. Chained assignment and compound forms such as
`+=` are absent from the initial language.

For scalar assignment, an exact literal may adopt the destination type when it
fits. A Boolean destination requires `boolean`. Integer-to-integer assignment
performs the same bit-preserving or low-bit conversion as an explicit type
conversion: widening is silent, while narrowing or changing signedness warns
by default. A project may promote that warning to an error. Assignment to an
enum or subrange applies the checked ordinal conversion from section 3; a
failed check causes `F-RANGE` before the destination changes.

A round-trip arithmetic conversion is exempt from that warning when the
destination has integer type `T`, every typed leaf of the source expression
also has type `T`, every exact integer leaf resolves as `T`, and the expression
contains only parentheses and the integer operators from section 3.1. Wider
intermediate results prescribed by the operator table remain part of the same
round trip:

```lanternfly
lives = lives - 1
position = position + velocity
```

A value leaf is an operand whose scalar value contributes to the integer
calculation. Expressions used only to locate that operand are not value leaves:
the index in `bytes[index]` and record-selection prefixes do not participate in
the arithmetic. The loaded array element or selected field does, using its
declared value type. Thus a `u16` index does not prevent a warning-free `u8`
round trip in `bytes[index] = bytes[index] + 1`.

A value originating in another declared type, an explicit conversion to
another type or a standard operation such as `abs` ends the exemption. The
ordinary value-preservation analysis may still suppress the warning.

Initializers, scalar arguments and returned values use the same destination
conversion rules, including range checks and the round-trip exemption.
Aggregate assignment instead requires an identical record type or identical
array element type, rank and normalized index domains. String assignment
follows the checked content-copy rule in section 3.2, so source and
destination capacities need not match. Assignment to a bare aggregate alias
copies into its referent; it never rebinds the hidden carrier.

The parser recognises assignment when a statement begins with a writable
storage path followed by `=`. In every other expression context, `=` is
equality:

```text
assignment-statement ::= writable-path "=" expression
```

### 8.2 Equality and comparison

The same `=` token means equality inside an expression. Grammar context makes
the two uses unambiguous:

```lanternfly
if playerScore = highScore then
    showHighScore()
end
```

The comparison family is:

| Operator | Meaning               |
| -------- | --------------------- |
| `=`      | equal                 |
| `<>`     | not equal             |
| `<`      | less than             |
| `<=`     | less than or equal    |
| `>`      | greater than          |
| `>=`     | greater than or equal |

Comparison chaining is invalid. A bounded test combines two comparisons:

```lanternfly
if minimum <= input and input <= maximum then
    acceptValue()
end
```

Integer comparisons use the operand compatibility rule in section 3.1.
Subranges compare through their base ordinal type. Enum comparisons require
the same nominal enum family and follow declaration order. Booleans support
only `=` and `<>`. Opaque addresses of the same address class support `=` and
`<>`; mixed near/far address comparison is invalid and has no implicit
conversion. Strings support all six operators with the content comparison in
section 3.2. Record and array equality, including equality through an aggregate
alias, is deferred; their fields or elements must be compared explicitly.

### 8.3 Arithmetic

The initial arithmetic operators are `+`, `-`, `*`, `/`, `^`, `mod`, `shl` and
`shr`.
`mod` has the same precedence as multiplication and division. Integer division
truncates toward zero. The remainder satisfies:

```text
left = (left / right) * right + (left mod right)
```

Power, square root and operations that the target CPU lacks may lower through
runtime helpers. Helper use does not alter source semantics.

`shl` shifts an integer left and fills low bits with zero. `shr` fills high
bits with zero for unsigned values and with the sign bit for signed values. The
left operand retains its type. A negative count is an arithmetic fault. A count
greater than or equal to the width produces zero for `shl` and unsigned `shr`,
and produces all sign bits for signed `shr`.

### 8.4 Boolean and binary operators

The word operators are:

```text
not
and
xor
or
```

With `boolean` operands they perform logical operations. With integer operands
they perform bitwise operations:

```lanternfly
visible = active and onScreen
maskedFlags = flags and visibleMask
```

Boolean `and` and `or` evaluate the left operand first and follow this table:

| Operator | Left operand | Right operand | Result |
| -------- | ------------ | ------------- | ------ |
| `and` | `false` | not evaluated | `false` |
| `and` | `true` | evaluated | the right operand's Boolean value |
| `or` | `true` | not evaluated | `true` |
| `or` | `false` | evaluated | the right operand's Boolean value |

An operand marked not evaluated performs no call, storage access, check, fault
or other effect. These short-circuit rules are observable language semantics.
Boolean `xor` evaluates both operands. Integer `and`, `or` and `xor` always
evaluate both operands and combine corresponding bits.

A condition must have type `boolean`. Integers do not become conditions
implicitly:

```lanternfly
if (flags and visibleMask) <> 0 then
    drawActor()
end
```

Precedence, highest to lowest, is:

1. calls, indexing, field access and parentheses;
2. power;
3. unary arithmetic;
4. multiplication, division and `mod`;
5. addition and subtraction;
6. `shl` and `shr`;
7. comparisons;
8. `not`;
9. `and`;
10. `xor`;
11. `or`;
12. the conditional `if … then … else`.

The conditional binds loosest of all and extends as far right as it can, so
`if b then a else c + 1` puts `c + 1` in the else branch; parentheses stop
it. Power associates right to left; every other binary operator associates
left to right. Thus `-2 ^ 2` means `-(2 ^ 2)`, while `2 ^ 3 ^ 2` means
`2 ^ (3 ^ 2)`.

Comparisons bind more tightly than `not`, following BASIC practice.
`not x = y` means `not (x = y)`. A comparison against the bitwise
complement requires the explicit grouping `(not x) = y`.

### 8.5 Standard operations

The first edition defines lowercase numeric, text and layout operations:

```lanternfly
distance = abs(playerX - enemyX)
root = sqrt(area)
titleBytes = length("LANTERNFLY")
const actorBytes as u16 = byteSize(type Actor)
const actorCount as u8 = size(actors)
const rowCount as u8 = size(board, 0)
firstRow = lower(board, 0)
lastRow = upper(board, 0)
const xOffset as u8 = offset(Actor.position.x)
```

`abs(value)` accepts an integer. An unsigned operand is unchanged; a signed
operand produces the unsigned type of the same width, so
`abs(i16(-32768))` is `u16(32768)`.

`sqrt(value)` accepts an integer, calculates the floor of its non-negative
square root and produces the unsigned type of the operand's width. A negative
constant is a compile error; a negative runtime value invokes the arithmetic
fault service.

`length(text)` accepts a `string[N]` storage path or a string literal and
returns the payload byte count as `u16`. It reads the stored length header
without scanning. Literal calls fold under section 3.2.

`size(type ArrayType)` returns the extent of a fixed-array type, and
`size(path)` takes an array or string storage path. A multidimensional array
requires a zero-based dimension argument, as in `size(board, 0)`. An invalid
or nonconstant dimension is a compile error. `size` is also defined over a
range, a subrange type and an enum type, where it returns how many values
that domain contains, so it answers one question everywhere it is legal:
how many items are in this.

`byteSize(type Type)` returns the exact byte size of a type, and
`byteSize(path)` the same for a statically typed storage path. It counts
storage rather than items, including a string's length header and its
terminator, and it is the operation for a record, which has no item count —
`size` on a record is `E-LAYOUT-003`. Handing a byte count to an external
routine is what it is for.
The contextual word `type` selects the type namespace and removes any
ambiguity when a value and a type share a case-insensitive name.

`lower(type ArrayType, dimension)` and `upper(type ArrayType, dimension)` query
an array type; the path forms query an array storage path. They return the
first and last valid index of the selected dimension. The dimension argument
follows the same omission and validation rules as `size`. A dimension
declared with a named enum or subrange returns that nominal type. An anonymous
enum range returns its enum type, while a count or anonymous integer range
returns an exact, untyped integer constant. These queries make the declared
traversal explicit:

```lanternfly
for row = lower(board, 0) to upper(board, 0)
    clearRow(row)
end
```

A layout-query path is an unevaluated designator. It begins with a storage name
or local aggregate alias and may contain fields plus constant indices.
`byteSize(selected)` therefore returns the storage of the aggregate named by
the alias, while `size(board, 0)` returns the first extent of the declared
array.
The compiler constant-folds each index and validates it statically against the
selected array dimension; invalid constant arithmetic or an out-of-range index
is a compile error. This does not read the base, perform runtime index
evaluation, run a runtime bounds check or invoke a routine. Calls and
nonconstant indices are invalid in this position.

`offset(Record.fieldPath)` returns the exact byte offset of a field path from
the beginning of its record type. The path contains field names only, not
runtime indices, and every field before the final field must be a by-value
record field.

On an exact type the layout queries are compile-time operations; on a
generic aggregate parameter `size` and `byteSize` read the carrier of
section 11.3 at run time, and `length` has always read a string's header at
run time. `byteSize`, `size`, `offset`
and integer-domain `lower` and `upper` return exact, untyped integer constants
that adopt a surrounding integer type by the literal rules in section 3.1.
Enum- and named-subrange-domain `lower` and `upper` return typed ordinal
constants. `abs` and `sqrt` are pure value operations, but their argument is
evaluated normally. They constant-fold under section 4.5; `sqrt` may lower to
a target helper when evaluated at runtime.

Three standard procedures cover repeated aggregate stores and string growth:

```lanternfly
clear(board)
fill(framebuffer, backgroundColour)
append(playerName, '!')
```

`clear`, `fill` and `append` have the internal result type `unit` and are valid
only as complete procedure statements. They cannot appear in arithmetic, an
argument, an initializer, a return expression or any other value context.

`clear(target)` writes the all-zero representation to a writable record, fixed
array or string. For a record or array, it is valid only when every leaf
accepts that representation. Integers, Booleans and strings do; enums and
subranges do when their domain contains ordinal zero. The selected validity
contract determines whether all-zero is valid for an opaque address type. The
operation visits record fields recursively in declaration order and array
elements recursively in row-major order. A string becomes empty without
exposing its sealed cells.

`fill(target, value)` requires a writable fixed array whose leaf element type
is scalar. The value receives that leaf type as its expected destination type
and is evaluated and converted once under section 8.1 before any element is
stored. An exact literal may therefore adopt the leaf type. A narrowing or
signedness-changing conversion produces at most one `W-CONVERT-001` for the
procedure statement, not one warning per element. Every element of a
multidimensional array receives the converted value in row-major order. Arrays
whose leaf element is a record are rejected; an ordinary aggregate assignment
can copy a prepared record value when that operation is needed.

`append(destination, source)` requires a writable `string[N]` destination. A
text source is a string storage path or a string literal; a byte source has
type `u8` and must be nonzero. The procedure evaluates the destination path
first and the source second, snapshots the source content when the regions may
overlap, checks the final length and byte invariant, and then writes the
payload, terminator and length. Failure invokes `F-RANGE` before the destination
changes.

All three procedures evaluate the destination path once and then evaluate the
value, when present, once before storing. Their writes are observable. A volatile
target receives one ordered scalar write per element or field. A backend may
inline the operation or select a runtime helper, and the generated listing
reports that choice.

### 8.6 Expression statements

Any expression may stand as a statement. Evaluation proceeds normally and
discards its final value:

```lanternfly
updateClock()
distance(playerX, enemyX)
playerScore + 10
readKey() + 1
```

Discarding the final value does not discard routine effects, bounds checks,
faults or short-circuit behaviour. An expression proven to have no observable
effect may produce an unused-result warning, but it remains legal.

The warning should be enabled by default for a pure arithmetic, comparison,
field or index expression used as a statement:

```lanternfly
playerScore + 10
```

Projects may promote the warning to an error. A routine invocation is not
warned merely because its result is discarded.

### 8.7 Evaluation order

Lanternfly fixes evaluation order so that calls, volatile accesses, checks and
faults behave identically on every backend:

- statements execute in source order;
- invocation arguments evaluate from left to right;
- a unary operand evaluates before its operator;
- binary operands evaluate left to right, subject only to Boolean
  short-circuiting;
- path bases and indices evaluate from left to right;
- an assignment evaluates its destination path once, then its right-hand
  expression, then performs the store;
- array and record initializer elements evaluate in their written source order.

Under destination-first assignment, `actors[nextIndex()].x = nextValue()` runs
`nextIndex()` before `nextValue()`.
A backend may reorder work only when it proves that no call, volatile access,
fault, result or other observable behaviour can distinguish the change.

## 9. Conditional control

### 9.1 `if`

The basic form is:

```lanternfly
if active then
    updateActor()
end
```

Alternatives use `else`:

```lanternfly
if lives = 0 then
    finishGame()
else
    continueGame()
end
```

Several branches use the two words `else if` and one closing `end`:

```lanternfly
if direction = left then
    playerX = playerX - 1
else if direction = right then
    playerX = playerX + 1
else
    holdPosition()
end
```

A one-line form of the `if` statement is deferred; the conditional
expression of section 8 is a separate construct.

### 9.2 `select`

Selection uses `select`, `case`, optional `else` and `end`:

```lanternfly
select direction
case left
    playerX = playerX - 1
case right
    playerX = playerX + 1
case up
    playerY = playerY - 1
case down
    playerY = playerY + 1
else
    holdPosition()
end
```

The selected expression is evaluated once and must have an ordinal type. Cases
contain compatible ordinal compile-time constants. Duplicate and overlapping
cases are invalid, so at most one case body can match. When a case matches, its
body runs and execution continues after the `select` block's final `end`. It
does not continue into the following case body. Continuing into that body would
be fall-through; Lanternfly has no fall-through and no `break` statement. When
no case matches, the `else` body runs if present; otherwise no body runs.
Boolean and opaque-address selection is deferred.

Several values may share a case:

```lanternfly
case grass, sand
    movementCost = 1
```

Inclusive constant ranges use `to`:

```lanternfly
case 0 to 9
    band = cold
```

`until` gives an exclusive upper boundary. Every single case value and range
endpoint is constant-folded under its own ordinary expression type. An
all-literal integer expression therefore uses the `i16` default; the selected
type does not propagate into its operators. A single exact integer literal or
enum member may adopt the selected ordinal type directly. The folded value
must be representable in the selected type.

Ranges and overlap checks operate on these normalized selected-type values.
The resulting range must contain at least one value. A reversed, empty,
overlapping or duplicate range is a compile error. An enum `select` without
`else` is exhaustive when its cases cover every member; tools may warn when
they do not.

## 10. Loops

Lanternfly has counted loops, collection traversal and one conditional loop.
The language does not add a separate indefinite form because `while true`
expresses it directly.

### 10.1 Counted ranges

```lanternfly
var level as u8

for level = 1 to 10
    loadLevel(level)
end
```

`to` includes the limit. With the default positive step, the example visits
the values 1 through 10.

`until` excludes the boundary:

```lanternfly
var index as u8

for index = 0 until size(actors)
    actors[index].active = false
end
```

For a positive step, `until` visits values strictly below the boundary. This
half-open form is canonical for a count-declared array because its count can
appear directly without subtracting one. Arrays with explicit domains use
`lower` and `upper` for matching traversal.

Both forms accept a compile-time `step`:

```lanternfly
for row = 7 to 0 step -1
    clearRow(row)
end
```

The control name must denote a writable, non-volatile ordinal variable or
scalar parameter. A constant, Boolean, opaque address, alias, aggregate or
volatile ordinal is invalid. Rejecting volatile control storage avoids
inventing implicit device reads and writes for the loop machinery. The loop
introduces no control declaration. When `step` is omitted, it is the
mathematical integer `+1`. The compiler folds the written step independently
under the ordinary integer-expression rules and rejects zero. A negative step
remains valid with an unsigned control variable because the step is not
converted to that variable's type. Enum and enum-subrange controls advance by
ordinal position; their explicit step must be an integer constant.

The start and boundary each evaluate once, in that order, before the converted
start is stored in the control variable. A boundary expression that reads the
control variable therefore reads its old value. The start uses the
destination-conversion rules
from section 8.1. The boundary is an independently typed compatible ordinal
expression. An exact literal or layout query remains mathematical at an
integer boundary, allowing this complete traversal:

```lanternfly
var bytes as u8[256]
var index as u8

for index = 0 until size(bytes)
    bytes[index] = 0
end
```

The exclusive boundary 256 need not fit in `u8` because it is never stored in
`index`.

For a positive step, `to` continues while the current value is less than or
equal to the boundary, and `until` continues while it is less than the
boundary. For a negative step, `to` continues while the current value is
greater than or equal to the boundary, and `until` continues while it is
greater than the boundary.

A step directed away from the boundary produces a zero-iteration loop. For
`for position = 7 to 0 step 1`, the initial continuation test is `7 <= 0`, so
the body does not run and `position` retains 7.

After the body, the implementation computes the next value mathematically and
tests it before storing it. A value that fails the next test ends the loop
without being stored. A value that would continue must fit the control
variable; a statically known failure is a compile error and a dynamic failure
causes `F-LOOP-RANGE`. This order prevents unsigned wraparound.

After the loop, the variable retains the last value stored. If the body never
runs, it retains the converted start value. The loop body may not assign to
the control variable. The restriction includes transitive effects: a call or
native boundary whose effect summary may write the variable is rejected. A
conservative inline `asm` block is therefore invalid while the control
variable is visible.

`continue` performs the step and next test. `exit` leaves the loop immediately.

### 10.2 Collection traversal

`for each` visits every element of a fixed array in row-major order:

```lanternfly
for each actor in actors
    updateActor(actor)
end
```

The collection expression must be a fixed-array storage path. The complete
path, including every base operation, index expression and bounds check, is
evaluated exactly once before traversal. The loop introduces the element name
with the array's leaf element type and scopes it to the body under the
collision rules in section 2.1. That name denotes the current element itself:

```lanternfly
for each pixel in pixels
    pixel = 0
end
```

Assignment to the name changes the current element. In a value context, a
scalar element name reads the element's ordinary scalar value, which may be
copied, compared, passed or returned like any value of that type. For a record
element, bare aggregate assignment, field access and aggregate calls act on
the record in the array under section 7.1. The backend's traversal carrier is
not a source value and cannot be rebound, stored, returned, compared or
converted. A constant array produces a read-only element binding. Volatile
arrays are rejected in the first edition because the binding would need a
volatile alias contract.

`continue` advances to the next element. `exit` leaves the traversal. Fixed
array index domains are nonempty, so the collection itself is never empty.

### 10.3 Conditional iteration

`while` tests its Boolean condition before each iteration:

```lanternfly
while enemiesRemaining > 0
    updateEnemy()
end
```

An indefinite loop uses the Boolean literal `true`:

```lanternfly
while true
    readInput()

    if quitRequested then
        exit
    end

    updateGame()
end
```

`continue` returns to the condition test. `exit` leaves the loop.

### 10.4 Loop control

Bare `exit` leaves the innermost enclosing `for`, `for each` or `while`.
Bare `continue` begins that loop's next iteration according to the rules above.
Both statements are compile errors outside a loop. `exit` never terminates the
program and never leaves a routine; `return` leaves a routine.

The first edition has no labelled loops, named `exit` variants, bare
indefinite `loop`, `do` loop or post-test `repeat`. A routine can use an early
`return` to leave a nested search; code that must continue after an outer loop
uses an explicit Boolean flag. A later `repeat`/`until` form requires evidence
from translated programs.

## 11. Routines

### 11.1 One routine construct

`sub` declares every user routine. Lanternfly has no separate `function`
keyword:

```lanternfly
sub updateClock()
    frame = frame + 1
end

sub distance(left as i16, right as i16) as u16
    if left >= right then
        return u16(left - right)
    end

    return u16(right - left)
end
```

An omitted result type means that the routine returns no usable value. A
trailing `as Type` declares a result. The language does not initially expose a
`void` type. Internally, such an invocation has type `unit`; `unit` cannot be
written in source or used as a value. A declared result must be an ordinal,
Boolean or address scalar. Returning a string, record or fixed array by value
is deferred.

Parentheses are present for every declaration and invocation, including an
empty parameter list, so a routine invocation is syntactically distinct from a
name.

The parameter and result types in a routine signature must already be visible.
After that signature is checked, the routine name is visible within its own
body and in later declarations. This permits direct recursion on a capable
target. A call to a routine whose signature has not yet appeared is a
declaration-before-use error; section 11.6 defines the forward declaration
that supplies a signature ahead of its body.

### 11.2 Invocation

Lanternfly has no `call` keyword:

```lanternfly
updateClock()
separation = distance(playerX, enemyX)
distance(playerX, enemyX)
```

The first and third invocations are expression statements. Any result is
discarded. The second invocation contributes its result to an assignment.

A result-free routine cannot appear where a value is required.

### 11.3 Parameters

Parameters use the same `name as Type` form:

```lanternfly
sub moveActor(write actor as Actor, deltaX as i16, deltaY as i16)
    actor.position.x = actor.position.x + deltaX
    actor.position.y = actor.position.y + deltaY
end
```

Scalar parameters pass values. String, record and array parameters create
non-rebindable aliases to caller storage. Mutating `actor` in the example
mutates the caller's record. The source type remains `Actor`; no pointer or
reference type appears at either side of the call.

An unqualified aggregate parameter takes the profile's default storage
class. A routine accepting non-default storage puts `near` or `far` before
the parameter name:

```lanternfly
export sub moveActor(write near actor as Actor, deltaX as i16)
    actor.position.x = actor.position.x + deltaX
end
```

The position keeps aggregate storage class separate from the type of its
elements. In `far handles as near address[8]`, the array is in far storage and
each element is a near opaque address. The two classes are checked
independently. A leading storage class is valid only when the parameter type
is a string, record or fixed array.

An aggregate parameter is read-only. `write` before the storage class marks
one the callee may change:

```lanternfly
sub drawPanel(near panel as Panel)          // reads it
sub sortInPlace(write items as u8[])        // changes the caller's storage
```

Both carry the same hidden carrier and cost the same at run time; the marker
constrains what the body may do. Reading is the common case, so it is the
unmarked one, and an unmarked parameter can never disturb a caller's
storage. Every write path through an unmarked parameter is closed, and each
is `E-PARAM-001`: assigning to the parameter or to any path through it;
binding an `alias` to it; passing it to a parameter marked `write`; naming
it as the destination of `clear`, `fill` or `append`; and assigning to a
`for each` element bound over it, whose binding is read-only.
An aggregate parameter may omit its capacity — `items as u8[]`,
`write text as string[]` — which makes it **generic** and lets one routine serve
every size. Without routine values there is no map or fold, so every
traversal is a loop and every reusable loop is a routine that takes an
array; capacity-locked parameters would mean one copy per size. A generic
parameter's hidden carrier holds the payload address and the size as `u16`.
The caller supplies that size as a compile-time constant, always available
there because the argument's type is static, and a routine forwarding its
own generic parameter passes the size it received, so composition works to
any depth. The carrier gains a field and nothing else: it still has no
source syntax and cannot be stored, returned, compared or converted.

`size(items)` on a generic parameter reads that field, so a counted loop
takes it as a limit, evaluated once at entry. Indexing bounds-checks against
it rather than against an immediate. A generic array's index domain is
zero-based over its size. A generic parameter may be marked
`write`, since the carrier's size is what makes the bounds check possible: a
routine appending to a `write text as string[]` compares `length(text)` against
`size(text)`, the first giving where the characters end and the second where
the storage does. Records and multidimensional arrays take no generic form, their shape
being their type.

`write` is valid only on a string, record or fixed-array parameter of a
source routine; on a scalar parameter, on an `extern sub` parameter, or on a
task type's parameter it is `E-PARAM-001`, since a task's parameters are
fields of its instance rather than aliases.

An aggregate argument must be a compatible storage path or local alias, not a
temporary initializer or other general expression. A `write` parameter admits neither
constant nor volatile storage as an argument; an unmarked parameter accepts
constant storage, and a state cell may be passed only to an unmarked
parameter, under section 17.3. Source code has no expression for the parameter's hidden carrier,
so rebinding, returning, storing, comparing or converting that carrier has no
syntax. The parameter name denotes caller storage: ordinary field access,
indexing, aggregate copying and nested aggregate calls remain valid. Passing
it to another compatible aggregate parameter extends the temporary alias only
for that nested call.

### 11.4 Local variables and aggregate aliases

Scalar locals use `var`:

```lanternfly
sub updateActor(write actor as Actor)
    var nextX as i16 = actor.position.x + actor.velocity.x
    var nextY as i16 = actor.position.y + actor.velocity.y

    actor.position.x = nextX
    actor.position.y = nextY
end
```

Local aggregate storage follows these rules:

- scalar locals may own automatic storage;
- an ordinary `var` declaration with a string, record or array type
  declares a per-invocation aggregate local: each invocation holds the
  type's zero value when the declaration is reached. The form takes no
  initializer in the first edition, and a type without a valid all-zero
  value is rejected in it. Inside a direct or mutual recursive cycle
  the declaration is a compile error, `E-LOCAL-001`, whose diagnostic
  names the remedies: a `static var`, a caller-supplied aggregate, or
  an explicit frame pool indexed by depth. The compiler never lowers a
  per-invocation declaration onto shared storage;
- `static var` declares routine-scoped shared storage: one object with
  program lifetime whose name is visible only inside the declaring
  routine, used by every invocation, recursive activations included.
  It is a module variable in all but name scope — never overlay-shared,
  initialized once by a constant initializer under section 4.5's module
  rules (or the all-zero value), installed under the section 4.3
  contract. A `static var` takes no `at`, no `volatile` and no `export`
  in the first edition, and covers scalars and aggregates uniformly;
- a local aggregate name may instead alias storage allocated elsewhere.

Establishing a per-invocation aggregate local's zero value is real
work, attributed to the declaring routine in cost reports: a record or
array clears its leaves, while a string becomes empty by writing its
length header and terminator, its remaining cells unspecified as
always.

`alias` declares that non-owning local name:

```lanternfly
alias actor as Actor = actors[selectedActor]
```

The declaration evaluates and checks `actors[selectedActor]` once. It
allocates no record storage and cannot be rebound. Direct indexing suits a path
used once; an alias suits repeated access to the same aggregate or passage to
another aggregate parameter.

### 11.5 Return

A result-free routine may return early with bare `return`:

```lanternfly
sub updateActor(write actor as Actor)
    if not actor.active then
        return
    end

    actor.position.x = actor.position.x + 1
end
```

Reaching `end` also returns from a result-free routine.

A result-bearing routine uses `return expression`. Every reachable path must
return a compatible value; statements after a `while true` loop whose body
cannot `exit` are unreachable and impose no return obligation:

```lanternfly
sub clamp(input as i16, minimum as i16, maximum as i16) as i16
    if input < minimum then
        return minimum
    else if input > maximum then
        return maximum
    else
        return input
    end
end
```

`exit` remains loop control. `return` leaves the routine, or reaches the host
routine when used without a value.

### 11.6 Forward declarations

`forward sub` declares a routine's complete signature before its body:

```lanternfly
forward sub updateEnemies()

sub updatePlayer()
    if playerCollides() then
        updateEnemies()
    end
end

sub updateEnemies()
    if enemyCollides() then
        updatePlayer()
    end
end
```

A forward declaration is checked exactly as a routine header. Its parameter
and result types must already be visible, and the routine name enters the
module value scope at that point under the ordinary collision rules. From
that point the routine may be called wherever a completed routine could be
called. A call made before the body has appeared has the same meaning as a
call made after it; a backend resolves such calls by backpatching, the same
mechanism that resolves a forward branch, so a forward declaration adds no
runtime cost to the calls it enables.

The completing declaration is an ordinary `sub` later in the same module. Its
header must repeat the forward header exactly apart from the word `forward`:
the same name spelling, export status, `write` markers, parameter storage
classes, parameter
names and types in the same order, the same result type or its absence, and
the same `fails` clause or its absence. A completing header that differs in
any of these is `E-FORWARD-002`.

Each routine has at most one forward declaration, and a forward name follows
the ordinary duplicate-declaration rules: a second forward declaration for
the same name, or a forward declaration for a name that is already visible,
is a collision error. An exported forward declaration exports the routine,
and its completing header repeats `export`. A module whose end is reached
with an uncompleted forward declaration is `E-FORWARD-001`.

`forward` applies only to source routines. An `extern sub` is complete
without a body, so it can neither carry `forward` nor complete a forward
declaration. Hosted bodies contain no routine declarations, so a forward
declaration cannot appear there. A subroutine designated as a program's start
under section 12.6 may be forward-declared; its completing body satisfies the
eligibility rules unchanged.

### 11.7 Calling convention

Source semantics give each invocation fresh scalar parameters and locals. A
backend may place them in registers, stack slots or both. It may use static
temporaries when whole-program analysis proves that overlapping invocations
cannot occur.

Recursion is a target-profile capability. A routine may call itself, and
forward declarations under section 11.6 make mutual recursion expressible. A
profile without recursion rejects any cycle in the source call graph, whether
a direct self-call or a cycle through forward-declared routines. A
recursion-capable profile provides independent per-invocation scalar state —
parameters, scalar locals and compiler temporaries; per-invocation
aggregate state across recursive activations is caller-supplied storage,
since section 11.4 bars aggregate locals from cycles — declares
its stack and reentrancy rules, and reports per-routine frame size plus any
configured maximum stack bound, including any per-level interrupt-handler
stack allowance the target declares. Static temporaries are invalid where
recursion, reentrancy, interrupts or another overlapping invocation can reach
them.

Interrupt handlers are native code outside the language. A handler never
calls a Lanternfly routine, a runtime component holding static scratch, or a
native service whose contract does not declare interrupt safety; handlers
communicate with a program only through volatile storage. Under that rule no
interrupt reaches Lanternfly frame state.

Indirect calls are not in the first edition. Native-to-Lanternfly callbacks are
also deferred: an external or host routine contract may call native services
but may not re-enter a source-defined Lanternfly routine. A
binding that requires such a callback is incompatible. The target-specific
convention does not change Lanternfly source semantics.

Routine names are not values. Source code cannot take a routine's address,
store it in an array, return it or invoke it indirectly. `select` supplies
runtime dispatch; a backend may lower a dense selection to a jump table
without exposing code addresses to the program.

### 11.8 Failable routines

Lanternfly separates two kinds of failure. A violated contract is a runtime
fault under the conformance contract: non-returning, uninterceptable by
program code, with target-defined consequences. An expected failure — input
that does not parse, a device operation that does not complete — is a value:
a member of an ordinary enum, produced and consumed by the forms of this
section. No form in this section intercepts a fault.

The vocabulary splits by part of speech: `fail` is the verb and names the
routine's own act in every position it appears, while `error` is the noun
and appears exactly where a failure arrives as a value. The rules of this
section and section 11.9 are Provisional until the error-handling
conformance program and the planned manual-pattern evidence bodies exist.

A routine declares that it can fail by naming an error set after its result
type, or in place of one:

```lanternfly
enum ParseError as u8
    emptyLine
    badDigit
    tooLarge
end

sub parseHex(line as string[8]) as u16 fails ParseError

sub verifyBlock(index as u8) fails TapeError
```

The error set must be an enum whose representation type is `u8`; any other
`fails` operand is `E-FAIL-003`. The enum is otherwise ordinary: its members
obey the ordinary scope rules, and an error value may be stored, passed,
compared and selected over like any enum value. Absent a runtime fault, each
invocation of a failable routine returns in one of two ways: success,
carrying the declared result if there is one, or failure, carrying one
member of the error set.

`fail` returns failure:

```lanternfly
if digit > 15 then
    fail badDigit
end
```

Its operand must be a member of the enclosing routine's declared error set,
and `fail` outside a failable routine is `E-FAIL-002`. Ordinary `return`
returns success. In a result-bearing failable routine, every reachable path
must return a compatible value or `fail`, extending the rule of section 11.5.

A failable invocation may appear only as the complete expression of an
expression statement, the complete right side of an assignment, the complete
initializer of a local `var`, or the complete operand of `return`. It may not
nest inside a larger expression or argument list, and its failure must be
consumed by exactly one of the three forms below; an unconsumed or nested
failable invocation is `E-FAIL-001`. In `return` position the first edition
admits only `or fail`; the same meaning as a failure default or handler is
available by assigning to a local first, so the grammar of section 15 keeps
one consumption form there.

**Propagation.** `or fail` returns the callee's failure, unchanged, from the
enclosing routine:

```lanternfly
sub loadProgram() as u16 fails TapeError
    var header as u16 = readBlock(headerBuffer) or fail
    readBlock(bodyBuffer) or fail
    return header
end
```

The enclosing routine must itself be failable, and the first edition requires
its declared error set to be the same enum type as the callee's; either
violation is `E-FAIL-002`. Propagation runs the deferred statements of
section 11.9 like any other exit.

**Defaults.** `or` followed by an expression supplies the value used when the
call fails:

```lanternfly
var speed as u8 = parseDigit(key) or 1
```

The default expression must be assignment-compatible with the call's result
type, is evaluated only on failure, and may not itself contain a failable
invocation. A default on a result-free call is `E-FAIL-003`. When the left
operand of `or` is a complete failable invocation, the `or` is this failure
default; otherwise it is the Boolean operator of section 8.4, resolved by the
operand's type exactly as assignment and equality are resolved in section 15.

**Handling.** An `on error` block follows the failable statement it handles:

```lanternfly
address = parseHex(entry)
on error code
    showParseError(code)
    return
end
```

`on error` binds to the immediately preceding statement, which must be an
assignment, expression statement or local `var` declaration containing a
failable invocation that carries no `or` form; any other binding is
`E-FAIL-004`. The name introduces a read-only value of the callee's error-set
type, scoped to the block under the collision rules of section 2.1. On
success the block is skipped. On failure the assignment or initialization
does not occur, the destination is not written and the block runs. The
block contains ordinary statements; a `fail` inside it follows this section's
ordinary rules, and `continue` or `exit` requires an enclosing loop as usual,
which the assignment and expression-statement forms may have. When the bound
statement is a local `var` declaration, the block must not complete normally:
every path through it must end at `return` or `fail`, so the local is never
readable uninitialized. Local declarations precede every statement, so a
declaration-bound block has no enclosing loop; `exit` or `continue` there
is the ordinary loop error of section 10.4, not a binding error. A block
that can complete normally in declaration position is `E-FAIL-004`.

A subroutine designated as a program's start under section 12.6, and a task
type under section 17.1, may carry a `fails` clause. A normal `return` or
end-of-body completion finishes that body; an unhandled `fail` reports
unsuccessful program termination with the named error-set member. The
program-termination contract consumes this final outcome because neither a
designated start nor a task has a source caller. A `fails` clause on an external routine of section 12.4, and
are deferred and are `E-FAIL-005`. A forward declaration repeats the `fails` clause exactly
under section 11.6. An exported failable routine's compiled export interface
records its error-set type with the rest of the signature under section 12.5.

Failable routines require no target capability and select no runtime helper.
A backend lowers the failure channel — a one-bit completion discriminant plus
the `u8` error code — under the routine ABI of the lowering contract, and a
program that declares no failable routine contains no failure-channel code.

### 11.9 `defer`

`defer` registers one cleanup statement to run when the routine exits:

```lanternfly
sub copyFromTape(bank as u8) fails TapeError
    mapBank(bank)
    defer unmapBank()

    readBlock(buffer) or fail
    storeBlock(bank)
end
```

The deferred statement is an assignment or a result-free invocation. It must
be infallible: a failable invocation, `fail`, `return`, `exit` or `continue`
inside a deferred statement is `E-DEFER-001`. A `defer` may appear only at
the top level of a source routine or task body — not inside a control
structure, and
; that placement is `E-DEFER-001`.

Every exit from the routine — a `return`, a `fail`, a propagation inserted
by `or fail`, or reaching `end` — first executes each deferred statement
that lexically precedes the exit point, most recent first. A deferred
statement executes as an ordinary statement under the evaluation-order rules
of section 8.7, and a propagating exit preserves the failure code across the
deferred statements; that preservation is a backend obligation under the
lowering contract.

## 12. Modules

### 12.1 Source imports

`import` loads another source unit:

```lanternfly
import "actors.lafy"
```

An import:

- resolves relative to the importing file and configured search paths;
- names a source module whose filename ends in the exact lowercase `.lafy`
  extension; another extension is `E-MODULE-001`;
- appears in the contiguous import prefix before every other module item;
- resolves its source unit or compiled export interface before the next module
  item is checked;
- loads a resolved source unit once per compilation;
- retains that unit's private declarations;
- exposes only explicit exports;
- contributes code and data to the same whole program;
- may be written repeatedly without duplicating the module.

Import paths beginning with `standard/` are reserved for the versioned
Lanternfly standard modules supplied by the toolchain. They do not resolve to
project files and cannot be shadowed by a configured search path. Standard
modules remain explicit imports and contribute their exports under the same
visibility and collision rules as an ordinary module. Whether an optional
standard module can be used on the selected target is a target capability;
missing service bindings produce `E-TARGET-001` rather than changing the
module's source meaning.

Lanternfly has no general textual `include` in the initial language. The
compiler reads exported declarations directly, so it does not need C-style
header substitution or include guards.

Source-module resolution proceeds depth first. The resolver marks a module
while loading it; encountering that module again reports an import cycle. A
completed module supplies its export table immediately when a diamond import
reaches it again. Separate compilation may load an equivalent versioned
export-interface artifact instead of reading the source again.

### 12.2 Exports

Top-level declarations are private by default. `export` makes a declaration
visible to importing modules:

```lanternfly
export const actorCount as u8 = 8

export record Actor
    x as i16
    y as i16
    active as boolean
end

export enum Direction as u8
    left
    right
    up
    down
end

export var actors as Actor[actorCount]

export sub updateActors()
end
```

Exporting an enum also exports all of its members. An exported declaration
cannot expose an unexported user-defined type. The check applies recursively
to exported constant and variable types, routine parameter and result types,
and every field type reachable through an exported record. Array layers and
index domains do not hide their element or ordinal types from this check.

### 12.3 Visibility and collisions

Exports initially enter the importing module without qualification, following
AZM's source-module model:

```lanternfly
import "actors.lafy"

updateActors()
actors[0].active = true
```

The exports become visible at the point of the import. Because imports form the
module prefix, every successfully imported name precedes every local
declaration. Collisions between two imports are reported while processing the
later import.

Two visible declarations with the same case-insensitive name in the same
namespace cause a compile error. A value may share a name with a type under the
rule in section 2.1, while the cross-namespace type/callable collision remains
forbidden. Module aliases are a possible extension:

```lanternfly
import "actors.lafy" as actorsModule
```

Alias syntax remains deferred until real modules demonstrate the collision
pressure.

Imports are identified by canonical resolved file identity, so the same module
reached through two dependency paths is emitted once. Import cycles are
rejected initially with a path diagnostic. Imports do not re-export their own
imports unless a later explicit re-export facility is added.

### 12.4 External routines

`extern sub` gives target code a Lanternfly signature without supplying a
Lanternfly body:

```lanternfly
export extern sub printChar(ch as u8) at $0008
export extern sub waitForKey() from "ROM_WAIT_KEY"
export extern sub screenClear()
```

`at` binds a routine to an absolute target address. Its operand is a
target-address constant expression under section 3.1, and the selected profile
checks that the address is executable and representable. `from` names a
substrate symbol exactly after the compile-time string escapes from section 2.4
have been decoded. An external declaration without either clause receives the
target-profile binding for the Lanternfly name.

An absolute external routine binding owns no generated bytes and does not move
a placement origin. The profile must place its address in an executable region
reserved from ordinary allocation, normally an `explicitOnly` region. Target
metadata may describe the routine's occupied range when overlap validation
requires more than its entry address.

The declaration provides the parameter and result types seen by Lanternfly.
The selected target profile supplies or verifies the remaining native
contract. It includes the shared value and effect obligations in section 13.2
and:

- substrate symbol or address;
- parameter and result carriers;
- calling convention and normal-return behaviour;
- registers, flags, stack and mapping state preserved or clobbered;
- visible storage reads and writes, calls, faults and device I/O;
- reentrancy, interrupt and cost properties;
- blocking class: nonblocking, bounded with a stated worst case, or
  unbounded. A bounded- or unbounded-blocking routine is callable only in a
  program's prologue or epilogue (section 12.6), and in subroutines those
  call; a call from a task body, from a routine reachable from a
  derivation, or from a subroutine one of those calls, is `E-BLOCK-001`,
  because a body that holds the processor stalls every instant and every
  deadline in the program. Every unbounded call site is reported
  by warning `W-NATIVE-002`. Standard service bindings must be
  nonblocking.

A missing binding or incompatible ABI is a compile error. An omitted effect
contract, or an explicit `{ kind: "conservative" }` contract, produces
`W-NATIVE-001` and prevents optimizations across the call. The backend may
generate an adapter when the
declared Lanternfly signature and native ABI can be reconciled without changing
source meaning.

A string parameter uses an aggregate carrier and requires the exact capacity,
storage class, layout and invariant contract from section 3.2. A native
routine that consumes NUL-terminated text may read the payload directly under
that contract, because the terminator is part of the representation; native
data that supplies a string must lay out the header, payload and terminator
exactly.

External declarations are module declarations. They may be private or
exported, and a platform interface module can collect and export them for
ordinary `import`. Repeated imports still emit one binding. The selected
assembler or substrate toolchain resolves named symbols during the
whole-program build.

An `extern sub` has no Lanternfly body and cannot be designated as a
program's start. Target profiles may reject absolute `at` bindings or named `from`
bindings that their substrate cannot express.

#### 12.4.1 Optional standard text input and output

The first edition defines three optional standard text modules, two of them
service modules. A service module exports ordinary names and binds them
through the same profile machinery as a capability module under section 1.1,
gating no words and changing no typing rules. None is imported implicitly:

```lanternfly
import "standard/text-output.lafy"
import "standard/character-poll.lafy"
```

The toolchain supplies their versioned export interfaces, and the selected
profile supplies the service bindings. Their exported operation names become
visible through the ordinary import rule; they are not keywords or implicit
global names. `writeText` and `readArgument` take generic string parameters
under section 11.3, so their signatures are ordinary and could be written in
Lanternfly; only their bindings are compiler-defined and cannot be written in an ordinary `sub` or `extern sub`
declaration.

The interfaces map their exports to these stable target-service IDs:

| Export           | Service ID                           |
| ---------------- | ------------------------------------ |
| `writeCharacter` | `standard.textOutput.writeCharacter` |
| `writeText`      | `standard.textOutput.writeText`      |
| `writeNewline`   | `standard.textOutput.writeNewline`   |
| `pollCharacter`  | `standard.characterPoll.poll`        |

The selected profile resolves every used ID through the external-binding, ABI,
adapter and runtime-component contracts in this specification.

`standard/text-output.lafy` exports these operations:

```lanternfly
writeCharacter('A')
writeText("READY")
writeNewline()
```

`writeCharacter(value)` accepts a value assignable to `u8` and transfers that
one character byte to the target-selected output device. `writeText(text)`
accepts a string literal or any `string[N]` storage path and transfers its
payload bytes in order without modifying the string. The path is evaluated
once. Constant and mutable string storage are both valid because the service
receives the temporary read-only text source described in section 3.2.
`writeNewline()` transfers one target-appropriate line break; source does not
assume that the device represents it with one particular byte sequence.

Input is supplied in two layers. The lower one is a device service like the
output operations above. `standard/character-poll.lafy` exports one
nonblocking operation:

```lanternfly
character = pollCharacter()
```

`pollCharacter()` returns as `u8` the character byte the target-selected
input device has waiting, and consumes it. When no byte is waiting it returns
zero and consumes nothing. It never waits, so its blocking class is
nonblocking and any body may call it. A program without scheduled bodies
polls it directly from its prologue; a target that must deliver a zero byte
as data is outside this edition, as an end-of-file result is.

The upper layer is `standard/character-input.lafy`, an ordinary Lanternfly
module written over that primitive rather than a device service. It binds no
service ID, and because it declares a task instance it ships as
toolchain-supplied source and has no export-interface form under section
12.5. It exports:

```lanternfly
pulse characterArrived
sub hasCharacter() as boolean
sub takeCharacter() as u8
```

and declares a private task instance that polls the primitive each instant
and appends what it finds to a private buffer. `characterArrived` is raised
when the buffer becomes non-empty. `hasCharacter()` reports whether the
buffer holds a byte, and `takeCharacter()` removes and returns the oldest,
returning zero when the buffer is empty. A consumer takes bytes until
`hasCharacter()` reports none, which is why several bytes arriving within one
instant lose none: the pulse reports that input is waiting, and the buffer
carries how much.

Importing this module schedules its poller under section 12.7, so a program
that must terminate does not import it — the poller waits forever and denies
the program its quiescence.

Assembling lines, echoing characters and editing them are the work of modules
written in Lanternfly over these two, not of a device contract. The contract
defines no local echo and no interactive editing; a target may provide either
before it supplies a byte.

The output operations and `pollCharacter` have declared device-I/O effects
and normal return. They do not implicitly read or write other Lanternfly
storage, and `writeText` reads only its evaluated text source for the
duration of the call. A target may implement these contracts with firmware or
monitor routines, a serial terminal, generated substrate code, a desktop
terminal or a test service. The observable character-byte order remains the
same.

These modules do not define streams, handles, buffering, redirection, files,
directories, seeking or an operating-system interface. Future file loading and
saving belong in separate standard or target modules and do not extend the
meaning of these text devices.

#### 12.4.2 Optional standard program arguments

Launcher-supplied arguments use a third optional standard service module:

```lanternfly
import "standard/program-arguments.lafy"
```

It exports two operations, mapped to stable target-service IDs:

| Export          | Service ID                                      |
| --------------- | ----------------------------------------------- |
| `argumentCount` | `standard.programArguments.argumentCount`       |
| `readArgument`  | `standard.programArguments.readArgument`        |

`argumentCount()` returns the number of user arguments as `u8`. The launcher
therefore supplies at most 255 arguments. The invocation name is separate from
this list and is not argument zero.

`readArgument(index, destination)` accepts a value assignable to `u8` and a
writable `string[N]` storage path of any capacity. Both operands are evaluated
once. When the index exists and the complete nonzero-byte payload fits, the
operation replaces the destination with that argument and returns `true`. An
invalid index clears the destination and returns `false`. An argument that
contains a zero byte or exceeds the destination capacity stores the longest
valid prefix that fits and returns `false`.

The launcher supplies an ordered list of already-separated byte strings before
the program's start runs, and repeated reads of one index produce the same
payload during that invocation. A shell, monitor, firmware launcher, emulator
or test runner defines how its own command text becomes that list. The module
performs no allocation: the program declares the destination storage and the
service copies one bounded argument into it.

Both operations return normally. `argumentCount` is pure for one invocation;
`readArgument` writes only its evaluated destination and does not change the
launcher-supplied list. The selected profile resolves each used service ID
through the same binding, ABI, adapter and runtime-component contracts as the
standard text services. A profile with no launcher arguments may implement an
empty list. A used service with no compatible binding is `E-TARGET-001`.

#### 12.4.3 Optional standard instant clock

The scheduler's instant counter reaches a program through a fourth optional
standard service module:

```lanternfly
import "standard/instant-clock.lafy"
```

It exports one nonblocking operation, `instantCount() as u16`, returning
the counter defined in section 12.6. Its service ID is
`standard.instantClock.count`. A program with no scheduled body has no
instant counter, so importing this module anywhere in such a program is
`E-ENTRY-004`. The check is whole-program and reported at the root, since
whether a program has scheduled bodies is not visible to an importing
module.

### 12.5 Whole-program compilation

The language permits a declaration-ordered front end but does not require one
compiler implementation strategy. A whole-program build:

1. loads the root module;
2. resolves each module's contiguous import prefix depth first;
3. checks declarations in source order, making each completed declaration
   available to the declarations that follow;
4. resolves external bindings and ABI adapters;
5. resolves the program's start under section 12.6, and where the program has
   any task instance, fixes the whole-program order of those tasks and the
   settle order of the derivations;
6. lowers the required routines, data and helpers, the call to a designated
   subroutine, and the scheduler where the program has any scheduled body;
7. creates and validates the placement plan from section 4.3;
8. emits one target program and validates its final memory map and debug
   artifacts.

A compiler may keep syntax trees, typed IR and several internal passes. It may
also process a source unit once, retain a compact symbol table and leave branch
and address fixups to its backend. Both implementations accept the same
declaration-ordered programs. The second strategy is the reference
architecture under the charter's small-systems-first direction.

A program is linked by compilation rather than by a relocating link editor.
Libraries reach a program in three forms. A source import compiles the
library into the whole program in dependency order. A compiled
export-interface artifact restates a module's exported declarations, so an
unchanged library need not be re-read from source. It contributes symbols,
not relocatable code. Its `requiredCapabilities` field lists the capability
IDs that its exported declarations require under section 1.1. A module that
declares task instances or derivations contributes code that must be
scheduled or settled, so it is consumed from source and has no
export-interface form. No summary of a subroutine's writes is recorded: the
compiler emits each notification at the write site under section 17.3, so
nothing downstream needs one. An exported
exact integer constant records its mathematical value without a type or
storage representation; each importing use supplies its ordinary context. A
fixed-address library, such as a ROM library on a
banked system, pairs an export-interface artifact with code that is already
placed: its symbols bind to final addresses and the build emits no code for
it. Relocatable object formats and link-time relocation are outside the
language and its toolchain contract.

Lanternfly source module filenames use the exact lowercase `.lafy` extension.
The extension is part of each source import path. A compiled export-interface
artifact may use a target-toolchain extension because the import still names
the canonical `.lafy` source unit.

### 12.6 Compilation units and program execution

An ordinary Lanternfly source file is a `.lafy` module containing imports and
declarations. It does not contain loose executable statements. A build
manifest names the root `.lafy` module. A root path without the exact
lowercase extension is `E-MODULE-001`.

No module is a program in itself. A program is a root module, the modules
it imports, and a start. The same module is a program under one build and
a library under another, and its source says nothing about which.

A program has a declared start, a designated start, or both. A declared
start is the program's task instances: module variables of task types,
`auto task` instances, and task-typed arrays elementwise. A library
module's instances join the program that imports it and are scheduled with
it.

A designated start is requested by the build manifest's optional `start`
field. An absent field asks for none, and the program has a declared start
or none at all. A present field either names one declaration of the root
module or is empty, which asks for that module's one eligible export.

An eligible declaration is source-defined, declared in the root module,
exported, and is either a subroutine with no parameters and no result or a task type with
no parameters. Either may carry a `fails` clause under section 11.8. An `extern sub` is never eligible under
section 12.4.

The two starts combine. A designated subroutine is the program's
prologue: it is called once, before any instant, and runs to completion.
Where the program also has scheduled bodies, they follow its return; where
it has none, its return ends the program. The manifest may name a second
eligible subroutine as the program's epilogue, which runs once after the
program's last instant, on both exit paths — quiescence and unhandled
failure alike — and is the only way to state work that must happen when
everything else has finished, since no body can ask what else is
scheduled. A prologue that fails under
section 11.8 ends the program then and there, and no instant runs. A
designated task type is instantiated by the toolchain as though the
instance were declared last in the root module and is scheduled beside
whatever else the program declares; designating a type that an `auto task`
has already instantiated is `E-ENTRY-002`.

A program with no scheduled body and no designated start is
`E-ENTRY-001`. A designated name that does not resolve, names an
ineligible declaration, or is omitted where the root module has no single
eligible export is also `E-ENTRY-002`.

A prologue and an epilogue are the only places a program may block.
Nothing else holds the processor there, so the bounded and unbounded native
calls of section 12.4 belong to them alone: reading a password, loading an
image from tape, waiting on a monitor, handing the machine back. A prologue
is also where an owner assigns an instance's runtime start values, before
the instance first advances. Between them, no body may block, because a
body that holds the processor stalls every instant and every deadline in
the program.

A program has at most one scheduler, and no name in the language denotes
it. No operation selects or reorders the schedule: none starts a body, ends
another body, or reports what else is scheduled. The only exit from within
a scheduled body is an unhandled failure under the termination rule
below. A task's only controls are its own waits and its own
completion, and work that begins later is a dormant instance whose first
wait is its start condition.

The set of scheduled bodies is consequently fixed at compile time. The
scheduler is emitted as a fixed sequence: a direct call for each singleton
instance, and a counted loop over a static base address for each task-typed
array. Every call is guarded by a test against a mask byte at a statically
known address. No table of code addresses is built, and nothing registers
itself at run time.

Task instances carry one whole-program order, the order in which section
4.3 installs modules: imports depth first in their source order, each
module visited once and installed after its imports, and declaration order
within a module. A library's tasks therefore precede those of the module
that imports it.

Execution proceeds in instants. An instant has two phases:

1. **settle** — every derivation whose dependencies changed is evaluated,
   in the dependency order section 17.5 computes. Values propagate
   immediately within this phase: it is a recalculation, not a delivery.
2. **effect** — every unfinished task whose trigger has occurred advances,
   in whole-program order, from its suspension point to its next
   suspension or to its end.

Writes made during the effect phase are queued. They become the settle
phase's input at the next instant, so every task in one instant reads the
same settled state and nothing a task writes is visible to another task in
the same instant. At the instant's end, delivered pulses clear and queued
writes become the next instant's changes. Each task advances at most once
per instant, so an instant always terminates however tasks write to one
another's triggers.

Between one suspension point and the next, no other task observes the
storage a task writes: a task runs to its next suspension without
interleaving, so a sequence of statements within one advance is indivisible
with respect to the scheduler. Interrupt handlers lie outside the
scheduler, so storage shared with one keeps the access protocol required by
section 4.4. A protocol that spans a suspension point is not indivisible
either, and carries its own discipline.

On a target with a frame interrupt the instant is locked to the frame: the
handler sets a volatile flag under section 4.4 and the foreground scheduler
paces off it, so no Lanternfly body runs inside the handler and the rule in
section 11.7 stands. On a target without a frame interrupt, each pass of
the generated scheduler is an instant.

The scheduler maintains one instant counter, a `u16` incremented once at
each instant's end. Where the instant is locked to a frame interrupt the
counter counts frames at that interrupt's rate; otherwise it counts
scheduler passes, whose rate is elastic and depends on what the program
does. `after(n)` in section 17.2 takes a `u16` operand and counts n
increments of this counter from the moment a wait is entered, compared
wrap-safely, which bounds n at 32,767 — half the counter's period, because
ordering two wrapped values is decidable only within half a period. A
constant operand above that bound is `E-WAIT-001`; a runtime operand above
it faults with `F-WAIT-RANGE`.

`after` counts instants, and nothing in the language converts instants to
time. A target profile may declare an instant rate, and where it does an
instant is that period and a delay is a lower bound in real time. Where it
does not, an instant has no duration: a program that requires real time
uses a clock the profile supplies, and a profile that supplies none reports
`E-TARGET-001` rather than approximating one. A program reads the counter
through the optional standard module of section 12.4.3. The counter is not
a state cell, so reading it establishes no dependency.

All module storage is allocated and all constant initializers are installed
before the program's start runs. A prologue runs next, so it may compute
initial values; its writes are queued like any other. Every derivation is
then evaluated once, in dependency order, so derived cells hold settled
values before any task advances. A
program terminates successfully at an instant
boundary when every task is finished and no change or pulse is pending; a
program with an unfinished task — waiting or perpetual — continues. No
operation ends a program successfully, so a program that must stop reaches
quiescence by agreement: every task that outlives its work watches a cell
declared for the purpose and returns.

A program terminates unsuccessfully when a `fail` reaches the end of a
prologue, a task body or an epilogue with no handler. A prologue's failure
ends the program before any instant, and the epilogue runs even then, since
it names what must happen however the program ends. A failure in the
epilogue itself replaces any outcome already reported. Termination is immediate: the
deferred statements of the failing body run as the failure leaves it,
every other task is abandoned at its suspension point, and the deferred
statements of those tasks do not run. A task that handles its own failure
and returns is finished like any other, and the program continues without
it, so whether one body's error ends the program follows from whether that
body handles it.

A target profile that exposes a numeric exit status maps successful
termination to zero and a failed error member with ordinal `n` to
`n + 1`.

Programs receive launcher arguments through the optional service module
in section 12.4.2. This keeps program startup uniform on targets with
command lines, monitors, firmware launchers or no launcher arguments.

### 12.7 Tasks and cells across modules

Task types, task instances, state cells, pulses and derivations follow the
import, visibility and collision rules of sections 12.1 to 12.3 without
change. A task type exports like a record and cannot expose an unexported
parameter type. Because imports resolve depth first and load a module once
per compilation, a module reached through several import paths contributes
one copy of its instances, not one per importer.

An exported state cell is read, written and named in a `wait on` by any
module that can see it, and an exported pulse is raised and waited on the
same way. A cross-module write carries its notification with it: the
changed bit is set by the compiled write wherever that write appears, so
every waiting task and every derivation that depends on the cell responds,
including those in modules the writer has never heard of. This is the
behaviour of `export var` with the observer interface added, and the
restrictions that hold are the ones section 17.3 places on the writing
body rather than on which module it sits in. A derived cell keeps its
single formula wherever it is declared, and no body writes it.

Modules govern visibility. What a module can see, it can use.

A derivation's dependencies are the cells its expression reads, and a
task's are the cells and pulses its waits name. Either may reach an
imported module's declarations, and a task's writes may reach them too, so
a dependency edge can run against the import direction and the settling
graph is not confined to the import graph's shape. Computing the settle
order and searching it for circular references are therefore whole-program
obligations. Both read the `from` expressions of the derivations
themselves, so neither needs a summary of what any subroutine writes.

A module that declares task instances offers them as services: importing
it schedules those tasks in the importing program, at the position its
import order fixes. `auto task` is available to such a module on the same
terms as any other instance, because a module's tasks are scheduled
wherever they end up, and which module a build takes as its root settles
only which module's declarations a designated start may name.

A program with a designated subroutine and no task instances has no
scheduler. A standard service therefore exposes its nonblocking primitive
separately from any reactive module wrapped around it, so such a program
calls the primitive directly from its prologue. A program that must
terminate imports no perpetual service: a task that waits forever denies
the program the quiescence it ends at.

## 13. Runtime helpers and floating point

The closed record shapes a build supplies — the manifest, external bindings,
ABI adapters, memory regions and address-class validity contracts — are
specified in the companion `toolchain.md`, versioned separately. This section
keeps what a program's meaning depends on: the value invariants a native
boundary must preserve, and the contracts the language states about calls
across it.

### 13.1 Runtime helpers

Lanternfly source states operations rather than the target instructions used to
perform them. A Z80 backend may select helpers for multiplication, division,
power, square root, wide arithmetic, collection copying, bounds checks and far
access. A C backend may express the same operations directly.

Helpers are linked or emitted only when used. Their presence is visible in
generated listings and cost reports.

The bounds, range, arithmetic, invalid-Boolean and invalid-string fault
services do not return to the failing expression. A profile may report
or trap the fault; a standalone target may terminate or enter a target-defined
fault monitor. The chosen mechanism must preserve the public fault class and
source location in debug artifacts.

### 13.2 Target and native boundary

A target profile declares its CPU or substrate, endianness, supported scalar
operations, near and far address representations, address spaces, routine ABI,
program-termination implementation, standard-service implementations and
native dialect.

The target profile contains `memoryRegions` and `placementDefaults`. A
whole-program build request contains `placementOverrides`. They use these
closed record shapes:

```text
memoryRegions[]: MemoryRegion
  MemoryRegion
    id
    addressSpaceId
    start
    endExclusive
    minimumAlignment
    permissions { read, write, execute }
    allocation: "automatic" | "explicitOnly"
    initialization { preloadedImage, startupWrite }

PlacementTarget
  regionId
  start or null
  alignment

placementDefaults: PlacementDefaults
  PlacementDefaults
    code: PlacementTarget
    constantData: PlacementTarget
    variableData: PlacementTarget
    staticScratch: PlacementTarget

placementOverrides: PlacementOverrides
  PlacementOverrides
    code: PlacementTarget or null
    constantData: PlacementTarget or null
    variableData: PlacementTarget or null
    staticScratch: PlacementTarget or null
```

Region bounds and placement starts are target-address mathematical integers.
Every planned and reported address is qualified by its region's
`addressSpaceId`. A substrate with unqualified numeric addresses may omit that
field only when one relevant address space is possible; otherwise the backend
must attach the address-space identity or reject the target.

Every region is nonempty, its minimum alignment is a positive power of two,
and regions in one address space do not overlap. A placement target names an
`automatic` region and uses an alignment at least as strict as the region's.
A written start is the exact address of the class's first nonempty range; an
occupied or misaligned start fails placement rather than moving the origin. A
null start uses the first aligned free address after earlier planned ranges in
the same region, or the region start when none exists. Later allocation may
cross a reserved range only by ending the current segment and continuing at the
next aligned free address. Placement classes are planned in the order code,
constant data, variable data and static scratch. The selected region's
permissions must admit the class: code is executable, constant data is
readable, and variable data and scratch are readable and writable.

`explicitOnly` regions admit only `at`, external bindings and target assembly;
they are never selected for ordinary allocation. The two initialization flags
state whether the program image may contain bytes for the region and whether
startup code may write it. A placed initializer requires at least one permitted
mechanism, as described in section 4.3. Every emitted code range requires
`preloadedImage`; startup code cannot install the code needed to run itself.

A non-null override replaces the corresponding default for that build. It
changes placement only within the same validated memory map and cannot create a
region, relax permissions or alignment, or permit an overlap. All-null
overrides select the profile defaults. A host compiling an isolated body does
not assign final addresses; it carries the body's placement requirements into
the combined whole-program plan.

Its callable linkage, ABI, runtime, fault and symbol-resolution registries use
these closed records and exact array names:

```text
externalBindings[]: ExternalBinding
  ExternalBinding
    id
    implementation:
      { kind: "substrateSymbol", symbol }
      or { kind: "runtimeComponent", componentId }
    abiId

callableAbiDefinitions[]: CallableAbiDefinition
  CallableAbiDefinition
    id
    implementationId

adapterDefinitions[]: AdapterDefinition
  AdapterDefinition
    id
    fromAbiId
    toAbiId
    runtimeComponentId

runtimeComponents[]: RuntimeComponent
  RuntimeComponent
    id
    implementationId
    dependencyIds[]
    abiId or null
    effects: DeclaredCallableEffects

faultBindings[]: FaultBinding
  FaultBinding
    faultId
    runtimeComponentId

substrateSymbolResolver: SubstrateSymbolResolver
  SubstrateSymbolResolver
    id
    resolutionPhase: "configuration" | "link"
    implementationId

programTermination: ProgramTermination
  ProgramTermination
    implementationId
    numericExitStatus

callableCostMetadata[]: CallableCostMetadata
addressBindings[]: ProviderAddressBinding
addressValidityContracts[]: AddressValidityContract
```

Every `implementationId` resolves through the selected backend's implementation
registry. Runtime-component dependencies resolve within `runtimeComponents` and
are acyclic. ABI IDs resolve through `callableAbiDefinitions`; adapter endpoints
use that namespace and their component IDs resolve through `runtimeComponents`.
A fault ID is public and its component has declared `returns: "noReturn"`
effects. When an external binding selects a runtime component, its `abiId`
equals the component's non-null `abiId`. IDs are unique within their named
arrays.

The program-termination implementation consumes the program's final outcome
under section 12.6 — quiescence, or the unhandled failure of a prologue, a
task or an epilogue — and does not return to Lanternfly code. Where a program contains more
than one error-set type that can reach termination, the profile's numeric
mapping applies to the member actually reported, so ordinals from different
sets are not distinguished. `numericExitStatus` is Boolean. When true, the
implementation maps success to zero and a failed member with ordinal `n` to
`n + 1`. When false, its backend contract records how it reports success and
each failed member to the target's monitor, firmware, host or test interface.
In both forms, debug and test artifacts preserve the abstract success or
failure outcome and the error-set member on failure.

The selected profile contains one `substrateSymbolResolver`. A
configuration-phase resolver produces exact bytes during configuration. A
link-phase resolver may defer them, but produces exact bytes and applies the
selected validity rule before emitted-program completion. Failure to resolve a
provider symbol is `E-CONFIG-002`; resolved bytes that fail the rule are
`E-BOUNDARY-001`. Failure to resolve a callable or external-binding symbol is
`E-EXTERN-001`.

Portable character and text transfer uses the optional standard modules in
section 12.4.1. Launcher-supplied program arguments use the optional module in
section 12.4.2. Richer display, keyboard, sound, random, firmware and device
operations are typed external routines imported from platform interface
modules rather than core statements. Section 12.4 defines their source
declaration and binding forms. A missing implementation is a compile error.

Native source is admitted only through an explicit target-qualified boundary.
External bindings and statement-level inline assembly are executable
boundaries. A module-level assembly block is instead emitted source whose
runtime behaviour belongs to any `extern sub` contract that exposes it.
Compiler artifacts retain source mappings and selected-helper information
across all three forms.

Every external routine contract preserves Lanternfly value
invariants at entry and return. An integer has its declared width, an enum or
subrange contains a valid member of its domain, a Boolean is zero or one, and
an aggregate parameter names valid, correctly aligned storage of the declared
class and exact type for the duration of the call. A string has the declared
short or long layout and satisfies every sealed invariant in section 3.2.
Native code may not mutate constant storage or install an invalid ordinal,
Boolean, address or string representation in Lanternfly storage. A
contract missing one of these representation, layout or lifetime guarantees is
incompatible and is rejected; disabling optimization cannot make it safe.

An adapter validates a string after a native call that may write it and before
control returns to generated Lanternfly code. An invalid length, embedded zero,
misplaced terminator or reserved all-ones length invokes `F-INVALID-STRING`.
A provider that changes a string without declaring the write remains
nonconforming even when the resulting bytes happen to be valid.

The declared effect part of an external or host routine contract states visible
reads, writes, calls, faults, device I/O, control flow and ABI clobbers. When the
field is omitted or explicitly `{ kind: "conservative" }`, the normalized
fallback assumes that the call may read and write every mutable object reachable
by the boundary, call other native routines, fault, perform device I/O and
clobber every
caller-unpreserved machine resource. It still may not violate the value
invariants above. The compiler emits `W-NATIVE-001` and treats this fallback
as a write to any visible counted-loop control variable, which can make the
call invalid under section 10.1.

The calls named by such a contract are native-to-native edges. A native call
back into a source-defined Lanternfly routine is outside the
first edition and makes the binding incompatible. Conservative effects do not
grant callback permission.

#### 13.2.1 Inline assembly

`asm` opens an inline assembly block and the next line containing only `end`
after optional whitespace closes it:

```lanternfly
sub waitForKey()
    asm
        call ROM_WAIT_KEY
    end
end
```

The lines between `asm` and `end` are assembly source for the selected target
profile. Lanternfly does not tokenize, interpolate or rewrite them. An assembly
source backend emits those lines verbatim at the corresponding position in its
generated source, preserving their physical newlines and indentation. The
assembler then processes the combined generated and inline source. Assembly
diagnostics map back to the original inline-block lines.

An `asm` block may appear as a module item or as a statement. A module block
can provide target directives, labels, routines or data. It has no execution
point and therefore carries emission and provenance metadata rather than a
runtime effect summary or optimizer barrier. Effects of a routine defined in
module assembly belong to the `extern sub` contract that exposes it.

A statement block can use instructions, local labels and internal branches,
but conforming control must reach the generated statement that follows the
block. A return or jump that bypasses Lanternfly control flow violates the
block contract. The block must eventually reach the routine
epilogue through ordinary body completion or generated Lanternfly control.
The block must not modify immutable storage or leave an invalid enum, subrange,
Boolean, opaque-address or string representation in
Lanternfly-visible storage. Violating one of these obligations makes the inline
block nonconforming source for that target. Calling a generated source-defined
Lanternfly routine from raw assembly is deferred because the compiler cannot
add that hidden edge to its recursion and reentrancy analysis.

A statement block is an observable compiler barrier. Unless a later declared
native contract narrows its effects, the compiler assumes that statement-level
assembly:

- reads and writes every mutable object visible at the block;
- may call target or external routines, may fault and may perform arbitrary
  target or device I/O;
- clobbers processor registers, flags and other volatile machine state;
- preserves only the stack, mapping and calling-state obligations required to
  continue with the following generated statement.

The backend spills or preserves any generated value that must survive this
barrier. Read/write/call summaries and cost reports mark the block as
conservative native code. `W-ASM-001` is the specialized warning for this
statement-assembly fallback and suppresses `W-NATIVE-001` for the same block.

Raw assembly names belong to the selected assembler. There is no automatic
Lanternfly-name substitution inside the payload. The backend's generated
symbol artifact documents any Lanternfly storage or routine names exposed to
inline source.

An `asm` block is target-specific. A C, BASIC or other non-assembly backend
rejects it unless that target profile explicitly supplies a compatible
assembly-fragment pipeline. A missing closing `end` is a source error. Once
raw mode begins, `//` and every other character belong to the assembler; only
a physical line whose trimmed content compares case-insensitively equal to
`end` closes the block. The formatter emits that delimiter in lowercase.

#### 13.2.2 Generated-source provenance

A source-generating backend returns its generated text and an explicit
provenance map. Each record relates a half-open span within that exact text to
the originating `SourceSpan`, stable source node ID and generated role. A
source node may own several generated spans. A node removed by constant folding
or another semantics-preserving transformation remains in the typed artifacts
with no generated range; it is not attached to a neighbouring instruction.

An AZM backend divides its output into anchored fragments. A standalone
routine or module initializer may use its generated entry label as the anchor.
An assembly block uses a compiler-owned local label so that it remains within
the host's enclosing AZM routine. Anchor names come from the backend's reserved
generated-name space and are deterministic and unique within the assembly
unit. Each fragment records the anchor label's offset within its text. Anchor
and generated-span offsets are zero-based UTF-16 positions; generated spans
have a half-open end. The host must insert the returned text contiguously
without changing it.

After final source composition, the integration locates every anchor in the
AZM source or symbol data. It subtracts the recorded anchor offset to recover
the fragment start, verifies the exact fragment text, resolves its generated
spans to final AZM positions and joins them to the assembler's
generated-source-to-machine map. Missing or duplicate anchors, changed
generated text and provenance outside its fragment are `E-MAP-001`. After this
error, the backend does not publish a partial map.

In the composed artifact, instructions produced for a Lanternfly construct
have that source span as their primary source and retain the generated AZM span
and role as related provenance. Host wrappers and other synthetic glue that
have no Lanternfly origin remain attributed to generated source. Runtime
helpers map to their own runtime source and retain their call sites as related
locations. Inline assembly maps to its original payload lines. Assembler
diagnostics use the same composition to select the responsible Lanternfly span
while preserving the complete generated-source diagnostic.

### 13.4 Floating point

Floating-point semantics are deferred, but the delivery vehicle is settled:
a floating-point tier arrives as a standard capability module under section
1.1, with its type word reserved and gated, its operators joining the typed
operator families, and its helpers bound as profile runtime components. Of
the two models below, the second is therefore the adopted form:

1. A library-defined `Float32` record or opaque value with routines such as
   `floatAdd`. This requires little core-language knowledge but produces
   cumbersome arithmetic source.
2. An optional compiler-recognised built-in `float32` type whose ordinary
   operators lower to a selected target library. This adds a scalar type and
   conversion rules to the language, while adding no runtime bytes to programs
   that do not use it.

The built-in model requires a separate specification for:

- representation and IEEE-754 conformance;
- rounding modes;
- overflow, underflow, infinities and NaN;
- integer conversions;
- comparison behaviour;
- constant folding;
- target library ABI and code-size reporting.

On Z80 targets, floating-point library size is a reported deployment cost. A
future `float32` capability should be opt-in, linked on demand and visible in
the cost report.

## 14. Current word inventory

The current core word inventory is:

```text
abs
alias
and
append
as
asm
at
case
clear
const
continue
count
defer
each
else
end
enum
exit
export
extern
fail
fails
false
fill
for
forward
from
if
import
in
length
lower
mod
not
offset
on
or
range
record
return
select
shl
shr
size
sqrt
static
step
sub
then
to
true
until
upper
var
volatile
while
xor
```

The reserved built-in type and storage-class words are:

```text
address
boolean
far
i8
i16
i32
near
string
u8
u16
u32
```

`u32` and `i32` are reserved in every program but capability-gated under
section 1.1; a future floating-point type word would join this gated group.

`type` is contextual. It selects a type operand inside `byteSize`, `size`,
`lower` or `upper` and remains available as an ordinary identifier everywhere
else. `error` is likewise contextual: it is recognized only immediately
after `on` in the handler clause of section 11.8 and remains available as an
ordinary identifier everywhere else.

The 0.7 revision adds contextual words that are never reserved:
`task`, `derive`, `pulse`, `wait`, `raise` and `auto` in their head
positions, `state` immediately before `var`, `write` immediately before an
aggregate parameter's storage class or name, `from` inside a derivation,
and `after` inside a wait trigger (sections 11.3 and 17). Each is an
ordinary identifier everywhere else.
Contextual-word recognition is case-insensitive, and the formatter emits
lowercase.

The first edition omits:

```text
break
call
dim
do
function
goto
include
loop
procedure
repeat
```

## 15. Provisional grammar sketch

The grammar records block shape and assignment disambiguation. Expression
precedence is defined in section 8.

```text
module              ::= import-decl* top-item*

top-item            ::= export-decl
                      | declaration
                      | asm-block

import-decl         ::= "import" string-literal newline
export-decl         ::= "export" exportable-declaration

declaration         ::= const-decl
                      | var-decl
                      | enum-decl
                      | range-decl
                      | record-decl
                      | extern-sub-decl
                      | forward-sub-decl
                      | sub-decl
                      | task-decl
                      | pulse-decl
                      | derive-decl

exportable-declaration
                    ::= const-decl
                      | var-decl
                      | enum-decl
                      | range-decl
                      | record-decl
                      | extern-sub-decl
                      | forward-sub-decl
                      | sub-decl
                      | task-decl
                      | pulse-decl
                      | derive-decl

const-decl          ::= "const" value-name ("as" type-expr)?
                        "=" constant-initializer placement? newline
                        (* the as-clause may be omitted only when a
                           record initializer names the type *)

var-decl            ::= var-qualifier* "var" value-name
                        ("as" type-expr)? ("=" constant-initializer)?
                        placement? newline
                        (* the as-clause may be omitted only when a
                           record initializer names the type; a state
                           variable admits no placement, and `state` with
                           `volatile` parses so that section 17.3 may
                           reject it *)
var-qualifier       ::= "volatile" | "state"

placement           ::= "at" address-const-expr

enum-decl           ::= "enum" type-name "as" integer-type newline
                        enum-member+
                        "end" newline
enum-member         ::= value-name newline

range-decl          ::= "range" type-name "as" ordinal-type
                        "=" ordinal-range newline

record-decl         ::= "record" type-name newline
                        field-decl+
                        "end" newline

field-decl          ::= value-name "as" type-expr newline

sub-decl            ::= "sub" value-name "(" params? ")"
                        ("as" type-expr)? fails-clause? newline
                        routine-block
                        "end" newline

fails-clause        ::= "fails" type-name

extern-sub-decl     ::= "extern" "sub" value-name "(" params? ")"
                        ("as" type-expr)?
                        external-binding? newline
external-binding    ::= "at" address-const-expr
                      | "from" string-literal

forward-sub-decl    ::= "forward" "sub" value-name "(" params? ")"
                        ("as" type-expr)? fails-clause? newline

params              ::= param ("," param)*
param               ::= "write"? aggregate-storage-class? value-name
                        "as" (type-expr | generic-aggregate-type)
generic-aggregate-type
                    ::= ("string" | type-name) "[" "]"
aggregate-storage-class
                    ::= "near" | "far"

routine-block       ::= local-decl* statement*
local-decl          ::= local-var-decl | alias-decl
local-var-decl      ::= "static"? "var" value-name "as" type-expr
                        ("=" expression ("or" "fail")?)? newline
                        on-error-clause?
                        (* a static var takes a constant initializer;
                           an aggregate local without static takes none *)
alias-decl          ::= "alias" value-name "as" aggregate-type
                        "=" storage-path newline

constant-initializer
                    ::= const-expr
                      | array-initializer
                      | record-initializer
array-initializer   ::= "[" (constant-initializer
                        ("," constant-initializer)*)? "]"
record-initializer  ::= type-name "("
                        field-initializer
                        ("," field-initializer)* ")"
field-initializer   ::= value-name "=" constant-initializer

statement           ::= assignment-statement
                      | expression-statement
                      | standard-procedure-statement
                      | if-statement
                      | select-statement
                      | for-statement
                      | for-each-statement
                      | while-statement
                      | exit-statement
                      | continue-statement
                      | return-statement
                      | fail-statement
                      | defer-statement
                      | raise-statement
                      | wait-statement
                      | asm-block

asm-block           ::= "asm" newline
                        raw-assembly-line*
                        "end" newline

assignment-statement
                    ::= writable-path "=" expression
                        ("or" "fail")? newline on-error-clause?

expression-statement
                    ::= expression ("or" "fail")? newline on-error-clause?

on-error-clause     ::= "on" "error" value-name newline
                        block
                        "end" newline

fail-statement      ::= "fail" value-name newline

defer-statement     ::= "defer" deferred-statement
deferred-statement  ::= assignment-statement
                      | expression-statement

standard-procedure-statement
                    ::= "clear" "(" storage-path ")" newline
                      | "fill" "(" storage-path "," expression ")" newline
                      | "append" "(" storage-path "," expression ")" newline

if-statement        ::= "if" expression "then" newline block
                        ("else" "if" expression "then" newline block)*
                        ("else" newline block)?
                        "end" newline

select-statement    ::= "select" expression newline
                        case-clause+
                        ("else" newline block)?
                        "end" newline

case-clause         ::= "case" case-item
                        ("," case-item)* newline block
case-item           ::= const-expr
                      | const-expr ("to" | "until") const-expr

for-statement       ::= "for" value-name "=" expression
                        ("to" | "until") expression
                        ("step" const-expr)? newline
                        block
                        "end" newline

for-each-statement  ::= "for" "each" value-name "in" storage-path
                        newline block "end" newline

while-statement     ::= "while" expression newline block "end" newline

exit-statement      ::= "exit" newline
continue-statement  ::= "continue" newline
return-statement    ::= "return" (expression ("or" "fail")?)? newline

block               ::= statement*

type-expr           ::= arrayable-type dimensions?
aggregate-type      ::= type-name
                      | string-type
                      | arrayable-type dimensions
arrayable-type      ::= scalar-type
                      | string-type
                      | type-name
                      | address-type

dimensions          ::= "[" index-domain ("," index-domain)* "]"
index-domain        ::= const-expr
                      | ordinal-range
                      | type-name
ordinal-range       ::= const-expr ("to" | "until") const-expr
ordinal-type        ::= integer-type | type-name
scalar-type         ::= integer-type | "boolean"
integer-type        ::= "u8" | "i8" | "u16" | "i16"
                      | "u32" | "i32"
string-type         ::= "string" "[" const-expr "]"
address-type        ::= ("near" | "far") "address"

storage-base        ::= value-name
storage-path        ::= storage-base path-segment*
writable-path       ::= storage-path
path-segment        ::= "." value-name
                      | "[" expression ("," expression)* "]"

expression          ::= conditional-expression
conditional-expression
                    ::= "if" or-expression "then" expression
                        "else" expression
                      | or-expression
or-expression       ::= xor-expression ("or" xor-expression)*
xor-expression      ::= and-expression ("xor" and-expression)*
and-expression      ::= not-expression ("and" not-expression)*
not-expression      ::= "not" not-expression
                      | comparison-expression
comparison-expression
                    ::= shift-expression
                        (comparison-op shift-expression)?
comparison-op       ::= "=" | "<>" | "<" | "<=" | ">" | ">="
shift-expression    ::= additive-expression
                        (("shl" | "shr") additive-expression)*
additive-expression ::= multiplicative-expression
                        (("+" | "-") multiplicative-expression)*
multiplicative-expression
                    ::= unary-expression
                        (("*" | "/" | "mod") unary-expression)*
unary-expression    ::= ("+" | "-") unary-expression
                      | power-expression
power-expression    ::= postfix-expression ("^" unary-expression)?
postfix-expression  ::= primary-expression path-segment*

primary-expression  ::= integer-literal
                      | character-literal
                      | string-literal
                      | "true" | "false"
                      | value-name
                      | invocation
                      | conversion
                      | standard-value-operation
                      | layout-query
                      | "(" expression ")"

invocation          ::= value-name "(" arguments? ")"
arguments           ::= expression ("," expression)*
conversion          ::= integer-type "(" expression ")"
                      | type-name "(" expression ")"
standard-value-operation
                    ::= ("abs" | "sqrt" | "length") "(" expression ")"
layout-query        ::= "size" "(" layout-operand ")"
                      | "count" "(" layout-operand
                        ("," const-expr)? ")"
                      | ("lower" | "upper") "(" layout-operand
                        ("," const-expr)? ")"
                      | "offset" "(" type-name
                        ("." value-name)+ ")"
layout-operand      ::= "type" type-expr | layout-path
layout-path         ::= value-name layout-path-segment*
layout-path-segment ::= "." value-name
                      | "[" const-expr ("," const-expr)* "]"

const-expr          ::= expression
address-const-expr  ::= expression

value-name          ::= identifier
type-name           ::= identifier
identifier          ::= ascii-letter
                        (ascii-letter | decimal-digit | "_")*
integer-literal     ::= decimal-digit+
                      | "$" hexadecimal-digit+
                      | "%" binary-digit+
character-literal   ::= "'" character-content "'"
string-literal      ::= '"' string-character* '"'
newline             ::= logical-newline
```

`const-expr` and `address-const-expr` are syntactically expressions and are
restricted semantically by sections 4.5 and 3.1 respectively.
`character-content`, `string-character` and `logical-newline` obey section
2.4. Grammar positions for imports and external `from` bindings apply the
more restrictive compile-time text rules from that section.
The `import-decl* top-item*` shape makes an import after any declaration or
module `asm` block invalid under `E-MODULE-003`. Parser recovery may continue
after that diagnostic rather than treating the later import as an unrelated
parse error.
`value-name` and `type-name` share one lexical shape and resolve in their
respective namespaces, subject to the type/callable collision rule in section
2.1. In an array index domain, a lone identifier that resolves to an ordinal
type denotes that type's complete domain; otherwise it is checked as a count
expression. A name present in both scopes denotes the type in this position.
Parenthesizing the name makes it a count expression when the value declaration
is intended. Calls and checked conversions are likewise distinguished by the
resolved declaration. A no-result invocation has internal type `unit` and is
legal only as the complete expression of an expression statement. `clear`,
`fill` and `append` also have internal type `unit`, but their grammar admits
them only as complete standard-procedure statements.

The grammar leaves three failure forms to semantic resolution under section
11.8. An `or` whose left operand is a complete failable invocation is the
failure default; every other `or` is the Boolean operator, so the operator
grammar of section 8.4 is unchanged. An `on-error-clause` binds to the
statement it follows, and the binding rules — one failable invocation, no
`or` form on the bound statement, the non-completion rule for declaration
initializers — are checked semantically as `E-FAIL-004`. A
`deferred-statement` reuses the assignment and expression-statement
productions but admits neither `or` form nor an `on error` clause; that
restriction, with the other `defer` rules, is checked as `E-DEFER-001`.

When a statement begins with a writable path followed immediately by `=`, the
parser selects `assignment-statement`. Otherwise it selects an expression
statement, where `=` can occur only as equality inside the expression.
Parentheses make a discarded equality test explicit:

```lanternfly
(left = right)
```

The 0.7 revision adds these productions (section 17 defines the
semantics):

```text
task-decl           ::= "auto"? "task" type-name "(" params? ")"
                        fails-clause? newline
                        task-body
                        "end" newline
task-body           ::= local-decl* statement*
wait-statement      ::= "wait" "on" wait-trigger ("," wait-trigger)*
                        newline
wait-trigger        ::= trigger | "after" "(" expression ")"

pulse-decl          ::= "pulse" value-name newline
derive-decl         ::= "derive" value-name "as" type-expr
                        "from" expression newline

trigger             ::= value-name

raise-statement     ::= "raise" value-name newline
```

`auto task` takes no parameters. `wait-statement` and `raise-statement` are
ordinary statements, so each may appear wherever a statement may, nested
control structures included — a `wait` inside a loop is the usual shape of a
task. Each is then restricted semantically: a `wait-statement` outside a
task body is `E-TASK-002`, and a `raise-statement` outside a task body, a
prologue, an epilogue or a subroutine one of those calls is `E-STATE-002`.
An exported `auto task` exports the type and its instance together.

`conditional-expression` uses the same three words as the `if` statement in
the same order, so there is one conditional shape to learn. The two are distinguished by one token of
lookahead past `then`: a statement `if` has a newline there and a block
after it, an expression `if` has an expression. The grammar is unambiguous,
though not LL(1), so a single-pass parser reads the condition first and
settles the form when it reaches `then`. A conditional standing as another
conditional's condition needs parentheses. It binds loosest of all
operators and extends as far right as it can, which puts `c + 1` inside the
`else` of `if b then a else c + 1`; parentheses stop it.

## 16. Design queue

The following questions remain open or provisional. None blocks level 0 or
level 1.
Open items: pulses that carry a payload;
whether `raise` and `yield` share machinery; a loop form that carries its
own wait in its head or tail, once real programs show which shapes recur; the driven instance — an
instance the scheduler skips, advanced instead by another body, which
serves a test that steps a task between its waits, a controller sequencing
one task after another, and the value-producing generator as
one case rather than the defining one, needing an advance whose effect is
nothing when the instance's wait is unsatisfied and a diagnostic where no
call site advances it; a synchronous program's
access to the instant machinery, should one be wanted, through a service
that advances the scheduler from a designated subroutine. The prior queue:

- case-insensitive identifier resolution after parser experiments;
- whether real programs justify source-visible named placement classes beyond
  `at` and build-configured regions;
- source syntax for narrowing an external routine's effect contract;
- native callback declarations and their call-graph/reentrancy contract;
- read-only, output and in/out aggregate parameters and general bounded-view
  spelling; `writeText` already accepts differently sized strings
  through an ordinary generic parameter, so what remains open is only the
  output and in/out forms;
- whether translated programs justify `repeat`/`until` or named outer-loop
  exits;
- module aliases and re-exports;
- `float32` and `float48` capability modules: representation, rounding,
  conversion and comparison semantics, literal syntax, and the wide-scalar
  descriptor and helper-table contract shared with `standard/wide32.lafy`;
- string-literal initialization of `u8` arrays with explicit terminator
  escapes, giving alternative text representations such as zero-terminated
  byte strings library-level ergonomics without a second string type;
- error-set inclusion, so `or fail` can propagate a callee's error set into
  a caller's larger one, which needs a member-renumbering or shared-hosting
  rule before it is sound;
- `fails` contracts on external routines, binding the native carry-style
  failure conventions this platform's routines already use;
- `on error` forms beyond the single-statement binding, and `defer` inside
  nested control structure, both waiting on translated-program evidence.

Implementation evidence from representative Glimmer bodies, Tetro and Pacmo
routines, and AZM Book 3 algorithms will determine whether these points enter
a later edition. Until then, the 0.7 rules remain authoritative.

## 17. Tasks, state cells, pulses and derivations

This section is 0.7 core surface. It will be resequenced into the body of
the specification in the final 0.7 edit; until then, cross-references into
it use this number.

Everything that runs in a program is a task. Everything that is computed
from other values is a derivation. There is no third kind of body.

### 17.1 Task types and instances

`task Name(params)` declares a type whose body is a coroutine. The name is
PascalCase like every type. The compiler derives a record — a state
discriminant, the declared parameters as visible fields, and every local of
the body as a hidden field. A task's aggregate parameters are fields of the
instance, not aliases to caller storage, since a task has no caller; the
alias rule of section 11.3 does not reach them — and a step routine. All locals of a task body,
scalar and aggregate, are hoisted per-instance fields with first-advance
initialization; `static var` in a task body keeps its one meaning, a single
object shared across every instance.

An instance is a module variable of the type: `var cursor as Blink`, a pool
`var pool as Blink[4]`, or with arguments a record initializer naming
exactly the declared parameters. Visible fields are readable from outside
and hidden fields are not initializable. An owner writes an instance's
declared parameter fields before it first advances, which is what a
prologue does under section 12.6; every other field-level write to an
instance's record belongs to its own body. Whole-value re-imaging — `clear`
or template assignment — belongs to the owner and is the reset. Task-typed
record fields and locals are `E-TASK-001`.

`auto task Name()` declares the type and one instance in a single
declaration. The instance takes the type's name in the value namespace. An
`auto task` has no parameters; one that states them is `E-TASK-001`.

A task type may carry a `fails` clause under section 11.8. A task that
handles its own failure and returns is finished like any other; an
unhandled failure ends the program under section 12.6.

The scheduler advances every instance under section 12.6, at most once per
instant, and nothing else advances one. A task has no caller, produces no
result and offers no value channel. Its results reach other bodies through
the instance's readable fields and the state cells it writes.

A task's shape carries its own lifecycle, so the language needs no
operation to start, stop, restart or end one. A body with no loop runs once
and finishes. A counted loop runs a fixed number of times. `while true`
runs forever. `while` over a condition stops on that condition. Statements
before the loop are per-instance initialization; statements after it are
cleanup on the normal path.

### 17.2 Waiting

`wait on` suspends a task until a trigger occurs. A trigger is a state cell, a derived
cell or a pulse, or `after(n)` counting n increments of the instant counter
from wait entry, under the wrap-safe comparison and the 32,767 bound of section
12.6. A `wait-statement` outside a task body is `E-TASK-002`.

A trigger list is a disjunction: `wait on ready, timeout` resumes on
whichever occurs first. A pulse is readable as a Boolean during the instant
in which it is delivered, so a task tests which trigger resumed it without
further syntax.

Where the wait sits settles what happens at startup. Statements before the
first wait run in the first instant; a body whose wait comes first does
nothing until its trigger occurs. That replaces any qualifier on the
declaration.

### 17.3 State cells

A variable and a state cell differ in one respect. A write to a variable is
invisible: nothing else in the program learns of it. A write to a state
cell sets that cell's changed bit and schedules every task whose wait names
it. Storage that nothing reacts to remains a variable.

`state var` declares a watched cell: an ordinary variable plus a changed
bit in the delivery machinery. `state` qualifies `var` as `volatile` and
`static` do. There is no change detection by comparison anywhere;
notification is part of the compiled write, so the cell a write targets is
fixed at compile time. The bits themselves are raised once per body — at
each suspension point and at body exit — from a compile-time constant mask
of the cells that body wrote, not once per compiled write. The two are
observably identical, because a body runs to its next suspension without
interleaving, so nothing can read a bit in between. The difference is cost:
a loop writing every element of an aggregate cell would otherwise raise the
same bit once per element. A `state var` admits neither `at` nor
`volatile`, which is `E-STATE-001`; device state reaches these cells
through the volatile storage of section 4.4 and a task that copies it in.

A state cell may be an aggregate: one cell at the declared granularity, its
one bit raised by a write anywhere in it. A state cell is written only
through its declared path, and passing one as a writable aggregate argument
or binding an `alias` to it is `E-STATE-002`, because a write through an
alias is not statically tied to one cell. Reading is
unrestricted: a state cell may be passed to an unmarked aggregate
parameter under section 11.3.

A state cell is written in a prologue, an epilogue, a task body, or a
subroutine one of those calls, and nowhere else; a write elsewhere is
`E-STATE-002`. Writing is barred throughout the settle phase under section
17.5. Writes are inferred from bodies; there is no updates clause, and the
dependency report is generated from the code.

### 17.4 Pulses

`pulse` declares an occurrence rather than a value: it happens, it is
delivered once, and it is gone at the instant's end. `raise name` emits it.
Any module raises any pulse it can see. Raising is legal wherever writing a
state cell is legal, and `E-STATE-002` elsewhere. A pulse raised in a
prologue is delivered in the first instant.

A pulse appears in trigger position and, within the instant it is
delivered, as a Boolean. The language contains no input vocabulary; a pulse
that reports hardware is raised by a task written over a platform interface
module.

### 17.5 Derivations

A value computed from other values is a derivation:

```lanternfly
state var count as u8 = 0
derive barLength as u8 from count / 8
```

A derivation declares one cell and gives its formula. The cell has no other
writer. Its dependencies are the state cells and derived cells the
expression reads, so the compiler builds the dependency graph at cell
granularity, computes the settling order across the whole program, and
rejects a circular reference as `E-DERIVE-001`. The programmer never states
an order.

A derivation is an ordinary expression, including the conditional form of
section 8. It may call routines. A routine reachable from a derivation
writes no module storage — only its own locals and parameters — which is
`E-DERIVE-002`. It may read anything it can see and may perform device
operations; only writing is barred, because a write during settling lands
after cells that depend on it have settled. The check is one bit per
routine, propagated through the call graph from the routines derivations
call.

Every derivation is evaluated once before the first instant, so a derived
cell holds its settled value before any task runs.
