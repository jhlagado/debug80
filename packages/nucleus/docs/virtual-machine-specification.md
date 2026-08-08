# Nucleus Virtual Machine 0.1 Specification

## Contents

1. [Status and conformance](#1-status-and-conformance)
2. [Purpose, constraints, and non-goals](#2-purpose-constraints-and-non-goals)
3. [Machine overview](#3-machine-overview)
4. [Address space and memory model](#4-address-space-and-memory-model)
5. [Bytecode image and loading format](#5-bytecode-image-and-loading-format)
6. [Machine state](#6-machine-state)
7. [Runtime values and representation invariants](#7-runtime-values-and-representation-invariants)
8. [Virtual-slot organization](#8-virtual-slot-organization)
9. [Instruction encoding](#9-instruction-encoding)
10. [Data movement and memory access](#10-data-movement-and-memory-access)
11. [Arithmetic, logic, comparison, and conversions](#11-arithmetic-logic-comparison-and-conversions)
12. [Primitive control flow](#12-primitive-control-flow)
13. [Routines and activation storage](#13-routines-and-activation-storage)
14. [Recoverable failure](#14-recoverable-failure)
15. [Safety traps and diagnostics](#15-safety-traps-and-diagnostics)
16. [Nucleus System Services 0.1 ABI](#16-nucleus-system-services-01-abi)
17. [Interpreter contract and Z80 mapping](#17-interpreter-contract-and-z80-mapping)
18. [Native-backend contract](#18-native-backend-contract)
19. [Image validity](#19-image-validity)
20. [Conformance vectors](#20-conformance-vectors)
21. [Feature and cost ledger](#21-feature-and-cost-ledger)

Appendices:

- [A. Complete opcode table](#appendix-a-complete-opcode-table)
- [B. Binary layouts](#appendix-b-binary-layouts)
- [C. Worked lowering examples](#appendix-c-worked-lowering-examples)
- [D. Reference interpreter](#appendix-d-reference-interpreter)
- [E. Z80 dispatch sketch](#appendix-e-z80-dispatch-sketch)
- [F. Implementation sequence](#appendix-f-implementation-sequence)

## 1. Status and conformance

### 1.1 Status

This document defines the Nucleus Virtual Machine 0.1, abbreviated NVM 0.1. It is the normative contract for NVM 0.1 bytecode images, loaders, interpreters, service adapters, and native backends. It is a working specification until the Nucleus 0.1 release is frozen.

The [Nucleus 0.1 Language Specification](specification.md) governs source-language meaning. This document governs the execution target. If the books conflict about source meaning, the language specification prevails. If they conflict about an NVM encoding or state transition, this document prevails. Other repository documents do not override either specification.

In this document, **must** and **must not** state conformance requirements. **May** permits a choice. **Should** states a recommendation whose exception requires a documented reason.

### 1.2 Conforming artifacts

A conforming NVM 0.1 image satisfies every structural and instruction rule in Chapter 19. A conforming loader rejects an invalid image before its first instruction executes. Rejection is a loader result, not a Nucleus safety trap.

A conforming interpreter implements every assigned opcode and service transition, preserves all observable ordering, and stops in the specified halt or trap state. It may use any internal representation that has the same behavior. It must document its image-size, data-size, activation, and host-resource limits.

A conforming compiler emits only valid images and preserves the language specification. Compilation failure is preferable to emitting an image whose behavior is unspecified. A compiler may emit a strict subset of valid instruction sequences, but it may not redefine an opcode.

A conforming native backend consumes the same semantic operations and meets Chapter 18. It need not serialize an NVM image. A serialized bytecode program and native output compiled from the same valid source must be observably equivalent within their documented capacities.

### 1.3 Version and extension policy

The image identifies NVM version 0.1 and Nucleus System Services version 0.1 separately. Version fields are exact, not minimum-version claims. An NVM 0.1 loader rejects other values.

Opcodes and flag bits marked reserved are invalid in a 0.1 image. Extensions require another VM version or an explicitly selected non-conforming mode. An extension must not change the meaning of an image accepted as NVM 0.1.

Tests and the executable model are evidence for this contract. They do not override it.

## 2. Purpose, constraints, and non-goals

### 2.1 Purpose

NVM is a regular compilation target for the small, streaming Nucleus compiler. The instruction set favors direct emission, predictable lengths, simple fixups, and local type-directed selection. It avoids exposing Z80 instruction irregularities to the front end.

The primary interpreter is native Z80 code in a CP/M-like 64 KiB environment. Every 0.1 field and operand therefore fits a byte or little-endian word, and all machine resources have explicit bounds.

### 2.2 Resource accounts

The following are separate measured accounts:

1. compiler core and required immutable compiler constants;
2. compiler writable workspace and emitted output;
3. NVM interpreter and service adapter;
4. loaded program image;
5. runtime data, slots, arguments, and activation storage; and
6. an optional native backend and its output.

The compiler-core account has the language project's hard 16 KiB bank gate. Interpreter or runtime space does not excuse compiler-core growth. This specification sets representations and minimum capacities but does not combine the accounts into a flat 63 KiB budget.

### 2.3 Non-goals

NVM is not a CPU-compatibility layer. It does not expose a source pointer model, dynamic types, garbage collection, exceptions, unwinding, destructors, branch shortening, relocation records, native register allocation, or native peephole rules.

NVM contains no dedicated `if`, `while`, `for`, `select`, pattern, aggregate-copy, or source-scope instruction. Compilers lower source constructs to the primitive operations in this book. In particular, exact-type aggregate assignment uses checked addresses plus ordinary loads and stores; it does not add an unmeasured 0.1 opcode.

Interpreter speed matters after compiler regularity and size. This priority does not permit an unbounded or incomplete interpreter.

## 3. Machine overview

### 3.1 Processing route

The source compiler checks Nucleus types and source categories, then emits target-neutral semantic operations. The first backend serializes those operations as an NVM image. A loader validates the image, allocates zeroed runtime regions, applies static initializers, and starts the entry routine. The interpreter repeatedly decodes one instruction and applies its complete state transition.

A future native backend may consume the semantic operations immediately. The operation vocabulary, not the serialized file, is the frontend/backend boundary.

### 3.2 Selected organization

NVM combines a memory-backed word-slot file with explicit argument, result, error, and activation carriers. This organization gives the streaming compiler uniform addressed destinations without requiring expression-tree recovery or Z80 register allocation.

The slot file contains 128 words. A routine owns a prefix of it, declared by its descriptor. Calls save only the prefix that the caller and callee can both clobber. The model remains pure caller-save: the callee owns no preserved state and performs no cleanup.

### 3.3 Execution states

An instance is in exactly one state:

- **unloaded**: no accepted image exists;
- **ready**: an image is loaded and initialized, but no instruction has run;
- **running**: instructions may execute;
- **halted**: entry returned successfully; or
- **trapped**: a non-recoverable failure stopped execution.

Loading an image creates `ready`. Starting it creates `running`. Only reset or a new successful load leaves `halted` or `trapped`. Stepping any state other than `running` is an implementation-interface error and must not resume the program.

### 3.4 Observable behavior

Observable behavior comprises ordered system-service effects, writes visible through the supplied data image or service boundary, successful termination, recoverable failure results consumed by bytecode, and the final trap record. Interpreter-private dispatch choices are not observable.

## 4. Address space and memory model

### 4.1 Logical regions

NVM separates code offsets from data offsets. Both are unsigned 16-bit quantities, but one cannot be used in place of the other.

- Code offsets range from zero through `codeSize - 1` and address instruction bytes.
- Data offsets range from zero through `dataSize - 1` and address mutable program data.

`codeSize`, `dataSize`, and total image size are each at most 65,535 bytes. A size may be zero only where Chapter 19 permits it. The interpreter may place the regions anywhere in physical memory. No bytecode operation observes their physical bases.

### 4.2 Byte order and alignment

Every encoded or stored word is little-endian: the low byte precedes the high byte. Data words may begin at any valid data offset. NVM imposes no alignment padding or alignment trap.

An access of width `w` is valid when `address + w <= dataSize`, computed without 16-bit wrap. A failed dynamic access performs the Nucleus bounds trap. It performs no partial read or write.

### 4.3 Mutability and initialization

Code, headers, routine descriptors, and initializer records are immutable during execution. The data region is mutable. Loading fills the entire data region with zero bytes, then applies initializer records in order. No relocation pass occurs.

Slots, staged arguments, result, error, completion kind, service cursors, and activation storage are runtime state rather than program data. Bytecode cannot address them as data.

### 4.4 Arithmetic on addresses

`ADDRI`, `ADDO`, `INDEX`, `STRIDX`, and `STRLEN` are the only address-producing operations. Their results occupy ordinary word slots after source type erasure. Arithmetic instructions can physically consume such a word, but a conforming compiler must not emit source-illegal address arithmetic. A valid image is therefore structurally safe but not a substitute for source type checking.

`ADDO` detects mathematical overflow and data-region escape. It never wraps an address; either condition performs the bounds trap.

## 5. Bytecode image and loading format

### 5.1 Canonical order

An image has four contiguous parts:

1. a 32-byte header;
2. one 8-byte descriptor per routine;
3. the initializer section; and
4. the code section.

The sections have no gaps, overlap, alignment padding, or trailing bytes. Chapter 19 defines all validity checks. Appendix B gives byte offsets.

### 5.2 Header

The magic bytes are `4E 56 4D 31`, the ASCII spelling `NVM1`. VM version is `0,1`; service version is `0,1`. `headerSize` is 32, `maxArguments` is 16, and `slotCount` is 128.

The header names the exact image size, section offsets and sizes, data size, entry routine ordinal, and minimum activation capacities. The required activation byte count is at least 4 and the required depth is at least 1. A host that cannot supply both rejects the image.

### 5.3 Routine table

Routine ordinals are zero-based byte values. An image contains 1 through 255 routines. Each descriptor supplies:

- inclusive code entry and exclusive code end offsets;
- parameter count from 0 through 16;
- clobber-prefix count from 0 through 128;
- bit 0, `hasResult`; and
- bit 1, `fails`.

The parameter count must not exceed the clobber count. Other flag bits and the descriptor's reserved byte are zero. Routine code ranges are nonempty, contiguous, ordered, and cover the whole code section. The entry routine has zero parameters and no result; it may be failable.

The table contains no source type tags. The compiler has already checked scalar and alias types.

### 5.4 Initializer section

The section begins with a little-endian record count. Each record is:

```text
address:u16  length:u16  payload:byte[length]
```

Records have positive length, appear in ascending address order, do not overlap, and fit the data region. Missing bytes retain their zero initialization. Even an empty initializer set occupies the two-byte zero record count.

### 5.5 Code section and relocation

The code section contains complete routine bodies in ordinal order. Branch operands are code-section offsets. `CALL` operands are routine ordinals. Absolute data operands are data offsets. The loader adds no base to any encoded operand, so NVM has no relocation section.

Canonical section order does not require the compiler to retain the whole image in fast memory. A streaming backend may spool code and initializer bytes to bulk storage, retain or spool descriptor and fixup records, and then write the canonical image sequentially. An environment with output seeking may instead reserve and patch known regions. Either route produces the same final bytes.

### 5.6 Load transaction

Loading is atomic. The loader first validates the entire immutable image and available capacities. It then allocates or selects runtime regions, zeros data and machine state, copies initializers, initializes services, and enters `ready`. Failure leaves no runnable partial instance.

## 6. Machine state

### 6.1 Normative state fields

An NVM instance contains:

| Field              |     Width or bound | Meaning                                           |
| ------------------ | -----------------: | ------------------------------------------------- |
| `pc`               |            16 bits | Offset of the next instruction within code.       |
| `instructionStart` |            16 bits | Offset captured before decode for trap reporting. |
| `currentRoutine`   |             8 bits | Ordinal whose range contains `pc`.                |
| `slots`            |      128 × 16 bits | Shared memory-backed virtual slots.               |
| `arguments`        |       16 × 16 bits | Staged call or service arguments.                 |
| `argumentMask`     |            16 bits | One bit for each staged argument.                 |
| `result`           |            16 bits | Most recent successful result carrier.            |
| `error`            |             8 bits | Most recent recoverable failure code.             |
| `completion`       |   2 bits logically | `none`, `success`, `result`, or `failure`.        |
| activation arena   |      bounded bytes | Packed caller-save records.                       |
| activation depth   |      bounded count | Number of active records.                         |
| service state      |       host bounded | Stream cursors and adapter-private state.         |
| run state          |             finite | `ready`, `running`, `halted`, or `trapped`.       |
| trap record        | reason, PC, detail | Stable final diagnostic identity.                 |

The result, error, and completion carriers belong to the most recently completed call or service until the instruction sequence that owns the completion consumes it. `GETR`, `GETE`, and `JFAIL` require the stated completion kind.

### 6.2 Reset

Reset after a successful load repeats data zeroing and initializer application, clears slots, arguments, result, error, completion, activations, and trap state, resets all service cursors and outputs to their environment-supplied initial states, selects the entry routine, sets `pc` to its entry, and enters `ready`.

Starting from `ready` changes only the run state to `running`. It does not push an activation record.

### 6.3 Instruction cycle

For each instruction the interpreter:

1. copies `pc` to `instructionStart`;
2. decodes the opcode and its fixed operands;
3. computes `nextPC = pc + instructionLength` without wrap;
4. performs all stated checks and state changes; and
5. sets `pc` to `nextPC` unless the instruction branches, calls, returns, halts, or traps.

A trap leaves `pc = instructionStart`. No part of a state transition described as atomic remains committed after its failed check. Earlier completed instructions remain visible.

### 6.4 Interpreter-private state

A Z80 interpreter may hold cached bases, dispatch pointers, scratch words, host return state, and temporary arithmetic values. Such fields are inaccessible to bytecode, absent from activations, and irrelevant to observable equivalence.

## 7. Runtime values and representation invariants

### 7.1 Scalar carriers

Every slot and argument is a 16-bit word. The compiler selects operations by static source type.

- A `u8` has high byte zero.
- A Boolean is exactly 0 or 1.
- A `u16` is any word.
- An aggregate alias is a data offset in a word.

Instructions that require `u8` or Boolean operands do not mask or reinterpret another carrier. Supplying one is invalid execution caused by invalid bytecode or corrupted state; valid compiled programs cannot produce it.

Unsigned arithmetic wraps modulo 256 or 65,536 as selected by the opcode, except division and checked narrowing. Comparisons are unsigned. Unary minus uses the same modular arithmetic. Bitwise `not`, `and`, and `or` operate at the selected width. Boolean `not` is separate.

### 7.2 Records and fixed arrays

Records use declaration order, no padding, and the following field widths:

- `u8` and `boolean`: 1 byte;
- `u16`: 2 bytes;
- fixed record, fixed array, and bounded string fields: their complete inline extent.

A fixed array stores elements consecutively with the element's extent as its stride. Its runtime alias is the offset of element zero. The static compiler supplies stride and declared length to `INDEX`; neither is stored beside the array.

Records and arrays carry no runtime type or length tag. The compiler preserves their nominal source types.

### 7.3 Bounded strings

`string[N]` occupies `N + 1` bytes. Byte zero is the logical length `L`; bytes 1 through `L` are the byte sequence; the remaining payload is unspecified storage. The invariant is `0 <= L <= N`, where `1 <= N <= 255`.

A string alias is the offset of the length byte. `STRLEN` reads the length after checking the invariant. `STRIDX` checks an index against `L`, not `N`, and returns the selected payload address. Assigning through that address changes one byte but not the length. NVM 0.1 has no resize instruction.

### 7.4 Aliases and lifetime

An alias has no runtime tag, ownership bit, or lifetime counter. It denotes storage by data offset. Every alias a conforming compiler emits has an exact referent type and denotes program-lifetime storage. Field selection uses `ADDO`; array and string selection use checked address instructions.

Because Nucleus 0.1 allocates every owned aggregate in program data, including routine-private static objects, a valid aggregate alias remains addressable across calls. Slot save and restore preserves alias words like other scalar carriers.

### 7.5 Invalid representations

An out-of-data address or stored string length greater than its declared capacity performs the bounds trap. A noncanonical byte or Boolean carrier used by an instruction that requires the corresponding source type is invalid execution. Valid compiler output cannot produce that state; Section 15.7 defines the implementation response without adding another source trap.

## 8. Virtual-slot organization

### 8.1 Shared slot file

Slots are numbered 0 through 127. Slot operands are one byte, but a routine may address only `0 .. clobberCount - 1`. A routine's parameter values arrive in slots `0 .. parameterCount - 1`.

Each routine descriptor declares one clobber prefix. It covers parameters, named scalar locals, aggregate-alias bindings, and expression temporaries. Slots have no permanent source name or type.

### 8.2 Page-aligned Z80 mapping

The primary implementation should place the 256-byte slot file on a 256-byte boundary. Slot `s` then occupies byte offsets `2s` and `2s+1` in that page. A handler can double the one-byte operand and combine it with a fixed high byte. This mapping is an implementation recommendation, not bytecode-visible state.

Repository measurements of three isolated Z80 dispatch/slot sketches found the page-aligned common-helper variant used 162 core bytes, a 64-T-state dispatch, and 350 T-states for the measured `ADD` path. The alternatives measured 165/458 and 210/299 respectively. These figures select the access shape among those sketches; they do not estimate the complete interpreter.

### 8.3 Argument staging

`ARG` copies a slot word into an indexed argument cell and sets its mask bit. Writing the same argument index again replaces the value. A `CALL` or `SVC` requires the mask to equal its signature exactly. On successful acceptance of the call or service, the machine clears the entire mask.

No other instruction clears staged arguments. Compilers must complete one argument set before starting another. A malformed set is invalid execution and produces no callee or service effect.

### 8.4 Slot liveness

Slot contents outside the current routine's declared prefix are not available to that routine. A compiler may reuse a slot after its source value is dead. It must retain every scalar argument value and alias address until all argument expressions have been evaluated and staged.

## 9. Instruction encoding

### 9.1 General form

Every instruction begins with one opcode byte. The opcode fixes the number and width of all following operands. A slot, argument index, routine ordinal, service ordinal, trap number, or byte immediate occupies one byte. A word immediate and code target occupy two little-endian bytes.

The notation in the table uses:

- `s`, `a`, `b`, and `d` for slots;
- `q` for an argument index;
- `r` for a routine ordinal;
- `v` for a service ordinal;
- `t` for a trap number;
- `i8` and `i16` for constants;
- `x` for a data offset; and
- `p` for a code offset.

Multi-source operations encode sources before the destination. The instruction width never depends on an operand value.

### 9.2 Complete opcode assignment

| Opcode | Mnemonic  | Operands after opcode | Width | Meaning                              |
| -----: | --------- | --------------------- | ----: | ------------------------------------ |
| `0x00` | `NOP`     | —                     |     1 | no effect                            |
| `0x01` | `LDI8`    | `i8, d`               |     3 | byte constant                        |
| `0x02` | `LDI16`   | `i16, d`              |     4 | word constant                        |
| `0x03` | `MOV`     | `s, d`                |     3 | complete slot copy                   |
| `0x04` | `ARG`     | `s, q`                |     3 | stage one argument                   |
| `0x05` | `GETR`    | `d`                   |     2 | consume a successful result          |
| `0x06` | `GETE`    | `d`                   |     2 | consume a recoverable error code     |
| `0x08` | `JMP`     | `p`                   |     3 | unconditional branch                 |
| `0x09` | `JZ`      | `s, p`                |     4 | branch when zero                     |
| `0x0a` | `JNZ`     | `s, p`                |     4 | branch when nonzero                  |
| `0x0b` | `JFAIL`   | `p`                   |     3 | branch on failed completion          |
| `0x0c` | `TRAP`    | `t`                   |     2 | explicit safety trap                 |
| `0x10` | `ADD8`    | `a, b, d`             |     4 | byte addition                        |
| `0x11` | `SUB8`    | `a, b, d`             |     4 | byte subtraction                     |
| `0x12` | `MUL8`    | `a, b, d`             |     4 | byte multiplication                  |
| `0x13` | `DIV8`    | `a, b, d`             |     4 | byte division                        |
| `0x14` | `AND8`    | `a, b, d`             |     4 | byte bitwise and                     |
| `0x15` | `OR8`     | `a, b, d`             |     4 | byte bitwise or                      |
| `0x18` | `ADD16`   | `a, b, d`             |     4 | word addition                        |
| `0x19` | `SUB16`   | `a, b, d`             |     4 | word subtraction                     |
| `0x1a` | `MUL16`   | `a, b, d`             |     4 | word multiplication                  |
| `0x1b` | `DIV16`   | `a, b, d`             |     4 | word division                        |
| `0x1c` | `AND16`   | `a, b, d`             |     4 | word bitwise and                     |
| `0x1d` | `OR16`    | `a, b, d`             |     4 | word bitwise or                      |
| `0x20` | `NEG8`    | `s, d`                |     3 | byte negation                        |
| `0x21` | `NEG16`   | `s, d`                |     3 | word negation                        |
| `0x22` | `NOT8`    | `s, d`                |     3 | byte complement                      |
| `0x23` | `NOT16`   | `s, d`                |     3 | word complement                      |
| `0x24` | `LNOT`    | `s, d`                |     3 | Boolean not                          |
| `0x25` | `NARROW8` | `s, d`                |     3 | checked word-to-byte conversion      |
| `0x28` | `EQ8`     | `a, b, d`             |     4 | byte equality                        |
| `0x29` | `NE8`     | `a, b, d`             |     4 | byte inequality                      |
| `0x2a` | `LT8`     | `a, b, d`             |     4 | unsigned byte less-than              |
| `0x2b` | `LE8`     | `a, b, d`             |     4 | unsigned byte less-or-equal          |
| `0x2c` | `GT8`     | `a, b, d`             |     4 | unsigned byte greater-than           |
| `0x2d` | `GE8`     | `a, b, d`             |     4 | unsigned byte greater-or-equal       |
| `0x30` | `EQ16`    | `a, b, d`             |     4 | word equality                        |
| `0x31` | `NE16`    | `a, b, d`             |     4 | word inequality                      |
| `0x32` | `LT16`    | `a, b, d`             |     4 | unsigned word less-than              |
| `0x33` | `LE16`    | `a, b, d`             |     4 | unsigned word less-or-equal          |
| `0x34` | `GT16`    | `a, b, d`             |     4 | unsigned word greater-than           |
| `0x35` | `GE16`    | `a, b, d`             |     4 | unsigned word greater-or-equal       |
| `0x40` | `ADDRI`   | `x, d`                |     4 | constant data address                |
| `0x41` | `ADDO`    | `a, i16, i16, d`      |     7 | checked constant-offset address      |
| `0x42` | `INDEX`   | `a, s, i16, i16, d`   |     8 | checked fixed-array element address  |
| `0x43` | `STRLEN`  | `a, i8, d`            |     4 | checked bounded-string length        |
| `0x44` | `STRIDX`  | `a, s, i8, d`         |     5 | checked existing string-byte address |
| `0x48` | `LOAD8`   | `a, d`                |     3 | data byte load                       |
| `0x49` | `LOAD16`  | `a, d`                |     3 | data word load                       |
| `0x4a` | `STORE8`  | `s, a`                |     3 | data byte store                      |
| `0x4b` | `STORE16` | `s, a`                |     3 | data word store                      |
| `0x50` | `CALL`    | `r`                   |     2 | invoke a bytecode routine            |
| `0x51` | `SVC`     | `v`                   |     2 | invoke a standard service            |
| `0x52` | `RET`     | —                     |     1 | successful result-free return        |
| `0x53` | `RETV`    | `s`                   |     2 | successful value return              |
| `0x54` | `FAIL`    | `s`                   |     2 | failed return with byte code         |

All other opcode bytes are reserved and invalid in an NVM 0.1 image. The highest assigned opcode is below `0x80`; a Z80 implementation may therefore use one 256-byte page containing 128 two-byte dispatch addresses.

### 9.3 Source-first order

`STORE8` and `STORE16` name the value before the address. Arithmetic, comparison, and address formation name every read before the destination. `ARG` names the source slot before its staging index. This order keeps compiler emission regular and avoids a destination-first special case in the most common three-slot handlers.

### 9.4 No embedded source types

An opcode width is the only runtime width selection. No instruction contains a source type ID, record ID, mutability flag, array type, or result type. Static metadata determines the opcode and immediate layout facts during compilation.

## 10. Data movement and memory access

### 10.1 Constants and movement

`LDI8 value, destination` writes a zero-extended byte. `LDI16 value, destination` writes the complete word. `MOV source, destination` copies all sixteen bits. A canonical `u8` value is already its widened `u16` value, so widening needs no opcode; the compiler emits `MOV` only when allocation requires another slot.

### 10.2 Address immediates and offsets

`ADDRI offset, destination` writes a constant data offset after checking that it is below `dataSize`. It normally supplies the address of a program-lifetime root.

`ADDO base, offset, extent, destination` computes the mathematical sum of the base slot and constant byte offset. The positive extent describes the selected field or subobject. The complete region must fit data; otherwise the instruction performs the bounds trap. It never wraps.

### 10.3 Fixed-array indexing

`INDEX base, index, length, stride, destination` requires positive constant length and stride. It first checks the unsigned slot index against the fixed length. It then computes `base + index * stride` mathematically and checks a region of one stride. On success it writes the element address. Either failed check performs the bounds trap before the destination changes.

### 10.4 Bounded strings

`STRLEN base, capacity, destination` checks a positive capacity, the complete `capacity + 1` byte region, and the stored invariant `length <= capacity`. It writes the length as a canonical byte.

`STRIDX base, index, capacity, destination` performs the same object and invariant checks, then checks `index < length`. It writes `base + 1 + index`. Capacity storage beyond the current length remains inaccessible through this operation. Either instruction performs the bounds trap on failure.

### 10.5 Loads

`LOAD8 address, destination` checks one byte, loads it, and zero-extends it. `LOAD16 address, destination` checks two consecutive bytes and loads the little-endian word. A failed region check traps before the destination changes.

### 10.6 Stores

`STORE8 source, address` requires a canonical byte, checks one data byte, and stores the source. `STORE16 source, address` checks two bytes and stores the low byte followed by the high byte. A failed precondition performs no partial store.

A conforming compiler uses `STORE8` for `u8`, Boolean, and bounded-string byte destinations. Byte assignment through a bounded-string index writes one payload byte and never the length. Exact-type aggregate assignment copies the complete `N + 1` byte string representation, including the length byte.

### 10.7 Runtime and static responsibilities

The address instructions enforce the supplied dynamic region checks. They do not prove that a constant offset belongs to the nominal record type or that a stride belongs to the selected array type. Those are compiler obligations. NVM bytecode is an execution format rather than a hostile-code capability system.

For exact-type aggregate assignment, the compiler obtains a checked destination address and a checked source address for the complete common extent before emitting the first store. It may then emit a straight-line sequence of `LOAD16`/`STORE16` pairs with a final `LOAD8`/`STORE8` pair, or byte pairs throughout. It may instead emit a counted byte-copy loop that walks the common extent with `INDEX` at unit stride. The loop counter is an ordinary `u16` slot; only `INDEX` forms each dynamic address. Both forms perform the complete-extent checks before the first store, and a compiler may select either form by any semantics-preserving policy. The source type system makes two distinct same-type aggregate paths disjoint, and self-assignment is a no-op, so the generated sequence requires no overlap direction or temporary object. NVM 0.1 deliberately has no block-copy opcode.

## 11. Arithmetic, logic, comparison, and conversions

### 11.1 Width rule

An `8` instruction requires canonical byte sources, reads their low bytes, and writes a zero-extended byte. A `16` instruction reads and writes complete words. Sources are read before any destination is written, so a source and destination may name the same slot.

### 11.2 Modular arithmetic

`ADD`, `SUB`, and `MUL` write the mathematical result modulo 256 or 65,536 according to the suffix. `NEG` writes zero minus the source under the same modulus. Overflow and underflow are defined wraparound and do not trap.

### 11.3 Division

`DIV8` and `DIV16` perform unsigned integer division and discard the remainder. A zero divisor performs the division-by-zero trap before the destination changes.

### 11.4 Integer logic

`AND`, `OR`, and `NOT` combine or complement the bits in the selected width. They implement the integer meanings of the source words. The source language has no `xor`, shift, rotate, or remainder operator, so NVM 0.1 assigns no opcode for one.

### 11.5 Boolean logic

`LNOT` requires a canonical Boolean and writes one minus that value. Boolean `and` and `or` have no opcode: the compiler lowers short-circuit behavior with `JZ`, `JNZ`, and primitive blocks so an omitted right operand performs no operation.

### 11.6 Checked narrowing

`NARROW8 source, destination` writes the source only when it is at most 255. A larger source performs the narrowing trap. It does not mask or wrap. A compiler may omit it only after proving the source in range.

### 11.7 Comparisons

Every comparison reads two unsigned operands in its selected width and writes a canonical Boolean. `EQ`, `NE`, `LT`, `LE`, `GT`, and `GE` have their ordinary mathematical relations. Boolean equality and inequality use the byte family; a conforming compiler does not emit Boolean ordering.

## 12. Primitive control flow

### 12.1 Branch targets

Every branch target is a code-section offset inside the current routine and at an instruction boundary. The target replaces the already advanced `pc` when the branch is taken.

### 12.2 Unconditional and Boolean branches

`JMP target` always branches. `JZ source, target` requires a canonical Boolean and branches when it is zero. `JNZ source, target` branches when it is one. NVM does not interpret arbitrary nonzero integers as source Booleans.

### 12.3 Structured control

`if`, `elseif`, and `while` become Boolean branches and joins. `exit` becomes a branch to the innermost loop exit. `continue` becomes a branch to the innermost loop update or condition. None requires a VM block stack.

### 12.4 Counted loops

Start and bound are evaluated once. The constant step sign selects the comparison direction, and unsigned comparisons and branches implement `to` or `until`. The counter is a scalar local that source statements cannot change while the loop is active, so a value reaching the update still satisfies the comparison that admitted its iteration.

For current counter `c`, saved bound `b`, and positive step magnitude `s`, an admitted lowering exits without storing under these conditions:

| Form             | Exit condition | Otherwise store |
| ---------------- | -------------- | --------------- |
| positive `to`    | `b - c < s`    | `c + s`         |
| positive `until` | `b - c <= s`   | `c + s`         |
| negative `to`    | `c - b < s`    | `c - s`         |
| negative `until` | `c - b <= s`   | `c - s`         |

The active-iteration invariant makes each subtraction nonnegative, so no wider VM integer is required. Under a negative step, a continuing next value is automatically within the unsigned counter type: it is at or beyond a nonnegative bound and no greater than the current counter. A continuing positive next value also fits for a `u16` counter or a `u8` counter with a `u8` bound. Only a positive `u8` counter with a `u16` bound needs another check: when `s` is at most 255, `c > 255 - s` performs `TRAP loop-range`; when `s` is greater than 255, every continuing path traps. The trap occurs before the store. NVM has no counted-loop opcode or hidden loop state.

### 12.5 Failure branch

`JFAIL target` is legal only at the completion-consumption position fixed by Chapter 14. On failed completion it branches and preserves the error for `GETE`. On result completion it falls through and preserves the result for `GETR`. On successful result-free completion it falls through and clears completion.

## 13. Routines and activation storage

### 13.1 Argument staging

`ARG source, index` requires completion `none`, copies one complete slot to argument cell `index`, and sets the corresponding mask bit. The index is 0 through 15. Repeating an index replaces the staged value. `ARG` has no source-visible effect beyond the next call or service.

The compiler evaluates all source arguments from left to right into ordinary slots before it emits any `ARG` for that invocation. This prevents a nested call in a later argument from consuming a partially staged outer call. It then stages the final carriers in parameter order.

### 13.2 Accepted argument set

Before `CALL`, the mask must contain exactly indices zero through `parameterCount - 1` for the callee and no others. Before `SVC`, it must match the service signature in Chapter 16. An exact zero-argument set has a zero mask.

An accepted call or service clears the whole mask. A malformed mask is invalid execution and produces no callee or service effect. Valid compiler output cannot produce it.

### 13.3 Caller-save overlap

For a call from routine `C` to routine `D`, the save count is:

```text
min(C.clobberCount, D.clobberCount)
```

Only that shared prefix can be both live for the caller and overwritten by the callee. Slots above the callee prefix remain untouched. Slots above the caller prefix are not caller values.

### 13.4 Activation record

Each non-entry call pushes one packed record:

| Field                                 |                  Size |
| ------------------------------------- | --------------------: |
| saved slots 0 through `saveCount - 1` | `2 * saveCount` bytes |
| return code offset                    |               2 bytes |
| caller routine ordinal                |                1 byte |
| save count                            |                1 byte |

The record size is `4 + 2 * saveCount`. Records form a last-in, first-out arena. The final count byte makes the top record self-delimiting: a return reads it, computes the complete size, and then finds the return offset and caller ordinal. The VM records a depth independently from byte use so either configured limit can stop a call.

### 13.5 Call transition

`CALL routine` requires completion `none` and performs these steps atomically until the callee begins:

1. verify the exact staged-argument mask;
2. compute the save count and record size;
3. check activation depth and byte capacity;
4. push the saved slot prefix, return offset, caller ordinal, and save count;
5. clear the callee's declared clobber prefix;
6. copy the staged argument cells to leading parameter slots;
7. clear the argument mask and set completion to `none`;
8. select the callee routine and its entry offset.

If capacity is insufficient, the activation-capacity trap occurs after source arguments have been evaluated and staged but before the record, slots, mask, current routine, or `pc` changes.

### 13.6 Successful return

`RET` completes a result-free routine successfully. `RETV source` captures one complete result carrier, then completes a result-bearing routine successfully.

For a non-entry activation the VM pops the record, restores the saved prefix, selects the caller, and resumes at the saved offset. An infallible result-free return leaves completion `none`. A failable result-free success leaves completion `success`. A result-bearing success leaves completion `result` and the captured carrier in `result`.

`GETR destination` requires result completion, copies the result carrier, and clears completion. It works for scalar results and transient aggregate-alias results; the compiler retains their static type and source category. A source aggregate result is transient even though its lowered carrier occupies a slot: the compiler must consume it as an argument, return, selection, discard, or aggregate-copy source rather than preserve it as a source-level local alias. If another call occurs during that containing operation, ordinary live-slot save rules preserve the carrier until consumption.

### 13.7 Early return and recursion

Every return performs the same pop and restore. The callee owns no preservation set, destructor, cleanup list, or epilogue obligation. The VM call operation preserves the caller's overlap once, and every early callee return uses the same record.

Direct and mutual recursion use ordinary `CALL`. Each nested call receives a distinct saved record, so active scalar locals and alias carriers are restored correctly. No routine-specific recursion opcode or static recursion ban exists.

### 13.8 Entry return

The entry routine has no activation record. Its `RET` terminates successfully. `RETV` is invalid because the entry descriptor has no result. Entry failure is defined in Chapter 14.

## 14. Recoverable failure

### 14.1 Failed return

`FAIL source` requires a failable routine and a canonical byte code. It captures the code, then performs the same pop and caller restoration as a successful return. It leaves completion `failure`, stores the code in `error`, and produces no result.

The result carrier and any caller destination remain unchanged. Error code zero is valid.

### 14.2 Required call sequence

Every call or service that may fail is immediately followed in byte order by `JFAIL`. A result-bearing success path then executes `GETR`. A result-free success path needs no result instruction. The failure target begins with `GETE` unless it is a validator-proved shared target whose first operation has the same effect.

`GETE destination` requires failure completion, writes the zero-extended error code, and clears completion. `GETR` and `GETE` are mutually exclusive paths for one failable result.

### 14.3 Result and error destination order

On success, `GETR` alone writes the result destination. On failure, that path is skipped and `GETE` writes the error destination. They may name the same slot. The result wins on success and the code wins on failure, which implements the source same-destination `on error` rule.

### 14.4 Propagation

The compiler lowers `or fail` to `JFAIL` targeting `GETE temporary` followed by `FAIL temporary`. The current activation returns through its ordinary caller-save record. NVM performs no search or unwind.

### 14.5 Local handling

For `on error`, the failed path begins after `GETE` has established the source handler binding. The block then uses ordinary branches, returns, calls, or another `FAIL`. A trap never enters this path.

### 14.6 Result-free failures

A successful failable result-free call leaves completion `success`; its immediate `JFAIL` clears that state and falls through. A failed call branches while preserving failure until `GETE`. No dummy result carrier or destination is required.

### 14.7 Entry failure

`FAIL` in the entry routine has no caller. It performs the unhandled-error trap with the captured byte code. It does not leave recoverable completion for the environment.

### 14.8 No exceptions

There is no handler stack, caught region, throw, saved stack pointer, destructor, `finally`, `defer`, or nonlocal recovery. Failure is one explicit return outcome and one explicit caller branch.

## 15. Safety traps and diagnostics

### 15.1 Stable trap numbers

| Number | Name                | Cause                                                       |
| -----: | ------------------- | ----------------------------------------------------------- |
| `0x01` | bounds              | checked data region, array index, or string byte is invalid |
| `0x02` | narrowing           | `NARROW8` source exceeds 255                                |
| `0x03` | division-by-zero    | integer divisor is zero                                     |
| `0x04` | loop-range          | compiler-emitted counted-loop range failure                 |
| `0x05` | activation-capacity | call record cannot fit depth or byte capacity               |
| `0x06` | unhandled-error     | entry routine returns recoverable failure                   |

The numbers are part of NVM 0.1. An implementation may display target-specific text but preserves the number in a machine-readable record.

### 15.2 Trap record

A trap record contains the trap number, current routine ordinal, and `instructionStart`. Unhandled error also contains the byte error code. Activation capacity reports the faulting `CALL` offset. A source map outside the core image may add source position; the bytecode location is always available.

### 15.3 Terminal and atomic behavior

A trap commits none of the faulting instruction's destination writes, data writes, service effects, activation changes, or control transfer. It records the trap and enters `trapped`. Program code cannot intercept it, and no instruction executes afterward. Failure while presenting the diagnostic does not replace the original record or resume execution.

### 15.4 Explicit trap instruction

`TRAP number` may encode bounds, narrowing, division-by-zero, or loop-range. Activation-capacity and unhandled-error are generated by `CALL` and entry `FAIL` because their records require machine context. Encoding `TRAP 0x05`, `TRAP 0x06`, zero, or an unassigned number is an invalid image.

### 15.5 Compile-time rejection

When the compiler proves a bounds, narrowing, or division failure in source, it diagnoses invalid source rather than emitting a guaranteed trap. `TRAP` remains available for a dynamic check lowered through primitive branches and for the counted-loop range contract.

### 15.6 Best location

The interpreter reports the offset of the instruction that detected the condition. It does not report the following `pc`, a helper's Z80 address, or the service adapter's native address. A combined handler preserves `instructionStart` before it executes shared code.

### 15.7 Invalid execution

Malformed runtime state that valid compiler output cannot produce is invalid execution, not a seventh source trap. It may arise from hand-written bytecode whose source types cannot be reconstructed, post-validation corruption, or an interpreter defect. Examples are a noncanonical carrier supplied to a typed bytecode operation, a malformed argument mask, missing completion for `GETR` or `GETE`, or fallthrough beyond a routine extent.

A conforming interpreter stops with an implementation diagnostic that includes the routine and bytecode offset. It must not wrap, continue, invent a recoverable code, or relabel the defect as one of the six source traps.

## 16. Nucleus System Services 0.1 ABI

### 16.1 Service ordinals

| Ordinal | Source routine              | Parameters        | Success result     |
| ------: | --------------------------- | ----------------- | ------------------ |
|  `0x00` | `readInputByte()`           | none              | one canonical `u8` |
|  `0x01` | `writeOutputByte(value)`    | argument 0: `u8`  | none               |
|  `0x02` | `readStorageByte()`         | none              | one canonical `u8` |
|  `0x03` | `rewindStorageInput()`      | none              | none               |
|  `0x04` | `writeStorageByte(value)`   | argument 0: `u8`  | none               |
|  `0x05` | `seekStorageOutput(offset)` | argument 0: `u16` | none               |

Every service may fail. Other ordinals are invalid in NVM 0.1.

### 16.2 Error codes

|   Code | Source constant  | Meaning                                            |
| -----: | ---------------- | -------------------------------------------------- |
| `0x01` | `endOfInput`     | no byte remains at the current input cursor        |
| `0x02` | `inputFailure`   | standard-input operation failed for another reason |
| `0x03` | `outputFailure`  | standard-output operation failed                   |
| `0x04` | `storageFailure` | bulk-storage operation failed                      |

The service adapter returns these exact byte values. It does not translate end of input into a trap or successful sentinel byte.

### 16.3 `SVC` transition

`SVC service` first checks the exact staged-argument mask from the table above and requires completion `none`. It invokes the selected adapter once. On acceptance it clears the argument mask.

Services with a `u8` parameter require a canonical byte. On successful result-bearing completion, the VM requires and writes the returned canonical byte to `result` and sets completion `result`. On successful result-free completion it sets completion `success`. On failure it requires and writes a canonical code to `error` and sets completion `failure`. A nonconforming adapter value is an implementation defect, not a value that the VM masks. The immediately following `JFAIL`, and when applicable `GETR` or `GETE`, use the same sequences as bytecode calls.

The adapter call creates no NVM activation record and does not change the current routine or slots except through later `GETR` or `GETE`.

### 16.4 Standard input and output

Standard input is a byte sequence with a cursor initially at zero. `readInputByte` succeeds with the current byte and then advances the cursor. At the end it fails with `endOfInput`; another input failure uses `inputFailure`. Failure leaves the cursor unchanged.

Standard output starts empty and is append-only. `writeOutputByte` appends its byte and then succeeds. If the environment cannot accept it, the service fails with `outputFailure` and leaves output unchanged. Successful writes appear in call order.

### 16.5 Bulk-storage input

Bulk-storage input is a separately selected byte sequence with a cursor initially at zero. `readStorageByte` has the same success and end behavior as standard input, using `storageFailure` for other failures. `rewindStorageInput` moves the cursor to zero on success. Any failure leaves the cursor unchanged.

### 16.6 Bulk-storage output

Bulk-storage output begins with the environment-supplied bytes and a cursor at its current end. The Chapter 20 conformance environment supplies an empty sequence.

`writeStorageByte` overwrites when the cursor is below the end, appends when it equals the end, and advances by one on success. It never inserts or truncates. `seekStorageOutput` accepts an existing offset or exactly the current end. Seeking beyond the end fails with `storageFailure`.

Every failed output operation is atomic: its cursor and bytes remain unchanged.

### 16.7 Binding freedom

An interpreter may realize services through CP/M calls, monitor traps, ports, host callbacks, or tests. The binding may buffer internally only when failure points, order, bytes, and cursor behavior remain identical. No native address, port number, file name, or operating-system handle appears in bytecode.

### 16.8 Service reset

Machine reset restores service inputs, outputs, and cursors to the execution environment's initial state. Restarting from an already mutated service state without reset is another run and must be identified as such by the host interface.

## 17. Interpreter contract and Z80 mapping

### 17.1 Required interpreter components

A complete interpreter contains:

- an atomic loader and structural validator;
- code and data region bases and bounds;
- a 128-word slot file;
- sixteen staged argument words and their mask;
- result, error, and completion carriers;
- packed activation storage with byte and depth limits;
- opcode dispatch and every assigned handler;
- the six service adapter entries;
- terminal trap recording; and
- reset, start, step or run, and result-reporting entry points.

A product may combine components, but its cost ledger accounts for all of them.

### 17.2 Minimum host capacities

The host publishes maximum image, code, data, activation-byte, activation-depth, standard-stream, and bulk-stream capacities. It rejects an image before execution when an immutable section or the image's requested activation minima cannot fit.

The actual activation limits selected for a run remain fixed until reset. Calls beyond them trap; the host must not grow or relocate the arena invisibly after observing that a call would fail.

### 17.3 Z80 physical mapping

The recommended first Z80 mapping reserves:

- `DE` as the bytecode `pc` between handlers;
- one 256-byte-aligned page for the 128 word slots;
- one 256-byte-aligned page for the 128 two-byte dispatch addresses;
- ordinary memory for staged arguments, carriers, routine metadata, and the activation arena; and
- interpreter-private words for code and data physical bases.

The mapping is not bytecode-visible. An implementation may select different Z80 registers or inline slot addressing if its measurements justify the change.

### 17.4 Dispatch

A page dispatch may reject opcodes with bit seven set, double the remaining byte, combine it with the dispatch-page high byte, load the handler word, and jump indirectly. The measured frame-addressing spike counted a 64-T-state dispatch for the tested variants. That number is evidence for the sketch only; a complete interpreter reports its own dispatch cost.

Every handler preserves or restores the bytecode `pc` according to its documented interpreter convention. Native Z80 flags are scratch unless the handler is transferring a result into interpreter state. No VM semantic depends on a flag surviving dispatch.

### 17.5 Slot access

With a page-aligned slot file, slot `s` begins at low-byte offset `2s`. A common helper may form that address; a hot handler may inline it. Both must reject a slot outside the current routine's clobber prefix during validation, so execution need not repeat that structural check.

### 17.6 Activation records on Z80

The activation arena may grow upward or downward, but its logical record bytes follow Section 13.4. A call computes `4 + 2 * saveCount` without eight-bit wrap, checks both capacity limits, then writes the complete record. Return reads the complete top record before releasing it.

An interrupt or monitor entry that shares the Z80 stack does not share the activation arena unless the target contract says so. The interpreter must preserve its own private state across permitted interrupts or disable them under a documented machine profile.

### 17.7 Arithmetic helpers

Z80 has no native word multiply or divide. `MUL8`, `MUL16`, `DIV8`, and `DIV16` may call shared helpers. A helper remains part of the interpreter account, preserves `instructionStart`, and commits the destination only after a zero-divisor check.

### 17.8 Loader placement

The NVM logical code and data offsets are independent of physical addresses. A Z80 loader selects nonoverlapping physical regions and stores their bases. Physical base addition must detect 16-bit overflow before a load, store, fetch, or initializer copy.

The compiler's own resident bank may be reclaimed before execution under the platform launcher contract. This specification neither requires nor forbids that lifecycle.

### 17.9 No self-hosting requirement

The first interpreter and compiler are native Z80 assembly. NVM 0.1 does not require either component to be written in Nucleus, produced by Nucleus, or capable of compiling itself.

## 18. Native-backend contract

### 18.1 Semantic input

A native backend consumes the same lowered operations represented by the opcode families: fixed-width scalar operations, checked conversions, packed-layout addresses, scalar and fixed-size aggregate-copy effects, loads and stores, primitive branches, calls, failure edges, traps, and system services. It need not decode a serialized NVM image when the compiler feeds those operations directly.

### 18.2 Required equivalence

For the same source and external streams, native output must preserve:

- left-to-right source effects and Boolean short-circuiting;
- byte and word wraparound;
- unsigned comparison and division;
- packed object layout and string length semantics;
- startup images for top-level and routine-private aggregate objects;
- exact-type aggregate copies, including complete bounded-string representations;
- bounds, narrowing, and division checks before writes;
- call argument evaluation and activation-capacity timing;
- result-free and value results;
- recoverable failure codes and immediate handling;
- trap class and best available source or lowered location; and
- service order, bytes, failure atomicity, and termination.

### 18.3 Calling convention freedom

A native backend may place values in Z80 registers, static slots, a stack, or another target ABI. It may use carry plus a code register for recoverable failure. These choices are backend-private. They do not change the abstract result/error distinction or allow a source alias to become an integer address.

### 18.4 Caller-save relation

The NVM serialized ABI saves the overlap of two clobber prefixes. A native backend may perform equivalent liveness-based save-around calls, save a conservative caller set, or use distinct dynamic frames. The observable requirement is that recursion and nested calls preserve every caller value live after the call and that early return performs no source cleanup phase.

### 18.5 Activation capacity

A native backend publishes its own activation limit. It must pass the Chapter 20 minimum corpus. When it claims equivalence to a particular NVM run, it selects a limit that produces activation-capacity at the same logical call boundary.

### 18.6 Image layout consumers

A native backend that reads or writes NVM object images uses the exact Chapter 7 data layout and Chapter 5 initializer meaning. A backend with an unrelated private data layout does not claim binary object-memory interoperability, though it may still claim source behavioral equivalence.

## 19. Image validity

### 19.1 Validation order

The loader validates the immutable image in this order:

1. fixed header fields and arithmetic;
2. canonical section order and exact final size;
3. host capacity minima;
4. routine descriptors and extents;
5. initializer records;
6. instruction decoding and operand ranges;
7. branch and routine targets;
8. return, result, failure, and service shapes; and
9. argument-mask data flow.

A loader may combine passes when it produces the same rejection and runs no source instruction first.

### 19.2 Header checks

The header must match Appendix B. Every reserved field and flag is zero. Routine count is 1 through 255. Entry ordinal is present. The fixed slot and argument counts are 128 and 16. Offsets and sizes form the four canonical contiguous sections without 16-bit overflow or trailing bytes. Service and VM versions are exactly 0.1.

Required activation bytes are at least four and required depth is at least one. They must not exceed the capacities supplied for the run.

### 19.3 Descriptor checks

Descriptor code ranges are nonempty, contiguous, ordered, and cover code exactly. Parameter count is at most 16 and no greater than clobber count. Clobber count is at most 128. Only result and failure flag bits are set. The entry descriptor has zero parameters and no result.

### 19.4 Initializer checks

The two-byte record count and every record must fit the initializer section exactly. Record length is positive. Records appear in strictly ascending, nonoverlapping order. Each `address + length` is computed mathematically and does not exceed `dataSize`. There are no leftover initializer bytes.

### 19.5 Instruction checks

Validation decodes from each routine entry to its exclusive end. It rejects an unassigned opcode, truncated operand, leftover byte, slot outside the current clobber prefix, argument index above 15, absent routine or service, forbidden trap number, invalid immediate data root, zero layout extent, or branch target outside the current routine or between instructions. A routine's final instruction must return, fail, trap, or branch unconditionally; no path may fall through its exclusive end.

`RET` is valid only without a result flag. `RETV` is valid only with one. `FAIL` is valid only with the failure flag.

### 19.6 Completion-shape checks

For an infallible result-bearing `CALL`, the following instruction is `GETR`. For a failable `CALL` or every `SVC`, the following instruction is `JFAIL`; when success bears a result, the fallthrough instruction after `JFAIL` is `GETR`. The failure target begins with `GETE`.

No branch may target the owning `JFAIL` or `GETR`, and no instruction other than the owning `JFAIL` may target its `GETE`. A `GETR`, `GETE`, or `JFAIL` outside one of these patterns is invalid. A compiler may duplicate a short consumer block; format 0.1 does not share it across calls. These local shapes prevent a result or error from outliving its call statement.

### 19.7 Argument-mask analysis

The validator performs a forward data-flow analysis whose value is a 16-bit staged-argument mask. Entry begins with zero. `ARG q` sets bit `q`. An accepted `CALL` or `SVC` requires the exact signature mask and produces zero on its callee-return continuation. Other instructions preserve the mask.

All incoming edges to an instruction must carry the same mask. Every instruction in a routine must be reachable from its entry; dead instruction bytes are noncanonical and invalid. A merge with different masks, a back edge carrying a partial set, an exact-signature mismatch, or a return with a nonzero mask is invalid. The analysis is finite because there are only instruction boundaries and 65,536 masks; rejecting unequal merges avoids a mask-set powerset.

### 19.8 Source verification remains separate

Image validation does not reconstruct nominal records, source scopes, source alias categories, or typed expression trees. A structurally valid hand-written image may perform operations unavailable in source. A conforming compiler output additionally satisfies the language specification and the lowering obligations in the worked examples.

### 19.9 Rejection result

Image rejection identifies at least the failed field, descriptor ordinal, initializer record, or code offset. It makes no program output, service call, data mutation, activation, or Nucleus trap record.

## 20. Conformance vectors

### 20.1 Vector format

Each machine-readable vector records:

- image bytes or an image builder with exact expected bytes;
- host capacities and initial service streams;
- expected accept or reject result;
- for accepted images, expected final state, data bytes, service bytes, and trap record; and
- the first differing step for an implementation failure.

A conforming implementation supplies and passes vectors covering every requirement in this chapter. A source compiler also supplies paired source-to-image and source-behavior vectors.

### 20.2 Minimal successful image

The canonical image containing one result-free, infallible entry routine whose only instruction is `RET` has 43 bytes:

```text
4e 56 4d 31  00 01 00 01  20 00 2b 00  01 00 10 80
20 00 28 00  02 00 2a 00  01 00 00 00  04 00 01 00
00 00 01 00  00 00 00 00  00 00 52
```

The first 32 bytes are the header, the next eight the descriptor, the next two the zero initializer count, and the final byte `RET`. Loading, starting, and executing one instruction terminates successfully with empty output and zero activation depth.

### 20.3 Required scalar vectors

The suite covers each opcode at boundary values, including:

- byte and word wraparound for addition, subtraction, multiplication, and negation;
- division quotient and division-by-zero destination preservation;
- integer `and`, `or`, and `not` at both widths;
- canonical Boolean comparisons and `LNOT`;
- successful narrowing at 255 and narrowing trap at 256; and
- aliasing a destination with each source.

### 20.4 Required layout vectors

The suite constructs nested packed records, scalar and aggregate arrays, and `string[1]`, `string[4]`, and `string[255]`. It verifies exact offsets, little-endian words, embedded zero string bytes, recursive static initializer images, routine-private object initialization, current-length indexing, bounds failures before stores, exact-type aggregate copies, self-assignment, and an invalid stored string length.

### 20.5 Required control vectors

The suite covers taken and untaken branches, short-circuit blocks whose omitted side would trap, forward and backward targets, inclusive `to`, exclusive `until`, positive and negative steps, zero-iteration direction mismatch, remaining-distance update boundaries, the positive `u8`/`u16`-bound `loop-range` case, `exit`, and `continue` through the lowered primitive sequence. Paired source rejection tests cover a nonlocal counted-loop counter, assignment to an active counter, and nested reuse of one counter.

### 20.6 Required call vectors

The suite covers zero and sixteen arguments, scalar and alias carriers, caller/callee clobber prefixes in both size orders, no-overlap and full-overlap saves, nested calls, early return, direct recursion, mutual recursion, byte-capacity exhaustion, and depth-capacity exhaustion. It checks that the capacity trap leaves the slot file, mask, and arena unchanged.

### 20.7 Required failure vectors

The suite covers every combination of result presence and failure status, error code zero and 255, `or fail` propagation through several routines, local handling, a handler destination equal to the success destination, result-free success, and entry failure becoming unhandled-error. It verifies that traps bypass `JFAIL`.

### 20.8 Required service vectors

The suite exercises all six ordinals, every standard error code, repeated end-of-input, input rewind, output append, bulk overwrite, append at end, valid seeks, failed seek beyond end, and atomic failed writes. It verifies exact cursor positions and byte order after each call.

### 20.9 Required rejection vectors

At minimum, one vector rejects each Chapter 19 rule: bad magic or version, arithmetic section overflow, unknown opcode, truncated instruction, bad slot, bad target, bad descriptor, overlapping initializer, return-shape mismatch, completion-shape mismatch, and argument-mask mismatch or merge.

### 20.10 Language corpus

The accepted and rejected programs in Chapter 21 of the language specification remain the minimum source-level corpus. A compiler-to-NVM harness compiles every accepted program, validates the image, runs it where it terminates, and compares behavior. It rejects every invalid source before image execution.

## 21. Feature and cost ledger

### 21.1 Status labels

Every size or timing entry is labeled **Measured**, **Projected**, or **Hypothesis**. Measured entries identify the assembly and harness. Projected entries state their measured basis and arithmetic. A hypothesis is not quoted as a target result.

### 21.2 Component ledger

| Component                    | Compiler bytes |                  Interpreter bytes |    Writable runtime |                                 Emitted bytes | Timing evidence           | Status                               |
| ---------------------------- | -------------: | ---------------------------------: | ------------------: | --------------------------------------------: | ------------------------- | ------------------------------------ |
| image header and descriptors |           open |                               open | loader scratch open |                                32 + 8/routine | not measured              | Projected                            |
| page dispatch                |           none | 11-byte dispatcher; 256-byte table |                none |                                      1/opcode | 64 T dispatch in spike    | Measured dispatcher; Projected table |
| common page slot addressing  |           none |                      7-byte helper |       slot page 256 |                                1/slot operand | 350 T measured `ADD` path | Measured, isolated                   |
| inlined page slot addressing |           none |                   no shared helper |       slot page 256 |                                     unchanged | 299 T measured `ADD` path | Measured handler paths               |
| argument staging             |           open |                               open |            34 bytes |                                    3/argument | not measured              | Projected                            |
| packed activation records    |           open |                               open |   `4 + 2n` per call |                                        2/call | not measured              | Projected                            |
| arithmetic helpers           |           open |                               open |        scratch open |                           fixed opcode widths | not measured              | Hypothesis                           |
| canonical-width selection    |           open |                               open |                none |                                     unchanged | reference mapping checked | Implemented model; Z80 open          |
| address and safety checks    |           open |                               open |        scratch open |                               3–8/instruction | not measured              | Hypothesis                           |
| counted-loop increment       |           open |                               none |    saved bound slot | subtraction and comparison; optional fit trap | not measured              | Hypothesis                           |
| aggregate-copy lowering      |           open |                               none |  scratch slots open |                 straight-line or counted loop | not measured              | Hypothesis                           |
| recoverable failure          |           open |                               open |       carriers open |                           call-local sequence | not measured              | Hypothesis                           |
| services and traps           |           open |                               open |   adapter dependent |                             2/service or trap | not measured              | Hypothesis                           |

The measured harness covered seven handlers and three slot-addressing arrangements. Their complete core sizes were 165, 162, and 210 bytes. Those figures exclude the separately placed dispatch table, and they are not complete-interpreter estimates.

The executable definition maps nine canonical-byte operations to an equivalent word implementation: division, binary `and` and `or`, equality, inequality, and the four unsigned order comparisons. A compiler may emit the mapped word opcode for a statically typed `u8` operation because valid byte carriers have zero high bytes and these results already fit in one byte. Wrapping addition, subtraction, multiplication, negation, and complement are not equivalent and retain their byte operations.

This mapping does not make the byte opcode entries removable. A byte opcode still has the Section 7.1 carrier precondition, while its word counterpart accepts every word. An interpreter may check the byte operands and then enter a shared arithmetic or comparison core, but it cannot point both dispatch entries directly at an unchecked word handler and still satisfy Section 15.7. The target measurement therefore counts any byte-entry checks as well as the shared core. No assigned opcode or opcode meaning changes.

### 21.3 Required reports

The first complete Z80 implementation reports:

- loader and validator bytes;
- immutable opcode and service tables;
- dispatch, slot, carrier, activation, service, and trap state bytes;
- each handler and shared helper size;
- complete interpreter and adapter size;
- peak activation bytes for every conformance program;
- image bytes per compiled source program;
- opcode counts and executed T-states for representative programs; and
- the exact compiler-core delta for selecting and emitting NVM operations.

### 21.4 Decision gates

The design is accepted only after one vertical slice compiles, validates, and runs source that exercises scalar locals, arguments, recursion, records, recursive static initializers, routine-private aggregate objects, aggregate assignment, arrays, strings, branches, a handled error, a propagated error, a service, and each reachable safety trap. A direct-Z80 backend for the same slice provides a comparison, not a prerequisite.

If the interpreter or compiler exceeds its account, the project identifies the responsible component and tests a narrower representation. It does not remove a settled source requirement silently or charge the bytes to another account.

## Appendix A. Complete opcode table

Chapter 9 is the normative opcode table. The machine-readable companion in the Nucleus measurement package must contain the same mnemonic, number, operand sequence, and width for all assigned instructions. Generated assembler, disassembler, validator, and documentation tables derive from that companion after it is checked against this chapter.

## Appendix B. Binary layouts

### B.1 Header bytes

| Byte offset | Width | Field                     | NVM 0.1 rule              |
| ----------: | ----: | ------------------------- | ------------------------- |
|           0 |     4 | magic                     | `4e 56 4d 31` (`NVM1`)    |
|           4 |     1 | VM major                  | 0                         |
|           5 |     1 | VM minor                  | 1                         |
|           6 |     1 | service major             | 0                         |
|           7 |     1 | service minor             | 1                         |
|           8 |     1 | header size               | 32                        |
|           9 |     1 | flags                     | 0                         |
|          10 |     2 | image size                | exact complete bytes      |
|          12 |     1 | routine count             | 1..255                    |
|          13 |     1 | entry routine             | existing ordinal          |
|          14 |     1 | maximum arguments         | 16                        |
|          15 |     1 | slot count                | 128                       |
|          16 |     2 | routine-table offset      | 32                        |
|          18 |     2 | initializer offset        | after routine table       |
|          20 |     2 | initializer size          | complete record section   |
|          22 |     2 | code offset               | after initializer section |
|          24 |     2 | code size                 | complete routine extents  |
|          26 |     2 | data size                 | zeroed mutable data bytes |
|          28 |     2 | required activation bytes | at least 4                |
|          30 |     1 | required activation depth | at least 1                |
|          31 |     1 | reserved                  | 0                         |

### B.2 Routine descriptor bytes

| Relative offset | Width | Field                        |
| --------------: | ----: | ---------------------------- |
|               0 |     2 | entry code offset, inclusive |
|               2 |     2 | end code offset, exclusive   |
|               4 |     1 | parameter count              |
|               5 |     1 | clobber-prefix count         |
|               6 |     1 | bit 0 result, bit 1 failable |
|               7 |     1 | reserved zero                |

### B.3 Initializer record bytes

The initializer section begins with a two-byte record count. Each record then contains a two-byte data address, a positive two-byte payload length, and exactly that many payload bytes. There is no terminator record.

### B.4 Activation record bytes

The logical order is each saved slot low byte and high byte in increasing slot order, then return offset low, return offset high, caller ordinal, and save count. The arena top points immediately after the final count. A return reads that count, computes `4 + 2 * saveCount`, validates it against the current arena and depth, and only then removes the record.

## Appendix C. Worked lowering examples

### C.1 Infallible value call

For two already evaluated arguments in slots 4 and 7 and a result destined for slot 3:

```nvm
ARG   4, 0
ARG   7, 1
CALL  routine
GETR  3
```

The descriptor supplies two parameters and a result. The argument mask is zero again before `GETR`.

### C.2 Failable assignment with handler

```nvm
ARG    4, 0
CALL   routine
JFAIL  handler
GETR   3
JMP    after
handler:
GETE   3
// lowered handler statements
after:
```

Slot 3 receives exactly one carrier on either path. No result write occurs on failure.

### C.3 Propagation

```nvm
CALL   routine
JFAIL  propagate
// successful result-free continuation
JMP    after
propagate:
GETE   6
FAIL   6
after:
```

The failed callee has already restored the caller's slot prefix. `FAIL` then returns through the caller's own activation record.

### C.4 Fixed-array element

For an array root in slot 0, dynamic index in slot 1, length 20, and record stride 3:

```nvm
INDEX   0, 1, 20, 3, 2
ADDO    2, fieldOffset, fieldExtent, 3
LOAD16  3, 4
```

The compiler emits literal length, stride, offset, and extent from static layout. The address carrier never becomes a source integer.

### C.5 Boolean short circuit

For `left and right`, with result slot 2:

```nvm
// evaluate left into slot 0
JZ    0, falseBlock
// evaluate right into slot 1
MOV   1, 2
JMP   done
falseBlock:
LDI8  0, 2
done:
```

The right-hand block is unreachable when left is false, so its calls and traps do not occur.

### C.6 Aggregate assignment

For an exact-type object of extent `objectExtent`, with destination and source aliases in slots 0 and 1, the compiler first validates both complete regions:

```nvm
ADDO  0, 0, objectExtent, 2
ADDO  1, 0, objectExtent, 3
```

For a short extent, it may then emit fixed-offset checked addresses and ordinary loads and stores. This schematic pair copies one word at `byteOffset`:

```nvm
ADDO     3, byteOffset, 2, 4
ADDO     2, byteOffset, 2, 5
LOAD16   4, 6
STORE16  6, 5
```

A final odd byte uses `LOAD8` and `STORE8`. The two initial instructions guarantee the complete extents before the first store; the later constant subregions cannot fail when the carriers remain unchanged.

For a larger extent, the compiler may instead emit a counted byte-copy loop. This example uses slot 4 as the index, slot 5 as the constant one, slot 6 as the extent, slots 7 and 8 as the selected byte addresses, slot 9 as the copied byte, and slot 10 as the loop condition:

```nvm
LDI16   0, 4
LDI16   1, 5
LDI16   objectExtent, 6
loop:
INDEX   3, 4, objectExtent, 1, 7
INDEX   2, 4, objectExtent, 1, 8
LOAD8   7, 9
STORE8  9, 8
ADD16   4, 5, 4
LT16    4, 6, 10
JNZ     10, loop
```

`INDEX` remains the address-producing operation; `ADD16` changes only the ordinary `u16` loop counter. The two complete-region checks still precede the first store. A self-copy may be omitted. A direct Z80 backend may implement the same semantic operation with `LDIR` after its equivalent complete-range checks.

## Appendix D. Reference interpreter

The repository reference model is executable evidence. Its core step has this shape:

```text
validate complete image
zero data and apply initializer records
clear machine state
select entry routine and set pc

while running
    instructionStart = pc
    opcode = code[pc]
    decode fixed operands
    nextPC = pc + width(opcode)
    execute complete checked transition
    if transition did not replace pc
        pc = nextPC
    end
end
```

The model must be generated from or mechanically checked against the opcode companion. A prose example or model behavior does not override a discrepancy in the normative chapter; the discrepancy is a release blocker.

## Appendix E. Z80 dispatch sketch

The first measured arrangement uses a one-page dispatch table and one-page slot file:

```text
fetch opcode through DE
reject bit 7
double opcode
combine with dispatch-page high byte
load handler address
jump indirect
```

Handlers read additional bytes through `DE`, leaving it at the following bytecode instruction unless they branch or call. A combined helper records `instructionStart` before fetching the opcode so traps report the bytecode position rather than a native helper address.

The sketch intentionally omits fixed Z80 register assignments beyond the measured `DE` instruction pointer. The complete assembly implementation freezes assignments only after the full handler set exposes its pressure.

## Appendix F. Implementation sequence

1. Freeze the machine-readable header, descriptor, service, trap, and opcode definitions.
2. Generate canonical encoders, decoders, and the minimal image vector.
3. Implement the structural validator and argument-mask analysis on the host.
4. Implement the host reference interpreter and all state-transition vectors.
5. Compile the language Chapter 21 corpus to NVM and compare source behavior.
6. Build the Z80 loader, dispatch, slot access, and minimal scalar handlers.
7. Add calls, packed activation records, recursion, and capacity traps.
8. Add data layout, checked addressing, strings, failures, services, and terminal traps.
9. Measure every component and representative program.
10. Run a full reader-order specification audit and an independent adversarial conformance review before freezing 0.1.
