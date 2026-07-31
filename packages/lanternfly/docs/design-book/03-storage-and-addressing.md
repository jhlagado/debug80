# Static storage and ordinal domains

Structured memory is Lanternfly's centre of gravity. The motivating programs
work with known shapes: the language must name the right byte and preserve the
shape across backends. These known shapes need neither ownership frameworks nor
general pointer arithmetic.

## Storage ownership

Module variables own static storage:

```lanternfly
var score as u16 = 0
var body as u8[64]
var monsters as Monster[3]
var playerName as string[24]
```

The linker or substrate places each object in a target region. Its exact size,
layout and address class are known before execution.

Scalar locals may use automatic storage:

```lanternfly
sub chooseMove() as u8
    var candidate as u8 = scanCandidate()
    return candidate
end
```

Counted strings, records and arrays declared inside a routine would allocate
aggregate frame storage, so first-edition locals cannot own them. A local
aggregate name is an `alias` to storage that already exists.

Compiler-owned storage without an initializer begins as all bits zero only
when zero is valid for every leaf. Integers, Booleans and strings qualify —
an uninitialized string begins empty. Enums and subranges qualify when their
domains include ordinal zero.

## Exact records

Fields appear in declaration order with no hidden padding:

```lanternfly
record Monster
    x as u8
    y as u8
    direction as Direction
    timer as u8
    respawnTimer as u8
    state as EnemyState
end
```

If both enums use `u8` representation, this record occupies six bytes. A C
backend cannot silently turn it into an aligned host struct; an AZM backend
cannot round its stride to eight because shifts would be cheaper.

Exact layout is observable through imports, exports, placement and layout
queries. A private backend temporary may use another representation only when
the difference cannot be observed.

Records and arrays contained by value must form an acyclic graph. The language
has no by-value recursive record because it would have no finite size.

## Sealed counted-string storage

A counted string also has exact inline layout, although its cells do not become
source fields. Capacity fixes both the header width and total size:

| Declared type        | Length form                       | Payload begins | Exact size |
| -------------------- | --------------------------------- | -------------- | ---------- |
| `string[N]`, N ≤ 254 | `u8`, never 255                   | offset 1       | N + 2      |
| `string[N]`, N ≥ 255 | target-endian `u16`, never 65,535 | offset 2       | N + 3      |

The last byte reserved by either formula leaves room for a terminator at full
capacity. A length of 255 or more therefore belongs to the long form. The
declared capacity fixes the form even when the current text is short, keeping
every surrounding record offset fixed.

The header, payload and terminator form one sealed value. Source cannot index
the payload or assign the length directly. This removes an otherwise awkward
class of half-valid states: a program cannot update the count while forgetting
the terminator, insert an embedded zero, or write past capacity through an
ordinary array path.

## Array index domains

Every dimension has a fixed, nonempty ordinal domain. The short form states an
element count:

```lanternfly
var body as u8[64]
var nameShadow as u8[24, 32]
```

`u8[64]` is identical to `u8[0 until 64]`. The half-open form makes the count
usable as a loop boundary without subtraction.

Explicit bounds are equally direct:

```lanternfly
var samples as u8[10 to 20]
var board as Cell[1 to 8, 1 to 8]
```

`samples` has eleven elements. The first element is indexed by 10; the board
is one-based in both dimensions.

A named subrange or enum can supply the entire domain:

```lanternfly
range ScreenColumn as u8 = 0 until 32

enum Colour as u8
    black
    red
    green
    blue
end

var rowPixels as u8[ScreenColumn]
var palette as u8[Colour]
```

The enum array has one element per member in declaration order. Its indices are
`black`, `red`, `green` and `blue`, not the integers 0 through 3.

The normalized domain belongs to the array type. Two arrays with the same
element count but different lower bounds or nominal domains are not
assignment-compatible. `u8[8]`, `u8[0 until 8]` and `u8[0 to 7]` normalize to
the same integer domain.

## Index compatibility and checks

Integer domains accept any integer index type. An enum domain accepts its root
enum and subranges of that enum, but not a raw integer or unrelated enum.

```lanternfly
palette[green] = 7
board[row, column].occupied = true
```

A constant outside the domain is a compile error. A dynamic index invokes
`F-BOUNDS` before any load or store when it falls outside. The compiler removes
the check when the index type or value analysis proves containment:

```lanternfly
var column as ScreenColumn
rowPixels[column] = 1
```

`column` cannot hold a value outside `ScreenColumn`, so this access needs no
remaining bounds test.

Two boundaries can reject a value. Conversion into `ScreenColumn` may cause
`F-RANGE`; direct indexing of `rowPixels` with a general integer may cause
`F-BOUNDS`. Both faults occur before the destination changes.

## Layout and addressing

Arrays are contiguous and row-major. The rightmost dimension changes fastest.
Address calculation subtracts each declared lower ordinal before applying its
stride:

```text
u8[12, 20]:
    row * 20 + column

u8[1 to 12, 1 to 20]:
    (row - 1) * 20 + (column - 1)
```

For enum indexing, the member ordinal is the normalized offset. A
non-power-of-two element uses its true size:

```text
monsters[index].timer
    base(monsters) + index * 6 + offset(Monster.timer)
```

A Z80 backend may generate shift-and-add scaling, stage a term in a temporary
or call a multiplier. The six-byte layout does not change.

One bracket operation supplies every index for the selected array rank.
`board[row, column]` is valid; `board[row]`, `board[row][column]` and an extra
third index are not. This keeps partial-row values out of the source model.

## Initialization and startup

Array initializers follow ascending ordinal order. The first initializer maps
to the lower bound, and the rightmost dimension changes fastest:

```lanternfly
var movementCost as u8[1 to 4] = [1, 1, 2, 255]
```

Here the four values map to indices 1 through 4. `for each` uses the same
row-major order.

Record initializers name every field:

```lanternfly
var spawn as Point = Point(x = 7, y = 1)
```

Aggregate `const` declarations create immutable tables with the same exact
layout. Any assignment through a path rooted in constant storage is an error.

Module initializers are constant data. They may use imported constants and
earlier constants or enum members from the same module. A storage layout query
may begin at earlier storage. Types and layouts are complete before they become
visible, so a later declaration cannot create a constant, layout or placement
cycle through an earlier one.

Local scalar initializers are different: they execute once per invocation,
in declaration order, before the routine's statements. Each initializer may
use parameters, module declarations and earlier locals.

Startup order is deterministic when an initializer requires observable writes
or copies. Beginning at the root module, the compiler visits imports depth
first in source order and installs each module after its imports. Declarations
within a module are installed in declaration order. Preloaded image bytes
appear in the same startup-effect order even when no runtime write occurs.

Within an aggregate, initializer expressions evaluate in their written order,
while installed scalar leaves follow exact layout: record declaration order
and row-major array order. A placed variable without an initializer denotes an
existing target object and is never zeroed. A placed initializer must be
supported as preloaded data or an explicit startup operation by the selected
profile.

## Paths carry identity

A storage path begins at a declared or imported object and continues through
fields and complete index operations:

```lanternfly
player.position.x
monsters[selectedMonster].timer
board[row, column]
```

Paths and ordinal selectors are the persistent identity model. If the program
must remember which monster is selected, it stores `selectedMonster`, not an
address. An enum selector can make that relationship nominal when the set is
small and fixed.

Regular objects that assembly builds with pointer tables become
multidimensional arrays. Irregular named objects use an integer or enum
selector plus `select`; a backend may still choose addresses internally.

## Aggregate assignment

Assignment between equal record types or equal fixed-array types copies the
complete aggregate:

```lanternfly
monsters[0] = monsters[1]
```

Ordinary copies have snapshot semantics even when the source and destination
overlap. A backend may use a direction-aware move, a loop or a helper, but it
must preserve that result. The destination must be writable.

## Local aliases

A local alias gives a shorter name to one existing aggregate:

```lanternfly
record Plane
    rows as u8[8]
end

var boardPlanes as Plane[4]

sub collapsePlane(planeIndex as u8, row as u8)
    alias plane as u8[8] = boardPlanes[planeIndex].rows

    var destination as u8
    for destination = row to 1 step -1
        plane[destination] = plane[destination - 1]
    end

    plane[0] = 0
end
```

The initializer is an exact aggregate storage path. The alias neither allocates
nor copies an eight-byte plane, and cannot be rebound. A backend may carry the
selected base in a register pair or frame slot, but that carrier has no source
value.

An alias cannot be stored, returned, compared, converted or used as an array
element. It remains a temporary name for field access, indexing,
counted-string operations, aggregate copy and nested aggregate calls.

## Aggregate parameters

Counted-string, record and array parameters use the same non-rebindable storage
model:

```lanternfly
export sub tickMonster(near monster as Monster)
    monster.timer = monster.timer - 1
end
```

The argument must be compatible mutable aggregate storage, not a temporary
value. A counted-string parameter states its exact capacity. Exported
parameters state `near` or `far`; private parameters may use the target
profile's default.

The storage class describes where the aggregate lives. It is not part of the
element type. In `far handles as near address[8]`, the array is far storage
and each stored element is a near opaque address.

## Near/far storage and opaque address values

Near and far aggregate aliases are backend capabilities. A near aggregate is
directly usable in the current memory context. A far aggregate may require a
bank or segment carrier and helper operations. Neither carrier can be
inspected in source.

`near address` and `far address` are opaque scalar values for native
boundaries. They support same-class assignment and equality, but no field
selection, indexing, conversion or arithmetic. A TMS9918 VRAM location uses one
of those two source types. Its device-space identity is target metadata on the
provider binding or service contract, not a third Lanternfly address type.

Address zero may be a valid native location, so Lanternfly does not invent a
universal null value.

## Layout queries

Five compile-time operations expose useful structure without exposing
addresses:

```lanternfly
const monsterBytes as u16 = size(type Monster)
const monsterCount as u8 = count(monsters)
firstColumn = lower(board, 1)
lastColumn = upper(board, 1)
const timerOffset as u8 = offset(Monster.timer)
```

`count` returns an extent. `lower` and `upper` return the declared bounds and
preserve a nominal enum or subrange result where one exists. `size` reports
exact bytes; `offset` reports the field path from the record base.

The path operand of a layout query is unevaluated. It may contain constant
indices for selecting a nested type, but it performs no load or runtime check.

## Placement, volatility and byte order

`at` places module storage or constant data at a target address:

```lanternfly
volatile var controlPort as u8 at $80
```

Ordinary objects need no source placement clause. The target profile describes
legal memory regions and the default destinations for code, constant data,
writable data and scratch. A standalone build or host may select another
permitted origin. The compiler reserves every `at` range, allocates the rest,
and records a complete placement plan.

For AZM output, `.org` marks the start of each planned segment. It does not
decide the memory map: the validated target regions and placement plan do. AZM
resolves labels and fixups, after which its initialized-byte map,
reserved-address set and symbol table are checked against the plan. This final
comparison catches a segment that grew past its region, an overlap, a wrong
origin or an inline assembly directive that moved output unexpectedly. An
embedded body reports requirements to its host and therefore emits no origin
of its own.

Every volatile read and write is observable. The compiler preserves their
source order and does not merge or invent accesses.

Multi-byte numeric meaning is independent of byte order. A target profile
declares its storage endian convention; wire and file formats use explicit
platform services with their own byte-order contracts.

## Deliberate limits

The first edition has no heap, garbage collector, resizable array or string,
aggregate automatic local, source pointer/reference value, array of pointers,
pointer arithmetic, indirect call, arbitrary bit field or array that spans
mapping contexts.

Packed byte records and masks cover the observed Pacmo layouts. Bounded views
remain open work for algorithms that need a variable-sized region of existing
storage. Neither feature weakens the fixed, address-free source model.
