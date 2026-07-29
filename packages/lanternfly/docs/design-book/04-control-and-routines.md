# Control flow and routines

Lanternfly's control surface should read as ordinary pseudocode. The backend owns
branch distances, condition flags and generated labels.

## Statements

The initial executable statements are:

- scalar assignment;
- procedure call;
- `IF`;
- `SELECT CASE`;
- `FOR`;
- `WHILE`;
- `DO` with `WHILE` or `UNTIL`;
- loop exit and continuation;
- routine return;
- local scalar and alias declarations;
- explicit native boundary.

An empty body is legal. This matters in Glimmer: a scheduled block may
currently do nothing while its surrounding generated update epilogue still
runs.

## Conditional blocks

The ordinary form is:

```lanternfly
IF score >= target THEN
    level = level + 1
ELSEIF lives = 0 THEN
    gameOver = -1
ELSE
    PlayContinueCue()
END IF
```

`THEN` is retained. It makes a one-line condition easy to scan and feels
natural to BASIC readers.

A single-line form is allowed only when it contains one simple statement and
no `ELSE`:

```lanternfly
IF Count >= 10 THEN Count = 0
```

The compiler's formatter may expand it. Long or nested bodies use the block
form.

Conditions use numeric truth. No comparison with zero is required, although a
comparison is clearer when an integer is not conventionally a flag.

## Selection

`SELECT CASE` expresses dispatch over a scalar:

```lanternfly
SELECT CASE Direction
CASE DIR_UP
    next = (head - 8) AND $3F
CASE DIR_DOWN
    next = (head + 8) AND $3F
CASE DIR_LEFT
    next = (head AND $38) OR (BYTE(head - 1) AND 7)
CASE DIR_RIGHT
    next = (head AND $38) OR (BYTE(head + 1) AND 7)
CASE ELSE
    next = head
END SELECT
```

The initial form supports:

- one or more constant values in a case;
- non-overlapping constant ranges;
- one optional `CASE ELSE`;
- no fall-through.

The selector is evaluated once. Case expressions are compile-time constants
compatible with its type. A backend can choose a comparison chain, decision
tree or jump table.

## Counted loops

The inclusive `FOR` form is:

```lanternfly
FOR row = 0 TO 7
    Framebuffer[row].green = Trail[row]
NEXT row
```

A non-unit step is explicit:

```lanternfly
FOR destination = row TO 1 STEP -1
    plane[destination] = plane[destination - 1]
NEXT destination
```

Semantics:

1. start, limit and step are evaluated once, in that order;
2. the control variable receives start;
3. a positive step continues while variable `<= limit`;
4. a negative step continues while variable `>= limit`;
5. zero step is an error;
6. the variable advances after the body;
7. on normal completion it contains the first value beyond the limit, narrowed
   to its declared type.

The control variable must be a local or static scalar, not a field with an
effectful address calculation. The loop owns mutation of it; assigning to it
inside the body is a diagnostic by default.

The compiler analyses descending loops carefully. A `BYTE` variable cannot
represent -1, so:

```lanternfly
FOR row AS BYTE = 7 TO 0 STEP -1
```

must stop after the iteration at zero rather than decrement, wrap and continue.
Loop termination is defined from the mathematical next value, not from an
accidentally wrapped stored control variable.

## Conditional loops

Pre-test:

```lanternfly
WHILE BodyContains(candidate)
    candidate = candidate + 1
END WHILE
```

Post-test:

```lanternfly
DO
    key = ReadKey()
LOOP UNTIL key <> NO_KEY
```

`DO WHILE condition ... LOOP` and `DO UNTIL condition ... LOOP` are also
readable, but one pre-test spelling is enough. The initial design keeps
`WHILE ... END WHILE` for pre-test and `DO ... LOOP WHILE/UNTIL` for post-test.

## Exiting and continuing

Loops support:

```lanternfly
EXIT FOR
CONTINUE FOR
EXIT WHILE
CONTINUE WHILE
EXIT DO
CONTINUE DO
```

The noun is required. It prevents an `EXIT` in nested control from depending
on visual indentation alone.

Routines use `EXIT SUB` or `RETURN value`. A hosted body uses `EXIT BODY`.

## Hosted body exit

A Glimmer body is not a complete machine routine. Generated update code follows
it:

```text
entry wrapper
    Lanternfly body
    Glimmer update epilogue
    return
```

`EXIT BODY` branches to the body epilogue. It does not emit a machine `RET`.
A direct return would skip Glimmer's updates and change scheduling behaviour.

The same concept works in another host: the host supplies the continuation
point. Standalone Lanternfly may treat the top-level body epilogue as program return.

## Labels and jumps

Lanternfly uses labels, never line numbers:

```lanternfly
retry:
```

Unrestricted `GOTO` is not needed by the current corpus and is deferred. A
restricted local `GOTO label` may later support generated state machines or
algorithms that become less clear under artificial flags.

If admitted, it must obey:

- target label in the same routine or body;
- no jump into a nested block;
- no jump across initialization of a local or alias;
- no jump out of a block that owns cleanup;
- source maps retain the named label.

Native assembly remains available when the desired control really is
instruction-level.

## Calls before a full routine system

The first useful Lanternfly integration can call imported zero- or fixed-argument
services:

```lanternfly
FbClear()
FbPlot(DotX, DotY, COLOR_GREEN)
NextPiece = RandomByte() AND 7
```

The host interface supplies signatures. A source call does not state whether
the target implementation is inline or callable.

User-defined routines can arrive in the next stage without changing this call
syntax.

## Procedures

A procedure returns no value:

```lanternfly
SUB OrPlaneRow(
    plane AS REF TO BYTE[8],
    row AS BYTE,
    mask AS BYTE
)
    plane[row] = plane[row] OR mask
END SUB
```

Parameters have lexical names and declared types. Parentheses and commas are
used even for zero arguments. This is closer to modern BASIC and
Algol-descended languages than to a BASIC `GOSUB`.

Scalar parameters pass values. Reference parameters pass access to existing
storage. Aggregate parameters must be references; there is no implicit array
or record copy.

## Functions

A function returns one scalar or reference value:

```lanternfly
FUNCTION Manhattan(
    x0 AS BYTE,
    y0 AS BYTE,
    x1 AS BYTE,
    y1 AS BYTE
) AS WORD
    RETURN ABS(x0 - x1) + ABS(y0 - y1)
END FUNCTION
```

The first routine system has no:

- overloads;
- optional parameters;
- variable argument lists;
- multiple return values;
- closures;
- nested routine declarations;
- exceptions.

An aggregate return is deferred. Return a reference to existing storage when
that matches the lifetime.

## Locals

Scalar locals use `DIM`:

```lanternfly
DIM candidate AS INTEGER
DIM oldRotation AS BYTE = CurRotation
```

Initializers execute in source order on routine entry. A local without an
initializer has no readable value until assigned. Definite-assignment analysis
rejects a path that reads it first.

Local aliases use `ALIAS` and cannot be rebound:

```lanternfly
ALIAS monster = Monsters[index]
```

Local reference variables may be rebound because they are scalars:

```lanternfly
DIM monster AS NEAR REF TO Monster
monster = REF Monsters[index]
```

The distinction makes lifetime and storage cost visible.

## Calling convention is not syntax

Lanternfly does not define IX, register saves or stack slot width. Each backend ABI
must implement:

- scalar value parameters;
- typed reference parameters;
- scalar or reference result;
- automatic local lifetime;
- recursion policy;
- preservation across imported calls.

The Z80 backend may begin with ZAX's proven shape:

- arguments in address-sized stack slots;
- IX as frame anchor;
- scalar locals in slots;
- aggregate aliases as addresses;
- declared return carrier.

That is one ABI, not Lanternfly's meaning. A 6502 target may use a software frame in
zero page and memory. C can use its native call surface behind fixed-width
types. BASIC can lower initial routines to global scratch plus generated
`GOSUB` conventions if reentrancy is disabled.

## Recursion

Recursion is deferred from the first target profile. It is not forbidden by
the eventual routine semantics.

Without recursion, a backend may allocate local storage statically along the
known call graph. This is valuable on small systems and makes maximum memory
use predictable. The compiler must reject recursive cycles under such a
profile.

A stack-capable profile may opt into recursion later. Aggregate locals remain
aliases, so recursion does not imply dynamic arrays.

## Reentrancy and interrupts

A routine or imported service can carry execution properties:

- reentrant;
- not reentrant;
- interrupt-safe;
- may change memory context;
- no return.

These properties belong to interface and backend checking, not ordinary
keywords in every call.

A Lanternfly routine using static scratch is not reentrant. The cost report and
symbol map should identify its scratch allocation. A routine that can be
called from both main code and an interrupt requires a reentrant ABI or an
explicit prohibition.

## Evaluation and sequencing

Statements execute in source order. The initial expression subset is pure, so
operand evaluation order does not expose side effects.

Arguments to a call are evaluated left to right and staged before the call.
This is chosen now so later pure function expressions and complex reference
arguments do not acquire backend-dependent ordering.

An imported procedure may read and write memory described by its interface.
The compiler must not reorder calls or visible storage operations across it
unless the contract proves that safe. The first compiler need not perform such
reordering at all.

## Control-flow conformance

The acceptance suite should include:

- nested `IF` with `ELSEIF` priority;
- `SELECT CASE` with range and default;
- ascending, descending and negative-step `FOR`;
- a descending byte loop that terminates correctly at zero;
- empty `WHILE` and post-test `DO`;
- `EXIT` and `CONTINUE` from nested conditions;
- early function return;
- `EXIT BODY` followed by a host epilogue;
- definite assignment across branches;
- reference argument mutation;
- recursion rejection in a non-recursive target profile.
