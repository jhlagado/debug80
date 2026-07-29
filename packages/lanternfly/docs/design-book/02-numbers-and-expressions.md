# Numbers, truth and expressions

Numeric rules are where an apparently simple language can become treacherous.
The corpus contains three behaviours that must coexist:

- Skyfall subtracts into a byte and deliberately wraps;
- Rushlight subtracts two byte coordinates and needs a signed intermediate
  before taking the absolute value;
- historical Tetro stores the genuine negative value -3 in one byte.

Lanternfly cannot leave those results to the backend.

## Integer types

The working integer set is:

| Type      | Width | Range                          |
| --------- | ----: | ------------------------------ |
| `BYTE`    |     8 | 0 through 255                  |
| `SBYTE`   |     8 | -128 through 127               |
| `INTEGER` |    16 | -32768 through 32767           |
| `WORD`    |    16 | 0 through 65535                |
| `LONG`    |    32 | -2147483648 through 2147483647 |
| `DWORD`   |    32 | 0 through 4294967295           |

`INTEGER` is the ordinary type for unconstrained whole-number calculation.
`BYTE` is the ordinary compact storage type for pixels, counters, masks and
small table elements. `SBYTE` exists because negative eight-bit game state is
real, not hypothetical. `WORD` and `DWORD` preserve the upper half of their
width when a signed range would be too small.

All integer representations are two's complement. Their widths do not change
with the backend.

`FLOAT32` is deferred. A later profile may provide IEEE binary32 or another
explicitly named format, but no integer-only program links floating-point
support.

## Literals

Lanternfly accepts decimal, hexadecimal, binary and character literals:

```lanternfly
42
$FF
%00111111
'A'
```

A literal is initially an exact compile-time integer rather than a prematurely
chosen machine type. Context then selects a type that contains it:

```lanternfly
DIM mask AS BYTE = $80
DIM period AS WORD = 1000
DIM spawnY AS SBYTE = -3
```

Without a constraining context, a decimal literal uses `INTEGER` if it fits,
then `LONG`. A non-decimal literal follows the same rule; spelling `$FFFF`
does not silently mean -1. Write `-1`, `WORD($FFFF)` or a named mask according
to the intended value.

A constant initializer that cannot fit its declared type is an error. Runtime
narrowing is different and is discussed below.

## Promotions solve the byte-subtraction conflict

Addition, subtraction, division, remainder and comparison never evaluate below
16 bits. Their common type is the smallest type of at least 16 bits whose range
contains both operand ranges. Multiplication and power use their own
product-width rule; masks and shifts retain explicit bit width. The minimum
arithmetic width gives byte coordinate subtraction a useful signed range:

```lanternfly
dx = ABS(PlayerX - EnemyX)
```

If `PlayerX` is 2 and `EnemyX` is 250, the subtraction is -248. It does not
first wrap to 8.

A later assignment to byte storage narrows:

```lanternfly
EnemyY = EnemyY - FallSpeed
```

The subtraction occurs as `INTEGER`; storing into `EnemyY AS BYTE` keeps the
low eight bits. This preserves Skyfall's wrap without corrupting every byte
expression.

That pair of rules is chosen:

1. byte-only additive, division and comparison operations use at least
   `INTEGER`;
2. assignment to a narrower integer uses defined two's-complement truncation.

A compiler should warn when an implicit narrowing is not provably in range.
The warning can be suppressed by making intent explicit:

```lanternfly
EnemyY = BYTE(EnemyY - FallSpeed)
```

The conversion does not change the result. It documents that wrapping is
intended.

## Finding a common type

For `+`, `-`, comparison, division and remainder, the compiler finds a common
type from the original operand ranges, with a minimum arithmetic width of 16
bits.

The rule is range-based:

1. let an exact literal adopt the other operand's type if it fits;
2. choose the smallest supported type at least 16 bits wide whose range
   contains both operand types;
3. require an explicit conversion when no supported type contains both.

Examples:

| Operands          | Common type                  |
| ----------------- | ---------------------------- |
| `BYTE`, `BYTE`    | `INTEGER`                    |
| `SBYTE`, `BYTE`   | `INTEGER`                    |
| `INTEGER`, `BYTE` | `INTEGER`                    |
| `WORD`, `BYTE`    | `WORD`                       |
| `INTEGER`, `WORD` | `LONG`                       |
| `LONG`, `WORD`    | `LONG`                       |
| `LONG`, `DWORD`   | explicit conversion required |

This avoids the particularly dangerous rule that a signed/unsigned mixture
silently becomes unsigned at the same width.

## Multiplication

Multiplication selects its type from the effective operand types before narrow
arithmetic promotion:

| Effective operands                | Product type                                         |
| --------------------------------- | ---------------------------------------------------- |
| both at most 8-bit and unsigned   | `WORD`                                               |
| both at most 8-bit, either signed | `INTEGER`                                            |
| either 16-bit, both unsigned      | `DWORD`                                              |
| either 16-bit, either signed      | `LONG`                                               |
| a 32-bit operand                  | compatible common 32-bit type, with defined wrapping |

This rule makes `row * stride` useful without a cast and makes 32-bit integers
earn their place in the initial model. A backend may still strength-reduce a
constant multiplication.

An exact literal first adopts the other operand's type when it fits. A
`LONG`/`DWORD` mixture still requires an explicit conversion because neither
range contains the other.

Multiplication that has reached 32 bits wraps in its result type. A
future checked family can report overflow without changing the ordinary
operators.

## Division and remainder

`/` is integer division. `MOD` is the matching remainder.

For signed types:

- quotient truncates toward zero;
- remainder has the sign of the dividend;
- `a = (a / b) * b + (a MOD b)` when `b` is nonzero.

For unsigned types, both operations are unsigned.

A constant zero divisor is a compile error. A runtime zero divisor invokes the
target's arithmetic fault hook. The default bare-metal hook stops execution in
a diagnosable target-defined manner. A host backend may raise its ordinary
runtime error only if the Lanternfly runner maps that error back to the source.

The overflow case `minimumSigned / -1` wraps to `minimumSigned` in the ordinary
operator family. A checked library routine may reject it later.

## Power and square root

Power is written with `^`:

```lanternfly
areaScale = base ^ exponent
```

`XOR` is a word, so the caret is unambiguous. The exponent must be a
non-negative integer. The result type follows multiplication's product model
for the base and then remains fixed for repeated products; overflow wraps in
that type.

A constant negative exponent is a compile error. A negative exponent reached
at runtime invokes the arithmetic fault hook. Fractional reciprocals do not
belong to the integer operator.

The visible `POW(base, exponent)` standard function is equivalent and useful
where a function value is easier to pass or document. A backend may lower
either form to the same helper.

Integer square root is a standard function:

```lanternfly
root = ISQRT(value)
```

It accepts a non-negative integer and returns the floor of the mathematical
square root. `SQRT` is reserved for a possible floating-point family so source
does not change meaning when float support arrives.

A constant negative input is a compile error. A negative input reached at
runtime invokes the arithmetic fault hook.

Neither power nor square root is assumed to be a machine instruction. Used
helpers are linked; unused helpers cost nothing.

## Overflow and narrowing

Ordinary fixed-width arithmetic wraps modulo `2^width`. Signed results are
interpreted from the resulting two's-complement bit pattern.

Compile-time expressions follow the same rule only after a result type is
known. An untyped constant is kept exact so that:

```lanternfly
CONST TableBytes = 24 * 32
```

does not overflow merely because `INTEGER` is the default runtime type.

There are three conversion situations:

- **widening** preserves the value and is implicit;
- **runtime narrowing** keeps the low bits and may warn;
- **constant narrowing** must fit unless an explicit conversion requests
  truncation.

This distinction removes a common foot gun while preserving low-level control.

## Comparisons and canonical truth

Lanternfly has:

```text
=  <>  <  <=  >  >=
```

Operands first convert to their common type. Signed or unsigned comparison
then follows that type.

A comparison returns canonical numeric truth in the common comparison type:

- false is zero;
- true has every bit set.

Thus an integer comparison yields `0` or `-1`, and a long comparison yields
`0` or `-1L`. Narrow operands promote to `INTEGER`, so `BYTE < BYTE` also
returns `INTEGER`.

Conditions accept any integer. Zero is false; every nonzero bit pattern is
true.

Lanternfly does not need a separately stored `BOOLEAN` type in its first version.
Programs may define named byte state such as `Alive AS BYTE`. A future Boolean
type would have to interoperate with this numeric model and is not currently
justified.

## One Boolean and bitwise operator family

`AND`, `OR`, `XOR` and `NOT` operate on complete fixed-width bit patterns.
They do not apply arithmetic's narrow promotion. Binary operands must have the
same type after a literal has adopted its context; otherwise an explicit
conversion states the desired width and signedness. `NOT` retains its operand
type.

These operators also combine canonical truth values:

```lanternfly
IF Alive AND NOT Paused THEN
    TickGame()
END IF

masked = flags AND VISIBLE_MASK
flags = flags OR DIRTY_MASK
```

There is no second `&&`/`||` family. This follows classic integer BASIC and
keeps binary work grammatical.

The consequence is deliberate: `NOT` is complement, not a conversion to
Boolean. If `value` is 2, `NOT value` is not zero. Write `value = 0` when that
is the intended test.

This means `NOT BYTE(0)` is `BYTE($FF)`, while `NOT INTEGER(0)` is `-1`.

`AND` and `OR` evaluate both operands. They do not short-circuit. The initial
language also excludes side-effecting calls inside expressions, so this rule
is usually unobservable. If expression calls are later admitted, eager
evaluation remains the default; an explicit conditional expresses guarded
effects.

## Shifts

`SHL` and `SHR` shift the left operand by the right operand. They retain the
left operand's type and do not apply arithmetic's narrow promotion:

```lanternfly
mask = 1 SHL row
screenY = packed SHR 3
```

`SHR` zero-fills an unsigned left operand and sign-extends a signed one. A
future `USHR` is unnecessary while an explicit unsigned conversion can state
the same intent.

For a shift count greater than or equal to the width:

- `SHL` returns zero;
- unsigned `SHR` returns zero;
- signed `SHR` returns zero or all ones according to the sign.

Negative shift counts are errors. Defining overshifts avoids inheriting C's
undefined behaviour or a CPU's masked count.

## Operator precedence

From highest to lowest:

1. parentheses, indexing, field selection and calls;
2. `^`;
3. unary `+`, unary `-`, `NOT`;
4. `*`, `/`, `MOD`;
5. `+`, `-`;
6. `SHL`, `SHR`;
7. comparisons;
8. `AND`;
9. `XOR`;
10. `OR`.

Power is right-associative. Following BASIC convention, `-2 ^ 2` means
`-(2 ^ 2)`; use `(-2) ^ 2` for a positive four.

Comparison chaining is not allowed. Write:

```lanternfly
IF 0 <= x AND x < width THEN
```

rather than `0 <= x < width`.

## Expression purity

The first expression grammar contains:

- literals and constants;
- scalar loads;
- indexed and field loads;
- pure conversions;
- pure operators;
- pure standard functions explicitly marked as such.

Procedures and platform calls are statements. A later function system may
allow pure user calls in expressions, but it must define evaluation order and
cost before doing so.

This restriction is small in the corpus. The games already stage random bytes
and service results into temporaries when reuse matters. It also makes
generated assembly easier to inspect.

## The numeric conformance set

Every backend must pass at least these cases:

| Case                       | Required result                 |
| -------------------------- | ------------------------------- |
| `BYTE(2 - 5)`              | 253                             |
| `ABS(BYTE(2) - BYTE(250))` | 248                             |
| `SBYTE($FD)`               | -3                              |
| `WORD(65535) + BYTE(1)`    | 0 as wrapping `WORD`            |
| `INTEGER(-7) / 3`          | -2                              |
| `INTEGER(-7) MOD 3`        | -1                              |
| `NOT BYTE(0)`              | 255                             |
| `BYTE(1) < BYTE(2)`        | -1 as `INTEGER` after promotion |
| `BYTE(255) * BYTE(255)`    | 65025 as `WORD`                 |
| `WORD($8000) > INTEGER(1)` | true after promotion to `LONG`  |

These are language tests, not Z80 tests. The C and BASIC backends must not
inherit different host-language answers.
