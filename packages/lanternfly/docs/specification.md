# Lanternfly working language specification

Edition: design draft 0.4
Implementation status: no compiler exists
Normative status: working contract for a prototype

The companion [conformance and diagnostics contract](conformance.md) collects
the mandatory errors, warnings, runtime faults, semantic vectors and program
fixtures for this edition.

This edition recasts the language as a streamlined structured BASIC. It keeps
the readable control forms and word operators associated with structured
Microsoft BASIC, but uses fixed-width types, exact layouts and one closing
`end`. It neither claims Visual Basic compatibility nor copies features that
do not suit fixed-memory targets.

Prototype and corpus work may still remove constructs from this draft.

**Must** states a semantic requirement. **Should** states a strong toolchain
recommendation. **Provisional** marks a rule that still requires implementation
or corpus evidence. **Deferred** marks a facility outside the first
implementation.

## 1. Language scope

Lanternfly is a statically typed structured BASIC for fixed-memory systems. It
can replace ordinary AZM program logic in standalone programs as well as
Glimmer bodies.

The first useful implementation should support:

- fixed-width signed and unsigned integers;
- Boolean values and binary masks;
- byte-valued character literals and static NUL-terminated text;
- constants and statically allocated variables;
- exact records and fixed arrays;
- field access, runtime indexing and temporary storage aliases;
- assignment and general expressions;
- `if`, `select`, counted, collection and conditional loops;
- routines with optional parameters, local scalar storage and optional
  results;
- source modules with private declarations and explicit exports;
- target-independent lowering through AZM, another assembler, C or a selected
  BASIC dialect.

Lanternfly is independent of Glimmer. State, pulses, effects, rendering, cards
and scheduling remain host concerns. Glimmer may provide imported storage and
routines to a Lanternfly body.

The BASIC lineage is syntactic and educational rather than compatible. Source
uses short English words, `name as Type` declarations, assignment with `=`,
word operators, `if ... then`, `select`, `for` and `while`. Lanternfly leaves
behind line numbers, implicit declarations, variant values, `goto`, optional
parentheses and dialect-specific UI facilities. Arithmetic and comparison keep
their familiar symbols; block punctuation, semicolon terminators and curly
braces do not enter the language.

The first edition uses fixed storage and whole-program compilation. Programs
identify persistent objects by their declared paths or by integer indices into
fixed pools. Aggregate parameters and local aliases may name existing storage
for the duration of a call. A bare alias denotes that storage for field access,
indexing and aggregate copying. Its backend carrier is not a value and has no
source syntax.

Lanternfly has no source-level pointer or reference type, address-of operator,
dereference operator, function value or closure. Backends remain free to
implement an aggregate parameter or alias with a machine address. That
representation is lowering machinery and does not enter the language's value
model.

Heap allocation, garbage collection, exceptions, dynamic collections and
indirect calls are outside the first edition. Fixed multidimensional arrays
and indexed pools cover the initial programs that assembly would otherwise
express through pointer tables.

## 2. Source style and names

### 2.1 Case

Keywords and built-in type names have canonical lowercase spellings. Ordinary
program names use lower camel case. User-defined type names use Pascal case.

```lanternfly
const actorCount as u8 = 8
var playerScore as u16 = 0

record Actor
    var currentFrame as u8
    var active as boolean
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
- user-defined records and future named types begin uppercase;
- tools display an identifier using the spelling at its declaration;
- declarations that differ only in case conflict within the same namespace.

Capitalization is a reading convention rather than a semantic distinction.
Types and values occupy separate name-resolution contexts, so this is valid in
a case-insensitive language:

```lanternfly
var actor as Actor
```

One cross-namespace collision is forbidden: a record type and a callable
routine, including an external routine, may not share the same
case-insensitive name. This keeps `Point(...)` unambiguously a record
initializer or a call. A storage name may still match its type, as `actor` and
`Actor` do above.

Each module has one type scope and one value scope. Record declarations enter
the type scope. Constants, variables and routines enter the value scope, so a
storage declaration and a callable routine cannot share a name. Imports add
their exported declarations to those module scopes. All module declaration
names are collected before declaration bodies and routine bodies are checked.
A type annotation may therefore name a later record type, and a routine body
may use any successfully checked module declaration. Constant names embedded
in array extents or other declaration expressions still follow the
source-order rule below.

Constant initializers and placement expressions are evaluated in source order.
Successfully resolved imported exports precede every declaration in the
importing module for this purpose, regardless of where the `import` item is
written. Among declarations written in the importing module, an initializer
may use only earlier constants, and a layout path may begin only with earlier
storage. This source-order restriction applies even though the later name is
already known to the module scope.

Constant expressions written inside a routine body, including `case` values
and counted-loop steps, may use any successfully initialized module constant
because routine bodies are checked after module declarations. The compiler
builds one dependency graph spanning constant values, array extents, record
layouts, placement expressions and layout queries. That graph must be
acyclic. A cycle such as a constant taking `size(type Packet)` while
`Packet` uses that constant as an array extent is rejected with the complete
dependency path.

A routine has one value scope containing its parameters and locals. Parameter
names are distinct, and a parameter or local may not shadow any visible module
or imported value. A local may not reuse a parameter or earlier local name.
Its declaration-order visibility remains defined in section 4.2. A `for each`
binding adds one nested value name for its body. It may not shadow a visible
module value, parameter, local or enclosing `for each` binding. Nested
traversals therefore use distinct binding names. The same rules apply when the
enclosing value scope belongs to a hosted body. Record fields occupy a separate
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

Every structured block currently closes with the single keyword `end`:

```lanternfly
if active then
    updateActor()
end
```

The parser closes the innermost open block. The formatter emits canonical
indentation, while the parser treats indentation as whitespace.

Bare `end` is provisional. Parser and corpus tests will determine whether long
nested routines need named endings such as `end if` or `end sub`.

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

A double-quoted literal in an expression is a static C string. Direct
characters range from ASCII space through `~`; the character escapes above are
accepted except `\0` and `\x00`. A hexadecimal escape contributes its exact
byte without declaring a character encoding. The compiler appends one zero
byte. An embedded zero, a physical newline, a non-ASCII character or more than
65,534 payload bytes is invalid. Section 3.2 defines the resulting `cstr`
value.

Import paths and external substrate-symbol names use the same double-quoted
token in compile-time text positions. Within those positions, only `\"` and
`\\` are accepted. The compiler decodes both escapes before resolving the path
or looking up the external symbol. A compile-time text position does not
allocate a runtime C string.

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

## 3. Built-in scalar types

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

`true` and `false` are lowercase Boolean literals. They are reserved literals,
not user-defined constants.

`boolean` occupies exactly one byte. Its only valid stored representations are
zero for `false` and one for `true`. Comparisons and Boolean operators always
produce those canonical values, and zero-initialized Boolean storage begins as
`false`. Imported routines and storage contracts must also supply zero or one;
observing any other representation through such a contract invokes the
target's invalid-value fault. `boolean` is not an integer type and has no
implicit integer conversion.

Opaque address values use explicit near and far types:

```lanternfly
var screenBuffer as near address
var bankedImage as far address
```

Their physical representations remain target-defined.

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
Without an expected-type context, literal integer operations default to `i16`;
a value that does not fit requires an explicit conversion.

An `at` placement or absolute external binding requires a target-address
constant expression rather than an ordinary integer expression. It may contain
integer literals, parentheses, previously declared integer constants, explicit
integer conversions and layout queries. Its operators are limited to unary
`+` and `-`, plus `+`, `-`, `*`, `/`, `mod`, `^`, `shl`, `shr`, `and`, `or`
and `xor`. It may not contain comparisons, Boolean values or operations, or
opaque address values.

Integer literals and the results of `size`, `count` and `offset` are exact,
untyped values in this context. A subtree made entirely from those values
remains exact through unary `+`, unary `-`, `+`, `-`, `*`, `/`, `mod`, `^`
and `shl`. The compiler evaluates that subtree mathematically rather than
applying a fixed-width result table; exact `shl` multiplies by a power of two.
Division by zero, a negative power or a negative shift is a compile error.
`shr`, `and`, `or` and `xor` require at least one typed operand because their
meaning depends on a finite width.

A typed constant or explicit integer conversion ends exact evaluation in its
containing operation. The ordinary operand, result-width and folding rules
then apply, with exact operands adopting the written integer type when they
fit. The selected profile validates the final exact or typed value against its
address space and representation. Thus `at $8000 + size(type Header)` remains
exact, while `at u16($8000) + size(type Header)` performs ordinary `u16`
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

### 3.2 Static C strings

`cstr` is a non-null, read-only view of a NUL-terminated byte sequence:

```lanternfly
const title as near cstr = "LANTERNFLY"
var prompt as near cstr = "READY?"

extern sub printText(text as near cstr)
```

The bytes before the terminator are the string's content. Direct source
characters use their ASCII byte values, and escapes use the values listed in
section 2.4. The empty literal `""` contains only its terminator.

`near cstr` and `far cstr` state the address class. Unqualified `cstr` uses the
target profile's default class and is permitted for private parameters and
local variables. Exported declarations, stored module variables, constants,
record fields and routine results must state `near` or `far`. A string literal
adopts an expected address class; otherwise the profile places it in its
default class.

The runtime representation is the target's text-view carrier. It has no hidden
length, capacity, ownership flag or allocation. Assigning a `cstr` copies that
carrier; it does not copy bytes. The text is immutable through the `cstr`
interface. Literal storage has static lifetime and may be pooled only when
pooling cannot change observable address-class behaviour.

A near C string widens to `far cstr` when the target can attach the current
mapping context. The explicit conversions admitted by the grammar are:

- `near cstr(expression)` leaves a near operand unchanged and performs a
  checked far-to-near conversion on a far operand;
- `far cstr(expression)` leaves a far operand unchanged and performs the
  permitted near-to-far widening on a near operand;
- `cstr(expression)` converts to the profile's default C-string class,
  applying the corresponding identity, widening or checked narrowing rule.

A required near-to-far widening is a compile error when the profile cannot
attach a valid mapping context. No form changes the bytes or their lifetime. C
strings have no conversion to or from integers or opaque addresses.

Every first-edition `cstr` names bytes that remain accessible and immutable
for the program's lifetime. Literals satisfy that rule directly. Imported and
hosted storage, manifest values and native routine results declared as `cstr`
must make the same guarantee. A parameter or local copy retains the guarantee
of its source. Contracts for temporary native buffers are incompatible with
`cstr`; a later bounded-view design may introduce shorter, checked lifetimes.

All six comparison operators accept two compatible C strings. They compare
payload bytes as unsigned values from left to right and stop at the first
difference or NUL terminator. Equality therefore compares text content rather
than storage identity. A near and far operand first require the ordinary
permitted near-to-far conversion.

`length(text)` scans to the terminator and returns the number of payload bytes
as `u16`. A literal call is a constant expression and folds to its known
length. Each imported, hosted or native `cstr` contract guarantees an
accessible NUL terminator within 65,535 bytes of its start and guarantees that
the sequence remains valid for the program's lifetime. A provider that breaks
that contract is nonconforming.

Writable text uses ordinary `u8` array storage together with an explicit
capacity. The first edition does not silently convert such an array into
`cstr`, because writing a terminator and proving its lifetime are separate
operations. Bounded views and writable string procedures are specified as
follow-up work in the
[language completeness review](language-completeness-review.md).

## 4. Constants and variables

### 4.1 Constants

`const` declares a compile-time value:

```lanternfly
const screenWidth as u8 = 32
const maximumLives as u8 = 5
const visibleMask as u8 = %00000001
const debuggingEnabled as boolean = false
```

The first implementation requires an explicit type. Type inference is
deferred, so omitting `as Type` is a compile error.

A scalar constant normally occupies no storage. Explicit placement or target
export requirements may force a stored representation. A `cstr` constant may
bind only to compiler-owned literal storage or a conforming imported constant
C string.

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
First-edition aggregate parameters are writable aliases, so constant aggregate
storage cannot be passed to them. A later read-only parameter form may remove
that restriction. A target may place constant aggregate data in ROM.

### 4.2 Variables

`var` declares storage:

```lanternfly
var score as u16 = 0
var lives as u8 = 3
var gameOver as boolean = false
```

`as` introduces the type.

Module-level variables own static storage. Compiler-allocated static storage
without an explicit initializer begins with all bits zero when every scalar
leaf accepts that representation. Integers and Booleans do; `cstr` does not,
and a target profile decides whether zero is valid for each opaque address
type. A declaration whose type lacks an all-zero value requires an
initializer. Placed or host- or native-supplied storage without an initializer
retains the value supplied by the target environment; the compiler performs no
startup write. Importing a source module does not change a declaration's
storage class: an unplaced variable in that module remains compiler-allocated
and uses the ordinary zero-initialization rule, while an uninitialized placed
variable retains its target-supplied value under section 4.3. A module variable
whose type contains `cstr` requires an initializer that supplies every such
field, or a host/native storage contract that guarantees valid C strings.

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
leaves do not accept zero requires an initializer. A `cstr` variable therefore
always requires an initializer.

`const` declarations are module-level in the first edition. A routine can use
a module constant without allocating storage.

### 4.3 Placement

`at` gives module-level static storage or constant data a target address:

```lanternfly
var workspace as u8[256] at $8000
const glyph as u8[2] = [$00, $7e] at $4000
```

The address is a target-address constant expression under section 3.1. The
target profile validates its range, address space, alignment requirements and
overlap with other placed objects. A placed declaration has the same type and
access rules as ordinary storage.

A placed variable with an initializer is installed before program entry. The
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
the startup-effect artifact records them in the same order.

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
address. Portable modules should normally leave placement to an entry program
or target configuration. A local declaration cannot use `at`.

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

The first implementation permits `volatile` only on module-level storage and
imported or native storage contracts; volatile local variables are rejected.
It also rejects a local aggregate alias to volatile storage and rejects passing
volatile storage as an aggregate argument. Volatile accesses remain available
through the original declared storage path. A later parameter-effect contract
may permit volatile aggregate calls without weakening access ordering.

### 4.5 Initializers and constant expressions

A constant or module-variable initializer has one of three forms:

```lanternfly
const lives as u8 = 3
const origin as Point = Point(x = 0, y = 0)
const row as u8[4] = [1, 2, 3, 4]
```

A scalar initializer is an expression. An array initializer contains exactly
one initializer for each element at its current dimension; nested brackets
must match the declared rank and shape exactly. A record initializer names
every field exactly once. Unknown, duplicate or omitted fields are compile
errors. Record fields may be written in any order, although storage layout
continues to follow declaration order.

The leading name resolves in the type namespace. Section 2.1 forbids a
case-insensitive collision between that record type and a callable routine, so
the same token sequence cannot also resolve as an invocation.

Initializer expressions are evaluated in source order. For a record literal,
that is the written field order; for an array literal, it is left to right at
each dimension. Each value must be assignable to its destination type.

Every array dimension, case value, case-range endpoint and counted-loop step
is a scalar constant expression. A placement uses the target-address constant
expression defined in section 3.1. A `const` or module-level `var` instead
uses a constant initializer: either one scalar constant expression or an
array/record initializer whose nested values are themselves constant
initializers. This distinction keeps aggregate values out of scalar contexts.
A local `var` initializer is an ordinary runtime expression.

A constant expression in a module declaration may contain literals, names of
previously declared constants, parentheses, the integer and Boolean operators
in this specification, comparisons, explicit scalar conversions, the pure
standard operations `abs`, `sqrt` and `length`, the layout queries `size`,
`count` and `offset`. `length` is constant only when the operand resolves to
literal storage whose payload is known to the compiler. A constant expression
may not read variable storage, invoke a routine, use a volatile object or
perform any other observable operation.

A C-string conversion whose destination class is near is valid in a constant
expression only when the target profile proves that the complete logical
address is representable as near. This includes unqualified `cstr(expression)`
when the profile default is near. Failure is a compile error; constant
evaluation cannot defer an address fault to runtime. The same conversion
applied to a nonconstant runtime value invokes the address-fault service when
the address is not representable.

For a constant expression inside a routine body, “previously declared” means
any module constant whose initializer has already been checked successfully,
as defined in section 2.1. Constant and layout dependencies are checked as one
acyclic graph; source order controls name eligibility but does not excuse a
cycle. In a hosted body, typed host-manifest constants also satisfy these
constant-expression contexts.

Outside the target-address constant expressions defined in section 3.1, the
compiler resolves every operator's operand and result types before folding it.
Each folded operation applies the same wrapping, shift, conversion and fault
rules as runtime evaluation. Only an untyped literal or layout-query result
remains exact until context or the `i16` default gives it a type. Consequently,
if `maximum as u16` is 65535, `(maximum + 1) / 2` is zero, not 32768. Division
by zero, an invalid shift, a negative power or a negative `sqrt` operand is a
compile error in a constant expression.

## 5. Records

`record` declares a Pascal-cased nominal type:

```lanternfly
record Point
    var x as i16
    var y as i16
end

record Actor
    var position as Point
    var velocity as Point
    var image as u8
    var active as boolean
end
```

A record declaration defines layout. A `var` declaration allocates instance
storage:

```lanternfly
var player as Actor
```

Record layout is exact:

- fields appear in declaration order;
- no padding is inserted implicitly;
- nested records are stored inline;
- every offset and total size is known during compilation;
- the graph of records and arrays contained by value must be acyclic, so direct
  and mutual recursive containment are both rejected;
- exporting a record exports its complete field layout.

## 6. Fixed arrays

Dimensions follow the element type:

```lanternfly
const actorCount as u8 = 8
const boardRows as u8 = 12
const boardColumns as u8 = 20

var actors as Actor[actorCount]
var board as u8[boardRows, boardColumns]
```

An array:

- has fixed positive compile-time dimensions;
- uses zero-based indices;
- stores elements contiguously;
- is stored inline;
- may contain scalars or records;
- may appear as a record field.

Dimensions state element counts. `u8[8]` therefore has indices from `0` through
`7`.

Array initializers use square brackets:

```lanternfly
var movementCost as u8[4] = [1, 1, 2, 255]

var smallMap as u8[2, 4] = [
    [0, 0, 1, 1],
    [2, 2, 3, 3]
]
```

Multidimensional arrays use row-major layout. The rightmost dimension is
contiguous:

```lanternfly
board[row, column]
```

For `u8[12, 20]`, the element number is `row * 20 + column`. A non-power-of-two
element size uses its true size in the address calculation.

One bracket operation supplies exactly one index for every dimension of the
array it selects. `board[row, column]` is valid for a rank-two array;
`board[row]`, `board[row, column, extra]` and `board[row][column]` are not.
Indexing selects an element, never a partial row or subarray. A later bracket
may follow only after another path segment reaches a different array.

Constant out-of-range indices are compile errors. Every dynamic index is
checked unless the compiler proves it is in range. An out-of-range access
invokes the target bounds-fault service before any load or store occurs. A
target-specific unchecked mode may exist as an explicitly unsafe extension,
but code compiled in that mode is not a conforming execution of this
specification.

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

Paths and integer indices are Lanternfly's normal way to retain identity. A
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
matches the declared record or fixed-array type. Its base and indices are
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
first edition permits `alias` declarations only for records and fixed arrays;
scalar code uses ordinary values and direct indexed assignment.

Constant storage cannot initialize a writable alias. Volatile storage also
requires direct access until the language has a parameter contract that can
preserve volatile ordering. Alias targets have static or caller-provided
lifetime, so heap lifetime and nullability do not arise.

Every static storage root has a target storage class. Ordinary
compiler-allocated storage uses the profile default; placed, banked, hosted
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
near parameter. Exported aggregate parameters must state their class; private
unqualified parameters use the profile default. Local aliases inherit the
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
by default. A project may promote that warning to an error.

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
conversion rules, including the round-trip exemption. Aggregate assignment
instead requires an identical record type or identical array element type,
rank and dimensions. C-string assignment requires compatible address classes
under section 3.2. Assignment to a bare aggregate alias copies into its
referent; it never rebinds the hidden carrier.

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
Booleans support only `=` and `<>`. Opaque addresses of the same address class
support `=` and `<>`; mixed near/far address comparison is invalid and has no
implicit conversion. Compatible C strings support all six operators with the
content comparison in section 3.2. Record and array equality, including
equality through an aggregate alias, is deferred; their fields or elements
must be compared explicitly.

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

`and` and `or` short-circuit for Boolean operands. Integer operations evaluate
both operands and combine their bits. `xor` evaluates both operands.

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
11. `or`.

Power associates right to left; every other binary operator associates left to
right. Thus `-2 ^ 2` means `-(2 ^ 2)`, while `2 ^ 3 ^ 2` means
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
const actorBytes as u16 = size(type Actor)
const actorCount as u8 = count(actors)
const rowCount as u8 = count(board, 0)
const xOffset as u8 = offset(Actor.position.x)
```

`abs(value)` accepts an integer. An unsigned operand is unchanged; a signed
operand produces the unsigned type of the same width, so
`abs(i16(-32768))` is `u16(32768)`.

`sqrt(value)` accepts an integer, calculates the floor of its non-negative
square root and produces the unsigned type of the operand's width. A negative
constant is a compile error; a negative runtime value invokes the arithmetic
fault service.

`length(text)` accepts `cstr` and returns the payload byte count as `u16`.
Section 3.2 defines its scan, folding and boundary contract.

`size(type Type)` returns the exact byte size of a type. `size(path)` returns
the size of a statically typed storage path. `count(type ArrayType)` returns
the extent of a fixed-array type, while `count(path)` takes an array storage
path. A multidimensional array requires a zero-based dimension argument, as in
`count(board, 0)`. An invalid or nonconstant dimension is a compile error.
The contextual word `type` selects the type namespace and removes any
ambiguity when a value and a type share a case-insensitive name.

A layout-query path is an unevaluated designator. It begins with a storage name
or local aggregate alias and may contain fields plus constant indices.
`size(selected)` therefore returns the size of the aggregate named by the
alias, while `count(board, 0)` returns the first extent of the declared array.
The compiler constant-folds each index and validates it statically against the
selected array dimension; invalid constant arithmetic or an out-of-range index
is a compile error. This does not read the base, perform runtime index
evaluation, run a runtime bounds check or invoke a routine. Calls and
nonconstant indices are invalid in this position.

`offset(Record.fieldPath)` returns the exact byte offset of a field path from
the beginning of its record type. The path contains field names only, not
runtime indices, and every field before the final field must be a by-value
record field.

The three layout queries are compile-time operations. They return exact,
untyped integer constants that adopt a surrounding integer type by the literal
rules in section 3.1. `abs` and `sqrt` are pure value operations, but their
argument is evaluated normally. They constant-fold under section 4.5; `sqrt`
may lower to a target helper when evaluated at runtime.

Two standard procedures cover repeated aggregate stores:

```lanternfly
clear(board)
fill(framebuffer, backgroundColour)
```

`clear` and `fill` have the internal result type `unit` and are valid only as
complete procedure statements. They cannot appear in arithmetic, an argument,
an initializer, a return expression or any other value context.

`clear(target)` writes the all-zero representation to a writable record or
fixed array. It is valid only when every scalar leaf accepts that
representation. Integers and Booleans do; `cstr` does not. A target profile
decides whether all-zero is valid for one of its opaque address types. It
visits record fields recursively in declaration order and array elements
recursively in row-major order.

`fill(target, value)` requires a writable fixed array whose leaf element type
is scalar. The value receives that leaf type as its expected destination type
and is evaluated and converted once under section 8.1 before any element is
stored. An exact literal may therefore adopt the leaf type. A narrowing or
signedness-changing conversion produces at most one `W-CONVERT-001` for the
procedure statement, not one warning per element. Every element of a
multidimensional array receives the converted value in row-major order. Arrays
whose leaf element is a record are rejected; an ordinary aggregate assignment
can copy a prepared record value when that operation is needed.

Both procedures evaluate the destination path once and then evaluate the value,
when present, once before storing. Their writes are observable. A volatile
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

The destination-first assignment rule means that in
`actors[nextIndex()].x = nextValue()`, `nextIndex()` runs before `nextValue()`.
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

One-line conditionals are deferred.

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

The selected expression is evaluated once and must have an integer type.
Cases contain integer compile-time constants, never fall through and require
no `break`. Boolean and opaque-address selection is deferred.

Several values may share a case:

```lanternfly
case grass, sand
    movementCost = 1
```

Inclusive constant ranges are provisional:

```lanternfly
case 0 to 9
    band = cold
```

Every single case value and range endpoint is constant-folded under its own
ordinary expression type. An all-literal expression therefore uses the `i16`
default; the selected type does not propagate into its operators. Only a
single exact integer literal may adopt the selected type directly. The folded
mathematical value must be representable in the selected expression's type, to
which it is then normalized without a conversion warning. A value that is not
representable is type-incompatible.

Ranges and overlap checks operate on these normalized selected-type values.
The lower endpoint must be less than or equal to the upper endpoint. A
reversed, overlapping or duplicate range is a compile error.

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

for index = 0 until count(actors)
    actors[index].active = false
end
```

For a positive step, `until` visits values strictly below the boundary. This
half-open form is canonical for zero-based array traversal because an array
count can appear directly without subtracting one.

Both forms accept a compile-time `step`:

```lanternfly
for row = 7 to 0 step -1
    clearRow(row)
end
```

The control name must denote a writable, non-volatile integer variable or
scalar parameter. A constant, Boolean, opaque address, alias, aggregate or
volatile integer is invalid. Rejecting volatile control storage avoids
inventing implicit device reads and writes for the loop machinery. The loop
introduces no control declaration. When `step` is omitted, it is the
mathematical integer `+1`. The compiler folds the written step independently
under the ordinary expression rules and rejects zero. A negative step remains
valid with an unsigned control variable because the step is not converted to
that variable's type.

The start and boundary each evaluate once, in that order, before the converted
start is stored in the control variable. The boundary therefore observes the
control variable's old value. The start uses the destination-conversion rules
from section 8.1. The boundary is an independently typed integer expression
and must be comparable with the control value. An exact literal or layout
query remains mathematical at this boundary, allowing this complete traversal:

```lanternfly
var bytes as u8[256]
var index as u8

for index = 0 until count(bytes)
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

After the body, the implementation computes the next value mathematically and
tests it before storing it. A value that fails the next test ends the loop
without being stored. A value that would continue must fit the control
variable; a statically known failure is a compile error and a dynamic failure
invokes the arithmetic-fault service. This order prevents unsigned wraparound.

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
array extents are positive, so the collection itself is never empty.

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
program and never leaves a routine; `return` leaves a routine or hosted body.

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
        return left - right
    end

    return right - left
end
```

An omitted result type means that the routine returns no usable value. A
trailing `as Type` declares a result. The language does not initially expose a
`void` type. Internally, such an invocation has type `unit`; `unit` cannot be
written in source or used as a value. A declared result must be an integer,
Boolean, address or `cstr` scalar. Returning a record or fixed array by value
is deferred.

Parentheses are present for every declaration and invocation, including an
empty parameter list, so a routine invocation is syntactically distinct from a
name.

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
sub moveActor(actor as Actor, deltaX as i16, deltaY as i16)
    actor.position.x = actor.position.x + deltaX
    actor.position.y = actor.position.y + deltaY
end
```

Scalar parameters, including `cstr`, pass values. Record and array parameters
create non-rebindable aliases to caller storage. Mutating `actor` in the
example mutates the caller's record. The source type remains `Actor`; no
pointer or reference type appears at either side of the call.

An unqualified aggregate parameter in a private routine uses the profile's
default storage class. An exported routine, or a private routine that accepts
non-default storage, puts `near` or `far` before the parameter name:

```lanternfly
export sub moveActor(near actor as Actor, deltaX as i16)
    actor.position.x = actor.position.x + deltaX
end
```

The position keeps aggregate storage class separate from the type of its
elements. In `far labels as near cstr[8]`, the array is in far storage and each
element is a `near cstr`. The two classes are checked independently. A leading
storage class is valid only when the parameter type is a record or fixed
array.

An aggregate argument must be a compatible storage path or local alias, not a
temporary initializer or other general expression. First-edition aggregate
parameters are writable, so constant and volatile storage are not valid
arguments. Source code has no expression for the parameter's hidden carrier,
so rebinding, returning, storing, comparing or converting that carrier has no
syntax. The parameter name denotes caller storage: ordinary field access,
indexing, aggregate copying and nested aggregate calls remain valid. Passing
it to another compatible aggregate parameter extends the temporary alias only
for that nested call.

Parameter-free routines form the first implementation stage. Later stages add
parameters, locals and the calling convention without changing the source
language edition.

### 11.4 Local variables and aggregate aliases

Scalar locals use `var`:

```lanternfly
sub updateActor(actor as Actor)
    var nextX as i16 = actor.position.x + actor.velocity.x
    var nextY as i16 = actor.position.y + actor.velocity.y

    actor.position.x = nextX
    actor.position.y = nextY
end
```

Local aggregate storage follows these rules:

- scalar locals may own automatic storage;
- record and array locals do not allocate aggregate stack objects;
- a local aggregate name aliases storage allocated elsewhere.

A local `var` declaration with a record or array type is therefore a compile
error. The parser accepts the common `var name as Type` shape before semantic
checking distinguishes an owned scalar from an aggregate.

`alias` declares that non-owning local name:

```lanternfly
alias actor as Actor = actors[selectedActor]
```

The declaration evaluates and checks `actors[selectedActor]` once. It
allocates no record storage and cannot be rebound. Direct indexing remains
preferable when the path is used only once; an alias earns its name when a
routine repeatedly accesses the same aggregate or needs to pass it to another
aggregate parameter.

### 11.5 Return

A result-free routine may return early with bare `return`:

```lanternfly
sub updateActor(actor as Actor)
    if not actor.active then
        return
    end

    actor.position.x = actor.position.x + 1
end
```

Reaching `end` also returns from a result-free routine.

A result-bearing routine uses `return expression`. Every reachable path must
return a compatible value:

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
epilogue when used without a value in a hosted body under section 13.3.

### 11.6 Calling convention

Source semantics give each invocation fresh scalar parameters and locals. A
backend may place them in registers, stack slots or both. It may use static
temporaries when whole-program analysis proves that overlapping invocations
cannot occur.

Recursion is a target-profile capability. A profile without it rejects every
direct or mutually recursive call cycle with the cycle path in the diagnostic.
A recursion-capable profile provides independent frames, declares its stack
and reentrancy rules, and reports per-routine frame size plus any configured
maximum stack bound. Static temporaries are invalid where recursion,
reentrancy, interrupts or another overlapping invocation can reach them.

Indirect calls are not in the first edition, so the initial cycle analysis uses
the complete direct call graph. Native-to-Lanternfly callbacks are also
deferred: an external or host routine contract may call native services but
may not re-enter a source-defined Lanternfly routine or hosted body. A binding
that requires such a callback is incompatible. The target-specific convention
does not change Lanternfly source semantics.

Routine names are not values. Source code cannot take a routine's address,
store it in an array, return it or invoke it indirectly. `select` supplies
runtime dispatch; a backend may lower a dense selection to a jump table
without exposing code addresses to the program.

## 12. Modules

### 12.1 Source imports

`import` loads another source unit:

```lanternfly
import "actors.lf"
```

An import:

- resolves relative to the importing file and configured search paths;
- loads a resolved source unit once per compilation;
- retains that unit's private declarations;
- exposes only explicit exports;
- contributes code and data to the same whole program;
- may be written repeatedly without duplicating the module.

Lanternfly has no general textual `include` in the initial language. The
compiler reads exported declarations directly, so it does not need C-style
header substitution or include guards.

### 12.2 Exports

Top-level declarations are private by default. `export` makes a declaration
visible to importing modules:

```lanternfly
export const actorCount as u8 = 8

export record Actor
    var x as i16
    var y as i16
    var active as boolean
end

export var actors as Actor[actorCount]

export sub updateActors()
end
```

An exported declaration cannot expose an unexported user-defined type. The
check applies recursively to exported constant and variable types, routine
parameter and result types, and every field type reachable through an exported
record. Array layers do not hide their element type from this check.

### 12.3 Visibility and collisions

Exports initially enter the importing module without qualification, following
AZM's source-module model:

```lanternfly
import "actors.lf"

updateActors()
actors[0].active = true
```

Two visible declarations with the same case-insensitive name in the same
namespace cause a compile error. A value may share a name with a type under the
rule in section 2.1, while the cross-namespace record/callable collision remains
forbidden. Module aliases are a possible extension:

```lanternfly
import "actors.lf" as actorsModule
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
have been decoded. An external declaration without either clause asks the
target profile to bind the Lanternfly name.

The declaration provides the parameter and result types seen by Lanternfly.
The selected target profile supplies or verifies the remaining native
contract. It includes the shared value and effect obligations in section 13.2
and:

- substrate symbol or address;
- parameter and result carriers;
- calling convention and normal-return behaviour;
- registers, flags, stack and mapping state preserved or clobbered;
- visible storage reads and writes, calls, faults and device I/O;
- reentrancy, interrupt and cost properties.

A missing binding or incompatible ABI is a compile error. An incomplete effect
contract produces the conservative native-boundary warning and prevents
optimizations across the call. The backend may generate an adapter when the
declared Lanternfly signature and native ABI can be reconciled without changing
source meaning.

For a `cstr` parameter or result, the native contract also guarantees the
terminator, accessible byte range, immutability and program lifetime required
by section 3.2. AZM `.cstr` data satisfies the representation rule directly.

External declarations are module declarations. They may be private or
exported, and a platform interface module can collect and export them for
ordinary `import`. Repeated imports still emit one binding. The selected
assembler or substrate toolchain resolves named symbols during the
whole-program build.

An `extern sub` has no Lanternfly body and cannot be selected as the program
entry. Target profiles may reject absolute `at` bindings or named `from`
bindings that their substrate cannot express.

### 12.5 Whole-program compilation

The compiler performs address allocation and symbol resolution in one
whole-program build:

1. loads the root module;
2. resolves the import graph;
3. collects private and exported declarations;
4. type-checks the complete program;
5. allocates static storage;
6. resolves external bindings and ABI adapters;
7. lowers required routines, data and helpers;
8. produces one target program and its debug artifacts.

The source file extension remains open. `.lf` is illustrative only.

### 12.6 Compilation units and program entry

An ordinary Lanternfly source file is a module containing imports and
declarations. It does not contain loose executable statements. A build
manifest names the root module and, for an executable build, one entry
subroutine. The entry must have no parameters and no result:

```lanternfly
sub main()
    initialiseGame()
    gameLoop()
end
```

The entry may remain private to the root module and must name a source-defined
subroutine rather than an external declaration. A library build has no entry.
All module storage has been allocated and all constant static initializers have
been installed before an executable entry begins. Returning from the entry
invokes the target profile's normal program-termination service.

A hosted body is a distinct compilation-unit form supplied through a host
manifest. Its source consists of local declarations followed by statements; it
cannot contain imports, exports, module storage, records or subroutine
declarations. The host manifest supplies all non-local names and the body
epilogue. This separation prevents a loose statement sequence from being
mistaken for an ordinary module.

The host manifest defines one type scope and one value scope under the module
namespace and record/callable collision rules from section 2.1. Duplicate
host names and same-namespace case-only collisions are errors. Record fields
remain scoped to their record. A hosted body has one local value scope whose
declarations follow the routine local declaration-order rules from section
4.2. A hosted local may not shadow a host-manifest value, and it may not reuse
an earlier hosted local name.

Host-manifest constants have declared Lanternfly scalar types and compile-time
values. They are available wherever a hosted body requires a constant
expression, including `case` values, range endpoints and counted-loop steps.
Manifest records obey the ordinary nominal typing and exact layout rules in
section 5.

`resource` is not a Lanternfly declaration category. A host resource must be
mapped into the body through an existing typed category: a constant, opaque
address, storage object or routine. The corresponding constant, representation,
lifetime and effect rules apply to that category. A host may retain richer
resource metadata outside the Lanternfly namespace.

Each host entry executes the body as a fresh invocation. Its scalar locals are
created and initialized on every entry under section 4.2; no local value
persists from an earlier entry. A backend may lower them to static scratch only
when the host contract guarantees that body executions cannot overlap,
re-enter or be interrupted by another execution that uses the same scratch.
Otherwise each active entry receives independent storage.

## 13. Runtime helpers and floating point

### 13.1 Runtime helpers

Lanternfly source states operations rather than the target instructions used to
perform them. A Z80 backend may select helpers for multiplication, division,
power, square root, wide arithmetic, collection copying, bounds checks and far
access. A C backend may express the same operations directly.

Helpers are linked or emitted only when used. Their presence is visible in
generated listings and cost reports.

The bounds, arithmetic, address and invalid-value fault services do not return
to the failing expression. A hosted profile may report or trap the fault; a
standalone target may terminate or enter a target-defined fault monitor. The
chosen mechanism must preserve the fault class and source location in debug
artifacts.

### 13.2 Target and native boundary

A target profile declares its CPU or substrate, endianness, supported scalar
operations, near and far address representations, address spaces, routine ABI,
standard-service implementations and native dialect.

Display, input, sound, random, firmware and device operations are typed
external routines imported from platform interface modules rather than core
statements. Section 12.4 defines their source declaration and binding forms. A
missing implementation is a compile error.

Native source is admitted only through an explicit target-qualified boundary.
External bindings and statement-level inline assembly are executable
boundaries. A module-level assembly block is instead emitted source whose
runtime behaviour belongs to any `extern sub` contract that exposes it.
Compiler artifacts retain source mappings and selected-helper information
across all three forms.

Every external or host-manifest routine contract preserves Lanternfly value
invariants at entry and return. An integer has its declared width, a Boolean is
zero or one, and an aggregate parameter names valid, correctly aligned storage
of the declared class and exact type for the duration of the call. A `cstr` is
non-null, immutable through its interface and terminated within its promised
accessible range for the program's lifetime. Native code may not mutate constant storage or
install an invalid Boolean, address or C-string representation in Lanternfly
storage. A contract missing one of these representation, layout or lifetime
guarantees is incompatible and is rejected; disabling optimization cannot make
it safe. If a provider violates a declared guarantee at runtime, that provider
is nonconforming.

The effect part of an external or host routine contract states visible reads,
writes, calls, faults, device I/O, control flow and ABI clobbers. When this
effect summary is incomplete, the conservative fallback assumes that the call
may read and write every mutable object reachable by the boundary, call other
native routines, fault, perform device I/O and clobber every
caller-unpreserved machine resource. It still may not violate the value
invariants above. The compiler emits `W-NATIVE-001` and treats this fallback
as a write to any visible counted-loop control variable, which can make the
call invalid under section 10.1.

The calls named by such a contract are native-to-native edges. A native call
back into a source-defined Lanternfly routine or hosted body is outside the
first edition and makes the binding incompatible. An incomplete effect summary
does not grant callback permission.

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
block contract. In a hosted body, the block must eventually reach the host
epilogue through ordinary body completion or generated Lanternfly control.
The block must not modify immutable storage or leave an invalid Boolean,
opaque-address or C-string representation in Lanternfly-visible storage.
Violating one of these obligations makes the inline block nonconforming source
for that target. Calling a generated source-defined Lanternfly routine from
raw assembly is deferred because the compiler cannot add that hidden edge to
its recursion and reentrancy analysis.

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

### 13.3 Hosted bodies

A host such as Glimmer supplies the typed manifest defined in section 12.6.
Manifest storage and routines obey the shared value-invariant and effect
contract in section 13.2. A missing representation or lifetime guarantee is a
manifest error; an incomplete routine effect summary receives the conservative
fallback and `W-NATIVE-001`. Lanternfly has no Glimmer-specific state or
scheduling words.

Normal body completion reaches the host epilogue. Bare `return` may complete a
hosted body early and reaches that same epilogue; it must not lower to a
machine return. A hosted body cannot return a value. This rule keeps `exit`
exclusive to loop control and avoids a host-specific exit form.

The compiler returns a summary of imported storage reads and writes, routines
called, native effects, early returns, runtime helpers, static scratch,
estimated cost and source mappings. A host may compare that summary with explicit
dependency declarations or use it to derive change tracking.

### 13.4 Floating point

Floating point is deferred. Two models remain:

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
as
asm
at
case
clear
const
continue
count
each
else
end
exit
export
extern
false
fill
for
from
if
import
in
length
mod
not
offset
or
record
return
select
shl
shr
size
sqrt
step
sub
then
to
true
until
var
volatile
while
xor
```

The reserved built-in type and storage-class words are:

```text
address
boolean
cstr
far
i8
i16
i32
near
u8
u16
u32
```

`type` is contextual. It selects a type operand inside `size` or `count` and
remains available as an ordinary identifier everywhere else.
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
module              ::= top-item*
hosted-body         ::= local-decl* statement*

top-item            ::= import-decl
                      | export-decl
                      | declaration
                      | asm-block

import-decl         ::= "import" string-literal newline
export-decl         ::= "export" exportable-declaration

declaration         ::= const-decl
                      | var-decl
                      | record-decl
                      | extern-sub-decl
                      | sub-decl

exportable-declaration
                    ::= const-decl
                      | var-decl
                      | record-decl
                      | extern-sub-decl
                      | sub-decl

const-decl          ::= "const" value-name "as" type-expr
                        "=" constant-initializer placement? newline

var-decl            ::= "volatile"? "var" value-name "as" type-expr
                        ("=" constant-initializer)? placement? newline

placement           ::= "at" address-const-expr

record-decl         ::= "record" type-name newline
                        field-decl+
                        "end" newline

field-decl          ::= "var" value-name "as" type-expr newline

sub-decl            ::= "sub" value-name "(" params? ")"
                        ("as" type-expr)? newline
                        routine-block
                        "end" newline

extern-sub-decl     ::= "extern" "sub" value-name "(" params? ")"
                        ("as" type-expr)?
                        external-binding? newline
external-binding    ::= "at" address-const-expr
                      | "from" string-literal

params              ::= param ("," param)*
param               ::= aggregate-storage-class? value-name "as" type-expr
aggregate-storage-class
                    ::= "near" | "far"

routine-block       ::= local-decl* statement*
local-decl          ::= local-var-decl | alias-decl
local-var-decl      ::= "var" value-name "as" type-expr
                        ("=" expression)? newline
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
                      | asm-block

asm-block           ::= "asm" newline
                        raw-assembly-line*
                        "end" newline

assignment-statement
                    ::= writable-path "=" expression newline

expression-statement
                    ::= expression newline

standard-procedure-statement
                    ::= "clear" "(" storage-path ")" newline
                      | "fill" "(" storage-path "," expression ")" newline

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
                      | const-expr "to" const-expr

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
return-statement    ::= "return" expression? newline

block               ::= statement*

type-expr           ::= arrayable-type dimensions?
aggregate-type      ::= type-name
                      | arrayable-type dimensions
arrayable-type      ::= scalar-type
                      | type-name
                      | address-type

dimensions          ::= "[" const-expr ("," const-expr)* "]"
scalar-type         ::= integer-type | "boolean"
                      | cstring-type
integer-type        ::= "u8" | "i8" | "u16" | "i16"
                      | "u32" | "i32"
cstring-type        ::= ("near" | "far")? "cstr"
address-type        ::= ("near" | "far") "address"

storage-base        ::= value-name
storage-path        ::= storage-base path-segment*
writable-path       ::= storage-path
path-segment        ::= "." value-name
                      | "[" expression ("," expression)* "]"

expression          ::= or-expression
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
                      | cstring-type "(" expression ")"
standard-value-operation
                    ::= ("abs" | "sqrt" | "length") "(" expression ")"
layout-query        ::= "size" "(" layout-operand ")"
                      | "count" "(" layout-operand
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
`value-name` and `type-name` share one lexical shape and resolve in their
respective namespaces, subject to the record/callable collision rule in
section 2.1. A no-result invocation has internal type `unit` and is legal only
as the complete expression of an expression statement. `clear` and `fill`
also have internal type `unit`, but their grammar admits them only as complete
standard-procedure statements.

When a statement begins with a writable path followed immediately by `=`, the
parser selects `assignment-statement`. Otherwise it selects an expression
statement, where `=` can occur only as equality inside the expression.
Parentheses make a discarded equality test explicit:

```lanternfly
(left = right)
```

## 16. Decisions to revisit

The following questions remain open or provisional:

- whether bare `end` stays clearer than named endings in long routines;
- case-insensitive identifier resolution after parser experiments;
- whether `at` is sufficient or grows into a section-placement model;
- source syntax for narrowing an external routine's effect contract;
- native callback declarations and their call-graph/reentrancy contract;
- read-only aggregate parameters and bounded writable-text view spelling;
- whether selection ranges belong in the first parser;
- whether translated programs justify `repeat`/`until` or named outer-loop
  exits;
- module aliases, re-exports and the source file extension;
- optional `float32` semantics and its target capability contract.

The first prototype should translate representative Glimmer bodies, Tetro and
Pacmo routines and AZM Book 3 algorithms before these choices are frozen.
