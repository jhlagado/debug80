# Lanternfly working language specification

Edition: design draft 0.3
Implementation status: no compiler exists
Normative status: working contract for a prototype

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

Address types remain part of the design. Their final spelling is still open.
The current readable candidates are:

```lanternfly
var screenBuffer as near address
var bankedImage as far address
```

or the single built-in names `nearAddress` and `farAddress`. Their physical
representations remain target-defined.

### 3.1 Integer arithmetic

Integer operations have target-independent widths and signedness. A backend
must not inherit the promotion rules of C, JavaScript, BASIC or its target CPU.

The first implementation uses these rules:

- an exact literal adopts the other operand's type when its value fits;
- arithmetic on two 8-bit operands of the same signedness calculates in the
  corresponding 16-bit type;
- arithmetic on matching 16-bit or matching 32-bit types retains that type;
- mixed signed and unsigned runtime operands require an explicit conversion;
- narrowing assignment keeps the low destination-width bits and should warn
  unless the source explicitly converts or range analysis proves it fits;
- overflow wraps in the selected result width.

The mixed-signedness rule prevents an ordinary `i16` and `u16` expression from
silently selecting 32-bit helper arithmetic:

```lanternfly
var signedValue as i16
var unsignedValue as u16

i32(signedValue) + i32(unsignedValue)
```

`signedValue + unsignedValue` is a compile error because neither signedness
contains the complete range of the other. The exact conversion spelling shown
above is provisional. The requirement for an explicit choice is normative.

`i32` and `u32` remain language types. They enter a program only when declared
or selected explicitly; smaller arithmetic does not promote into them merely
to reconcile signedness. A backend emits wide helpers only when the program
uses wide operations.

Multiplication follows the selected operand type. Eight-bit multiplication
produces the corresponding 16-bit type. A full-width 32-bit product from
16-bit inputs requires explicitly widening the inputs before multiplication.

Division truncates toward zero. `mod` satisfies:

```text
left = (left / right) * right + (left mod right)
```

Division or remainder by constant zero is a compile error. A runtime zero
divisor invokes the target arithmetic-fault service.

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

An aggregate `const` declares immutable static data:

```lanternfly
const movementCost as u8[4] = [1, 1, 2, 255]

const smallMap as u8[2, 4] = [
    [0, 0, 1, 1],
    [2, 2, 3, 3]
]
```

Constant arrays and records have exact ordinary layout and may be indexed,
passed by alias and exported. Assignment through any path to constant storage
is a compile error. A target may place constant aggregate data in ROM.

### 4.2 Variables

`var` declares storage:

```lanternfly
var score as u16 = 0
var lives as u8 = 3
var gameOver as boolean = false
```

`as` introduces the type. Lanternfly does not use `dim` or a colon for ordinary
type declarations.

Module-level variables own static storage. Static storage without an explicit
initializer begins with all bits zero.

Local scalar variables use the same syntax inside a routine:

```lanternfly
sub addScore(amount as u16)
    var previousScore as u16 = playerScore
    var nextScore as u16 = previousScore + amount

    playerScore = nextScore
end
```

The initial implementation may require local declarations before executable
statements and give them routine scope. Whether an omitted local initializer
means zero initialization or requires definite assignment remains open.

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
- a record cannot contain itself directly by value;
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

Constant out-of-range indices are compile errors. Runtime bounds checks are the
safe default, with proof-based removal by the compiler. The target mechanism
for reporting a failed check remains part of the runtime contract.

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

Collection assignment is rejected when:

- record types differ;
- array element types, ranks or dimensions differ;
- the destination is immutable;
- a future type is explicitly non-copyable.

## 8. Assignment and expressions

### 8.1 Assignment

`=` assigns when it forms an assignment statement:

```lanternfly
playerScore = playerScore + 10
player.position.x = player.position.x + 1
```

Assignment is not an expression. Chained assignment and compound forms such as
`+=` are absent from the initial language.

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

The present precedence direction, highest to lowest, is:

1. calls, indexing, field access and parentheses;
2. power and unary arithmetic;
3. multiplication, division and `mod`;
4. addition and subtraction;
5. `shl` and `shr`;
6. comparisons;
7. `not`;
8. `and`;
9. `xor`;
10. `or`.

Power precedence remains subject to parser examples.

### 8.5 Expression statements

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

The start, limit and step are evaluated once. A zero step is an error. The loop
variable is declared separately, avoiding hidden local storage.

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
`void` type.

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

The alias spelling is provisional. The current candidate is:

```lanternfly
ref actor as Actor = actors[selectedActor]
```

This keeps `var actor as Actor` available for owning static storage and makes a
local alias explicit.

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

The target-specific convention does not change Lanternfly source semantics.

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

1. loads the entry source;
2. resolves the import graph;
3. collects private and exported declarations;
4. type-checks the complete program;
5. allocates static storage;
6. lowers required routines, data and helpers;
7. produces one target program and its debug artifacts.

Address allocation and symbol resolution still occur inside the compiler.
Avoiding a separate linker does not remove those compiler responsibilities.

The source file extension remains open. `.lf` is illustrative only.

## 13. Runtime helpers and floating point

### 13.1 Runtime helpers

Lanternfly source states operations rather than the target instructions used to
perform them. A Z80 backend may select helpers for multiplication, division,
power, square root, wide arithmetic, collection copying, bounds checks and far
access. A C backend may express the same operations directly.

Helpers are linked or emitted only when used. Their presence is visible in
generated listings and cost reports.

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
and
as
at
case
const
continue
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
or
record
return
select
shl
shr
step
sub
then
to
true
var
volatile
while
xor
```

`ref`, `near`, `far` and `address` remain provisional type/reference words.

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
program             ::= top-item*

top-item            ::= import-decl
                      | export-decl
                      | declaration

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

type-expr           ::= scalar-type dimensions?
                      | type-name dimensions?
                      | reference-type
                      | address-type

dimensions          ::= "[" const-expr ("," const-expr)* "]"
storage-path        ::= value-name path-segment*
writable-path       ::= storage-path
path-segment        ::= "." value-name
                      | "[" expression ("," expression)* "]"
```

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
- zero initialization versus definite assignment for scalar locals;
- the spelling of local collection aliases and typed references;
- the final near/far address type syntax;
- case-insensitive identifier resolution after parser experiments;
- checked-array policy for release builds;
- exact power and unary precedence;
- whether `at` is sufficient or grows into a section-placement model;
- volatile imported-reference spelling;
- whether selection ranges belong in the first parser;
- module aliases, re-exports and the source file extension;
- comments;
- optional `float32` semantics and its target capability contract.

The first prototype should translate representative Glimmer bodies, Tetro and
Pacmo routines and AZM Book 3 algorithms before these choices are frozen.
