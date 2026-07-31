# Lowering across unlike targets

Portability means that source meaning survives a change of substrate. It does
not promise equal speed, code size or library burden.

## Compilation boundary

```text
source
  -> syntax tree with source spans
  -> declarations, ordinal domains and exact layouts
  -> typed program and effect summaries
  -> typed control-flow IR
  -> target lowering
  -> substrate source or machine object
  -> runtime and platform services
```

Glimmer may invoke this pipeline for one body, while a standalone build invokes
it for modules and an entry `sub`. Both routes use the same typed boundary.

The IR carries language decisions rather than reconstructing them in each
backend:

- integer width, signedness and result type;
- Boolean canonical form;
- enum identity, representation and member order;
- subrange host and inclusive normalized bounds;
- array index domains, counts and exact strides;
- path evaluation and fault order;
- destination conversions and proof status;
- calls, effects and host continuations.

Aggregate aliases may have hidden carriers in IR. Those carriers are not
Lanternfly values.

## CPU and platform are separate axes

```text
z80 + tec1g
z80 + trs80
z80 + zx81
z80 + spectrum
6502 + selected platform
8086 + selected platform
C + hosted runtime
BASIC + named dialect
```

The CPU backend owns arithmetic, control and calling mechanics. The platform
profile owns memory regions, mapping rules, entry, device address spaces and
services. “Z80” must not quietly mean one display or firmware.

## Z80 through AZM

AZM is the first substrate because Glimmer already generates and verifies it.
The backend emits exact layouts, `.routine` boundaries, instructions, imported
helpers, source annotations and mapping metadata.

For:

```lanternfly
value = monsters[index].timer
```

with a six-byte `Monster`, the semantic address is:

```text
base(monsters) + index * 6 + offset(Monster.timer)
```

The backend may form `6 * index` as shift-and-add. It may not pad `Monster` to
eight bytes to obtain an easier shift.

A non-zero lower bound is normalized first:

```lanternfly
value = samples[index] // samples as u8[10 to 20]
```

```text
base(samples) + (index - 10)
```

If `index` has the matching subrange type, the bounds check disappears while
the subtraction remains part of addressing.

Strict AZM analysis verifies generated routines and imported adapters. A
source type check does not replace register-contract proof.

## 6502 and 8086

A 6502 backend will often use zero-page temporaries, memory-resident wide
values, static frames and helpers for multiplication or division. Static
aggregates and non-recursive profiles fit that machine well.

An 8086 backend has direct 16-bit arithmetic and a natural near/far
implementation. A near aggregate carrier may be an offset under an agreed
segment; a far carrier may hold segment and offset. Those representations do
not enter source types.

Neither backend may let an assembler's alignment policy alter exact records or
array strides.

## C as a semantic backend

The fixed integers map naturally:

```text
u8  -> uint8_t       i8  -> int8_t
u16 -> uint16_t      i16 -> int16_t
u32 -> uint32_t      i32 -> int32_t
```

Direct textual substitution is unsafe:

- signed C overflow is undefined;
- C integer promotions differ from Lanternfly;
- right shift and narrowing need explicit treatment;
- host structs may add padding;
- evaluation order may differ;
- a C pointer cannot model every banked or device address.

Generated C uses unsigned intermediates, explicit width operations, helpers and
static assertions. An enum can lower to its representation integer, while
generated checks preserve nominal conversion rules. A subrange remains its
host representation plus checks at every entering destination.

Exact records may use verified packed structs or byte arrays with accessors.
Imported and exported storage must preserve the declared layout regardless of
which representation is convenient internally.

## A named BASIC dialect

“BASIC” is not a backend definition. Each dialect chooses different integer,
array and call conventions.

A Microsoft-style 16-bit dialect may:

- represent `u8` as integers 0 through 255;
- represent `u16` as signed bits plus helpers;
- flatten records and arrays into storage pools;
- implement enums as integer cells while preserving compiler checks;
- use `GOSUB` plus generated argument/result cells for non-recursive calls;
- represent 32-bit values with paired words or a dialect capability.

Array bounds need particular care. Lanternfly count shorthand `[64]` contains
64 elements, while a BASIC `DIM body(64)` may contain 65. The backend can emit
an upper bound of 63 or flatten the storage.

Explicit Lanternfly bounds can be useful when a dialect supports them:

```lanternfly
var board as u8[1 to 8, 1 to 8]
```

The generated BASIC may retain those bounds, but it must still reproduce
Lanternfly's row-major layout, exact element count and check order. An enum
domain normally becomes a numeric bound plus compiler-maintained name and type
metadata.

Generated line numbers are acceptable when the dialect needs them. They never
appear in Lanternfly source.

## Lowering a typed path

The backend receives:

```text
base storage identity
storage class
path segments in evaluation order
per-dimension root family, lower ordinal, count and stride
field offsets
leaf type
read or write context
bounds proof or required check
```

For a four-byte framebuffer row:

```lanternfly
framebuffer[row].green
```

```text
base = framebuffer
lower = 0
stride = 4
field offset = 1
width = 1
```

Possible implementations differ, but all compute the same selected byte. A
BASIC backend might use `framebuffer(row * 4 + 1)`; C might use a verified
field accessor.

Index evaluation and checks stay left to right. A failure in the first
dimension prevents evaluation of the second. Destination paths evaluate before
assignment sources.

## Ordinal lowering

Enum values retain nominal identity through type checking and debug metadata.
Their stored bits use the declared integer representation. Enum comparison and
counted traversal use declaration order.

A subrange conversion is:

```text
evaluate source
  -> prove containment or compare normalized bounds
  -> F-RANGE on failure
  -> transfer/store unchanged host representation
```

An array check uses the selected dimension's bounds and faults with
`F-BOUNDS`. A subrange index can prove that check unnecessary. Proof removal is
an optimization only in cost; it preserves the same result and fault boundary
because the type already excludes failure.

`lower` and `upper` fold in the front end. They do not become runtime helper
calls.

## Arithmetic and control

Each typed arithmetic node records operand types, result width, constants,
wrapping rule and possible fault. A backend selector can then choose an
instruction, inline sequence or helper without reapplying host promotion rules.

Structured control becomes blocks and branches before emission. This permits
short or long Z80 branches, inverted 6502 branches, structured C and generated
BASIC labels without exposing branch distance in source.

Loop IR distinguishes the mathematical next value from the stored control
value. Hosted `return` targets a host continuation block; routine `return`
targets the routine epilogue. Bare `exit` targets only the nearest loop.

## Calls and ABI adapters

An adapter:

- evaluates and converts scalar arguments;
- materializes hidden aggregate carriers;
- places values in registers, stack cells or generated storage;
- preserves required machine and mapping state;
- invokes the substrate symbol;
- validates or converts the result;
- restores the caller's context.

The aggregate carrier never enters public typed output as a value. Adapters
are emitted once where possible, and their cost is reported separately.

## Capability negotiation

A target profile states:

- supported integer operations and address classes;
- maximum object and literal sizes;
- checked-index policy;
- recursion and reentrancy capability;
- assembly-fragment pipeline;
- standard-operation and platform-service implementations;
- fault bindings;
- ABI, source-map and cost-report support.

The profile may reject unavailable operations. It cannot change result widths,
enum order, subrange checks, exact layout, evaluation order or loop boundaries.

## Conformance before optimization

A backend begins with a correct reference lowering. Optimization follows
evidence:

- numeric and ordinal vectors;
- exact layout and non-zero-bound assertions;
- range and bounds fault traces;
- translated game fixtures;
- differential execution against the typed IR interpreter;
- ABI tests and substrate verification;
- source-map integrity.

C is useful as a semantic backend only after it implements Lanternfly's
explicit overflow and conversion rules. Host operators alone are not an
oracle.

Portable algorithms can still require named platform services or far storage.
Portability promises stable language meaning across profiles that provide
those capabilities; it does not invent absent hardware.
