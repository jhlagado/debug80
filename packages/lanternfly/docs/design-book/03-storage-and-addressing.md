# Static storage, layouts and references

> [!IMPORTANT]
> This chapter is an exploratory design record. Syntax and policies shown here,
> including uppercase declarations and the rejection of aggregate assignment,
> may have been superseded. The normative 0.3 rules for storage, copying,
> references and bounds checks are in
> [the specification](../specification.md), sections 4 through 7.

Structured memory is Lanternfly's centre of gravity. The corpus rarely asks for
clever syntax. It repeatedly asks to name the right byte inside a known shape.

## Storage objects

A storage declaration owns memory:

```lanternfly
DIM Score AS WORD
DIM Body[64] AS BYTE
DIM Monsters[3] AS Monster
```

At module scope, `DIM` creates static storage. The target linker or substrate
places it in a memory region. The declaration has a stable identity, size and
address class.

Inside a routine, `DIM` may create a scalar local:

```lanternfly
DIM candidate AS INTEGER
```

The backend may place that scalar in a register, a stack slot or statically
allocated scratch when reentrancy rules allow. Source lifetime and value
semantics remain the same.

An array or record declared inside a routine would imply aggregate automatic
allocation. That is deferred. The first language requires aggregate objects to
be static or imported.

## Arrays count elements

Square brackets contain an element count:

```lanternfly
DIM Board[8] AS BYTE
DIM NameShadow[24, 32] AS BYTE
```

`Board` has indexes 0 through 7. `NameShadow` has 24 rows and 32 columns.
Unlike old BASIC, the number is not an inclusive upper bound.

Multiple dimensions are row-major. For:

```lanternfly
DIM Grid[rows, columns] AS Cell
```

the address of `Grid[r, c]` is:

```text
base(Grid) + ((r * columns) + c) * sizeof(Cell)
```

The comma form is preferred in source. A backend IR may represent the same
access as nested arrays. Chained `Grid[r][c]` can be accepted as an equivalent
form if it does not complicate diagnostics.

Constant out-of-range indexes are always errors. Checked execution traps on a
dynamic failure and can remove checks proved unnecessary. An explicitly
selected unchecked release mode omits remaining checks and requires the
program to keep indexes in range.

## Records are exact

A record places fields in declaration order:

```lanternfly
TYPE Monster
    x            AS BYTE
    y            AS BYTE
    direction    AS BYTE
    timer        AS BYTE
    respawnTimer AS BYTE
    state        AS BYTE
END TYPE
```

This record occupies six bytes. There is no hidden padding.

Exact layout is a chosen semantic rule:

- `SIZEOF(BYTE)` is 1;
- `SIZEOF(WORD)` is 2;
- array size is count multiplied by exact element size;
- record size is the sum of exact field sizes;
- field offset is the sum of exact sizes before it.

Power-of-two padding was once attractive in ZAX because a Z80 can scale an
index with shifts. Later ZAX lowering demonstrates the better separation:
retain the real layout and generate shift-and-add multiplication when needed.
Lanternfly adopts that separation from the start.

## Alignment and external layouts

The first layout rule has alignment 1 for every field. A target may use a more
aligned temporary representation internally only when it is unobservable and
not used for a declared object, import, export or `SIZEOF`.

A later explicit alignment facility may request padding:

```lanternfly
REM illustrative, not initial syntax
TYPE HostRecord ALIGN 4
```

Padding must never appear merely because the backend emits C. A C backend can
use packed structs, byte arrays with accessors, or static assertions to
preserve Lanternfly layout.

Imported native data may already have an unusual layout. Its interface must
state exact field offsets, byte order and address space. An opaque imported
type is preferable when a backend cannot represent the layout safely.

## Endianness

Lanternfly defines scalar numeric values independently of memory byte order. A target
profile declares how multi-byte fields are stored. The initial Z80, 6502 and
8086 profiles are little-endian.

Portable code should read a `WORD` field as a value. Code that needs a wire or
file byte order uses explicit services:

```lanternfly
value = READ_LE_WORD(bytes, offset)
WRITE_BE_WORD(bytes, offset, value)
```

Field layout is exact, but it does not make every byte serialization portable
without an endian contract.

## Aggregate values are not freely copied

An aggregate path denotes storage:

```lanternfly
Monsters[index]
Framebuffer[row]
```

It is not automatically a temporary value. The following is not an implicit
six-byte copy:

```lanternfly
REM not initial Lanternfly
Monsters[0] = Monsters[1]
```

Programs use field assignment, `COPY`, or an alias according to intent.
Keeping aggregate copy explicit prevents accidental code-size and time costs
on small machines.

Scalar fields retain normal value semantics:

```lanternfly
Monsters[0].x = Monsters[1].x
```

## Static aliases

A static alias is another name for the same object or subobject:

```lanternfly
ALIAS EnemyState = Monsters[0].state
```

It allocates nothing and has no runtime initialization. The alias is resolved
after layout and before code generation.

This replaces assembly equates such as:

```asm
EnemyState .equ Monster0 + MonsterState
```

with a typed relationship. Writes through either name update the same byte.

Static aliases may select only paths whose address is known at link time.

## Local aliases

A local alias binds a typed name to an existing object selected when execution
reaches the declaration:

```lanternfly
ALIAS plane = BoardPlanes[planeIndex]
```

`plane` is immutable as a binding but mutable as a view: `plane[row] = 0`
writes the selected plane. The binding may require an address-sized temporary,
but it never allocates or copies the eight-byte array.

The initializer may be an aggregate path or a reference-valued expression.
When it is a reference, the alias binds the referent, not the array slot that
stored the reference.

The alias lasts to the end of its lexical block. It cannot escape through a
return or be stored unless explicitly converted to a reference.

This is the natural translation of Tetro row collapse:

```lanternfly
FOR planeIndex = 0 TO 3
    ALIAS plane = BoardPlanes[planeIndex]
    FOR destination = row TO 1 STEP -1
        plane[destination] = plane[destination - 1]
    NEXT destination
    plane[0] = 0
NEXT planeIndex
```

The compiler infers `plane AS BYTE[8]` from the array-of-references element.

## References

A reference is a scalar runtime value that locates existing storage and carries
the target shape:

```lanternfly
DIM CurrentPiece AS NEAR REF TO BYTE[4]
DIM CurrentMonster AS NEAR REF TO Monster
```

A reference does not own its referent. Lanternfly's first version has no lifetime
extension, ownership transfer or allocator. It forms references from
static/imported objects or through an existing reference. Storing or returning
a reference to an owned scalar local is deferred.

Reference formation uses `REF`:

```lanternfly
CurrentMonster = REF Monsters[index]
```

Access is transparent through a typed reference:

```lanternfly
CurrentMonster.timer = CurrentMonster.timer - 1
CurrentPiece[row]
```

There is no general source-level pointer arithmetic. Indexing and field
selection are the arithmetic.

References support:

- assignment between compatible reference types;
- equality and inequality;
- field or index selection through their referent type;
- passing to reference parameters;
- explicit conversion between permitted address classes.

Ordering comparisons, multiplication, bit masks and conversion to ordinary
integers are not defined.

## Arrays of references

Tetro uses an array selecting its four board planes:

```lanternfly
DIM BoardPlanes[4] AS NEAR REF TO BYTE[8] = (
    REF BoardRows,
    REF BoardRed,
    REF BoardGreen,
    REF BoardBlue
)
```

Each element is a scalar reference. The pointed-to arrays remain separate
static objects. This layout is useful on machines with inexpensive address
tables and maps directly to a C array of pointers where address classes permit.

An array of references is not the same as one two-dimensional array. Its planes
may live at unrelated locations or in different sections.

## Reference nullability

Ordinary `REF TO T` is non-null. It must name a valid object before use.

Optional references are written provisionally as:

```lanternfly
MAYBE NEAR REF TO Monster
```

and compared with `NO REF`. This facility is deferred until the corpus needs
nullable links or optional imported objects. Arrays of known resources and
current game aliases are non-null.

Using zero as a universal null is unsafe on machines where address zero is a
valid object or where a far reference has several representations.

## Near and far

`NEAR` and `FAR` describe reachability, not arithmetic width.

A near reference can be accessed in the current memory context. On the initial
Z80 target it is normally a 16-bit address.

A far reference can identify an object in another context. Its representation
is target-defined:

- bank identifier plus 16-bit offset on TEC-1G;
- segment plus offset on 8086;
- flat 24- or 32-bit address elsewhere;
- the same representation as near on a flat target.

The referent type remains part of either reference:

```lanternfly
DIM LocalBoard AS NEAR REF TO BYTE[8]
DIM Asset AS FAR REF TO SpriteData
```

Far access may call a runtime helper and may temporarily change bank or segment
state. The source operation remains a load, store or service call.

## Conversion between address classes

A near reference widens to far when the target can attach the current or
statically known context. This is safe and may be implicit inside one module
or bank declaration.

A far reference narrows only through an explicit operation:

```lanternfly
localAsset = NEAR REF(Asset)
```

The operation requires proof or a runtime mapping action. A target profile
defines whether failure is a compile error, a checked runtime result or an
explicit unsafe assertion. Silent truncation is forbidden.

An object initially fits wholly within one address context. An array that spans
banks is not an ordinary array because `base + index * stride` may change
mapping. A future banked collection type can define that operation.

## Unshaped address values

`NEAR ADDRESS` and `FAR ADDRESS` are opaque scalar location values without a
referent type. They are useful at firmware, linker and native boundaries:

```lanternfly
DIM entry AS FAR ADDRESS
```

A typed `REF TO Monster` is safer for ordinary data because it knows the legal
fields and stride. `ADDRESS(monsterRef)` explicitly discards that shape.
Constructing a typed reference from an unshaped address requires a native or
interface operation with a declared target contract.

Addresses support equality, not ordinary integer masks or arithmetic. A target
service may accept an address plus a bounded offset. Their storage widths are
target-defined, so a record containing `FAR ADDRESS` has a target-dependent
exact layout.

## Procedure references

Code references are distinct from data references:

```lanternfly
NEAR PROC
FAR PROC
```

Their complete typed signatures are deferred with indirect calls. A far
procedure call may need a bank or segment trampoline. Data-reference
arithmetic must never accidentally construct a callable value.

## Device address spaces

TMS9918 VRAM demonstrates a third category. `$0800` in VRAM is not a Z80
address and cannot be dereferenced by the CPU. The processor sets a device
cursor and streams bytes through a port.

A target package can declare an opaque address space:

```lanternfly
ADDRESS SPACE VRAM USING WORD

IMPORT NAME_TABLE AS VRAM ADDRESS
IMPORT VdpFill(target AS VRAM ADDRESS, count AS WORD, value AS BYTE)
```

An address-space value supports:

- equality;
- addition or subtraction of an integer offset when the space permits it;
- calls to services accepting the same address space.

It does not support ordinary field or array dereference. A memory-mapped target
may declare a capability that maps such access, but portable Lanternfly cannot assume
it.

`VRAM ADDRESS` is nominally distinct from `NEAR ADDRESS`, `WORD` and another
device address using the same bits.

## Address calculations

Every typed path lowers to:

```text
base
+ dynamicIndex0 * stride0
+ dynamicIndex1 * stride1
+ constant field and index offsets
```

For `Monsters[i].timer`, the stride is six and the field offset is three.
For `NameShadow[row, column]`, the row stride is 32 and the column stride is
one.

The backend may:

- fold constant terms;
- use shifts for power-of-two strides;
- use shift-and-add for other constant strides;
- stage one dynamic term in a temporary;
- call a multiply helper;
- use a host-language index expression.

It must use a wide enough address calculation type. A 24-by-32 byte array has
768 elements; an 8-bit intermediate cannot address it.

## Two dynamic indices

Lanternfly's language model admits:

```lanternfly
NameShadow[row, column]
```

even on a Z80. Rejecting this common form would leak a scratch-register
shortage into the language.

The first backend implementation may initially lower only one dynamic index
and ask the programmer to stage a row alias:

```lanternfly
ALIAS nameRow = NameShadow[row]
nameRow[column] = tile
```

That is an implementation capability limit, not the permanent semantics. The
diagnostic should offer the staging form and the cost report should compare
both.

## Packed bits

Pacmo stores a 15-column world as two bytes per row. Lanternfly can represent the
external layout exactly:

```lanternfly
TYPE PackedRow15
    high AS BYTE
    low  AS BYTE
END TYPE

DIM World[15] AS PackedRow15
```

The first language does not add arbitrary bit fields. Shifts, masks and small
standard helpers cover the observed programs without introducing
implementation-defined packing.

A future fixed bit-array type would need to specify:

- bit order within each byte;
- row and element stride;
- addressability of individual bits;
- atomicity;
- external layout compatibility.

Until those questions have real demand, an exact byte record is clearer.

## Initialization and placement

Static objects may be zero-initialized or given constant values:

```lanternfly
DIM ClearScore[5] AS WORD = (0, 100, 300, 500, 800)
DIM Spawn AS Point = (7, 1)
```

Record initializers follow field order initially. Named-field initializers can
be added when records become large enough for order to be error-prone.

Target placement is an attribute outside ordinary type spelling:

```lanternfly
REM illustrative target declaration
PLACE AssetData IN BANK 3
```

The core language only needs to know the resulting address class and
visibility. Bank numbers and linker sections belong to target configuration.

## What is deliberately absent

The initial storage model has no:

- heap allocation;
- garbage collection;
- resizable array;
- aggregate stack local;
- implicit aggregate copy;
- untyped pointer;
- unrestricted pointer arithmetic;
- array spanning several banks;
- implementation-defined record padding.

These absences match the corpus and make each stored byte explainable. They do
not prevent sophisticated algorithms over fixed pools, grids, rings and
records.
