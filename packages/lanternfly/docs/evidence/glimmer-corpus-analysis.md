# Glimmer corpus analysis for Lanternfly

This document records what the actual repository programs require from their
body language. It treats each assembly body as evidence, not as a template to
transliterate instruction by instruction.

The first question for every body is what the programmer meant to do. The
second is whether Lanternfly's ordinary expressions, control flow, fixed storage and
typed service calls can say it. Native code remains justified where the work
depends on ports, exact timing, a specialized ABI, or a missing language stage.

## Small programs

### Counter

Counter contains two bounded mutations:

```text
Count = Count + 1
IF Count >= 10 THEN Count = 0
```

and:

```text
IF Count = 0 THEN
    Count = 9
ELSE
    Count = Count - 1
END IF
```

The render converts a digit value to its character code and calls a generic
service. It requires a byte character literal and a typed imported call, but no
platform or Glimmer vocabulary. The increment currently uses an indirect
memory instruction only as an assembly convenience.

### Dot

Dot repeats four bounded coordinate mutations and one three-argument plot.
Every body has a direct structured translation. It is a baseline conformance
program for conditions, assignment, byte storage, constants and imported
procedures.

### Slide

Slide adds an indexed byte lookup, word increment and numeric truth:

```text
Travel = 0
DotX = SlideX[Travel]
Slides = Slides + 1
Snd_Arrive()
Visible = Visible XOR 1

IF Visible THEN
    ShapeDraw(Shape_Dot, DotX, 3)
END IF
```

This is the smallest program that should validate generated-resource array
imports and a near resource reference. Glimmer retains the ramp, curve, timer,
sound and shape declarations; Lanternfly sees only their storage, data and services.

### Trail

Trail requires a runtime-indexed array update and a fixed-stride framebuffer
copy:

```text
Trail[DotY] = Trail[DotY] OR MxMask(DotX)

FOR row = 0 TO 7
    Framebuffer[row].green = Trail[row]
NEXT row
```

The movement and cursor plot are otherwise the same as Dot. This program is an
early end-to-end fixture for array reads and writes, record-array field access,
`FOR`, mask operations and calls inside a render.

## Snake

Snake is the most informative matrix program for compact data structures. A
position is packed into one byte:

```text
position = y * 8 + x
```

and `Body[64]` is a fixed-capacity circular buffer. `HeadIdx` selects the newest
element, `Len` determines how many entries are live, and decrementing indexes
wrap with `AND %00111111`.

This is an APL-like, array-oriented structure rather than a linked list. It
supports the proposed rule that aggregates are allocated statically and local
aggregate names are aliases or views.

### Initialization

`StartGame` writes two initial elements and resets scalar state:

```text
IF NOT Alive THEN
    Body[0] = 26
    Body[1] = 27
    HeadIdx = 1
    Len = 2
    Dir = 3
    FoodPos = 42
    Step = 10
    Alive = 1
END IF
```

No loop, pointer or local is needed.

### Direction

The four turn blocks reject the opposite direction, then assign a numeric
direction code. Lanternfly can consume named constants such as `DIR_UP` even if the
current source uses literals. An enum would improve type checking later, but
is not a prerequisite.

### Packed movement

Vertical motion adds or subtracts eight and masks to six bits. Horizontal
motion preserves the upper row bits and wraps only the lower three column bits:

```text
SELECT CASE Dir
CASE DIR_UP
    next = (head - 8) AND %00111111
CASE DIR_DOWN
    next = (head + 8) AND %00111111
CASE DIR_LEFT
    next = (head AND %00111000) OR ((head - 1) AND %00000111)
CASE DIR_RIGHT
    next = (head AND %00111000) OR ((head + 1) AND %00000111)
END SELECT
```

This is a strong case for BASIC-style `SELECT CASE`, bit masks and explicit
modular byte behaviour. The scalar `next` is also a strong case for one local
temporary in a larger routine. Before locals exist, a compiler could retain it
as an expression temporary or a program-global scratch cell, but neither should
be the final source model.

### Circular indexing

The new head index is:

```text
HeadIdx = (HeadIdx + 1) AND %00111111
Body[HeadIdx] = next
```

The array length is a power of two, so masking is both the intended ring
operation and the cheapest lowering. Lanternfly need not add a ring-buffer type.

### Search and food placement

`BodyContains` scans `Len` cells backwards from `HeadIdx`. In mature Lanternfly:

```text
FUNCTION BodyContains(position AS BYTE) AS BYTE
    index = HeadIdx
    FOR remaining = 1 TO Len
        IF Body[index] = position THEN RETURN 1
        index = (index - 1) AND %00111111
    NEXT remaining
    RETURN 0
END FUNCTION
```

Only scalar arguments and locals are needed. `Body` remains global static
storage. This is a direct fit for the ZAX-inspired calling model.

Food placement starts at a random candidate and advances around the board until
`BodyContains` is false. The loop is unbounded syntactically but guaranteed to
terminate because growth stops at length 62, leaving free cells:

```text
candidate = RandomByte() AND %00111111
WHILE BodyContains(candidate)
    candidate = (candidate + 1) AND %00111111
END WHILE
FoodPos = candidate
```

Lanternfly therefore needs `WHILE` in addition to counted `FOR`, or an equivalent
repeat form. This is the first compelling non-counted loop in the live corpus.

### Rendering and support routines

`PlotPos` unpacks a byte into x and y:

```text
FbPlot(position AND 7, (position SHR 3) AND 7, colour)
```

It is an ideal small function with two scalar arguments and no aggregate state.

`DrawBody` scans the same ring, plotting each entry green and then the head
white. Its two private global scratch bytes exist because the assembly routine
cannot conveniently keep values across `FbPlot`. Scalar locals let the compiler
place them in registers, on the stack, or in static scratch according to the
target and calling convention. The body array is never copied.

### Numeric and safety observations

- `Len` is capped at 62 so food placement cannot fill every remaining cell.
- All packed positions and indexes are bytes in the range 0..63.
- Ring arithmetic explicitly masks; ordinary mathematical arithmetic would
  not be equivalent.
- `Alive` is a canonical numeric truth.
- Score displays `Len`, widened from byte to word at the service boundary.
- The assembly uses a long `jp` because its local target exceeds a Z80 relative
  branch. Lanternfly control flow must leave branch sizing entirely to the backend.

Snake's game logic requires no heap, recursion, aggregate local allocation or
general pointer arithmetic. Fixed arrays, scalar locals, loops, functions and
mask operations cover it.

## Sprite Chase

`MovePlayer` reads four imported pulse cells and stages x and y in registers
before storing them. Two scalar locals express the intent:

```text
x = PlayerX
y = PlayerY

IF UpP AND y > 0 THEN
    y = y - 1
ELSE IF DownP AND y < 184 THEN
    y = y + 1
END IF

IF LeftP AND x > 0 THEN
    x = x - 1
ELSE IF RightP AND x < 248 THEN
    x = x + 1
END IF

PlayerX = x
PlayerY = y
```

The original gives up priority to Up over Down and Left over Right when
opposites are simultaneously raised. The `ELSE IF` structure preserves that
choice. A translation that used four independent conditions would change the
behaviour.

`FleeTarget` is another pair of comparison ladders. It combines movement away
from the player with edge clamps and needs no special operation.

`Collide` repeats Rushlight's widened absolute-difference requirement. On a
catch it increments a byte score and uses masked random values to place a new
target. The y expression produces 32..159 and safely fits a byte.

The score render writes one pip at:

```text
column = (Score - 1) AND 31
```

This is modular display behaviour, not mathematical remainder over a possibly
negative value. Because the zero score exits before the subtraction, the
operand is at least one. After 32 points, pips overwrite from column zero. Lanternfly
must preserve the ordering and fixed-width mask semantics.

Empty `StartPlaying` proves that a Lanternfly body may contain no statements. Glimmer
still performs its surrounding `updates` work.

The three render bodies are typed calls in Lanternfly. The sprite and tile identifiers
are imported resource constants or handles; their declaration and VRAM upload
remain Glimmer/profile work.

## Tetro

Tetro is the repository's strongest acceptance case. Its Glimmer rules are
already short, while its 473-line native engine exercises nearly every proposed
advanced feature. The engine is therefore the right test of how much code can
move upward without turning Lanternfly into a general systems language.

### Rule bodies

`SplashTwinkle` reuses one random byte for column, row and colour. A scalar
local makes the relationship clear:

```text
IF (FrameCount AND 63) = 0 THEN FbClear()
r = RandomByte()
x = r AND 7
y = (r SHR 3) AND 7
colour = (r SHR 2) AND 7
IF colour = 0 THEN colour = COLOR_CYAN
FbPlot(x, y, colour)
```

This depends on stable left-to-right statement order and explicit shifts. The
assembly's conditional call is just an `IF`.

`ApplyMove` computes a candidate x, rejects byte underflow or x at eight, then
calls collision:

```text
candidateX = PlayerX
IF MoveLeftP THEN
    candidateX = candidateX - 1
ELSE
    candidateX = candidateX + 1
END IF

IF candidateX >= 0 AND candidateX < 8 THEN
    IF NOT CheckCollAt(candidateX, PlayerY) THEN PlayerX = candidateX
END IF
```

The source should use a widened signed temporary so the left-edge check is
grammatical. The current assembly uses unsigned byte wrap to make −1 fail
`candidateX < 8`. This joins the Skyfall/Rushlight numeric conformance set.

`ApplyRotate` speculatively changes rotation, refreshes derived piece metadata,
tests collision, and restores both rotation and metadata if blocked. It needs
one scalar `oldRotation` local. The calls are observably ordered:

```text
oldRotation = CurRotation
CurRotation = (CurRotation + 1) AND 3
SetCurPiece()
IF CheckCollAt(PlayerX, PlayerY) THEN
    CurRotation = oldRotation
    SetCurPiece()
ELSE
    Snd_Rotate()
END IF
```

`ApplyGravity` and `FinishClear` match the book analysis. `FinishClear` adds a
word score delta returned by a function to `Score`, another ordinary widened
arithmetic case. `DifficultyCurve` is simply `IF Score >= 2000 THEN Gravity =
16`.

The remaining rule bodies are resource indexing, imported calls, masks and
conditional card-state assignments. None require substrate syntax.

### Static engine data

The native module declares:

```text
ClearScore : WORD[5]
BoardPlane : NEAR REF TO BYTE[8] [4]
CurPiece   : NEAR REF TO BYTE[4]
CurPieceRight : BYTE
CurColour  : BYTE
ShiftCount : BYTE
```

The exact Lanternfly declaration syntax remains provisional, but the types are clear.
`BoardPlane` is an array of references to four global arrays. `CurPiece` aliases
one generated rotation bitmap selected at runtime. No reference points to
temporary or heap storage.

The four scratch scalars can become routine locals or cached derived globals.
`CurPiece` is intentionally persistent across calls, so it may remain global.

### Piece selection

`SetCurPiece` manually flattens the resource tables. Lanternfly can retain their
shape:

```text
rotation = CurRotation AND 3
CurPieceRight = ShapeRight[CurPieceIndex, rotation]
CurPiece = ShapeRotation[CurPieceIndex, rotation]
CurColour = ShapeColour[CurPieceIndex]
```

This is the reference-table and multidimensional-array acceptance case.

### Dynamic shifts

`ShiftRowMask` loops once per x position because the Z80 has no variable-count
shift. Lanternfly should write:

```text
RETURN mask SHR ShiftCount
```

The Z80 lowering may emit the same loop or call a runtime helper. A processor
with a variable shift uses it directly. The cost listing should make this
target difference visible.

### Collision

`CheckCollAt(x, y)` scans four piece rows. Its source algorithm is:

```text
IF x + CurPieceRight >= 8 THEN RETURN 1

FOR pieceRow = 0 TO 3
    mask = CurPiece[pieceRow] SHR x
    IF mask <> 0 THEN
        boardRow = y + pieceRow
        IF boardRow >= 8 THEN RETURN 1
        IF (BoardRows[boardRow] AND mask) <> 0 THEN RETURN 1
    END IF
NEXT pieceRow

RETURN 0
```

This uses a reference selected earlier, indexed loads, scalar locals, early
returns and numeric truth. It is compact Lanternfly and needs no direct pointer
arithmetic.

### Locking into planes

`OrPlaneRow` is the first natural aggregate alias parameter:

```text
SUB OrPlaneRow(plane AS REF TO BYTE[8], row AS BYTE, mask AS BYTE)
    plane[row] = plane[row] OR mask
END SUB
```

The reference aliases a global plane. It does not allocate, copy or take
ownership. A near qualifier is appropriate for the Z80 implementation; a
portable default reference can be resolved by the target if the address class
is unambiguous.

`LockPiece` loops over four bitmap rows and ORs each nonempty mask into
occupancy plus the colour-selected planes. Lanternfly's mask conditions map directly:

```text
IF CurColour AND COLOR_RED THEN OrPlaneRow(BoardRed, row, mask)
```

This is another use of integer truth and the unified `AND`.

### Row collapse

`CollapseRow(row)` selects each plane through `BoardPlane` and shifts rows
above the cleared row down:

```text
FOR planeIndex = 0 TO 3
    plane = BoardPlane[planeIndex]
    FOR destination = row TO 1 STEP -1
        plane[destination] = plane[destination - 1]
    NEXT destination
    plane[0] = 0
NEXT planeIndex
```

This requires:

- an array of typed references;
- a local aggregate alias `plane`;
- a descending counted loop;
- reads and writes through the alias.

It is the best single test of the proposed ZAX rule for aggregate locals.

`ClearFullRows` scans from the bottom and re-tests the same row after a
collapse. A `WHILE` loop expresses it:

```text
row = 7
WHILE row >= 0
    IF BoardRows[row] = $FF THEN
        CollapseRow(row)
        cleared = cleared + 1
    ELSE
        row = row - 1
    END IF
END WHILE
```

The loop variable must be signed or the condition `row >= 0` never becomes
false after unsigned underflow. An alternative `DO ... EXIT` avoids that trap.
The specification should include both lowering and diagnostic tests for
descending unsigned loops.

### Full-row and score tables

`FullRowsMask` can state its intent without rotate-through-carry:

```text
mask = 0
FOR row = 0 TO 7
    IF BoardRows[row] = $FF THEN mask = mask OR (1 SHL row)
NEXT row
RETURN mask
```

The bit-to-row convention must match the renderer. This form makes that
convention testable.

`ScoreForClears` clamps its count and indexes a word array:

```text
RETURN ClearScore[MIN(cleared, 4)]
```

This validates word-element scaling and a word result.

### Initialization and zeroing

`ZeroPlane` is another aggregate alias function, but it is better supplied by a
standard operation:

```text
FILL(BoardRows, 0)
```

The Z80 runtime can emit an eight-byte loop, C can use a loop or `memset`, and a
BASIC backend can iterate the declared bounds. Passing each plane to a user
routine remains possible when the routine system matures.

### Framebuffer rebuild

`DrawBoardFb` is the largest translation candidate. It scans eight rows,
combines settled colour planes with the active piece mask when the piece covers
that row, writes an exact-layout framebuffer record, then overrides all colour
planes when the row's clear bit is set.

A representative Lanternfly structure is:

```text
FOR row = 0 TO 7
    pieceMask = 0
    pieceRow = row - PlayerY
    IF pieceRow >= 0 AND pieceRow < 4 THEN
        pieceMask = CurPiece[pieceRow] SHR PlayerX
    END IF

    Framebuffer[row].red = BoardRed[row]
    IF CurColour AND COLOR_RED THEN
        Framebuffer[row].red = Framebuffer[row].red OR pieceMask
    END IF

    ' green and blue follow the same form

    IF ClearMask AND (1 SHL row) THEN
        Framebuffer[row].red = $FF
        Framebuffer[row].green = $FF
        Framebuffer[row].blue = $FF
    END IF
NEXT row
```

This requires exact record-array fields, widened signed subtraction, shifts,
masks, locals and loops. It does not require unsafe address arithmetic.

### Tetro conclusion

Every game-specific engine routine can be represented in Lanternfly once the
following staged features exist:

1. fixed arrays and exact records;
2. multidimensional indexing and arrays of static references;
3. scalar locals, scalar arguments and results;
4. aggregate reference/alias arguments and locals;
5. counted and conditional loops with early return;
6. shifts, masks, word table access and standard fill/min operations.

Direct assembly remains useful for the first backend implementation, verified
hot paths, or exact target tuning. It is not semantically necessary for this
engine.

## Book 2 source programs

The published Skyfall and Rushlight files were read independently after their
book chapters. Their bodies match the listings and introduce no unreported
constructs.

Skyfall remains the key wrapping-subtraction case, and its parameterless
`RandCol` routine is the smallest user-defined function candidate. Rushlight
remains the widened absolute-difference and integer division/remainder case.
Both confirm that device operations can be presented as typed imports without
adding display-specific words to Lanternfly.

## Historical TEC-1G corpus

The historical corpus predates the current Glimmer examples. It is not a
second language definition, but it exposes larger algorithms and less polished
memory layouts than the teaching programs. It is useful precisely because it
shows where assembly becomes clerical.

### Shared scan, display, sound and LCD code

The shared TEC-1G code divides into two kinds of work.

The first kind is ordinary fixed-storage manipulation:

- clear or copy a 32-byte framebuffer;
- select a four-byte row record;
- turn an x coordinate into a one-bit mask;
- format an unsigned 16-bit score into six display cells;
- step a timer and divider;
- walk a sentinel-terminated LCD script.

Lanternfly can express all of this once it has records, arrays, loops and static
references. The LCD script is especially revealing. Each entry is effectively:

```text
TYPE LcdCommand
    row  AS BYTE
    text AS NEAR REF TO BYTE
END TYPE

DIM ScriptPacRun[] AS LcdCommand = (
    (LCD_ROW_1, REF LcdTextPacRun),
    (LCD_ROW_2, REF LcdTextPacLevel)
)
```

The assembly representation ends with a zero row rather than carrying a
length. Lanternfly should support exact data declarations and interoperating with
sentinel formats, but a Lanternfly-owned array normally has a compile-time element
count. Sentinel walking is an algorithm, not a special array kind.

The second kind is target machinery: port output, ROM calls, display scan
timing and register-sensitive service entry. These routines belong behind
imports or in native passthrough. Their presence does not justify adding
`OUT`, registers or scan concepts to the core language.

### Historical Tetro

The historical Tetro engine confirms the current adaptation's requirements:
four colour planes, a four-row piece bitmap, arrays of references to planes,
row collapse, collision testing, framebuffer records and score tables. It also
adds one important signedness case.

The initial piece y coordinate is stored as `$FD`, meaning -3. A piece may
legally occupy negative rows while entering the board. Treating this as an
ordinary unsigned byte preserves its representation but conceals the
algorithm. A Lanternfly translation should declare it as a signed 8-bit value:

```text
PlayerY = -3

FOR pieceRow = 0 TO 3
    boardRow = PlayerY + pieceRow
    IF boardRow >= 0 AND boardRow < 8 THEN
        ' inspect or draw this row
    END IF
NEXT pieceRow
```

This is direct evidence for `SBYTE`, not merely an argument from symmetry with
`BYTE`. It also shows why the language cannot make every small integer
unsigned just because the target CPU is eight-bit.

The engine still allocates every aggregate statically. Record and array aliases
select existing storage; no path needs a heap, ownership, garbage collection,
recursive allocation or a general tree.

### Pacmo's records and aliases

Pacmo stores three monsters as adjacent six-byte records:

```text
TYPE Monster
    x            AS BYTE
    y            AS BYTE
    direction    AS BYTE
    timer        AS BYTE
    respawnTimer AS BYTE
    state        AS BYTE
END TYPE

DIM Monsters[3] AS Monster
```

The assembly passes one selected record in `IX` and addresses fields as
`(IX + MonsterTimer)`. In Lanternfly, a routine argument can be an alias to one
element:

```text
SUB TickEnemy(monster AS REF TO Monster)
    IF monster.respawnTimer <> 0 THEN
        TickEnemyResp(monster)
        EXIT SUB
    END IF

    monster.timer = monster.timer - 1
    IF monster.timer <> 0 THEN EXIT SUB

    monster.timer = EnemyPeriodCur
    IF monster.state = ENEMY_ATTACK THEN
        EnemyAttackStep(monster)
    ELSE
        EnemyRoamStep(monster)
    END IF
END SUB
```

The alias has identity: comparisons exclude the current monster by testing
whether two record references name the same global object. Lanternfly therefore
needs reference equality, or an equivalent index-based formulation. It does
not need aggregate value equality.

Pacmo also demonstrates a limitation worth preserving. An aggregate local
should not silently allocate or copy a `Monster`. A local of type
`REF TO Monster` may alias `Monsters[index]`; scalar fields may be copied
normally. Copying a whole record, if later admitted, should be explicit.

### Packed world maps

The Pacmo world is a 15 by 15 bit matrix stored as 15 pairs of bytes. The
matching eaten map has the same layout. Assembly manually computes
`row * 2`, selects the high or low byte, and constructs a mask.

There are two plausible Lanternfly descriptions.

The first preserves the external layout exactly:

```text
TYPE PackedRow15
    high AS BYTE
    low  AS BYTE
END TYPE

DIM World[15] AS PackedRow15
DIM Eaten[15] AS PackedRow15
```

The algorithm then uses shifts and masks. This is portable, transparent and
compatible with existing data.

The second would introduce a packed bit-array abstraction. The corpus does not
yet justify that language feature. A standard helper such as
`BIT_TEST(World[row], column)` can remove repetition without making bit packing
part of the type system. The exact record remains the initial design.

The renderer extracts an eight-bit window by shifting a 16-bit row by
`ViewX`. This is a useful lowering test: the source operation is a word shift,
while a Z80 backend may implement it as a loop over byte pairs. The source
should describe the word operation rather than the loop.

### Sentinel coordinate tables

Power pills and respawn candidates are stored as x,y byte pairs followed by
`$FF`. The algorithm walks the table, keeps a one-bit-per-entry eaten mask, and
uses Manhattan distance to score respawn positions.

Lanternfly can express the data as an exact point record:

```text
TYPE Point
    x AS BYTE
    y AS BYTE
END TYPE
```

For Lanternfly-owned data, fixed arrays with known bounds are clearer:

```text
DIM EnemySpawns[6] AS Point

FOR index = 0 TO UBOUND(EnemySpawns)
    candidate = REF EnemySpawns[index]
    ' score candidate
NEXT index
```

Native data may still use a sentinel, so pointer or reference iteration must
remain possible at the interoperability boundary. A sentinel is not evidence
for unbounded dynamic arrays.

The respawn scorer adds distances to the player and other active monsters.
Each component is small, but the sum has a wider range than one component.
This joins collision subtraction as evidence that intermediate expression
types must not be chosen solely from the destination byte. The compiler must
define promotions and diagnose an explicit narrowing store.

### Control flow in Pacmo

Pacmo's assembly is full of early returns and tail jumps because those are the
natural Z80 forms. Its source algorithms map cleanly to:

- `IF`, `ELSE IF` and `SELECT CASE`;
- counted loops over monsters, rows and candidates;
- `WHILE` for sentinel tables;
- `EXIT SUB` and `RETURN value`;
- small procedures that update aliased records;
- functions for distance, bounds and wall tests.

Carry flags currently serve both as deliberate Boolean results and as
incidental residue. Lanternfly must end that ambiguity. A routine returning truth
declares a Boolean-sized numeric result; a procedure returns nothing. Backend
flags are implementation details.

### Pacmo conclusion

Pacmo's apparent assembly complexity comes mainly from:

1. register assignment for temporaries;
2. manual field offsets through `IX`;
3. manual row scaling and mask construction;
4. carrying values across calls;
5. representing Boolean results in flags;
6. walking static tables by raw address.

Records, fixed arrays, aggregate aliases, scalar locals, defined integer
promotions and structured control flow remove those costs from the source.
None of Pacmo requires a heap-oriented language.

## Historical TMS9918 programs

The three TMS9918 programs separate CPU memory from a device-owned address
space. Their constants such as `$0800` and `$3800` are VRAM locations, not
dereferenceable Z80 pointers. Access occurs by setting a VDP write cursor and
streaming bytes through ports.

Lanternfly should therefore distinguish at least conceptually among:

- a near CPU-memory reference;
- a far CPU-memory reference whose representation is target-defined;
- an opaque device address such as `VRAM ADDRESS`.

A VRAM address supports address arithmetic within its own space and can be
passed to a VDP service. It cannot be dereferenced with ordinary `value[index]`
syntax unless a backend-specific mapped-memory capability explicitly says so.

The source-level shape is:

```text
DIM PATTERN_BASE AS VRAM ADDRESS = $0000
DIM NAME_BASE    AS VRAM ADDRESS = $0800

VdpWrite(PATTERN_BASE, TilePatterns)
VdpFill(NAME_BASE, $0300, 0)
```

Those names are illustrative standard-library imports, not core words. On the
Z80/TMS9918 backend they lower to port streaming. On a memory-mapped target
they may lower to stores. This is exactly the separation between Lanternfly and its
platform library.

The demo adds fixed lookup tables for x/y motion, an array-of-struct sprite
attribute stream, modular indexing with `AND 7`, and phase banks selected by
`base + phase * 24`. These are all ordinary Lanternfly expressions over static
arrays. The platform-specific portion is the final write service.

The demo also rotates sprite table order each frame to balance a hardware
four-sprites-per-scanline limit. This is useful evidence for keeping statement
order and array traversal exact. It is not evidence for a sprite keyword.

## Corpus boundary

Across the current and historical programs, the part that Lanternfly cannot usefully
replace is narrow:

- cycle-sensitive scan loops;
- direct port and ROM calls;
- target startup and stack setup;
- specialized block transfer where a backend has not yet supplied an
  equivalent service;
- intentional handwritten assembly.

Everything else is built from state reads and writes, scalar arithmetic,
structured conditions, loops, fixed arrays, exact records and aliases to
static storage. That is the empirical boundary for the first language.
