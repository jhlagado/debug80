# Numbers, truth and expressions

Numeric rules are part of program meaning. A Z80, C compiler and BASIC dialect
must agree even when their native promotion and overflow rules differ.

Three corpus cases keep the design honest:

- Skyfall deliberately stores a wrapped byte result;
- Rushlight needs the signed difference between two byte coordinates;
- historical Tetro stores the genuine value -3 in one byte.

## Fixed-width integers

| Type  | Width | Range                                |
| ----- | ----: | ------------------------------------ |
| `u8`  |     8 | 0 through 255                        |
| `i8`  |     8 | -128 through 127                     |
| `u16` |    16 | 0 through 65,535                     |
| `i16` |    16 | -32,768 through 32,767               |
| `u32` |    32 | 0 through 4,294,967,295              |
| `i32` |    32 | -2,147,483,648 through 2,147,483,647 |

Representations are two's complement and widths do not vary by backend.
`float32` is deferred and would be an explicit target capability.

## Exact literals

An integer literal begins as an exact compile-time value:

```lanternfly
const visibleMask as u8 = %00000001
const nameTable as u16 = $0800
const spawnY as i8 = -3
```

An expected type from an initializer, assignment, scalar argument, return,
`fill` value or counted-loop start propagates through an all-literal subtree.
Without such a context, literal arithmetic defaults to `i16`; a value outside
that type needs an explicit conversion.

Explicit conversion also requests low-bit interpretation:

```lanternfly
const wrapped as u8 = u8(300) // 44
```

The directly negated minimum of a signed type is legal as one value, so
`const minimum as i8 = -128` does not first try to represent positive 128.

## Byte characters and static strings

A character literal is one exact byte written in single quotes:

```lanternfly
const prompt as u8 = '>'
const newline as u8 = '\n'
const escape as u8 = '\x1b'
```

It begins as an untyped value from zero through 255 and adopts an integer type
from context. Lanternfly accepts printable ASCII and the defined byte escapes;
it does not add a character encoding, a multibyte character type or
multi-character literals.

A double-quoted expression creates immutable, program-lifetime bytes with a
NUL terminator:

```lanternfly
const title as near cstring = "LANTERNFLY"
var promptText as near cstring = "READY?"
```

The source cannot contain an embedded zero, because that would make the
payload end before the compiler-supplied terminator. A `cstring` carries an
address class but no hidden length, capacity or ownership. Assignment copies
that carrier, while comparison examines the unsigned payload bytes.

This is deliberately a boundary type rather than a mutable string system.
Writable text is a fixed `u8` array with an explicit capacity; it does not
convert implicitly to `cstring`. A C string also has no conversion to an integer
or opaque address.

The address class can be converted without changing the bytes or their
lifetime:

```lanternfly
farMessage = far cstring(nearMessage)
nearMessage = near cstring(farMessage)
defaultMessage = cstring(sourceMessage)
```

A target may widen a near C string to far when it can attach the current
mapping context. Far-to-near conversion is checked and invokes `F-ADDRESS` at
runtime when the logical address has no near representation. The unqualified
form converts to the target profile's default C-string class. A constant
conversion that cannot be proved valid is a compile-time error.

## Operand compatibility

Matching integer types can be combined directly. A narrower operand may widen
to the type already present on the other side when every source value fits:

| Source | Permitted written destination operand |
| ------ | ------------------------------------- |
| `u8`   | `u16`, `i16`, `u32`, `i32`            |
| `i8`   | `i16`, `i32`                          |
| `u16`  | `u32`, `i32`                          |
| `i16`  | `i32`                                 |

The compiler never invents a third common type. `u8 + u16` is a `u16`
operation because `u8` widens to the type already present. `u8 + i8` and
`i16 + u16` require an explicit conversion.

That restriction keeps a small expression legible: a 32-bit helper appears
only when a 32-bit operand is actually written into the calculation.

## Result widths

For matching operands:

| Operator             | `u8` result  | `i8` result  | 16/32-bit result |
| -------------------- | ------------ | ------------ | ---------------- |
| `+`, `*`, `/`, `mod` | `u16`        | `i16`        | operand type     |
| `-`                  | `i16`        | `i16`        | operand type     |
| `and`, `or`, `xor`   | operand type | operand type | operand type     |
| `shl`, `shr`         | left type    | left type    | left type        |
| `^`                  | `u16`        | `i16`        | base type        |
| comparisons          | `boolean`    | `boolean`    | `boolean`        |

The `u8 - u8` result covers -255 through 255. Rushlight can therefore write:

```lanternfly
distance = abs(playerX - enemyX)
```

without first wrapping the subtraction. Byte multiplication and addition grow
to 16 bits, so ordinary array-offset arithmetic also composes naturally:

```lanternfly
elementNumber = row * 20 + column
```

Operator order still matters. With `u8` values, `x + 1 - y` first produces
`u16`; the later subtraction is therefore unsigned. A calculation that needs
a negative final range can write `i16(x) + 1 - i16(y)`.

## Wrapping and destination conversion

Arithmetic wraps in its selected fixed-width result type. Assignment converts
that result to its destination:

- value-preserving widening is silent;
- narrowing keeps the low destination-width bits;
- a signedness change preserves the bit pattern;
- narrowing and signedness changes warn by default.

The common state-update form receives a round-trip exemption:

```lanternfly
lives = lives - 1
position = position + velocity
```

When every value leaf has the destination's type and the expression contains
only ordinary integer operators, the wider intermediate is understood to
return to its original storage width. No warning is needed. An explicit
conversion, another declared type or a standard operation ends that exemption.

Skyfall's deliberate wrap is still exact:

```lanternfly
enemyY = u8(enemyY - fallSpeed)
```

If both inputs are `u8` and hold 2 and 5, subtraction produces `i16(-3)` and
the conversion stores 253.

## Division, remainder, power and shifts

Integer division truncates toward zero. `mod` satisfies:

```text
left = (left / right) * right + (left mod right)
```

A zero divisor is a compile-time error when known and a runtime arithmetic
fault otherwise.

Power uses `^`. Its exponent must be non-negative, and the result type remains
fixed through repeated products. `x ^ 0` is one in that type. A negative
runtime exponent faults.

`shl` and `shr` retain the left operand's type. A negative shift count faults.
A count at least as large as the width produces zero for `shl` and unsigned
`shr`, and sign fill for signed `shr`. These rules avoid C undefined behaviour
and CPU-specific masked counts.

## Boolean values

`boolean` occupies one byte and stores only zero or one. Comparisons produce
`boolean`, and every condition requires it:

```lanternfly
if (flags and visibleMask) <> 0 then
    drawActor()
end
```

Integers do not become conditions implicitly. Imported code that promises a
Boolean must also provide its canonical representation.

With Boolean operands, `not`, `and`, `xor` and `or` are logical. Boolean `and`
and `or` short-circuit. With integer operands the same words combine complete
bit patterns, and both operands are evaluated.

## Enums and subranges

Enums and subranges are ordinal types rather than decorated integers:

```lanternfly
enum Direction as u8
    left
    right
    up
    down
end

range InteriorColumn as u8 = 1 until 31
```

Enum members receive ordinals from zero in declaration order. Their names
enter the surrounding value scope without qualification. Unrelated enum types
cannot be mixed even when they share a representation width.

A subrange is a distinct type whose representation comes from its host.
Values widen silently to the host type. Assignment, initialization, argument
passing, return and explicit conversion into the subrange check its domain.
Known failure is a compile error; dynamic failure invokes `F-RANGE` before the
destination changes.

Enums support comparison, `select`, counted traversal and array indexing, but
not integer arithmetic or bitwise operations. An explicit conversion to the
representation type exposes an enum ordinal. Integer-to-enum conversion is
checked.

Ranges are type and grammar forms, not values. They cannot be stored, passed or
returned.

## Comparison and precedence

Integers use the compatibility rules above. Subranges compare through their
host, and enum operands must share a nominal enum family. Booleans allow only
`=` and `<>`. C strings use content comparison. Record and array equality is
deferred.

Precedence from highest to lowest is:

1. calls, indexing, field access and parentheses;
2. `^`;
3. unary `+` and `-`;
4. `*`, `/` and `mod`;
5. `+` and `-`;
6. `shl` and `shr`;
7. comparisons;
8. `not`;
9. `and`;
10. `xor`;
11. `or`.

Power associates right to left. Other binary operators associate left to
right. Comparison chaining is invalid.

## Standard scalar operations

`abs` returns the unsigned type of the same width as its operand, so
`abs(i8(-128))` is `u8(128)`. An unsigned operand is unchanged.

`sqrt` returns the floor of a non-negative integer square root in the unsigned
type of the operand's width. A negative value is a compile-time or runtime
arithmetic fault.

`length` scans a `cstring` payload and returns `u16`. Literal calls fold at compile
time.

These operations may become instructions, inline sequences or helpers. Their
source types and edge cases do not change.

## Numeric conformance

Every backend must agree on at least these cases:

| Case                   | Result                  |
| ---------------------- | ----------------------- |
| `u8(2 - 5)`            | 253                     |
| `abs(u8(2) - u8(250))` | `u16(248)`              |
| `i8($FD)`              | -3                      |
| `u16(65535) + u8(1)`   | wrapping `u16(0)`       |
| `i16(-7) / 3`          | -2                      |
| `i16(-7) mod 3`        | -1                      |
| `not u8(0)`            | 255                     |
| `u8(1) < u8(2)`        | `true` (`boolean`)      |
| `u8(255) * u8(255)`    | `u16(65025)`            |
| `i16(1) + u16(1)`      | compile-time type error |

These are language tests, not Z80 tests. A C or BASIC backend must insert the
operations needed to produce the same answers.
