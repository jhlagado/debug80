# Lanternfly working language specification

Edition: design draft 0.2
Implementation status: no compiler exists
Normative status: working contract for a prototype

This specification defines the source meaning selected by the design study.
It distinguishes mandatory semantics from syntax or facilities that remain
provisional. The design book gives rationale and examples; this file gives
rules.

## 1. Scope

Lanternfly is a statically typed imperative language with:

- fixed-width integers;
- exact static arrays and records;
- typed references to existing storage;
- BASIC-style expressions and structured control;
- procedures and scalar/reference-returning functions;
- target-independent standard services;
- explicit native and host boundaries.

Lanternfly does not define:

- reactive scheduling;
- display, input or sound statements;
- a heap;
- aggregate automatic allocation;
- implicit aggregate copying;
- exceptions;
- line numbers;
- CPU registers or instructions.

Glimmer may host a Lanternfly body, but Lanternfly has no Glimmer-specific semantics.

## 2. Conformance language

**Must** states a semantic requirement.

**Should** states a strong toolchain recommendation whose absence does not
change program results.

**Provisional** marks source spelling or policy that may change before the
first implemented edition.

**Deferred** marks a facility not accepted in the first implemented edition.

## 3. Source text

### 3.1 Characters

Source is Unicode text. Keywords and identifiers use the ASCII subset in the
first implementation. Strings and comments may contain Unicode subject to
file encoding.

Source files must be UTF-8.

### 3.2 Lines and separators

A newline ends a statement except:

- inside parentheses;
- inside brackets;
- after a comma in a continued argument or initializer list;
- where the grammar requires more tokens to complete a declaration.

Colon is not a general statement separator. It terminates a label declaration
only.

Semicolon statement separation is not supported.

### 3.3 Comments

Provisional: `REM` begins a comment outside a character or string literal:

```lanternfly
Score = Score + 10  REM path point
```

Comments have no semantic effect.

### 3.4 Case

Provisional: keywords and identifiers compare case-insensitively. Tools must
preserve declaration spelling for source display. Two declarations differing
only in case conflict.

String and character contents remain case-sensitive.

### 3.5 Identifiers

An identifier begins with an ASCII letter or underscore and continues with
ASCII letters, digits or underscores.

Names beginning with two underscores are reserved to the implementation.

Keywords may not be used as identifiers.

Provisional grammar:

```text
identifier ::= letter (letter | digit | "_")*
```

### 3.6 Labels

A label is an identifier followed by `:`.

Labels and `GOTO` are reserved but not enabled in the first implementation.
Line numbers are never labels.

## 4. Lexical values

### 4.1 Integer literals

```text
decimal ::= digit+
hex     ::= "$" hex-digit+
binary  ::= "%" ("0" | "1")+
```

Underscores between digits may be accepted for readability but are
provisional.

An integer literal has an exact compile-time value until context assigns a
type.

### 4.2 Character literals

A character literal uses single quotes and denotes one byte:

```lanternfly
'A'
```

The first implementation accepts ASCII characters and the escapes `\0`, `\n`,
`\r`, `\t`, `\'` and `\\`. The value type is `BYTE`.

Characters outside the target execution encoding require an explicit encoding
service and are not single-byte literals.

### 4.3 String literals

String literal syntax is reserved:

```lanternfly
"READY"
```

The first implementation may admit strings only in static byte-array
initializers and target interfaces. A general runtime string type is deferred.

## 5. Names and declarations

### 5.1 Declaration before use

A source unit is whole-unit resolved. A declaration may be referenced before
its textual position if no initialization-order ambiguity results.

Local variables and aliases are visible from their declaration to the end of
their lexical block. They must be declared before use.

### 5.2 Constants

```lanternfly
CONST BOARD_SIZE = 8
CONST FULL_ROW AS BYTE = $FF
```

A constant expression is evaluated at compile time. An optional type constrains
and records its value.

An untyped constant retains an exact integer value until used.

### 5.3 Static storage

```lanternfly
DIM Score AS WORD
DIM Board[8] AS BYTE
DIM Grid[24, 32] AS BYTE
```

At module scope, `DIM` allocates static storage.

The bracket expressions are positive compile-time element counts. A dimension
of zero is not accepted in the first implementation.

### 5.4 Local storage

Inside a routine or hosted body:

```lanternfly
DIM candidate AS INTEGER
DIM oldRotation AS BYTE = CurRotation
```

Only scalar and reference locals may own automatic storage.

Aggregate local storage declarations are invalid. Use `ALIAS` or a reference
to static/imported storage.

A local without an initializer is uninitialized. Reading it before a definite
assignment is a compile error.

### 5.5 Static initialization

Static scalar initializers are constant expressions:

```lanternfly
DIM Lives AS BYTE = 3
```

Array and record initializers use parentheses:

```lanternfly
DIM Scores[5] AS WORD = (0, 100, 300, 500, 800)
DIM Origin AS Point = (0, 0)
```

Nested initializers follow shape. Too few or too many elements are errors.

Uninitialized static storage has all bits zero.

### 5.6 Imports

The source form of external interface files remains provisional. Semantically,
an import declares:

- name;
- type or callable signature;
- mutability;
- address class/space;
- effects for a callable;
- target capability;
- substrate implementation binding.

An imported name behaves like an ordinary compatible Lanternfly declaration.

## 6. Types

### 6.1 Integer types

| Type      | Signed | Width |     Minimum |    Maximum |
| --------- | ------ | ----: | ----------: | ---------: |
| `BYTE`    | no     |     8 |           0 |        255 |
| `SBYTE`   | yes    |     8 |        -128 |        127 |
| `INTEGER` | yes    |    16 |      -32768 |      32767 |
| `WORD`    | no     |    16 |           0 |      65535 |
| `LONG`    | yes    |    32 | -2147483648 | 2147483647 |
| `DWORD`   | no     |    32 |           0 | 4294967295 |

All use two's-complement bit representations.

Widths and ranges are invariant across targets.

### 6.2 Default integer

`INTEGER` is the default unconstrained runtime integer type.

An exact literal or constant adopts the required context type if representable.
Without context it uses `INTEGER` if representable, otherwise `LONG` if
representable. Larger values require a `DWORD` context or explicit conversion.

### 6.3 Floating point

No floating type exists in the first edition.

`FLOAT32` is reserved for a possible optional target capability. It will
require a separate semantic specification before use.

### 6.4 Records

```lanternfly
TYPE Point
    x AS INTEGER
    y AS INTEGER
END TYPE
```

A record:

- has at least one field;
- lays fields out in declaration order;
- requires unique field names;
- may contain scalar, record, fixed array and reference fields;
- may not contain itself by value;
- may refer to another type through a reference.

### 6.5 Arrays

An array has:

- fixed rank;
- fixed positive count in each dimension;
- one element type;
- zero-based indexes;
- row-major layout.

An array is an aggregate storage type, not a freely copied value.

### 6.6 Type identity

Integer built-ins use structural identity by named type.

Record types are nominal: two separately declared records with identical fields
are different types.

Array types are structural over element type, rank and counts.

Reference compatibility includes referent type and address class.

### 6.7 Exact size

```text
SIZEOF(BYTE)    = 1
SIZEOF(SBYTE)   = 1
SIZEOF(INTEGER) = 2
SIZEOF(WORD)    = 2
SIZEOF(LONG)    = 4
SIZEOF(DWORD)   = 4
SIZEOF(T[n])    = n * SIZEOF(T)
SIZEOF(T[a,b])  = a * b * SIZEOF(T)
SIZEOF(record)  = sum of field sizes
```

Field offset is the sum of preceding exact field sizes.

No implicit padding or alignment is present.

The target byte order determines the in-memory order of multi-byte scalar
fields. The initial Z80, 6502 and 8086 profiles are little-endian.

### 6.8 `SIZEOF`, `OFFSET` and `COUNT`

`SIZEOF(type-or-object)` is a compile-time byte count.

`OFFSET(recordType, fieldPath)` is a compile-time byte offset.

`COUNT(array)` gives the first dimension count.
`COUNT(array, dimension)` gives a selected dimension using zero-based
dimension numbering.

All three are compile-time operations.

### 6.9 Near and far address values

Lanternfly also has opaque `NEAR ADDRESS` and `FAR ADDRESS` scalar types.

An address identifies a location but carries no referent shape. A typed
reference is an address capability plus a referent type and mutability.

Address representation size is declared by the target:

- initial Z80 `NEAR ADDRESS` is 16 bits;
- TEC-1G `FAR ADDRESS` may be bank plus 16-bit offset;
- 8086 `FAR ADDRESS` may be segment plus offset;
- a flat target may use the same representation for both.

Address values support compatible equality and inequality. They do not support
ordinary integer arithmetic or dereference. Target interfaces may define
bounded offset operations.

Explicit `ADDRESS(reference)` may discard referent shape while retaining its
address class. Constructing a typed reference from an unshaped address is a
native/interface operation and is not an ordinary conversion.

A record containing an address has a target-dependent exact size. Such a
record is portable only among targets with a compatible address-layout
contract.

## 7. Aliases and references

### 7.1 Static alias

```lanternfly
ALIAS EnemyState = Monsters[0].state
```

At module scope, the right side must denote a link-time constant storage path.
The alias owns no storage and denotes the same object or subobject.

### 7.2 Local alias

```lanternfly
ALIAS plane = BoardPlanes[planeIndex]
```

A local alias:

- evaluates and binds its initializer when the declaration executes;
- accepts an aggregate storage path or a reference-valued expression; a
  reference initializer binds the referent rather than the storage cell that
  happened to contain the reference;
- infers the selected aggregate or scalar storage type;
- cannot be rebound;
- permits mutation of mutable storage through the bound path;
- does not copy or allocate aggregate storage;
- has block lifetime.

The backend may allocate an address-sized temporary to retain a dynamic
binding.

### 7.3 References

Reference types are:

```text
REF TO T
NEAR REF TO T
FAR REF TO T
```

`T` may be any storable non-void type. Provisional: an unqualified `REF TO T`
is inferred from the object in local
contexts. Public/static layout declarations must resolve it to a target-valid
class.

Reference formation:

```lanternfly
REF objectOrSubobject
```

A reference:

- is a scalar value;
- locates existing storage;
- carries its referent type;
- does not own storage;
- is non-null in the first edition;
- supports equality/inequality with a compatible reference;
- supports field/index access through the referent;
- does not support general integer arithmetic.

The first edition permits reference formation from static/imported storage and
from subobjects reached through an existing reference. Forming a storable or
returnable reference to an owned scalar local is deferred; this avoids dangling
references without adding escape analysis.

### 7.4 Reference assignment

Reference assignment changes the reference value:

```lanternfly
current = REF Monsters[index]
```

It does not copy the referent.

### 7.5 Near and far

A near reference is directly usable in the current memory context.

A far reference can identify storage in another target-defined context.

Near-to-far widening is permitted when the target can attach a known context.

Far-to-near conversion is explicit and must be proven or checked by the target
profile. It may not silently discard context bits.

An ordinary object must fit wholly within one context. Bank-spanning arrays are
deferred.

### 7.6 Address spaces

A target may declare a nominal opaque address space:

```text
ADDRESS SPACE VRAM USING WORD
```

`VRAM ADDRESS` is distinct from integers and CPU references. It may support
equality and bounded integer offset operations defined by the space. It may be
passed to compatible services.

It cannot be dereferenced through ordinary Lanternfly array/field syntax unless the
target explicitly declares the address space as CPU-mapped.

### 7.7 Null and optional references

Nullable references and `NO REF` are deferred.

Zero is not a reference literal.

## 8. Values, storage paths and assignment

### 8.1 Scalar value context

A scalar name or scalar field/index path produces its stored value in an
expression:

```lanternfly
score + Scores[index]
monster.timer
```

### 8.2 Aggregate path context

An array or record path denotes storage. It may be:

- indexed or field-selected further;
- bound by `ALIAS`;
- used with `REF`;
- passed to a compatible aggregate-reference parameter;
- passed to an aggregate standard procedure.

It is not implicitly copied into a value.

### 8.3 Assignment

```lanternfly
destination = expression
```

The left side must be mutable scalar storage or a mutable reference variable.

`=` in statement position is assignment. `=` inside an expression is equality.
Grammar context disambiguates them.

Aggregate assignment is not supported in the first edition.

### 8.4 Narrowing

Assigning an integer value to a narrower integer type keeps the low `N` bits,
where `N` is destination width. Signed destinations interpret that bit pattern
as two's complement.

Runtime narrowing is legal and should warn unless:

- range analysis proves the value fits;
- an explicit destination-type conversion states intent;
- target configuration disables the warning.

A constant initializer must fit unless an explicit conversion requests
truncation.

### 8.5 Mutability

Constants and immutable imported resources cannot be assigned.

Mutability follows a reference or alias to the referenced object. A reference
variable may be mutable while pointing to immutable storage; in that case the
reference can change but storage cannot be written through it.

Read-only reference syntax is deferred; interfaces must still record
mutability.

## 9. Expressions

### 9.1 Initial expression terms

Expressions contain:

- integer and character literals;
- constants;
- scalar storage reads;
- field and index paths ending in a scalar;
- parentheses;
- explicit conversions;
- unary and binary operators;
- pure standard/imported function calls.

Side-effecting procedure calls are statements.

### 9.2 Operators

```text
unary:      +  -  NOT
power:      ^
multiply:   *  /  MOD
additive:   +  -
shift:      SHL  SHR
compare:    =  <>  <  <=  >  >=
binary:     AND  XOR  OR
```

### 9.3 Precedence

Highest to lowest:

1. calls, indexing, fields, parentheses;
2. `^`;
3. unary `+`, unary `-`, `NOT`;
4. `*`, `/`, `MOD`;
5. `+`, `-`;
6. `SHL`, `SHR`;
7. comparisons;
8. `AND`;
9. `XOR`;
10. `OR`.

Binary operators other than `^` are left-associative. Power is
right-associative.

Comparison chaining is invalid.

### 9.4 Minimum arithmetic width

Addition, subtraction, division, remainder and comparison never evaluate below
16 bits. Their common type is selected from the original operand ranges under
9.5.

Multiplication and power use product-width rules. Binary mask operations and
shifts use the rules in 9.10 and 9.12.

### 9.5 Common type

For the operations covered by 9.4:

1. an exact literal adopts the other operand's type if representable;
2. select the smallest supported integer type at least 16 bits wide whose
   range contains both operand type ranges;
3. if none exists, require an explicit conversion.

Examples:

```text
BYTE + BYTE       -> INTEGER
INTEGER + BYTE    -> INTEGER
WORD + BYTE       -> WORD
INTEGER + WORD    -> LONG
LONG + DWORD      -> explicit conversion required
```

### 9.6 Addition and subtraction

`+` and `-` use the common type and produce that type. The result wraps modulo
the result width.

### 9.7 Multiplication

Multiplication selects a product type from effective operand types before
narrow arithmetic promotion. An exact literal first adopts the other operand's
type when representable:

```text
both at most 8-bit and unsigned  -> WORD
both at most 8-bit, either signed -> INTEGER
either 16-bit, both unsigned      -> DWORD
either 16-bit, either signed      -> LONG
any 32-bit operand                -> compatible common 32-bit type
```

If `LONG` and `DWORD` cannot find a common 32-bit type, an explicit conversion
is required.

The result wraps at its selected width.

### 9.8 Division and remainder

`/` performs integer division.

Signed division truncates toward zero. `MOD` has the sign of the dividend.

Unsigned division and remainder operate on unsigned magnitudes.

Division by constant zero is a compile error. Runtime zero invokes the target's
arithmetic fault hook.

`minimumSigned / -1` wraps to `minimumSigned` in ordinary arithmetic.

### 9.9 Power

`base ^ exponent` is integer power. Exponent must be non-negative.

The result type is selected as for multiplication of the base type and remains
fixed during exponentiation. Repeated products wrap in that type.

`x ^ 0` is 1 converted to the result type, including when `x` is zero.

A constant negative exponent is a compile error. A runtime negative exponent
invokes the target's arithmetic fault hook.

### 9.10 Shifts

The left operand retains its declared expression type; shifts do not apply
narrow arithmetic promotion. The right operand is converted to a non-negative
integer shift count.

`SHL` shifts in zero.

`SHR` shifts in zero for unsigned values and sign bits for signed values.

For count greater than or equal to width:

- `SHL` returns zero;
- unsigned `SHR` returns zero;
- signed `SHR` returns zero for non-negative input and all ones for negative
  input.

Negative counts are compile/runtime arithmetic faults as applicable.

### 9.11 Comparison

Operands convert to their common type. Comparison uses that type's signedness.

The result type is the common comparison type. False is zero. True has every
bit in the result type set.

Because narrow integers promote, `BYTE < BYTE` returns an `INTEGER` truth
value, 0 or -1.

Reference equality is permitted only between compatible references and yields
`INTEGER` truth.

Ordering comparisons on references or opaque addresses are invalid unless an
address-space contract explicitly provides ordering.

### 9.12 Binary and Boolean operations

`AND`, `OR`, `XOR` and `NOT` operate bitwise on the full operand width.

They do not apply arithmetic's narrow promotion. Binary operands must have the
same type after contextual typing of literals. Mixed-width or mixed-signedness
operands require an explicit conversion. `NOT` retains its operand type.

They also combine canonical truth values. No separate short-circuit operator
family exists.

Both operands of `AND`, `OR` and `XOR` are evaluated. Initial expressions are
pure, so evaluation has no side-effect ordering.

### 9.13 Numeric conditions

Zero is false. Any nonzero integer is true.

No Boolean type is required.

### 9.14 Conversions

Explicit integer conversion uses the target type as a function:

```lanternfly
BYTE(value)
LONG(value)
```

Widening preserves value.

Narrowing keeps low bits.

Same-width signed/unsigned conversion preserves bits and changes
interpretation.

Reference/address conversions use separately specified reference forms and
cannot use integer conversion syntax.

### 9.15 Evaluation order

Call arguments are evaluated left to right.

No other initial expression form contains side effects. A later edition that
admits side-effecting expression calls must retain this order.

## 10. Indexed and field access

### 10.1 Index type

An index must be an integer. It is converted to an address-calculation type
wide enough for:

```text
index * exactStride + base + fieldOffset
```

The calculation must not truncate to the index storage width.

### 10.2 Bounds

Valid indexes are 0 through count minus one in each dimension.

Constant out-of-range indexes are compile errors.

The checked execution mode invokes the target's bounds fault for a dynamic
out-of-range index. A target may also offer an explicitly selected unchecked
release mode. In that mode the program must keep every dynamic index in range;
an out-of-range execution has no portable result.

The compiler may remove a check whenever range analysis proves the index valid.

### 10.3 Multiple dimensions

Canonical source:

```lanternfly
Grid[row, column]
```

Provisional equivalent:

```lanternfly
Grid[row][column]
```

Both denote row-major access and have identical type.

The language permits more than one runtime-varying index. A backend may stage
the address calculation. An early backend that lacks support must report a
capability diagnostic and may suggest a row alias.

### 10.4 Reference traversal

Field and index syntax transparently traverses a typed reference:

```lanternfly
monster.timer
plane[row]
```

No separate dereference operator is used.

## 11. Statements and blocks

### 11.1 Block scope

`IF`, loop, selection and routine bodies introduce lexical blocks.

Local declarations are permitted at the start of a block before executable
statements. Provisional: declarations after an executable statement in the
same block are invalid.

### 11.2 Empty blocks

Empty hosted bodies and routines are legal.

Provisional: an empty branch within `IF` or `CASE` must contain `PASS` to make
intent explicit.

### 11.3 Conditional

```lanternfly
IF condition THEN
    statements
ELSEIF condition THEN
    statements
ELSE
    statements
END IF
```

Conditions are evaluated in order. At most one branch executes.

The one-line form:

```lanternfly
IF condition THEN simpleStatement
```

contains no `ELSE` and ends at newline.

### 11.4 Selection

```lanternfly
SELECT CASE expression
CASE constantListOrRange
    statements
CASE ELSE
    statements
END SELECT
```

The selector evaluates once.

Case values are compatible compile-time constants. Cases may list constants
and constant inclusive ranges. Cases must not overlap.

There is no fall-through. `CASE ELSE` is optional and last.

### 11.5 Counted loop

```lanternfly
FOR variable = start TO limit
    statements
NEXT variable
```

or:

```lanternfly
FOR variable = start TO limit STEP step
    statements
NEXT variable
```

`start`, `limit`, then `step` evaluate once.

Step defaults to 1 and may not be zero.

Positive step continues while variable is less than or equal to limit.
Negative step continues while variable is greater than or equal to limit.

Termination uses the mathematical next control value before narrowing, so a
descending unsigned loop terminates correctly at zero.

The loop control variable may be predeclared or provisionally declared in the
header:

```lanternfly
FOR row AS INTEGER = 0 TO 7
```

The body must not assign the control variable. `NEXT` must name the same
variable.

### 11.6 Pre-test loop

```lanternfly
WHILE condition
    statements
END WHILE
```

The condition is tested before each iteration.

### 11.7 Post-test loop

```lanternfly
DO
    statements
LOOP WHILE condition
```

or:

```lanternfly
DO
    statements
LOOP UNTIL condition
```

The body executes at least once.

### 11.8 Loop exit and continuation

```text
EXIT FOR
CONTINUE FOR
EXIT WHILE
CONTINUE WHILE
EXIT DO
CONTINUE DO
```

The named loop kind must match an enclosing loop. The nearest matching loop is
affected.

### 11.9 Procedure call

```lanternfly
ProcedureName(argumentList)
```

A procedure call is a statement.

### 11.10 Hosted body exit

```lanternfly
EXIT BODY
```

This transfers to the host-provided body epilogue. It must not bypass host
updates or cleanup.

It is valid only in a hosted body.

### 11.11 `PASS`

Provisional:

```lanternfly
PASS
```

has no effect and documents an intentionally empty branch.

## 12. Routines

### 12.1 Procedure

```lanternfly
SUB name(parameters)
    declarations
    statements
END SUB
```

A procedure has no result value.

### 12.2 Function

```lanternfly
FUNCTION name(parameters) AS resultType
    declarations
    statements
    RETURN expression
END FUNCTION
```

The result type must be scalar or a reference in the first edition.

### 12.3 Parameters

```lanternfly
name AS scalarType
name AS REF TO T
name AS NEAR REF TO T
name AS FAR REF TO T
```

Non-reference scalar parameters pass values. A reference parameter passes
access to existing scalar or aggregate storage.

Aggregate parameters must be references and pass access to existing storage.

Reference mutability is determined by the imported/type contract. Read-only
surface syntax remains provisional.

### 12.4 Results

`RETURN expression` converts expression to the declared result type and exits
through the routine epilogue.

Every reachable function path must return a value.

A procedure uses:

```lanternfly
EXIT SUB
```

or falls through `END SUB`.

A function may use `RETURN` early. `EXIT FUNCTION` without a value is invalid.

### 12.5 Local lifetime

Scalar/reference locals exist separately for each active call under a
recursive/reentrant profile.

A non-recursive target profile may use static allocation if observable
semantics remain the same and reentrant calls are rejected.

Aggregate aliases bind existing storage and never allocate aggregate call-local
memory.

### 12.6 Recursion

The language model does not inherently forbid recursion.

Initial bare-metal profiles may declare `recursion: unsupported`. The compiler
must reject direct and indirect call cycles for such targets.

### 12.7 Call ordering

Arguments evaluate left to right, are converted/staged, then the call occurs.

Calls and visible stores execute in source order.

### 12.8 Overloading and advanced calls

Overloading, defaults, named arguments, variable arguments, closures, nested
routines, aggregate returns and indirect calls are deferred.

## 13. Standard operations

### 13.1 Required scalar functions

The first standard library specifies:

```text
ABS
MIN
MAX
CLAMP
SGN
ISQRT
POW
BITCOUNT
```

They are pure.

`ISQRT` accepts non-negative integer input and returns floor square root.

A constant negative `ISQRT` input is a compile error. A runtime negative input
invokes the target's arithmetic fault hook.

`POW` is equivalent to `^`.

`ABS` widens where the signed minimum cannot fit:

```text
ABS(SBYTE)   -> INTEGER
ABS(INTEGER) -> LONG
ABS(LONG)    -> DWORD
```

Unsigned `ABS` is identity.

### 13.2 Required aggregate procedures

```text
FILL(target, scalar)
CLEAR(target)
COPY(target, source)
MOVE(target, source)
```

`FILL` requires an array target and compatible scalar element.

`CLEAR` writes the all-zero representation and is valid only when all fields
permit it.

`COPY` requires identical exact size and no overlap.

`MOVE` requires identical exact size and permits overlap.

### 13.3 Runtime implementation

A backend may implement a core or standard operation as:

- native instruction;
- generated inline sequence;
- runtime helper;
- substrate built-in.

This choice does not change source semantics.

Only used helpers should be linked.

## 14. Native and platform boundary

### 14.1 Platform services

Input, display, sound, random, firmware and device functions are imports with
typed signatures. They are not core statements.

### 14.2 Native implementation

A native import binds a Lanternfly signature to a target/substrate symbol and ABI.

The interface must describe source-visible effects and whether control
returns. Substrate-specific contracts may additionally describe registers,
flags, stack and mapping state.

### 14.3 Inline native block

Inline native source is explicitly target-qualified.

Unless annotated otherwise it:

- may read/write all visible mutable storage;
- may perform I/O;
- is a scheduling/optimisation barrier;
- must fall through.

A native block in a hosted body may not bypass the host epilogue.

### 14.4 Missing implementation

Compiling a native import/block for a target with no matching implementation is
an error.

## 15. Hosted bodies

### 15.1 Host manifest

A host supplies a typed manifest of visible storage, resources, constants,
services and target capability.

Lanternfly does not infer this contract from substrate text.

### 15.2 No host-specific words

Imported host state is ordinary storage. Imported host services are ordinary
calls. Host scheduling and change tracking occur outside Lanternfly.

### 15.3 Completion

Normal fall-through and `EXIT BODY` both reach the host epilogue.

A body-level machine return is invalid.

### 15.4 Summary

The Lanternfly compiler returns:

- storage reads/writes;
- calls and effects;
- helpers/imports;
- early/no-return control;
- generated fragment;
- explicit source mapping;
- optional cost information.

## 16. Modules and source units

The concrete file/module syntax is provisional.

The semantic requirements are:

- stable source-unit identity;
- private declarations by default;
- explicit exports;
- typed imports;
- no textual name capture;
- deterministic initialization order;
- target-independent core modules;
- target-specific implementation alternatives.

A Lanternfly source file extension is not selected.

## 17. Target contract

A target profile declares:

- CPU/substrate identity;
- platform identity;
- endianness;
- scalar support;
- maximum object and program sizes;
- near/far representation;
- address spaces;
- default routine ABI;
- recursion/reentrancy support;
- standard/runtime implementations;
- native dialect;
- debug and cost capability.

The compiler must reject an unsupported facility rather than silently alter
its meaning.

## 18. Diagnostics

### 18.1 Required compile-time errors

At minimum:

- unknown or duplicate name;
- incompatible assignment;
- invalid constant range;
- uninitialized local read;
- aggregate local allocation;
- implicit aggregate copy;
- invalid reference conversion;
- constant array bounds violation;
- invalid index type;
- zero constant divisor or loop step;
- negative constant shift;
- negative constant power exponent or `ISQRT` input;
- missing function return;
- overlapping selection cases;
- exit/continue without matching construct;
- return from hosted body;
- unsupported target capability;
- missing native implementation.

### 18.2 Warnings

Should include:

- runtime narrowing not proven safe;
- costly helper inside a known hot loop;
- large static object;
- near/far conversion with mapping cost;
- native block with conservative effects;
- unused declaration;
- unreachable code.

### 18.3 Source coordinates

Diagnostics must report original source file, line and column. Host-integrated
diagnostics also identify the containing body.

Backend/substrate diagnostics must retain generated-source context and map back
to the responsible Lanternfly node.

## 19. Debug and generated artifacts

A source-generating backend should emit:

- canonical generated substrate source;
- original-to-generated provenance;
- generated-to-machine map where applicable;
- typed symbol/layout data;
- helper/import list;
- optional cost report.

A single Lanternfly statement may map to multiple generated and machine ranges.
Mappings must represent that directly.

## 20. Cost visibility

Cost is not semantic.

A backend may classify or estimate:

- code bytes;
- cycles/range;
- helper calls;
- temporary storage;
- bank/segment switches;
- bounds-check overhead.

Reports must name target assumptions and confidence. Unknown is permitted.

## 21. Provisional grammar sketch

This grammar is sufficient to guide parser experiments. It does not override
the semantic sections.

```text
program          ::= top-item*

top-item         ::= const-decl
                   | type-decl
                   | dim-decl
                   | alias-decl
                   | sub-decl
                   | function-decl
                   | import-decl
                   | native-decl

const-decl       ::= "CONST" identifier ("AS" type-expr)? "=" const-expr

type-decl        ::= "TYPE" identifier newline
                     field-decl+
                     "END" "TYPE"

field-decl       ::= identifier "AS" type-expr newline

dim-decl         ::= "DIM" identifier dimensions? "AS" type-expr
                     ("=" initializer)?

dimensions       ::= "[" const-expr ("," const-expr)* "]"

alias-decl       ::= "ALIAS" identifier "=" storage-path

type-expr        ::= type-primary dimensions?
type-primary     ::= integer-type
                   | identifier
                   | reference-type
                   | address-type
                   | address-space-type

integer-type     ::= "BYTE" | "SBYTE" | "INTEGER"
                   | "WORD" | "LONG" | "DWORD"

reference-type   ::= ("NEAR" | "FAR")? "REF" "TO" type-expr
address-type     ::= ("NEAR" | "FAR") "ADDRESS"

sub-decl         ::= "SUB" identifier "(" params? ")" newline
                     block
                     "END" "SUB"

function-decl    ::= "FUNCTION" identifier "(" params? ")"
                     "AS" scalar-or-reference-type newline
                     block
                     "END" "FUNCTION"

params           ::= param ("," param)*
param            ::= identifier "AS" type-expr

block            ::= local-decl* statement*
local-decl       ::= dim-decl | alias-decl

statement        ::= assignment
                   | call-statement
                   | if-statement
                   | select-statement
                   | for-statement
                   | while-statement
                   | do-statement
                   | exit-statement
                   | continue-statement
                   | return-statement
                   | native-block
                   | "PASS"

assignment       ::= writable-path "=" expression
call-statement   ::= identifier "(" args? ")"

if-statement     ::= "IF" expression "THEN" newline block
                     ("ELSEIF" expression "THEN" newline block)*
                     ("ELSE" newline block)?
                     "END" "IF"

select-statement ::= "SELECT" "CASE" expression newline
                     case-clause+
                     ("CASE" "ELSE" newline block)?
                     "END" "SELECT"

for-statement    ::= "FOR" identifier ("AS" integer-type)?
                     "=" expression "TO" expression
                     ("STEP" expression)? newline
                     block
                     "NEXT" identifier

while-statement  ::= "WHILE" expression newline block "END" "WHILE"

do-statement     ::= "DO" newline block
                     "LOOP" ("WHILE" | "UNTIL") expression

exit-statement   ::= "EXIT" ("FOR" | "WHILE" | "DO" | "SUB" | "BODY")
continue-statement ::= "CONTINUE" ("FOR" | "WHILE" | "DO")
return-statement ::= "RETURN" expression

expression       ::= precedence-defined expression grammar
storage-path     ::= identifier path-segment*
path-segment     ::= "." identifier | "[" expression ("," expression)* "]"
writable-path    ::= storage-path

args             ::= expression-or-aggregate-path
                     ("," expression-or-aggregate-path)*
```

Storage declarations use the BASIC-like name-side count:

```lanternfly
DIM planeBytes[8] AS BYTE
```

The equivalent shape appears on the type inside a reference:

```lanternfly
DIM plane AS REF TO BYTE[8]
```

`BYTE[8]` is therefore a valid `type-expr`; the name-side spelling remains
canonical for owned `DIM` storage.

## 22. Minimum conformance programs

A conforming implementation must eventually pass:

1. Counter: byte state, arithmetic, comparison, narrowing.
2. Trail: runtime array update and record-array field store.
3. Skyfall numeric case: signed intermediate with byte wrap on assignment.
4. Rushlight numeric case: widened subtraction before `ABS`.
5. Snake: fixed ring, masks, selection, search loop.
6. Tetro collision: signed spawn y, reference indexing, early return.
7. Tetro collapse: array of references and local aggregate alias.
8. Pacmo: exact six-byte record and non-power-of-two runtime stride.
9. TMS9918: opaque device address passed to a service.
10. Hosted exit: `EXIT BODY` reaches Glimmer update epilogue.

The same semantic vectors must run across each claimed backend.

## 23. Deferred features

Not part of the first implemented edition:

- float;
- dynamic allocation;
- aggregate automatic locals;
- aggregate return/copy syntax;
- nullable references;
- bit fields;
- bank-spanning arrays;
- recursion on profiles that do not opt in;
- indirect calls;
- unrestricted `GOTO`;
- exception handling;
- generics;
- operator overloading;
- rich dynamic strings.

## 24. Remaining specification decisions

Only these points block a frozen syntax edition:

1. case sensitivity;
2. comment spelling;
3. import/module/export syntax;
4. read-only reference spelling;
5. one-line `IF` inclusion;
6. `PASS` inclusion;
7. identifier/file extension;
8. default warning severity for narrowing;
9. native declaration syntax.

Numeric meaning, exact layout, reference classes, aggregate allocation,
structured control, body exit and the core/library boundary are no longer open
at the design level.
