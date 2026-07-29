# Services, native code and the runtime

The Z80 does not multiply or divide in one instruction. The 6502 does not have
a native 16-bit arithmetic instruction set. Microsoft BASIC already has
numeric operators but may represent every ordinary integer as signed 16-bit.
Lanternfly needs one source meaning across all three.

Lanternfly uses a layered library model.

## Four implementation layers

### Core semantics

The language defines assignment, arithmetic, comparisons, binary operations,
control flow, typed paths and calls. The backend must implement these whether
through instructions, inline code or helpers.

The programmer never imports `__mul16` to make `a * b` work.

### Visible standard library

The standard library contains target-independent operations that deserve
names:

```lanternfly
distance = ABS(dx)
limited = CLAMP(value, minimum, maximum)
root = ISQRT(area)
FILL(BoardRows, 0)
COPY(Framebuffer, FramebufferBack)
```

Their signatures and edge cases are part of Lanternfly. A backend may replace them
with built-ins or specialized sequences.

### Platform libraries

A platform library names facilities outside the abstract machine:

```lanternfly
key = ScanKeys()
FbPlot(x, y, colour)
SndStart(length, divider)
VdpWrite(address, data)
```

These are typed imports. Another target may implement them differently or not
offer them. Their absence is a target-capability error, not a missing keyword.

### Hidden runtime helpers

A backend runtime fills instruction-set gaps:

- signed and unsigned division;
- wide multiply;
- 32-bit shifts and comparisons;
- nontrivial conversion;
- far load, store and call;
- arithmetic fault dispatch;
- complex constant-stride addressing.

Only referenced helpers are linked. Their names are reserved and do not enter
ordinary source lookup.

## The initial standard library

The first portable set should be small.

### Scalar functions

| Function              | Meaning                                                    |
| --------------------- | ---------------------------------------------------------- |
| `ABS(x)`              | non-negative magnitude in a type wide enough for the input |
| `MIN(a, b)`           | smaller value after normal common-type conversion          |
| `MAX(a, b)`           | larger value after normal common-type conversion           |
| `CLAMP(x, lo, hi)`    | `MIN(MAX(x, lo), hi)`; error if constant `lo > hi`         |
| `SGN(x)`              | -1, 0 or 1 as `INTEGER`                                    |
| `ISQRT(x)`            | floor of integer square root; non-negative input           |
| `POW(base, exponent)` | integer power with non-negative exponent                   |
| `BITCOUNT(x)`         | number of one bits, returned as `INTEGER`                  |

`ABS(minimumSigned)` cannot fit its input type. The result therefore widens:
`ABS(SBYTE)` returns `INTEGER`, `ABS(INTEGER)` returns `LONG`, and
`ABS(LONG)` requires either a `DWORD` result or an arithmetic fault for the
single minimum value. The working choice is `DWORD` for `ABS(LONG)`.

### Aggregate procedures

| Procedure              | Meaning                                       |
| ---------------------- | --------------------------------------------- |
| `FILL(target, value)`  | assign one scalar value to every element      |
| `COPY(target, source)` | copy equal-shape exact storage safely         |
| `MOVE(target, source)` | copy equal-shape storage with overlap allowed |
| `CLEAR(target)`        | `FILL(target, 0)` where zero is valid         |

`FILL` works on an array or a reference to an array. Records are not
elementwise-fillable unless every byte representation of the requested value
has defined meaning. `CLEAR` can zero any aggregate whose fields accept an
all-zero representation.

`COPY` has no-overlap precondition. `MOVE` defines overlap-safe direction.
Keeping both lets a backend use `LDIR`, `memcpy`, `memmove` or loops correctly.

### Shape queries

`COUNT(array)` returns the compile-time element count for one-dimensional
arrays. `COUNT(array, dimension)` handles multiple dimensions. The result is a
compile-time `WORD` unless a larger shape requires `DWORD`.

`SIZEOF(type-or-object)` and `OFFSET(type, field)` are compile-time operations,
not runtime functions.

`LOWERBOUND` is always zero and adds little. `UPPERBOUND(array)` may be supplied
as `COUNT(array) - 1` for BASIC familiarity, but `COUNT` is the canonical
facility because the declaration syntax uses counts.

## Randomness is not a core standard

The games call a random-byte service. Randomness depends on platform state,
seeding and reproducibility, so it belongs to the environment:

```lanternfly
IMPORT RandomByte() AS BYTE
```

A test host can inject a deterministic implementation. A platform can use
firmware, a hardware source or a small PRNG. Lanternfly does not promise a universal
sequence.

## Services may be calls, ops or built-ins

The interface presented to Lanternfly is uniform:

```lanternfly
mask = MxMask(x)
```

The Z80/AZM implementation could be:

- an imported `.routine`;
- an AZM `op` expanded inline;
- a compiler-recognised intrinsic;
- a call to a linked runtime helper.

The interface manifest records enough facts for selection:

```text
name: MxMask
kind: pure function
parameters: BYTE
result: BYTE
effects: none
implementations:
  z80-tec1g: azm-op
  c: inline-expression
  basic: generated-function
```

Source code does not change when the implementation moves from a call to an
inline op.

## Effects in interfaces

An imported routine contract describes source-visible effects:

- storage read;
- storage written;
- device I/O;
- may fault;
- may not return;
- changes current bank or segment;
- timing-sensitive;
- pure.

Register clobbers remain in the substrate-specific half of the contract.

For the first compiler, an undeclared imported procedure is conservatively
assumed to read and write any imported mutable storage and perform I/O. This
prevents unsafe reordering. A pure declaration enables expression use and
constant folding only when the implementation is also deterministic.

## Native declarations

Existing assembly routines enter Lanternfly through typed declarations:

```lanternfly
NATIVE "azm" IMPORT
    FUNCTION CheckCollAt(
        x AS INTEGER,
        y AS INTEGER
    ) AS BYTE FROM "tetro-lib.asm"
END NATIVE
```

The exact surface remains provisional, but the contract must include:

- Lanternfly name and signature;
- substrate symbol;
- supported targets;
- near/far call class;
- memory effects;
- source-visible fault or no-return behaviour;
- backend ABI adapter if the native symbol does not use the default ABI.

The AZM side may add `.routine` register contracts. Those contracts verify the
adapter and implementation, not the Lanternfly call syntax.

## Native blocks

Inline native blocks are an escape hatch:

```lanternfly
NATIVE "azm" TARGET "z80-tec1g"
    ; exact AZM source
END NATIVE
```

An inline block is a statement and forms a scheduling barrier. The compiler
must know its inputs, outputs and memory effects. The minimal first form can
assume it may read and write all visible storage, but it must still state
whether it falls through.

A native block inside a hosted Glimmer body may not return directly around the
host epilogue. The default contract is fall-through. A special no-return block
ends control flow and must be accepted by the host.

Native code has no portable fallback. Compiling it for an unmatched target is
an error unless an alternative implementation is supplied.

## Far helpers

Banked and segmented operations need careful runtime contracts.

A far call typically performs:

1. evaluate and preserve arguments;
2. save the current mapping context;
3. select the callee context;
4. invoke the near entry;
5. retain the result;
6. restore the previous context;
7. return under the caller's context.

Nested far calls require a stack of contexts or a convention that naturally
nests. Interrupt handlers must either preserve the mapping state or run only
from common memory with explicit rules.

A far data load/store has similar problems. The compiler may choose:

- a helper per scalar width;
- a mapped-window abstraction;
- an inline bank switch for known banks;
- a bulk service for arrays.

The cost report distinguishes them. The language type remains `FAR REF TO T`.

## Errors on bare metal

Lanternfly cannot assume exceptions, an operating system or standard output. It can
still define fault classes:

- division by zero;
- invalid arithmetic domain, such as a negative shift count, power exponent or
  integer square-root input;
- invalid checked narrowing;
- failed far mapping;
- inserted bounds check;
- unreachable case assertion.

A target profile binds each class to a fault hook. A debug TEC-1G hook might
stop with a code in known RAM and on the display. A hosted C target might abort
through the Lanternfly runner. A BASIC target might set an error variable and stop.

Ordinary wrapping arithmetic does not fault.

## Library versioning

The core language version and library contracts are separate. A Lanternfly source
unit records:

- required language edition;
- required standard-library edition;
- target capability imports.

A platform library can evolve without changing integer semantics. An imported
signature change is diagnosed like a module-interface mismatch.

## Testing helpers

Every visible standard function receives backend-independent vectors. Hidden
helpers receive the same semantic vectors plus ABI checks on assembly targets.

For example, `ISQRT` vectors cover:

- 0, 1, 2, 3, 4;
- the values immediately below and above perfect squares;
- the maximum value of each supported unsigned type;
- signed-negative rejection;
- identical results across Z80, C and BASIC.

An AZM helper additionally assembles under strict routine contracts and runs in
the emulator. Correct arithmetic with a broken register contract is still a
backend failure.
