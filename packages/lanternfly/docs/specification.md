# Lanternfly working language specification

Edition: design draft 0.3
Implementation status: no compiler exists
Normative status: working contract for a prototype

The companion [conformance and diagnostics contract](conformance.md) collects
the mandatory errors, warnings, runtime faults, semantic vectors and program
fixtures for this edition.

This specification consolidates the 0.2 semantic work and the later
surface-language decisions into one implementation contract. Earlier syntax
using `DIM`, `SUB`/`FUNCTION`, uppercase keywords, integer truth values or named
block endings is historical.

The design remains open to contraction. Recording a construct here means that
its present semantics are understood well enough to test. It does not prevent a
prototype or a corpus translation from showing that Lanternfly can do with
less.

**Must** states a semantic requirement. **Should** states a strong toolchain
recommendation. **Provisional** marks a rule that still requires implementation
or corpus evidence. **Deferred** marks a facility outside the first
implementation.

## 1. Language scope

Lanternfly is an integer-based general-purpose programming language in the
structured BASIC family. It is intended to replace ordinary AZM program logic,
not merely the assembly statements inside Glimmer bodies.

The first useful implementation should support:

- fixed-width signed and unsigned integers;
- Boolean values and binary masks;
- constants and statically allocated variables;
- exact records and fixed arrays;
- field access and runtime indexing;
- assignment and general expressions;
- structured decisions, selection and loops;
- routines with optional parameters, local scalar storage and optional
  results;
- source modules with private declarations and explicit exports;
- target-independent lowering through AZM, another assembler, C or a selected
  BASIC dialect.

Lanternfly remains independent of Glimmer. It has no keyword for Glimmer state,
pulses, effects, rendering, cards or scheduling. Glimmer may provide imported
storage and routines to a Lanternfly body.

The language has no initial heap, garbage collector, exception system or
dynamic collection model. Fixed storage and whole-program compilation keep its
runtime suitable for small machines.

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

The current direction is case-insensitive name resolution with spelling
preservation:

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

Underscores may remain lexically valid for imported or generated names, but the
formatter should not introduce snake case into ordinary Lanternfly source.

### 2.3 Blocks

Every structured block currently closes with the single keyword `end`:

```lanternfly
if active then
    updateActor()
end
```

The parser closes the innermost open block. Indentation is canonical and
required from a formatter, but it is not currently proposed as semantic
syntax.

Bare `end` is provisional. It is being tried because it is no less structured
than Pascal's `begin`/`end` or braces, while avoiding a repeated closing word
such as `end if` or `end sub`.

### 2.4 Lexical rules and comments

The first-edition source character set is UTF-8, but language identifiers use
ASCII letters for portable interoperation. An identifier begins with `A`–`Z`
or `a`–`z`; later characters may also be digits or `_`. Keywords and built-in
operation names are reserved under case-insensitive comparison.

Integer literals use these forms:

```lanternfly
42          // decimal
$2a         // hexadecimal
%00101010   // binary
```

A leading `+` or `-` is a unary operator, not part of the literal. Digit
separators, octal literals and character literals are absent initially.

Import paths are double-quoted string literals. Within them, `\"` represents a
quote and `\\` a backslash. Other escapes and a physical newline are invalid.
General runtime strings are not implied by this lexical form.

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

The integer spellings replace the earlier `BYTE`, `SBYTE`, `WORD`, `INTEGER`,
`DWORD` and `LONG` surface names. Width and signedness remain invariant across
targets.

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
return, case comparison or counted-loop boundary, that type propagates to its
literal leaves. Without such a context, literal integer operations default to
`i16`; a value that does not fit requires an explicit conversion.

Thus `if 1 < 2 then` compares two `i16` values, while
`const mask as u16 = 1 shl 15` evaluates in the expected `u16` context. Boolean
literals always have type `boolean`.

For arithmetic, bitwise and integer comparison operators other than shifts and
power, all other binary operands must have the same declared type. Different
widths or signedness require an explicit conversion. This rule prevents
`i16 + u16` from silently selecting 32-bit helper arithmetic.

The result table for matching operand types is:

| Operator             | `u8` result | `i8` result | 16/32-bit result |
| -------------------- | ----------- | ----------- | ---------------- |
| `+`, `*`, `/`, `mod` | `u16`       | `i16`       | operand type     |
| `-`                  | `i16`       | `i16`       | operand type     |
| `and`, `or`, `xor`   | operand type | operand type | operand type    |
| `shl`, `shr`         | left type   | left type   | left type         |
| `^`                  | `u16`       | `i16`       | base type         |
| comparisons          | `boolean`   | `boolean`   | `boolean`        |

The `u8 - u8` rule preserves the complete mathematical range from -255 through
255 required by coordinate-difference programs. Arithmetic results wrap in the
selected result width.

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
that pattern as two's complement. Boolean and integer conversions are not
implicit and are deferred from the first implementation.

`i32` and `u32` remain language types. They enter a program only when declared
or selected explicitly; smaller arithmetic does not promote into them merely
to reconcile signedness. A backend emits wide helpers only when the program
uses wide operations.

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

## 4. Constants and variables

### 4.1 Constants

`const` declares a compile-time value:

```lanternfly
const screenWidth as u8 = 32
const maximumLives as u8 = 5
const visibleMask as u8 = %00000001
const debuggingEnabled as boolean = false
```

The first implementation should require the explicit type. Type inference can
be reconsidered after constant expressions and overload resolution exist.

A scalar constant normally occupies no storage. Taking its address or placing
it explicitly may force a stored representation.

The first edition does not permit a `const` whose type is, or contains, a
typed reference. This avoids conflating an immutable reference slot with an
immutable referent before read-only reference types are designed.

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

`as` introduces the type. Lanternfly does not use `dim` or a colon for ordinary
type declarations.

Module-level variables own static storage. Compiler-allocated static storage
without an explicit initializer begins with all bits zero, provided its type
contains no typed reference. Placed or imported storage without an initializer
retains the value supplied by the target environment; the compiler performs no
startup write. A module variable whose type is, or contains, a typed reference
requires an initializer that supplies every reference slot, or an imported
contract that guarantees valid non-null references.

Local scalar variables use the same syntax inside a routine:

```lanternfly
sub addScore(amount as u16)
    var previousScore as u16 = playerScore
    var nextScore as u16 = previousScore + amount

    playerScore = nextScore
end
```

The initial implementation requires local declarations before executable
statements and gives them routine scope. An owned scalar local without an
initializer starts with all bits zero. A typed-reference variable is non-null
and therefore always requires an initializer.

`const` declarations are module-level in the first edition. A routine can use
a module constant without allocating storage.

### 4.3 Placement

`at` gives static storage or constant data a target address:

```lanternfly
var workspace as u8[256] at $8000
const font as u8[512] = [...] at $4000
```

The address is a compile-time expression. The target profile validates its
range, address space, alignment requirements and overlap with other placed
objects. A placed declaration has the same type and access rules as ordinary
storage.

A placed variable with an initializer is installed before program entry. The
target profile declares, for each relevant address space, whether installation
means bytes preloaded by the program image/loader or generated startup writes.
If neither mechanism can establish the value, compilation fails. The generated
listing and cost report identify startup copies or writes.

A placed variable without an initializer is an existing external object and is
not zeroed. In particular, merely declaring a volatile memory-mapped register
never writes to that register. A volatile or device-mapped initializer is
accepted only when the profile explicitly permits its startup write; that
write is an observable initialization effect reported in compiler artifacts.

`at` is target-aware rather than CPU-specific. A banked target may accept a far
address expression. An address-space profile may accept a qualified device
address. Portable modules should normally leave placement to an entry program
or target configuration.

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
imported/native storage contracts. Volatile local variables have no useful
hardware meaning and are rejected.

### 4.5 Initializers and constant expressions

An initializer has one of three forms:

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

The leading Pascal-cased name resolves in the type namespace, so a record
initializer is distinct from a routine invocation even though both use
parentheses.

Initializer expressions are evaluated in source order. For a record literal,
that is the written field order; for an array literal, it is left to right at
each dimension. Each value must be assignable to its destination type.

Every `const` initializer, array dimension, placement expression, case value,
case-range endpoint and counted-loop step is a constant expression. A
module-level `var` initializer is also a constant expression because all
static initialization is completed before program entry. A local `var`
initializer is an ordinary runtime expression.

A constant expression may contain literals, names of previously declared
constants, parentheses, the integer and Boolean operators in this
specification, comparisons, explicit scalar conversions, and array or record
initializers. It may also form a reference to statically allocated storage when
every index in the path is constant; this computes an address and does not read
the storage. It may not otherwise read variable storage, invoke a routine, use
a volatile object or perform any other observable operation.

The compiler resolves every operator's operand and result types before folding
it. Each folded operation applies the same wrapping, shift, conversion and
fault rules as runtime evaluation. Only an untyped literal remains exact until
context or the `i16` default gives it a type. Consequently, if
`maximum as u16` is 65535, `(maximum + 1) / 2` is zero, not 32768. Division by
zero, an invalid shift or a negative power is a compile error in a constant
expression.

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

A record declaration allocates no storage. An instance declaration does:

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
- may contain scalars, records or other fixed arrays;
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

Constant out-of-range indices are compile errors. Every dynamic index is
checked unless the compiler proves it is in range. An out-of-range access
invokes the target bounds-fault service before any load or store occurs. A
target-specific unchecked mode may exist as an explicitly unsafe extension,
but code compiled in that mode is not a conforming execution of this
specification.

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
the copy, emit a loop or call a runtime helper. Size and cost belong in
generated listings or cost reports, not in a language restriction.

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

### 7.1 Typed references and aliases

A typed reference is a non-null scalar value that identifies existing storage:

```lanternfly
sub updateSelected()
    var selected as ref Actor = ref actors[0]
    var bankedActor as far ref Actor = ref actors[0]
    ...
end
```

`ref T` uses the target's default, normally near, reference class. `near ref T`
and `far ref T` state the class explicitly. Parentheses disambiguate compound
types: `(near ref Actor)[8]` is an array of eight references, while
`near ref (Actor[8])` is one reference to an eight-element array.

Prefix `ref` forms a reference to a storage path. It evaluates the path's base
and indices once. References may be formed only to module storage, imported
storage, aggregate parameters or storage already reached through a reference.
Forming, returning or storing a reference to an owned scalar local is deferred.
There is no null reference in the first edition.

Field and index access pass transparently through a reference:

```lanternfly
selected.position.x = selected.position.x + 1
```

Used without a following field or index, a reference variable evaluates to its
reference value. `value(reference)` explicitly denotes its referent and is a
writable storage path when the reference is writable:

```lanternfly
value(scoreReference) = value(scoreReference) + 1
value(selected) = actors[nextActor]
```

Assigning a reference value to a reference variable rebinds the variable:

```lanternfly
selected = ref actors[nextActor]
```

It does not copy the referent. Assignment to `value(selected)`, to a field or
element through `selected`, to a local aggregate alias, or to an aggregate
parameter writes the referent and follows the same aggregate-copy rules as
ordinary storage. Equality and inequality are defined for compatible reference
types and compare logical storage identities. Ordering, arithmetic and bitwise
operations on references are invalid.

References to mutable storage are writable. The first edition cannot form a
reference to constant aggregate storage because it has no read-only reference
type. Aggregate parameters are mutable references in source semantics and
likewise reject constant actual arguments.

A near reference may convert implicitly to the corresponding far reference
when the target can attach the current memory context. A far reference narrows
only through the explicit checked conversion `near ref T(expression)`;
failure invokes the target address-fault service. Public interfaces and stored
reference fields or variables must state `near` or `far`; the unqualified form
is permitted only for local reference variables and private parameters.

`near address` and `far address` are opaque machine or device address values,
not typed references. They support assignment and equality but not ordinary
field access, indexing or arithmetic. Constructing a typed reference from an
opaque address requires a target/native operation whose contract establishes
the address space, alignment, lifetime and referent type.

The local alias declaration:

```lanternfly
ref actor as Actor = actors[selectedActor]
```

is shorthand for a non-rebindable local `ref Actor` initialized with
`ref actors[selectedActor]`. It provides transparent field and index access
without allocating an aggregate local.

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
by default. A project may promote that warning to an error. This deliberate
store conversion permits compact state updates such as an `i16` subtraction
stored back into a `u8`, while mixed-type arithmetic itself remains explicit.

Initializers, scalar arguments and returned values use the same destination
conversion rules. Aggregate assignment instead requires an identical record
type or identical array element type, rank and dimensions. Reference
assignment requires compatible referent and address classes, subject to the
near/far rules in section 7.1.

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

Comparison chaining is invalid. Write:

```lanternfly
if minimum <= value and value <= maximum then
    acceptValue()
end
```

Integer comparisons use the operand compatibility rule in section 3.1.
Booleans support only `=` and `<>`. Compatible typed references support only
`=` and `<>`, as described in section 7.1. Record and array equality is
deferred; their fields or elements must be compared explicitly.

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

### 8.5 Standard operations

Four lowercase standard operations complete the initial numeric and layout
vocabulary:

```lanternfly
distance = abs(playerX - enemyX)
root = sqrt(area)
const actorBytes as u16 = size(Actor)
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

`size(type-or-path)` returns the exact byte size of a type or statically typed
storage path. `count(array-or-array-type)` returns the extent of a
one-dimensional fixed array. A multidimensional array requires a zero-based
dimension argument, as in `count(board, 0)`. An invalid or nonconstant
dimension is a compile error.

`offset(Record.fieldPath)` returns the exact byte offset of a field path from
the beginning of its record type. The path contains field names only, not
runtime indices.

The three layout queries are compile-time operations. They return exact,
untyped integer constants that adopt a surrounding integer type by the literal
rules in section 3.1, and they never read the storage path supplied for type
inspection. `abs` and `sqrt` are pure value operations, but their argument is
evaluated normally. They constant-fold under section 4.5; `sqrt` may lower to a
target helper when evaluated at runtime.

### 8.6 Expression statements

Any expression may stand as a statement. It is evaluated normally and its final
value is discarded:

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

The selected expression is evaluated once. Cases contain compatible
compile-time constants, never fall through and require no `break`.

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

Overlapping or duplicate cases are compile errors.

## 10. Loops

### 10.1 Conditional loop

```lanternfly
while enemiesRemaining > 0
    updateEnemy()
end
```

The condition must be Boolean and is tested before each iteration.

### 10.2 Counted loop

```lanternfly
var index as u8

for index = 0 to 7
    actors[index].active = false
end
```

The limit is inclusive. `step` supplies a compile-time integer step in the first
implementation:

```lanternfly
for row = 7 to 0 step -1
    moveRow()
end
```

When `step` is omitted, it is the mathematical integer `+1`. The start, limit
and effective step are evaluated once. A zero step is an error. The loop
variable is declared separately, avoiding hidden local storage.

Evaluation is left to right: start, limit, then step. Start and limit must be
convertible to the loop variable's integer type. The step is a non-zero signed
mathematical integer even when the loop variable is unsigned.

The loop first stores the converted start value. A positive step continues
while the current value is less than or equal to the limit; a negative step
continues while it is greater than or equal to the limit. After the body, the
implementation computes the next value mathematically. If it would fail the
next test, the loop ends without storing it. Otherwise it must be representable
in the loop variable's type and is stored for the next iteration. This rule
prevents wraparound at either boundary and permits an unsigned descending loop:

```lanternfly
for row = 7 to 0 step -1
    clearRow(row)
end
```

After the loop, the variable retains the last value stored. If the body never
runs, it retains the converted start value. The loop body may not assign to
the control variable or pass it to a writable reference or aggregate
parameter.

### 10.3 Indefinite loop

```lanternfly
loop
    readInput()
    updateGame()
    drawFrame()
end
```

`exit` leaves the innermost loop. `continue` begins its next iteration:

```lanternfly
for index = 0 to actorCount - 1
    if not actors[index].active then
        continue
    end

    updateActor(actors[index])
end
```

The first edition has neither labelled loops nor `exit for`/`exit while`
variants. A routine can use an early `return` to leave a nested search; code
that must continue after the outer loop uses an explicit Boolean flag. Named
outer-loop exit remains deferred until corpus translations justify it.

`repeat`/`until` is deferred until translated programs demonstrate enough
post-test loops to justify another form.

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
Boolean, address or typed-reference scalar. Returning a record or fixed array
by value is deferred.

Parentheses are present for every declaration and invocation, including an
empty parameter list. This makes a routine invocation syntactically distinct
from a name.

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

Scalar parameters pass values. Record and array parameters alias existing
storage rather than copying it. Mutating `actor` in the example mutates the
caller's record.

The unqualified aggregate form is private-interface shorthand. An exported
routine states the address class with a typed-reference parameter:

```lanternfly
export sub moveActor(actor as near ref Actor, deltaX as i16)
    actor.position.x = actor.position.x + deltaX
end
```

An aggregate argument must be a compatible storage path or a compatible typed
reference, not a temporary initializer or other general expression. Because
first-edition aggregate parameters are writable, constant storage is not a
valid actual argument. Typed-reference parameters pass reference values and
may be rebound locally without rebinding the caller's reference variable.

Parameter-free routines remain the first implementation stage. Parameters,
locals and the calling convention are later stages of the same source
language, not separate language editions.

### 11.4 Local variables and collection aliases

Scalar locals use `var`:

```lanternfly
sub updateActor(actor as Actor)
    var nextX as i16 = actor.position.x + actor.velocity.x
    var nextY as i16 = actor.position.y + actor.velocity.y

    actor.position.x = nextX
    actor.position.y = nextY
end
```

The ZAX-derived restriction remains useful:

- scalar locals may own automatic storage;
- record and array locals do not allocate aggregate stack objects;
- a local collection name aliases storage allocated elsewhere.

A local `var` declaration with a record or array type is therefore a compile
error even though the shared declaration grammar can parse it.

The alias spelling is provisional. The current candidate is:

```lanternfly
ref actor as Actor = actors[selectedActor]
```

This keeps `var actor as Actor` available for owning static storage and makes a
local alias explicit. Unlike a reference variable, this alias cannot be
rebound.

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
sub clamp(value as i16, minimum as i16, maximum as i16) as i16
    if value < minimum then
        return minimum
    else if value > maximum then
        return maximum
    else
        return value
    end
end
```

Early return is allowed. `exit` remains loop control; `return` leaves the
routine.

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
the complete direct call graph. The target-specific convention does not change
Lanternfly source semantics.

## 12. Modules

### 12.1 Import rather than include

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
    ...
end
```

The word `export` is preferred to AZM's `@` marker because Lanternfly uses
English declaration words rather than assembler punctuation.

An exported signature or variable type cannot expose an unexported
user-defined type.

### 12.3 Visibility and collisions

Exports initially enter the importing module without qualification, following
AZM's source-module model:

```lanternfly
import "actors.lf"

updateActors()
actors[0].active = true
```

Two visible declarations with the same case-insensitive name cause a compile
error. Module aliases are a possible extension:

```lanternfly
import "actors.lf" as actorsModule
```

Alias syntax remains deferred until real modules demonstrate the collision
pressure.

Imports are identified by canonical resolved file identity, so the same module
reached through two dependency paths is emitted once. Import cycles are
rejected initially with a path diagnostic. Imports do not re-export their own
imports unless a later explicit re-export facility is added.

### 12.4 Whole-program compilation

Lanternfly does not require object files or a separate user-visible linker. A
build:

1. loads the root module;
2. resolves the import graph;
3. collects private and exported declarations;
4. type-checks the complete program;
5. allocates static storage;
6. lowers required routines, data and helpers;
7. produces one target program and its debug artifacts.

Address allocation and symbol resolution still occur inside the compiler.
Avoiding a separate linker does not remove those compiler responsibilities.

The source file extension remains open. `.lf` is illustrative only.

### 12.5 Compilation units and program entry

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

The entry may remain private to the root module. A library build has no entry.
All module storage has been allocated and all constant static initializers have
been installed before an executable entry begins. Returning from the entry
invokes the target profile's normal program-termination service.

A hosted body is a distinct compilation-unit form supplied through a host
manifest. Its source consists of local declarations followed by statements; it
cannot contain imports, exports, module storage, records or subroutine
declarations. The host manifest supplies all non-local names and the body
epilogue. This separation prevents a loose statement sequence from being
mistaken for an ordinary module.

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

Display, input, sound, random, firmware and device operations are typed imported
routines rather than core statements. A missing implementation is a compile
error.

Native source is admitted only through an explicit target-qualified boundary.
Its declared contract states visible reads, writes, calls, control flow and ABI
effects. Generated source, original-source mapping and selected helper
information are normal compiler artifacts.

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
can provide target directives, labels, routines or data. A statement block can
use instructions, local labels and internal branches, but conforming control
must reach the generated statement that follows the block. A return or jump
that bypasses Lanternfly control flow violates the block contract. In a hosted
body, the block must eventually reach the host epilogue through ordinary body
completion or generated Lanternfly control.

The block is an observable compiler barrier. Unless a later declared native
contract narrows its effects, the compiler assumes that statement-level
assembly:

- reads and writes every mutable object visible at the block;
- may call target or imported routines and may fault;
- clobbers processor registers, flags and other volatile machine state;
- preserves only the stack, mapping and calling-state obligations required to
  continue with the following generated statement.

The backend spills or preserves any generated value that must survive this
barrier. Read/write/call summaries and cost reports mark the block as
conservative native code.

Raw assembly names belong to the selected assembler. There is no automatic
Lanternfly-name substitution inside the payload. The backend's generated
symbol artifact documents any Lanternfly storage or routine names exposed to
inline source.

An `asm` block is target-specific. A C, BASIC or other non-assembly backend
rejects it unless that target profile explicitly supplies a compatible
assembly-fragment pipeline. A missing closing `end` is a source error. Once
raw mode begins, `//` and every other character belong to the assembler; only
a physical line whose trimmed content is exactly `end` closes the block.

### 13.3 Hosted bodies

A host such as Glimmer supplies a typed manifest of visible storage, constants,
records, resources and routines. Lanternfly has no Glimmer-specific state or
scheduling words.

Normal body completion reaches the host epilogue. The host-only statement:

```lanternfly
exit body
```

also reaches that epilogue and must not lower to a machine return. A body-level
`return` is invalid because the hosted body is not a sub.

The compiler returns a summary of imported storage reads and writes, routines
called, native effects, early exits, runtime helpers, static scratch, estimated
cost and source mappings. A host may compare that summary with explicit
dependency declarations or use it to derive change tracking.

### 13.4 Floating point

Floating point is deferred, but it is not ruled out. There are two possible
models:

1. A library-defined `Float32` record or opaque value with routines such as
   `floatAdd`. This requires little core-language knowledge but produces
   cumbersome arithmetic source.
2. An optional compiler-recognised built-in `float32` type whose ordinary
   operators lower to a selected target library. This adds a scalar type and
   conversion rules to the language, while adding no runtime bytes to programs
   that do not use it.

The second model is more consistent with ordinary arithmetic, but it requires a
separate specification for:

- representation and IEEE-754 conformance;
- rounding modes;
- overflow, underflow, infinities and NaN;
- integer conversions;
- comparison behaviour;
- constant folding;
- target library ABI and code-size reporting.

The size of a Z80 floating-point library is a deployment cost rather than a
reason to distort integer semantics. A future `float32` capability should be
opt-in, linked on demand and visible in the cost report. The integer-only
language remains complete without it.

## 14. Current word inventory

The current core word candidates include:

```text
abs
and
as
asm
at
case
const
continue
count
else
end
exit
export
false
for
if
import
loop
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
value
var
volatile
while
xor
```

`ref`, `near`, `far` and `address` are type/reference words.

The current design deliberately omits:

```text
call
dim
function
include
procedure
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

import-decl         ::= "import" string-literal
export-decl         ::= "export" exportable-declaration

declaration         ::= const-decl
                      | var-decl
                      | record-decl
                      | sub-decl

exportable-declaration
                    ::= const-decl
                      | var-decl
                      | record-decl
                      | sub-decl

const-decl          ::= "const" value-name "as" type-expr
                        "=" initializer placement?

var-decl            ::= "volatile"? "var" value-name "as" type-expr
                        ("=" initializer)? placement?

placement           ::= "at" const-expr

record-decl         ::= "record" type-name newline
                        field-decl+
                        "end"

field-decl          ::= "var" value-name "as" type-expr newline

sub-decl            ::= "sub" value-name "(" params? ")"
                        ("as" type-expr)? newline
                        routine-block
                        "end"

params              ::= param ("," param)*
param               ::= value-name "as" type-expr

routine-block       ::= local-decl* statement*
local-decl          ::= var-decl | ref-decl
ref-decl            ::= "ref" value-name "as" type-expr
                        "=" storage-path

initializer         ::= expression
                      | array-initializer
                      | record-initializer
array-initializer   ::= "[" (initializer ("," initializer)*)? "]"
record-initializer  ::= type-name "("
                        field-initializer
                        ("," field-initializer)* ")"
field-initializer   ::= value-name "=" initializer

statement           ::= assignment-statement
                      | expression-statement
                      | if-statement
                      | select-statement
                      | for-statement
                      | while-statement
                      | loop-statement
                      | exit-statement
                      | continue-statement
                      | return-statement
                      | asm-block

asm-block           ::= "asm" newline
                        raw-assembly-line*
                        "end"

assignment-statement
                    ::= writable-path "=" expression

expression-statement
                    ::= expression

if-statement        ::= "if" expression "then" newline block
                        ("else" "if" expression "then" newline block)*
                        ("else" newline block)?
                        "end"

select-statement    ::= "select" expression newline
                        case-clause+
                        ("else" newline block)?
                        "end"

case-clause         ::= "case" case-item
                        ("," case-item)* newline block
case-item           ::= const-expr
                      | const-expr "to" const-expr

for-statement       ::= "for" value-name "=" expression
                        "to" expression
                        ("step" const-expr)? newline
                        block
                        "end"

while-statement     ::= "while" expression newline block "end"
loop-statement      ::= "loop" newline block "end"

exit-statement      ::= "exit" ("body")?
continue-statement  ::= "continue"
return-statement    ::= "return" expression?

block               ::= statement*

type-expr           ::= arrayable-type dimensions?
                      | reference-type
arrayable-type      ::= scalar-type
                      | type-name
                      | address-type
                      | "(" reference-type ")"

dimensions          ::= "[" const-expr ("," const-expr)* "]"
scalar-type         ::= "u8" | "i8" | "u16" | "i16"
                      | "u32" | "i32" | "boolean"
reference-type      ::= ("near" | "far")? "ref" reference-referent
reference-referent  ::= scalar-type
                      | type-name
                      | "(" type-expr ")"
address-type        ::= ("near" | "far") "address"

storage-base        ::= value-name
                      | "value" "(" expression ")"
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
                      | "true" | "false"
                      | value-name
                      | invocation
                      | conversion
                      | reference-expression
                      | referent-expression
                      | standard-value-operation
                      | layout-query
                      | "(" expression ")"

invocation          ::= value-name "(" arguments? ")"
arguments           ::= expression ("," expression)*
conversion          ::= scalar-type "(" expression ")"
                      | reference-type "(" expression ")"
reference-expression
                    ::= "ref" storage-path
referent-expression ::= "value" "(" expression ")"
standard-value-operation
                    ::= ("abs" | "sqrt") "(" expression ")"
layout-query        ::= "size" "(" layout-operand ")"
                      | "count" "(" layout-operand
                        ("," const-expr)? ")"
                      | "offset" "(" type-name
                        ("." value-name)+ ")"
layout-operand      ::= type-expr | storage-path

const-expr          ::= expression

value-name          ::= identifier
type-name           ::= identifier
identifier          ::= ascii-letter
                        (ascii-letter | decimal-digit | "_")*
integer-literal     ::= decimal-digit+
                      | "$" hexadecimal-digit+
                      | "%" binary-digit+
string-literal      ::= '"' string-character* '"'
newline             ::= logical-newline
```

`const-expr` is syntactically an expression and is restricted semantically by
section 4.5. `string-character` and `logical-newline` obey section 2.4.
Capitalisation conventions distinguish the semantic roles of `value-name` and
`type-name`; their lexical identifier shape is shared. A no-result invocation
has internal type `unit` and is legal only as the complete expression of an
expression statement.

When a statement begins with a storage path followed immediately by `=`, the
parser selects `assignment-statement`. Otherwise it parses an expression
statement, where `=` can occur only as equality inside the expression.
Parentheses make a discarded equality test explicit:

```lanternfly
(left = right)
```

## 16. Decisions to revisit

The following questions remain open or provisional:

- whether bare `end` stays clearer than named endings in long routines;
- the spelling of local collection aliases;
- case-insensitive identifier resolution after parser experiments;
- whether `at` is sufficient or grows into a section-placement model;
- volatile imported-reference spelling;
- whether selection ranges belong in the first parser;
- module aliases, re-exports and the source file extension;
- optional `float32` semantics and its target capability contract.

The first prototype should translate representative Glimmer bodies, Tetro and
Pacmo routines and AZM Book 3 algorithms before these choices are frozen.
