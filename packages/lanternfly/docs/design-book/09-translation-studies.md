# Translations from the game corpus

The game corpus tests whether Lanternfly can replace ordinary assembly without
absorbing Glimmer or exposing source pointers. These are semantic translations,
not line-for-line transliterations.

## Counter

```lanternfly
counterValue = counterValue + 1

if counterValue >= 10 then
    counterValue = 0
end
```

If `counterValue` is `u8`, addition produces `u16`. Assignment back to the
same `u8` state is a warning-free round trip. The optimizer can still recover
the familiar byte sequence:

```asm
        ld      a,(Count)
        inc     a
        cp      10
        jr      c,_save
        xor     a
_save:
        ld      (Count),a
```

This fixture covers imported mutable state, arithmetic, comparison, Boolean
control and fall-through to a Glimmer epilogue.

## Dot and Slide

Dot movement is an ordinary Boolean decision:

```lanternfly
if dotX < 7 then
    dotX = dotX + 1
end
```

Rendering calls a profile service:

```lanternfly
framebufferPlot(dotX, dotY, green)
```

Slide adds generated immutable data and Boolean state:

```lanternfly
travel = 0
dotX = slideX[travel]
slides = slides + 1
soundArrive()
visible = visible xor true

if visible then
    drawShape(shapeDot, dotX, 3)
end
```

The manifest may expose `shapeDot` as an opaque handle. Lanternfly does not
need to know its generated address.

## Trail

Trail combines indexed update and a pure imported operation:

```lanternfly
trail[dotY] = trail[dotY] or matrixMask(dotX)
```

The destination path evaluates once before the source. Lowering can retain one
resolved address:

```text
path = element(trail, dotY)
old = load u8 path
new = old or matrixMask(dotX)
store u8 path, new
```

An exact framebuffer record keeps rendering readable:

```lanternfly
var row as u8

for row = lower(framebuffer) to upper(framebuffer)
    framebuffer[row].green = trail[row]
end
```

With a four-byte row and `green` at offset one, the address is
`framebuffer + row * 4 + 1`.

## Skyfall and defined wrap

```lanternfly
enemyY = u8(enemyY - fallSpeed)
```

For `u8` values 2 and 5:

1. subtraction produces `i16(-3)`;
2. explicit `u8` conversion retains the low byte;
3. the stored result is 253.

Z80 may use one byte subtraction. C must use explicit fixed-width conversion
rather than depend on host signed overflow.

## Rushlight and signed difference

```lanternfly
if (
    abs(playerX - enemyX) < 8 and
    abs(playerY - enemyY) < 8
) then
    caught = true
end
```

`u8 - u8` produces `i16`, so coordinates 2 and 250 give -248 before `abs`.
Wrapping each subtraction to a byte first would give 8 and could reverse the
collision result.

Constant quotient and remainder remain optimizable:

```lanternfly
column = index mod 32
row = index / 32
```

A Z80 backend can lower these to mask and shift without linking general
division.

## Snake's ring

The ring index is a useful subrange:

```lanternfly
range RingIndex as u8 = 0 until 64

var body as u8[RingIndex]
var headIndex as RingIndex = 0
var bodyLength as u8 = 1
```

The array access needs no bounds check when indexed by `RingIndex`.

```lanternfly
sub packPosition(x as u8, y as u8) as u8
    return u8(y * 8 + x)
end

sub plotPosition(position as u8, colour as u8)
    framebufferPlot(
        u8(position and 7),
        u8((position shr 3) and 7),
        colour
    )
end
```

Direction deserves an enum:

```lanternfly
enum Direction as u8
    up
    down
    left
    right
end
```

```lanternfly
sub nextPosition(head as u8, direction as Direction) as u8
    var next as u8 = head

    select direction
    case up
        next = u8((head - 8) and $3f)
    case down
        next = u8((head + 8) and $3f)
    case left
        next = u8((head and $38) or (u8(head - 1) and 7))
    case right
        next = u8((head and $38) or (u8(head + 1) and 7))
    end

    return next
end
```

The enum makes an unrelated state value invalid at the call boundary and gives
`select` an exhaustive member set.

Search still needs no dynamic collection:

```lanternfly
sub bodyContains(position as u8) as boolean
    var index as RingIndex = headIndex
    var remaining as u8 = bodyLength

    while remaining <> 0
        if body[index] = position then
            return true
        end

        index = RingIndex(u8(index - 1) and $3f)
        remaining = remaining - 1
    end

    return false
end
```

Food search stores another checked selector:

```lanternfly
sub chooseFood() as RingIndex
    var candidate as RingIndex = RingIndex(randomByte() and $3f)

    while bodyContains(candidate)
        candidate = RingIndex(u8(candidate + 1) and $3f)
    end

    return candidate
end
```

The caller keeps the chosen ordinal:

```lanternfly
foodPosition = chooseFood()
```

The game invariant that the snake never fills all 64 cells explains
termination.

## Tetro shapes without reference tables

The assembly engine uses address tables for rotations. Lanternfly retains the
logical shape as a fixed multidimensional table:

```lanternfly
range PieceIndex as u8 = 0 until 7
range RotationIndex as u8 = 0 until 4
range PieceRow as u8 = 0 until 4
```

Glimmer supplies the generated immutable aggregate constant `shapeRows` with
type `u8[PieceIndex, RotationIndex, PieceRow]`. Persistent state stores
selectors:

```lanternfly
var currentPiece as PieceIndex
var currentRotation as RotationIndex
```

A row read names all three dimensions:

```lanternfly
mask = shapeRows[currentPiece, currentRotation, pieceRow]
```

The backend may still use address tables, shifts or generated labels. Those
choices do not become source reference values.

## Tetro collision

Historical spawn position -3 requires signed storage:

```lanternfly
sub checkCollisionAt(x as i16, y as i16) as boolean
    var boardRow as i16
    var mask as u8
    var pieceRow as PieceRow

    if x + currentPieceRight >= 8 then
        return true
    end

    for pieceRow = lower(type u8[PieceRow]) to upper(type u8[PieceRow])
        if x < 0 then
            mask = u8(
                shapeRows[currentPiece, currentRotation, pieceRow] shl -x
            )
        else
            mask = u8(
                shapeRows[currentPiece, currentRotation, pieceRow] shr x
            )
        end

        if mask <> 0 then
            boardRow = y + pieceRow

            if boardRow >= 8 then
                return true
            end

            if boardRow >= 0 then
                if (boardRows[boardRow] and mask) <> 0 then
                    return true
                end
            end
        end
    end

    return false
end
```

Rows below zero are above the visible board; rows eight and above meet the
floor. A dynamic shift may become a loop on Z80.

The layout-query type expression in the loop is illustrative but exact:
`u8[PieceRow]` has the same named domain as the table's third dimension.

## Tetro colour planes

The four planes are regular record fields rather than an array of pointers:

```lanternfly
record Board
    var occupied as u8[8]
    var red as u8[8]
    var green as u8[8]
    var blue as u8[8]
end

var board as Board
```

An exact-shape helper accepts one existing plane:

```lanternfly
sub orPlaneRow(plane as u8[8], row as u8, mask as u8)
    plane[row] = plane[row] or mask
end
```

Calls pass paths directly:

```lanternfly
orPlaneRow(board.occupied, u8(row), mask)

if (currentColour and colourRed) <> 0 then
    orPlaneRow(board.red, u8(row), mask)
end
```

Runtime choice among fields uses an enum and `select`, not a stored address:

```lanternfly
enum Plane as u8
    occupiedPlane
    redPlane
    greenPlane
    bluePlane
end

sub collapsePlane(plane as Plane, row as u8)
    select plane
    case occupiedPlane
        collapseRows(board.occupied, row)
    case redPlane
        collapseRows(board.red, row)
    case greenPlane
        collapseRows(board.green, row)
    case bluePlane
        collapseRows(board.blue, row)
    end
end
```

The selector is one byte. Each helper receives a temporary aggregate alias
implemented by whatever carrier the backend chooses.

## Tetro framebuffer

```lanternfly
var row as u8

for row = lower(framebuffer) to upper(framebuffer)
    framebuffer[row].red = board.red[row]
    framebuffer[row].green = board.green[row]
    framebuffer[row].blue = board.blue[row]
end
```

The full renderer combines signed `row - playerY`, masks, dynamic shifts and
the current shape table through the same typed paths.

## Pacmo monsters

```lanternfly
enum EnemyState as u8
    roaming
    attacking
    respawning
end

record Monster
    var x as u8
    var y as u8
    var direction as Direction
    var timer as u8
    var respawnTimer as u8
    var state as EnemyState
end

var monsters as Monster[3]
```

The enum-backed record remains exactly six bytes. Runtime indexing therefore
uses a true six-byte stride.

```lanternfly
sub tickEnemy(monster as Monster)
    if splashActive or playerCaught or roundDone then
        return
    end

    if monster.respawnTimer <> 0 then
        tickEnemyRespawn(monster)
        return
    end

    monster.timer = monster.timer - 1
    if monster.timer <> 0 then
        return
    end

    monster.timer = enemyPeriod

    select monster.state
    case attacking
        enemyAttackStep(monster)
    case roaming
        enemyRoamStep(monster)
    case respawning
        tickEnemyRespawn(monster)
    end
end
```

The parameter is a temporary alias to caller storage for the duration of the
call.

## Pacmo respawn selection

```lanternfly
range SpawnIndex as u8 = 0 until 6

record Point
    var x as u8
    var y as u8
end

const enemySpawns as Point[SpawnIndex] = [
    Point(x = 1, y = 1),
    Point(x = 7, y = 1),
    Point(x = 13, y = 1),
    Point(x = 1, y = 13),
    Point(x = 7, y = 13),
    Point(x = 13, y = 13)
]
```

Changing selection means changing an index:

```lanternfly
sub selectRespawn(monster as Monster)
    var bestIndex as SpawnIndex = 0
    var bestScore as i16 = -1
    var score as i16
    var index as SpawnIndex

    for index = lower(enemySpawns) to upper(enemySpawns)
        if not occupiedByOther(
            monster,
            enemySpawns[index].x,
            enemySpawns[index].y
        ) then
            score = respawnScore(
                monster,
                enemySpawns[index].x,
                enemySpawns[index].y
            )

            if score > bestScore then
                bestScore = score
                bestIndex = index
            end
        end
    end

    monster.x = enemySpawns[bestIndex].x
    monster.y = enemySpawns[bestIndex].y
end
```

The original reference proposal needed a rebindable `best` pointer. The
current model stores `bestIndex`, which is smaller, serializable, debuggable
and statically tied to the candidate domain.

The routine still needs the game precondition that at least one candidate is
available, or an explicit no-candidate result.

## Pacmo packed world

```lanternfly
record PackedRow15
    var high as u8
    var low as u8
end

var world as PackedRow15[15]
var eaten as PackedRow15[15]
```

```lanternfly
sub rowBits(row as PackedRow15) as u16
    return (u16(row.high) shl 8) or u16(row.low)
end

sub isWall(x as u8, y as u8) as boolean
    var bits as u16 = rowBits(world[y])
    return (bits and (u16($8000) shr x)) <> 0
end
```

The record states byte order once. A Z80 backend may recover nearly the same
loads and shifts as hand assembly.

## TMS9918 VRAM

VRAM locations are opaque device addresses supplied by the profile:

```lanternfly
extern sub vdpWrite(destination as far address, source as far address)
extern sub vdpFill(destination as far address, byteCount as u16, value as u8)

vdpWrite(patternTable, tilePatterns)
vdpFill(nameTable, $0300, 0)
```

`patternTable` and `nameTable` are opaque far-address tokens for VRAM
locations. `tilePatterns` is another far-address token naming immutable binary
data; it is not a constant array passed through a writable aggregate parameter.
The services set a VDP cursor and stream bytes through a port. A memory-mapped
target can implement the same typed interface with stores.

## Coverage

| Facility                         | Corpus pressure              |
| -------------------------------- | ---------------------------- |
| round-trip byte arithmetic       | Counter                      |
| explicit byte narrowing and wrap | Skyfall                      |
| signed byte difference           | Rushlight                    |
| Boolean state and conditions     | Slide, Pacmo                 |
| subrange index and proved bounds | Snake, Pacmo candidates      |
| enum selection and array domains | Snake, Tetro, Pacmo          |
| multidimensional fixed data      | Tetro shapes                 |
| aggregate alias parameter        | Tetro planes, Pacmo monsters |
| exact non-power-of-two record    | Pacmo                        |
| packed byte record               | Pacmo world                  |
| opaque device address            | TMS9918                      |

No listed algorithm requires heap allocation, dynamic containers, closures,
source references, arrays of pointers or general pointer arithmetic.
