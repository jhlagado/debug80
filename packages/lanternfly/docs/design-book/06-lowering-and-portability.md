# Lowering across unlike targets

Lanternfly is portable when its meaning survives a change of substrate. It does not
promise that every target has the same speed, size or library burden.

## The compilation boundary

The conceptual pipeline is:

```text
source
  -> parsed declarations and statements
  -> typed Lanternfly program
  -> target-neutral Lanternfly IR
  -> target lowering
  -> substrate source or machine object
  -> linked runtime and platform services
```

Glimmer may run before the Lanternfly compiler to identify bodies and construct their
interfaces, or it may invoke Lanternfly as a body compiler. Either arrangement must
preserve the same typed boundary.

The intermediate representation should be introduced only after the source
rules are stable enough to deserve it. Its likely operations are simple:

- load and store typed scalar path;
- form typed reference;
- integer unary and binary operation;
- compare;
- conditional and unconditional branch;
- call and return;
- block parameter or temporary;
- host-body exit;
- explicit conversion;
- standard or imported service invocation.

Arrays and records need not be runtime IR values. Their typed paths lower to
references and scalar accesses.

## A backend target has two axes

CPU and platform are independent:

```text
z80 + tec1g
z80 + trs80
z80 + zx81
z80 + spectrum
6502 + target platform
8086 + DOS-like platform
C + hosted runtime
BASIC + chosen dialect
```

The CPU backend defines arithmetic, control and calling mechanics. The platform
profile defines memory regions, bank rules, entry point, device address spaces
and services.

This prevents “Z80” from accidentally meaning “TEC-1G matrix display.”

## Z80 through AZM

AZM is the natural first substrate because Glimmer already generates it.

The Lanternfly backend can emit:

- AZM exact layout declarations or compatible references to Glimmer layouts;
- `.routine` boundaries;
- ordinary Z80 instructions;
- calls to imported helpers;
- AZM ops for selected inline idioms;
- source annotations and explicit mapping metadata.

AZM layout casts calculate constant paths. Runtime Lanternfly paths require generated
address sequences.

Example:

```lanternfly
value = Monsters[index].timer
```

with a six-byte `Monster` can lower conceptually to:

```asm
; HL = zero-extended index
; DE = original index
add hl,hl          ; 2i
add hl,de          ; 3i
add hl,hl          ; 6i
ld de,Monsters
add hl,de
inc hl
inc hl
inc hl             ; timer offset 3
ld a,(hl)
```

The actual selector may find a smaller sequence or preserve registers
differently. The source map attributes every generated instruction to the one
field access.

Strict AZM register contracts verify each emitted routine and imported
boundary. Lanternfly's own typed checks do not replace this substrate proof.

## 6502

A 6502 backend has few registers and no general 16-bit register pair. It is
likely to use:

- zero-page locations for expression temporaries and near pointers;
- memory-resident software values for wider integers;
- helper calls for multiplication, division and 16/32-bit operations;
- indexed-indirect or indirect-indexed forms for array paths;
- static call-frame allocation when recursion is disabled.

Lanternfly's restriction to scalar locals and static aggregates is well suited to
this. A target-specific allocator can give hot references zero-page slots.

The language must not promise that every local lives on a hardware stack. The
6502 backend's local allocation is an implementation detail visible only in
maps and cost output.

## 8086

An 8086 backend can use 16-bit arithmetic directly and 32-bit pairs where
needed. Its segmented memory gives near/far types a natural representation:

- near data reference: offset under an agreed data segment;
- far data reference: segment and offset;
- near procedure: offset under current code segment;
- far procedure: segment and offset with far call/return.

Lanternfly should not equate this implementation with the abstract model. A banked
Z80 uses the same near/far distinction without sharing 8086 instruction
semantics.

Exact records may require byte-oriented access or explicit segment overrides.
The backend must not let a host assembler's structure alignment alter them.

## C

C is a lowering target, not Lanternfly's specification.

A C backend should use `<stdint.h>` types:

```text
BYTE    -> uint8_t
SBYTE   -> int8_t
INTEGER -> int16_t
WORD    -> uint16_t
LONG    -> int32_t
DWORD   -> uint32_t
```

It cannot naively emit every Lanternfly expression as C:

- signed overflow is undefined in C;
- integer promotions may differ;
- right shift of negative signed values has implementation-defined history;
- struct padding can change exact layout;
- evaluation and narrowing may differ;
- pointer provenance does not model every device or banked address.

The backend uses unsigned intermediates, explicit casts, helper functions and
static assertions to preserve Lanternfly.

An exact record can lower to:

- a packed struct with compile-time size/offset assertions on a supported C
  compiler;
- a byte array plus generated field accessors;
- separate arrays when representation is private and observable layout is not
  required.

Imported/exported objects always retain exact Lanternfly layout.

Near and far references may both become C pointers in a flat hosted profile,
but they remain distinct in compiler type checking. Device addresses become
opaque integer-backed structs or typedefs passed only to services.

## BASIC

A BASIC backend is possible, but it is the most demanding semantic adapter.
The chosen dialect must be named. “BASIC” is not one language.

For a Microsoft-style 16-bit integer dialect, the backend may:

- emit `DEFINT` or explicit `%` integer variables in generated code;
- represent unsigned bytes in integers 0..255;
- represent words as signed bit patterns plus comparison helpers;
- flatten records into arrays and calculated offsets;
- flatten multidimensional exact storage when the dialect's array convention
  differs;
- implement references as indexes or integer offsets into generated storage
  pools;
- use `GOSUB` plus global argument/result cells for non-recursive routines;
- implement 32-bit values through paired words or a dialect capability;
- add wrapping and unsigned comparison helpers.

It must avoid the classic upper-bound trap. Lanternfly `DIM Body[64] AS BYTE` means
64 elements. If the dialect's `DIM Body(64)` allocates indexes 0 through 64,
the backend emits `DIM Body(63)`.

Line numbers may appear in generated BASIC if the dialect requires them.
Lanternfly source never uses or sees them.

Some Lanternfly targets will not support a practical BASIC backend. A capability
report should say which integer widths, address classes and service bindings
are missing instead of quietly changing semantics.

## Lowering a typed path

The backend receives:

```text
base object
referent/address class
path segments
scalar result type
read or write context
```

For:

```lanternfly
Framebuffer[row].green
```

with a four-byte row record:

```text
base = Framebuffer
index = row
stride = 4
field offset = 1
width = 1
```

Possible lowerings:

| Target | Shape                                                              |
| ------ | ------------------------------------------------------------------ |
| Z80    | zero-extend row, shift left twice, add base and 1, byte load/store |
| 6502   | scale index, place pointer in zero page, indirect indexed access   |
| 8086   | widen index, shift twice, base+index addressing                    |
| C      | exact-layout accessor or `Framebuffer[row].green`                  |
| BASIC  | `Framebuffer(row * 4 + 1)` in a flattened integer array            |

The meaning is the tuple, not any one spelling.

## Lowering arithmetic

For each typed operation, the backend selector records:

- operand and result type;
- constant operands;
- target instruction capability;
- live temporary pressure;
- speed/size policy;
- helper availability.

Multiplication by a constant can use:

1. zero or identity;
2. a shift;
3. a short addition chain;
4. a general shift-and-add sequence;
5. a runtime helper;
6. the substrate operator.

The selector must preserve result width. Multiplication by 256 is not allowed
to disappear merely because the low byte is zero if the result type is a word.

## Control-flow lowering

Structured control becomes blocks and branches before substrate emission.
This allows:

- Z80 `JR` where in range and `JP` otherwise;
- 6502 inverted-condition branches around a `JMP` when the target is far;
- C structured statements when mappings remain useful;
- BASIC generated labels and line numbers.

Branch sizing is never a source concern. A Lanternfly programmer should not rewrite
an `IF` because a Z80 relative target moved.

`EXIT BODY` targets a backend-provided epilogue block. Function returns target
a function epilogue. Loop exits target loop-specific blocks. Distinguishing
these in IR prevents the Glimmer fall-through bug.

## Calls and ABI adapters

The backend chooses a default Lanternfly ABI. An imported substrate symbol can use a
different ABI through an adapter.

An adapter:

- converts argument widths;
- materializes reference representation;
- places values in registers or stack cells;
- preserves required state;
- invokes the symbol;
- converts the result;
- restores bank/segment state;
- satisfies substrate contracts.

Adapters are generated once when possible. Their cost appears separately from
the call site.

## Capability negotiation

A target profile declares:

- supported scalar types;
- maximum static object size;
- near/far representations;
- available address spaces;
- recursion and reentrancy support;
- native pass-through dialect;
- standard-library implementations;
- platform-service interfaces;
- debug-map and cost-report capability.

The compiler checks the typed program before emitting substrate source.
Unsupported `LONG` or far references produce a precise capability diagnostic.
They do not degrade to floating point or a smaller address.

## Conformance before optimisation

Every backend first implements a reference lowering. It may be slow. It must be
correct.

Optimisations are then checked against:

- numeric vectors;
- memory-layout assertions;
- translated game fixtures;
- differential execution against a reference interpreter or typed IR runner;
- source-map integrity;
- target ABI tests.

A C or interpreter backend is useful as a semantic oracle, but only after it
has explicit helpers for Lanternfly overflow and conversion. Native host operators
alone are not an oracle.

## Portability has visible limits

Portable source can still ask for a target capability:

```lanternfly
REQUIRES FAR DATA
REQUIRES ADDRESS SPACE VRAM
```

A game that imports TMS9918 services is portable among profiles providing that
interface, not universally portable to every computer. Lanternfly separates the
algorithm from the capability; it does not invent devices.

The useful claim is modest: game logic such as chase direction, row collapse,
score update and collision should survive a target change. Display scanout and
bank switching remain target work behind typed boundaries.
