# Control flow and routines

Lanternfly control reads like structured pseudocode. Branch distances, flags
and generated labels belong to lowering.

## Executable statements

The first edition has:

- scalar and aggregate assignment;
- general expression statements, including calls whose results are discarded;
- `clear`, `fill` and `append`;
- `if`;
- `select`;
- `for ... to` and `for ... until`;
- `for each ... in`;
- `while`;
- loop-only `exit` and `continue`;
- routine or hosted-body `return`;
- `asm` blocks.

Local `var` and `alias` declarations appear before statements in a routine or
hosted body.
One-line conditionals, `do`, `repeat`, bare `loop`, `break`, `call`, general
`goto` and separate procedure/function declarations are absent.

## Conditional blocks

```lanternfly
if score >= target then
    level = level + 1
else if lives = 0 then
    gameOver = true
else
    playContinueCue()
end
```

Conditions have type `boolean`; an integer flag needs an explicit comparison.
The words `else if` form one continued decision, and one bare `end` closes the
whole block.

The compiler evaluates conditions from top to bottom and executes only the
first matching body. One-line `if` remains deferred.

## Ordinal selection

`select` dispatches over an integer, enum or subrange:

```lanternfly
select direction
case up
    next = (head - 8) and $3f
case down
    next = (head + 8) and $3f
case left, right
    next = turnHorizontal(head, direction)
else
    next = head
end
```

The selected expression runs once. Cases contain compatible compile-time
ordinal constants, do not fall through and need no `break`.

Ranges use the same boundary words as types and loops:

```lanternfly
case 0 to 9
    band = low
case 10 until 20
    band = middle
```

The first case includes 9; the second excludes 20. Empty, reversed,
overlapping or duplicate cases are errors. An enum selection without `else`
is exhaustive when its cases cover every member.

## Inclusive and exclusive counted loops

`to` includes its boundary:

```lanternfly
var row as u8

for row = 1 to 8
    clearRow(row)
end
```

`until` excludes it:

```lanternfly
var index as u8

for index = 0 until count(actors)
    updateActor(actors[index])
end
```

Explicit-domain arrays can use their own bounds:

```lanternfly
var column as ScreenColumn

for column = lower(rowPixels) to upper(rowPixels)
    rowPixels[column] = 0
end
```

The control variable already exists and must be a writable, non-volatile
ordinal scalar. The loop does not declare it. Start and boundary evaluate
once, in that order, before the converted start is stored.

An optional `step` is a nonzero compile-time integer:

```lanternfly
for row = 7 to 0 step -1
    clearRow(row)
end
```

The implementation computes each next value mathematically and tests whether
it would continue before storing it. A descending `u8` loop therefore stops
after zero rather than wrapping to 255. A continuing value that cannot fit the
control type is a compile error when known and `F-LOOP-RANGE` otherwise.

After the loop, the control retains the last value actually stored. If the
body never runs, it retains the converted start. The body cannot write the
control directly or through a call or native effect.

Enum controls advance in declaration order. Their loop step is still written
as an integer constant.

## Collection traversal

`for each` visits a fixed array in ascending ordinal, row-major order:

```lanternfly
for each actor in actors
    updateActor(actor)
end
```

The element name denotes the current element. Assignment changes the array:

```lanternfly
for each pixel in pixels
    pixel = 0
end
```

A scalar element behaves as an ordinary value when read. A record element
supports fields, complete aggregate assignment and aggregate calls. The
backend may carry an address or index internally, but that traversal carrier
is not a source value.

The array operand is one storage path evaluated before traversal. Constant
arrays give a read-only element binding; volatile arrays are excluded until a
volatile alias contract exists.

## Conditional and indefinite loops

`while` tests before each iteration:

```lanternfly
while enemiesRemaining > 0
    updateEnemy()
end
```

An indefinite loop uses the ordinary Boolean literal:

```lanternfly
while true
    readInput()

    if quitRequested then
        exit
    end

    updateGame()
end
```

Lanternfly does not add a second spelling for this case.

## Loop control

Bare `exit` leaves the innermost enclosing loop. Bare `continue` begins that
loop's next iteration: it steps a counted loop, advances `for each`, or retests
`while`.

Both are errors outside a loop. `exit` never terminates a program and never
leaves a routine. `return` performs those different transfers.

Named exits and post-test loops remain possible later additions, but current
corpus code does not justify their extra vocabulary.

## One routine form

Every routine is a `sub`. A trailing result type makes it value-producing:

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

An omitted result means no usable value. A result may be an ordinal, Boolean
or address scalar. String and other aggregate return is deferred.

Every declaration and invocation uses parentheses, including an empty
parameter list. There is no `call` keyword:

```lanternfly
updateClock()
separation = distance(playerX, enemyX)
distance(playerX, enemyX) // result deliberately discarded
```

General expression statements make the final line legal. A result-free
invocation remains invalid where a value is required.

## Parameters

Scalar parameters pass values. Counted-string, record and array parameters
temporarily alias caller storage:

```lanternfly
export sub moveActor(near actor as Actor, deltaX as i16)
    actor.position.x = u8(actor.position.x + deltaX)
end
```

The aggregate argument is a compatible writable storage path or local alias.
No pointer or reference value appears in source, and the parameter cannot be
rebound, stored, returned or compared. Its name denotes the caller's
aggregate. A counted-string parameter includes its exact capacity, so
`string[24]` and `string[32]` parameters are different shapes.

Exported aggregate parameters state `near` or `far`. Private unqualified
parameters use the target default. First-edition aggregate parameters are
writable; read-only, output and in/out modes remain open design work.

## Locals and aliases

Scalar locals use `var`; counted-string and other aggregate locals use `alias`:

```lanternfly
sub tickSelected(index as u8)
    var expired as boolean = false
    alias monster as Monster = monsters[index]

    monster.timer = monster.timer - 1
    expired = (monster.timer = 0)
end
```

Declarations precede executable statements in the routine or hosted body.
Initializers run in source order. A local name is visible after its declaration
and cannot shadow a parameter or visible module value.

An alias binds one exact aggregate path for its lexical lifetime. It cannot be
reassigned. Changing long-lived selection therefore means changing an ordinal
selector and forming a fresh alias when execution next needs the storage.

## Returning from routines and hosted bodies

`return expression` supplies the declared result. A result-bearing sub must
return on every reachable path. A no-result sub uses bare `return` for early
departure.

A hosted Glimmer body also uses bare `return`. Lowering targets the host
continuation rather than emitting a machine return:

```text
Lanternfly body
    -> Glimmer update epilogue
    -> wrapper return
```

This rule preserves update work after early body completion. A direct `RET`
from generated body code would be a backend bug.

## Calls, recursion and reentrancy

Arguments evaluate from left to right. Destination paths evaluate before
assignment sources. Calls and visible storage effects remain in source order
unless an interface proves a reordering safe.

The language permits a call graph, while bare-metal profiles may reject
recursive cycles. That lets a backend allocate scalar locals statically and
report a fixed memory cost. A recursion-capable profile must state its ABI and
stack costs.

Reentrancy, interrupt safety, mapping-context changes and no-return behaviour
belong to routine contracts and target profiles. They are not new call syntax.

## Modules and visibility

An ordinary source file is a module containing imports and declarations, not
loose executable statements:

```lanternfly
import "display-services.lf"

export record Actor
    var active as boolean
end

export const actorCount as u8 = 8
export var actors as Actor[actorCount]

export sub deactivateActors()
    for each currentActor in actors
        currentActor.active = false
    end

    flushActorDisplay()
end
```

Declarations are private unless marked `export`. An import exposes only the
other module's exports and includes its code and data once in the whole
program. Import cycles and conflicting visible exports are errors.

Name lookup is case-insensitive, while tools preserve the spelling at the
declaration. Built-in operation names such as `count` and `length` are
reserved. Types and values occupy separate namespaces, although a record, enum
or range type may not share its name with a callable routine. These rules apply
to host-manifest names as well as source modules.

## Standalone entry and hosted units

An executable build manifest selects one parameterless, result-free,
source-defined `sub` as its entry. Returning from that routine invokes the
profile's program-termination service. A library build has no entry.

A hosted body is a different compilation unit. It contains local declarations
followed by statements, while the host manifest supplies every non-local name
and the continuation. Imports, exports, module storage, type declarations and
routine declarations stay outside the body.

The [conformance contract](../conformance.md) holds the complete fixture
inventory for control, routines, modules and hosted execution. Keeping that
inventory in one normative document prevents a shorter chapter checklist from
drifting away from the language rules.
