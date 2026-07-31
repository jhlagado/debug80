# Translations from the game corpus

The game corpus tests Lanternfly against the work it is meant to take over from
assembly. Each translation preserves the game rule and storage model instead
of following the original instructions line by line.

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

The manifest exposes `shapeDot` as a provider-bound `far address` constant
accepted by `drawShape`. Lanternfly cannot inspect its target representation.

## Trail

Trail combines indexed update and a pure imported operation:

```lanternfly
trail[dotY] = trail[dotY] or matrixMask(dotX)
```

The assignment retains two source path occurrences. Its destination evaluates
first, followed by the right-hand path:

```text
destinationPath = element(trail, dotY)
sourcePath = element(trail, dotY)
old = load u8 sourcePath
new = old or matrixMask(dotX)
store u8 destinationPath, new
```

In this fixture `dotY` is stable, nonvolatile storage, and no effect occurs
between the two path evaluations. After proving those facts and identical
fault behaviour, a backend may share the address calculation. The source rule
does not grant unconditional reuse.

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

Direction is a closed four-value domain, which makes it a natural enum:

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

An unrelated state value is now invalid at the call boundary, and `select` has
an exhaustive member set.

A bounded scan over the fixed ring is enough for search:

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

The caller keeps the chosen ordinal in ordinary state:

```lanternfly
foodPosition = chooseFood()
```

The game invariant that the snake never fills all 64 cells explains
termination.

## Tetro shape tables

The assembly engine uses address tables for rotations. Lanternfly stores the
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

A backend may still use address tables, shifts or generated labels, but none
of those mechanisms becomes a source reference value.

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

The loop spells its domain as `u8[PieceRow]`, which has the same named domain
as the table's third dimension.

## Tetro colour planes

The four planes have regular, named roles, so a record holds them directly:

```lanternfly
record Board
    occupied as u8[8]
    red as u8[8]
    green as u8[8]
    blue as u8[8]
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

The selector occupies one byte. Each helper receives a temporary aggregate
alias implemented through a backend carrier.

## Tetro framebuffer

```lanternfly
var row as u8

for row = lower(framebuffer) to upper(framebuffer)
    framebuffer[row].red = board.red[row]
    framebuffer[row].green = board.green[row]
    framebuffer[row].blue = board.blue[row]
end
```

These field assignments are the fixed part of the renderer. Drawing the
falling piece adds signed `row - playerY`, masks and dynamic shifts, while
continuing to read the current shape through the same typed table paths.

## Pacmo monsters

```lanternfly
enum EnemyState as u8
    roaming
    attacking
    respawning
end

record Monster
    x as u8
    y as u8
    direction as Direction
    timer as u8
    respawnTimer as u8
    state as EnemyState
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

Each call gives `monster` a temporary name for one record in the caller's
array.

## Pacmo respawn selection

```lanternfly
range SpawnIndex as u8 = 0 until 6

record Point
    x as u8
    y as u8
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

The original reference proposal kept a rebindable `best` pointer. Storing
`bestIndex` instead uses one checked ordinal that is smaller, serializable,
debuggable and statically tied to the candidate domain.

The routine still needs the game precondition that at least one candidate is
available, or an explicit no-candidate result.

## Pacmo packed world

```lanternfly
record PackedRow15
    high as u8
    low as u8
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

## TMS9918 address bindings

The profile supplies `far address` bindings, with TMS9918 VRAM identity carried
as target metadata:

```lanternfly
extern sub vdpWrite(destination as far address, source as far address)
extern sub vdpFill(destination as far address, byteCount as u16, value as u8)

vdpWrite(patternTable, tilePatterns)
vdpFill(nameTable, $0300, 0)
```

`patternTable` and `nameTable` are provider-bound `far address` values for VRAM
locations. `tilePatterns` is another provider-bound `far address` value naming
immutable binary data. Device-space identity remains target metadata rather
than a third source type. None of these values is a constant array passed
through a writable aggregate parameter. The services set a VDP cursor and
stream bytes through a port. A memory-mapped target can implement the same typed
interface with stores.

## Coverage

| Facility                              | Corpus pressure              |
| ------------------------------------- | ---------------------------- |
| round-trip byte arithmetic            | Counter                      |
| explicit byte narrowing and wrap      | Skyfall                      |
| signed byte difference                | Rushlight                    |
| Boolean state and conditions          | Slide, Pacmo                 |
| subrange index and proved bounds      | Snake, Pacmo candidates      |
| enum selection and array domains      | Snake, Tetro, Pacmo          |
| multidimensional fixed data           | Tetro shapes                 |
| aggregate alias parameter             | Tetro planes, Pacmo monsters |
| exact non-power-of-two record         | Pacmo                        |
| packed byte record                    | Pacmo world                  |
| near/far address with device metadata | TMS9918                      |

Every listed algorithm fits fixed storage, ordinal selectors and temporary
aggregate aliases. Heap allocation, dynamic containers, closures, source
references, arrays of pointers and general pointer arithmetic add nothing to
these translations.
