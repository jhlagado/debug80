# Translations from the game corpus

These translations test whether Lanternfly can replace the language substrate without
absorbing Glimmer. They are not line-for-line rewrites. Each example first
states the game operation, then shows representative Lanternfly and lowering.

## Counter

The assembly body increments a byte, compares it with ten and wraps to zero.

```lanternfly
Count = Count + 1
IF Count >= 10 THEN Count = 0
```

`Count + 1` is calculated as `INTEGER`. Both possible results fit `BYTE`, so
the store is a narrowing operation that a range analysis can prove safe after
the conditional sequence.

A compact Z80 lowering is:

```asm
        ld      a,(Count)
        inc     a
        cp      10
        jr      c,_save
        xor     a
_save:
        ld      (Count),a
```

The source does not depend on that peephole. A reference lowering could create
an integer temporary and narrow it. Optimisation recovers the familiar byte
sequence.

This is the first compiler fixture:

- imported mutable byte;
- addition and comparison;
- one-line `IF`;
- proven narrowing;
- fall-through to the Glimmer epilogue.

## Dot

A movement body is:

```lanternfly
IF DotX < 7 THEN DotX = DotX + 1
```

The render body is a platform service:

```lanternfly
FbPlot(DotX, DotY, COLOR_GREEN)
```

Nothing in Lanternfly knows that `FbPlot` writes an 8-by-8 matrix buffer. Its
signature and effects come from the matrix profile. The same language can call
a different service on a TMS9918 profile.

## Slide

Slide indexes generated curve data and toggles visibility:

```lanternfly
Travel = 0
DotX = SlideX[Travel]
Slides = Slides + 1
SndArrive()
Visible = Visible XOR 1
```

Glimmer generates `SlideX` and exposes it as immutable byte data. Lanternfly performs
one ordinary array read. The sound cue is an imported procedure.

The render tests numeric truth:

```lanternfly
IF Visible THEN
    ShapeDraw(ShapeDot, DotX, 3)
END IF
```

`ShapeDot` may be an opaque resource handle rather than a raw address. Its
manifest type decides.

## Trail

The first structured-memory body is:

```lanternfly
Trail[DotY] = Trail[DotY] OR MxMask(DotX)
```

The compiler should avoid evaluating the indexed address twice. A typed IR
store can retain one resolved path:

```text
address = elementAddress(Trail, DotY)
old = load BYTE address
new = old OR call MxMask(DotX)
store BYTE address, new
```

The render uses an array of exact framebuffer row records:

```lanternfly
FOR row = 0 TO 7
    Framebuffer[row].green = Trail[row]
NEXT row
```

If a row record is four bytes with `green` at offset one, the Z80 address is:

```text
Framebuffer + row * 4 + 1
```

The backend shifts the row index twice. C may emit a field access. BASIC may
flatten the record array.

## Skyfall and defined wrap

Skyfall moves an enemy upward in byte storage:

```lanternfly
EnemyY = EnemyY - FallSpeed
```

Suppose `EnemyY = 2` and `FallSpeed = 5`.

1. Both bytes promote to `INTEGER`.
2. The subtraction yields -3.
3. Assignment narrows to `BYTE`, producing 253.

The source can make the wrap conspicuous:

```lanternfly
EnemyY = BYTE(EnemyY - FallSpeed)
```

Both forms have the same defined result. The explicit form suppresses a
narrowing warning.

On Z80 the optimiser can emit `sub` and store A. In C it should cast through
`uint8_t`; it must not rely on a signed overflow.

## Rushlight and signed difference

Collision uses absolute coordinate differences:

```lanternfly
IF ABS(PlayerX - EnemyX) < 8 AND
   ABS(PlayerY - EnemyY) < 8 THEN
    Caught = -1
END IF
```

Byte promotion occurs before subtraction. A player at x=2 and enemy at x=250
produce -248, whose magnitude is 248. If each subtraction wrapped to byte
first, the magnitude would be 8 and the collision answer could change.

This one translation justifies the promotion rule more strongly than an
abstract preference for signed arithmetic.

The game also uses quotient and remainder to split coordinates:

```lanternfly
column = index MOD 32
row = index / 32
```

On Z80, a constant divisor of 32 lowers to mask and shift. No general division
helper is needed. The cost report should state that strength reduction.

## Snake's fixed ring

The body is a static circular buffer:

```lanternfly
DIM Body[64] AS BYTE
DIM HeadIndex AS BYTE
DIM Length AS BYTE
```

Packing and unpacking a position:

```lanternfly
FUNCTION PackPosition(x AS BYTE, y AS BYTE) AS BYTE
    RETURN BYTE(y * 8 + x)
END FUNCTION

SUB PlotPosition(position AS BYTE, colour AS BYTE)
    FbPlot(
        BYTE(position AND 7),
        BYTE((position SHR 3) AND 7),
        colour
    )
END SUB
```

The source uses explicit byte conversion at the return and call boundary.
Multiplication by eight lowers to a shift.

Movement uses selection:

```lanternfly
FUNCTION NextPosition(head AS BYTE, direction AS BYTE) AS BYTE
    DIM next AS INTEGER

    SELECT CASE direction
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

    RETURN BYTE(next)
END FUNCTION
```

The ring update is:

```lanternfly
HeadIndex = BYTE((HeadIndex + 1) AND $3F)
Body[HeadIndex] = next
```

Search requires no list or heap:

```lanternfly
FUNCTION BodyContains(position AS BYTE) AS INTEGER
    DIM index AS BYTE = HeadIndex
    DIM remaining AS BYTE = Length

    WHILE remaining <> 0
        IF Body[index] = position THEN RETURN -1
        index = BYTE((index - 1) AND $3F)
        remaining = remaining - 1
    END WHILE

    RETURN 0
END FUNCTION
```

Food placement:

```lanternfly
candidate = RandomByte() AND $3F
WHILE BodyContains(candidate)
    candidate = BYTE((candidate + 1) AND $3F)
END WHILE
FoodPosition = candidate
```

The algorithm terminates because game growth stops before all 64 cells are
occupied. Lanternfly does not need a proof system to accept the loop.

## Tetro piece selection

The native engine flattens shape tables by hand. Lanternfly keeps their shape:

```lanternfly
rotation = CurRotation AND 3
CurPieceRight = ShapeRight[CurPieceIndex, rotation]
CurrentPiece = ShapeRotation[CurPieceIndex, rotation]
CurColour = ShapeColour[CurPieceIndex]
```

`ShapeRotation` is a two-dimensional array of near references to four-byte
rotation bitmaps. Assigning its element changes a reference scalar, not the
bitmap.

For a resource layout:

```text
piece count = 7
rotations per piece = 4
reference size = 2
```

the Z80 address calculation for `[piece, rotation]` is:

```text
base + piece * 8 + rotation * 2
```

Both strides are powers of two. The backend can stage piece in HL, shift three
times, then add the doubled rotation. Lanternfly admits the two-index source
regardless of that fortunate layout.

## Tetro collision

Historical Tetro spawns at y=-3, so the routine uses a signed y:

```lanternfly
FUNCTION CheckCollisionAt(x AS INTEGER, y AS INTEGER) AS INTEGER
    DIM boardRow AS INTEGER
    DIM mask AS BYTE

    IF x + CurPieceRight >= 8 THEN RETURN -1

    FOR pieceRow = 0 TO 3
        mask = BYTE(CurrentPiece[pieceRow] SHR x)
        IF mask <> 0 THEN
            boardRow = y + pieceRow
            IF boardRow >= 8 THEN RETURN -1

            IF boardRow >= 0 THEN
                IF BoardRows[boardRow] AND mask THEN RETURN -1
            END IF
        END IF
    NEXT pieceRow

    RETURN 0
END FUNCTION
```

Negative board rows are above the visible board and do not collide. Rows eight
and beyond collide with the floor. Calling y an unsigned byte would obscure
this asymmetry.

`CurrentPiece[pieceRow]` reads through a near reference. A dynamic right shift
may lower to a loop on Z80 and to a native shift elsewhere.

## Tetro locking

A reference parameter makes the helper direct:

```lanternfly
SUB OrPlaneRow(
    plane AS REF TO BYTE[8],
    row AS BYTE,
    mask AS BYTE
)
    plane[row] = plane[row] OR mask
END SUB
```

Locking selects colour planes:

```lanternfly
FOR pieceRow = 0 TO 3
    mask = BYTE(CurrentPiece[pieceRow] SHR PlayerX)
    IF mask <> 0 THEN
        row = PlayerY + pieceRow
        IF row >= 0 AND row < 8 THEN
            OrPlaneRow(REF BoardRows, BYTE(row), mask)
            IF CurColour AND COLOR_RED THEN
                OrPlaneRow(REF BoardRed, BYTE(row), mask)
            END IF
            IF CurColour AND COLOR_GREEN THEN
                OrPlaneRow(REF BoardGreen, BYTE(row), mask)
            END IF
            IF CurColour AND COLOR_BLUE THEN
                OrPlaneRow(REF BoardBlue, BYTE(row), mask)
            END IF
        END IF
    END IF
NEXT pieceRow
```

`CurColour AND COLOR_RED` is an ordinary numeric condition. There is no logical
operator overload.

## Tetro row collapse

Tetro row collapse is the decisive local-alias example:

```lanternfly
SUB CollapseRow(row AS BYTE)
    FOR planeIndex = 0 TO 3
        ALIAS plane = BoardPlanes[planeIndex]

        FOR destination = row TO 1 STEP -1
            plane[destination] = plane[destination - 1]
        NEXT destination

        plane[0] = 0
    NEXT planeIndex
END SUB
```

`plane` binds to one existing `BYTE[8]`. It never creates an array local.

On Z80, the reference may live in IX, IY, HL or a frame slot according to the
routine ABI. On C it can be a `uint8_t *`. On BASIC it may be a plane base
offset into a flattened board array. These are equivalent implementations.

## Tetro framebuffer records

The renderer combines static planes and the current piece:

```lanternfly
FOR row = 0 TO 7
    DIM pieceMask AS BYTE = 0
    DIM pieceRow AS INTEGER = row - PlayerY

    IF pieceRow >= 0 AND pieceRow < 4 THEN
        pieceMask = BYTE(CurrentPiece[pieceRow] SHR PlayerX)
    END IF

    Framebuffer[row].red = BoardRed[row]
    Framebuffer[row].green = BoardGreen[row]
    Framebuffer[row].blue = BoardBlue[row]

    IF CurColour AND COLOR_RED THEN
        Framebuffer[row].red =
            Framebuffer[row].red OR pieceMask
    END IF

    IF CurColour AND COLOR_GREEN THEN
        Framebuffer[row].green =
            Framebuffer[row].green OR pieceMask
    END IF

    IF CurColour AND COLOR_BLUE THEN
        Framebuffer[row].blue =
            Framebuffer[row].blue OR pieceMask
    END IF

    IF ClearMask AND (BYTE(1) SHL row) THEN
        Framebuffer[row].red = $FF
        Framebuffer[row].green = $FF
        Framebuffer[row].blue = $FF
    END IF
NEXT row
```

This one routine combines:

- signed subtraction;
- reference indexing;
- local scalars;
- exact record-array fields;
- masks and dynamic shifts;
- structured loops.

It needs no unsafe pointer arithmetic.

## Pacmo monsters

Pacmo's six-byte monster becomes an exact record:

```lanternfly
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

The dispatcher:

```lanternfly
FOR index = 0 TO ActiveMonsterCount - 1
    TickEnemy(REF Monsters[index])
NEXT index
```

A fragment of the tick:

```lanternfly
SUB TickEnemy(monster AS REF TO Monster)
    IF SplashActive OR PlayerCaught OR RoundDone THEN EXIT SUB

    IF monster.respawnTimer <> 0 THEN
        TickEnemyResp(monster)
        EXIT SUB
    END IF

    monster.timer = monster.timer - 1
    IF monster.timer <> 0 THEN EXIT SUB

    monster.timer = EnemyPeriod
    IF monster.state = ENEMY_ATTACK THEN
        EnemyAttackStep(monster)
    ELSE
        EnemyRoamStep(monster)
    END IF
END SUB
```

Assembly uses IX and carry. Lanternfly uses a record reference and explicit control
results.

## Pacmo respawn scoring

The candidate table is a fixed point array:

```lanternfly
TYPE Point
    x AS BYTE
    y AS BYTE
END TYPE

DIM EnemySpawns[6] AS Point
```

Selection:

```lanternfly
SUB SelectRespawn(monster AS REF TO Monster)
    DIM bestScore AS INTEGER = -1
    DIM score AS INTEGER
    ALIAS best = EnemySpawns[0]

    FOR index = 0 TO COUNT(EnemySpawns) - 1
        ALIAS candidate = EnemySpawns[index]

        IF NOT OccupiedByOther(monster, candidate) THEN
            score = RespawnScore(monster, candidate)
            IF score > bestScore THEN
                bestScore = score
                best = candidate
            END IF
        END IF
    NEXT index

    monster.x = best.x
    monster.y = best.y
END SUB
```

This reveals a flaw: local aliases are immutable bindings, so `best =
candidate` cannot rebind `best`. The correct source uses a reference scalar:

```lanternfly
DIM best AS REF TO Point = REF EnemySpawns[0]

REM inside the loop
IF score > bestScore THEN
    bestScore = score
    best = REF EnemySpawns[index]
END IF
```

That distinction is useful enough to retain. `ALIAS` shortens one stable path;
a reference variable models changing selection.

The routine also needs a declared precondition: its candidate set contains at
least one position not occupied by another monster. Without that guarantee,
the original assembly and the translation both need an explicit no-candidate
branch instead of silently retaining the first entry.

The score uses widened arithmetic:

```lanternfly
FUNCTION Manhattan(a AS REF TO Point, b AS REF TO Point) AS WORD
    RETURN WORD(ABS(a.x - b.x) + ABS(a.y - b.y))
END FUNCTION
```

## Pacmo packed world

The existing 15-bit row layout remains exact:

```lanternfly
TYPE PackedRow15
    high AS BYTE
    low  AS BYTE
END TYPE

DIM World[15] AS PackedRow15
DIM Eaten[15] AS PackedRow15
```

A helper can convert a row to a word with declared bit order:

```lanternfly
FUNCTION RowBits(row AS REF TO PackedRow15) AS WORD
    RETURN (WORD(row.high) SHL 8) OR WORD(row.low)
END FUNCTION
```

Wall test:

```lanternfly
FUNCTION IsWall(x AS BYTE, y AS BYTE) AS INTEGER
    DIM bits AS WORD = RowBits(REF World[y])
    RETURN (bits AND (WORD($8000) SHR x)) <> 0
END FUNCTION
```

This replaces manual `row * 2`, high/low loads and a shift loop. A Z80 backend
may generate nearly the same instructions. The source states the packed
convention once.

## TMS9918 VRAM

VRAM constants use an opaque device address:

```lanternfly
IMPORT PATTERN_TABLE AS VRAM ADDRESS
IMPORT NAME_TABLE AS VRAM ADDRESS

VdpWrite(PATTERN_TABLE, TilePatterns)
VdpFill(NAME_TABLE, $0300, 0)
```

The second argument is a count. `TilePatterns` is a near reference to immutable
CPU memory. The first is a VRAM address. They cannot be exchanged even if both
are represented by 16 bits.

On Z80/TMS9918:

1. set the VDP write address through the control port;
2. stream bytes through the data port.

On a memory-mapped video target, the same service may perform stores. Lanternfly has
not acquired a port instruction or a VRAM dereference.

## Translation coverage

The corpus is covered by a small set:

| Facility                         | Representative program |
| -------------------------------- | ---------------------- |
| assignment and comparison        | Counter, Dot           |
| imported calls and resources     | Slide                  |
| array update and record field    | Trail                  |
| defined narrowing wrap           | Skyfall                |
| widened signed difference        | Rushlight              |
| masks, `SELECT CASE`, `WHILE`    | Snake                  |
| multidimensional reference table | Tetro                  |
| aggregate reference parameter    | Tetro lock             |
| local aggregate alias            | Tetro collapse         |
| signed 8-bit storage             | historical Tetro       |
| exact six-byte record            | Pacmo                  |
| reference equality/selection     | Pacmo                  |
| packed byte record               | Pacmo world            |
| device address space             | TMS9918                |

No listed algorithm requires heap allocation, dynamic containers, closures,
exceptions or general pointer arithmetic.
