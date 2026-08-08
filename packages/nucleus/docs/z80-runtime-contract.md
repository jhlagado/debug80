# Nucleus Z80 Runtime and Backend Contract 0.1

## Contents

1. [Status and authority](#1-status-and-authority)
2. [Target and resource model](#2-target-and-resource-model)
3. [Runtime representation](#3-runtime-representation)
4. [Program storage and startup](#4-program-storage-and-startup)
5. [Checked access and aggregate copying](#5-checked-access-and-aggregate-copying)
6. [Calls, activations, and results](#6-calls-activations-and-results)
7. [Recoverable failure and traps](#7-recoverable-failure-and-traps)
8. [System-service boundary](#8-system-service-boundary)
9. [Generated-code integrity](#9-generated-code-integrity)
10. [Conformance and measurement](#10-conformance-and-measurement)

## 1. Status and authority

### 1.1 Status

This document defines the required direct-Z80 execution contract for Nucleus
0.1. It governs the first compiler's generated program representation, runtime
helpers, service adapter, activation machinery, and trap records. Nucleus 0.1
does not have an active bytecode format or virtual-machine implementation path.

The [Nucleus 0.1 Language Specification](specification.md) governs source
syntax, validity, and meaning. This contract supplies target representation and
execution rules without changing that meaning. If the two documents disagree
about source behavior, the language specification prevails. If they disagree
about the direct-Z80 runtime interface or packed representation, this contract
prevails.

The implementation plan and reviewer's charter are non-normative. Tests,
proofs, and measurements provide evidence; they do not amend either authority.

### 1.2 Conforming direct implementation

A conforming direct implementation:

- emits Z80 machine code rather than a portable intermediate program;
- preserves every source-visible order, result, mutation, failure, and trap;
- establishes the representations and startup state in this contract;
- checks every dynamic safety condition before the operation can commit a
  forbidden result or partial write;
- rejects an unresolved, out-of-range, or over-capacity generated program
  before publishing it as runnable; and
- documents every implementation capacity and target-adapter choice.

The compiler may use an internal semantic-operation transcript. That transcript
is compiler workspace, not a public object format, compatibility boundary, or
second execution target.

## 2. Target and resource model

### 2.1 Z80 target

The first implementation emits ordinary Z80 machine code for a flat 16-bit
address space. It is not tied to one computer, monitor, operating system, port
map, or physical memory layout. A target adapter supplies concrete source,
output, service, startup, and reporting addresses.

All runtime addresses are 16-bit target addresses. No source operation exposes,
constructs, compares, converts, or calculates with one. The compiler retains the
type and extent associated with every aggregate address carrier.

### 2.2 Separate accounts

The implementation reports these bounded accounts separately:

| Account            | Contents                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| Compiler core      | Z80 code and immutable data required while compiling.                            |
| Compiler workspace | Peak simultaneously live writable compiler state.                                |
| Generated program  | Emitted Z80 code, static program data, and required startup material.            |
| Target runtime     | Shared helpers, service adapter, trap support, and fixed writable runtime state. |
| Activation storage | Bounded storage used by simultaneously active routine calls.                     |
| External storage   | Source, generated-output staging, maps, manifests, and service buffers.          |

The compiler-core acceptance gate is 16 KiB. Moving required compiler code or
immutable tables into another account does not satisfy it. The target runtime
and generated program remain measured even though they do not enter that gate.

## 3. Runtime representation

### 3.1 Scalar values

`u8` occupies one byte and ranges from 0 through 255. `boolean` occupies one
byte and is exactly 0 or 1. `u16` occupies two little-endian bytes and ranges
from 0 through 65,535. A compiler or runtime helper must not depend on another
Boolean representation.

Arithmetic width and wraparound follow the language specification. A value
held temporarily in a Z80 register pair may use a wider carrier, but storage
and observable results retain their declared widths. Checked narrowing tests
the complete `u16` value before producing a `u8`.

### 3.2 Records and arrays

Records are packed in field-declaration order with no padding. Field extents
are:

- one byte for `u8` and `boolean`;
- two little-endian bytes for `u16`; and
- the complete inline extent for a record, fixed array, or bounded string.

A fixed array stores its elements consecutively. Its stride is the complete
element extent. Neither a record nor an array stores a runtime type tag, field
table, length word, or address.

### 3.3 Bounded strings

`string[N]` occupies `N + 1` bytes. Byte zero is the current logical length
`L`; bytes 1 through `L` are the content; the remaining payload bytes are not
source-readable. The invariant is `0 <= L <= N`.

An aggregate carrier for a bounded string addresses its length byte. Reading
`.length` checks the complete object and the length invariant. Indexing checks
`index < L` and addresses byte `1 + index`. Byte assignment changes one
existing content byte and does not change the length.

### 3.4 Aggregate carriers

An aggregate parameter or result is carried as one 16-bit address. Its exact
record type, array element type and length, or string capacity remains compiler
metadata. The runtime address has no source type tag and is never a source
integer. Only compiler-generated field selection, checked indexing, parameter
transfer, result transfer, and copying may consume it.

## 4. Program storage and startup

### 4.1 Program objects

Every owned aggregate object and every top-level scalar variable has a fixed
address and program lifetime. Aggregate fields and array elements occupy their
containing object's storage. Routine activations contain no owned aggregate
object.

The compiler determines every program object's address, type, extent, and
initial bytes before it publishes the generated program. It must reject a data
layout whose mathematical end exceeds the selected program-data region.

### 4.2 Initial state

Before `main` begins, every program variable has its language-defined zero or
explicit static value. The startup path may clear a region and apply explicit
bytes, copy a complete prepared data image, or emit an equivalent target
sequence. It must not expose a partly initialized object to source execution.

Static words use little-endian order. Record and array initializers follow the
packed layout in Chapter 3. A bounded-string initializer writes its length and
decoded bytes; unused capacity has no source-observable value.

### 4.3 Program entry and exit

Startup invokes `main` with no source parameters. Successful return terminates
normally. Failure returned by `main` performs `unhandled-error`. No source
routine runs before all program data is initialized.

## 5. Checked access and aggregate copying

### 5.1 Region checks

A generated access of width `w` at address `a` is permitted only when the
mathematical half-open region `[a, a + w)` lies within the selected program-data
region. The calculation must not use wrapped 16-bit arithmetic as evidence that
the region fits.

A fixed-array access first checks the unsigned index against its declared
length, then forms `base + index * stride`, and then establishes the complete
element region. A string access applies Section 3.3. Any failed check performs
`bounds` before a load, store, or alias result is produced.

The compiler may omit a runtime check only when information already proved at
that source point establishes the same condition.

### 5.2 Assignment atomicity

A scalar store checks its complete destination before writing. A failed check
performs no destination write.

Exact-type aggregate assignment establishes and checks the complete destination
region and then the complete source region before the first destination byte
changes. It copies the common fixed extent, including a bounded string's length
byte and complete capacity. Self-assignment has no effect. Nucleus types cannot
produce proper partial overlap between distinct same-type aggregate paths.

The backend may inline the copy, emit a counted loop, or call a shared helper.
For a Z80 target, `LDIR` is permitted after both complete-region checks. The
choice is private and must be measured; it does not change copy order or trap
timing.

## 6. Calls, activations, and results

### 6.1 Argument evaluation

The caller evaluates every argument from left to right before the callee begins.
It retains each earlier scalar value or aggregate carrier across evaluation of
later arguments. A trap during argument evaluation prevents the call.

Scalar parameters receive copied values. Aggregate parameters receive fixed,
non-null, non-reseatable address carriers to existing program storage. The
callee may mutate that storage where the language permits.

### 6.2 Activation state

Each successful call creates distinct logical storage for its scalar
parameters, scalar locals, aggregate-parameter carriers, return address, and
other live implementation state. Recursion uses the same mechanism as an
ordinary call. One active invocation must not overwrite another's state.

The backend may use the hardware stack, a bounded activation arena, static
slots saved around calls, or a measured combination. It publishes both the
maximum active depth and any byte limit. After all source arguments have been
evaluated, but before the callee begins or any caller state is overwritten, a
call that cannot fit performs `activation-capacity` atomically.

### 6.3 Results and caller preservation

A scalar result is copied to the caller. An aggregate result is one transient
address carrier to existing program storage. The compiler preserves its exact
referent type and keeps the carrier live until its containing source operation
discards, forwards, selects, indexes, or copies it. A nested call during that
operation must not destroy the carrier.

Every return restores the caller state required after the call. Early return,
ordinary return, recoverable failure, direct recursion, and mutual recursion
use the same preservation rule. Nucleus has no source cleanup or unwinding
phase.

## 7. Recoverable failure and traps

### 7.1 Recoverable completion

A failable routine completes with either success or one `u8` error code. No
success result exists on failure. `or fail` returns that code from the caller;
`on error` stores it only after suppressing the success-result store. These
paths perform ordinary local control transfer and no stack search or unwinding.

The target calling convention may use carry and a byte register or another
documented private representation. It must preserve the distinction among
result-free success, value success, and failure until the immediate consumer
has acted.

### 7.2 Stable trap codes

|   Code | Reason                | Required condition                                             |
| -----: | --------------------- | -------------------------------------------------------------- |
| `0x01` | `bounds`              | A checked data region, array index, or string byte is invalid. |
| `0x02` | `narrowing`           | A dynamic checked `u8(...)` operand exceeds 255.               |
| `0x03` | `division-by-zero`    | A runtime integer divisor is zero.                             |
| `0x04` | `loop-range`          | A continuing counted-loop value does not fit its counter.      |
| `0x05` | `activation-capacity` | A new activation cannot fit its published limit.               |
| `0x06` | `unhandled-error`     | `main` returns recoverable failure.                            |

These numeric codes are the machine-readable Nucleus Z80 trap contract.

### 7.3 Trap record and terminal behavior

A trap record contains at least the stable reason and the best available
16-bit source offset for the failing operation. `unhandled-error` also contains
the returned error code. A target may additionally record a source-part,
routine, generated-code address, or monitor-specific detail.

A trap commits none of the faulting operation's result writes, data writes,
service effects, activation changes, or control transfer. It terminates source
execution. Reporting failure must not resume the program or replace the
original reason.

## 8. System-service boundary

### 8.1 Stable services

|   Code | Source routine              | Parameter | Success result |
| -----: | --------------------------- | --------- | -------------- |
| `0x00` | `readInputByte()`           | none      | one `u8`       |
| `0x01` | `writeOutputByte(value)`    | `u8`      | none           |
| `0x02` | `readStorageByte()`         | none      | one `u8`       |
| `0x03` | `rewindStorageInput()`      | none      | none           |
| `0x04` | `writeStorageByte(value)`   | `u8`      | none           |
| `0x05` | `seekStorageOutput(offset)` | `u16`     | none           |

The codes identify the standard semantic service set in machine-readable tests
and adapters. A direct backend may call fixed adapter labels instead of
dispatching on the code at runtime.

### 8.2 Stable service errors

|   Code | Source constant  | Meaning                                   |
| -----: | ---------------- | ----------------------------------------- |
| `0x01` | `endOfInput`     | No input byte remains.                    |
| `0x02` | `inputFailure`   | Standard input failed for another reason. |
| `0x03` | `outputFailure`  | Standard output could not accept a byte.  |
| `0x04` | `storageFailure` | A bulk-storage operation failed.          |

Every adapter returns a canonical byte code. It does not turn end of input into
a trap or sentinel byte.

### 8.3 Stream behavior

Standard input begins at offset zero. A successful read returns the current
byte and advances once; failure leaves the cursor unchanged. Standard output
begins empty and appends successful bytes in call order; failure leaves it
unchanged.

Bulk input begins at offset zero and can be rewound to zero. Bulk output begins
with adapter-supplied bytes and a cursor at their end; the conformance harness
supplies an empty output. A write overwrites below the end, appends at the end,
and never inserts or truncates. A seek accepts an existing offset or the exact
end. A seek beyond the end fails with `storageFailure`. Every failed service
leaves its affected cursor and bytes unchanged.

### 8.4 Adapter freedom

A target may implement the services through CP/M, a monitor, ports, firmware,
host callbacks, or tests. The binding must preserve bytes, call order, failure
points, cursor state, and atomicity. No target address, port, file handle, or
operating-system name enters Nucleus source semantics.

### 8.5 Runs and reset

Before each new run, the adapter restores every service input, output, and
cursor to the initial state in Section 8.3. A new run therefore does not inherit
bytes, cursors, or failures from an earlier run. The external execution
interface identifies the reset execution as a distinct run.

Resuming or restarting generated code while retaining mutated service state is
a debugger or target-specific continuation, not a new conforming run.

## 9. Generated-code integrity

### 9.1 Compiler-controlled output

The first compiler is the only producer required for standard generated Z80
programs. Nucleus therefore requires no portable loader, hostile-code
validator, opcode decoder, or serialized routine table.

The compiler must nevertheless verify every fact that its generated program
depends on before publication. At minimum it checks:

- output-region capacity and all size arithmetic;
- every data address and complete object extent;
- every absolute and relative branch or call fixup;
- every required target-runtime entry address;
- every program-data and runtime-region non-overlap condition supplied by the
  selected target map; and
- every bounded compiler table needed to finish emission.

### 9.2 Atomic publication

The compiler may write tentative bytes to a bounded staging region or bulk
output while checking source. It publishes a runnable program only after the
source has been accepted and every layout, fixup, range, capacity, and target
contract check has succeeded. A diagnostic leaves no partial output identified
as runnable and does not replace a previously published runnable program.

The output format, relocation strategy, and loading transport are target
adapter choices. The adapter must not patch an unchecked value or silently
truncate an address, displacement, size, source location, or static datum.

### 9.3 Source locations

Each emitted dynamic trap site retains enough information to report the best
available source location required by the language specification. A compiler
may use a side map, inline constants, shared trap stubs with an established
location carrier, or another measured representation. Entering a shared helper
must not replace the source location with the helper's address.

## 10. Conformance and measurement

### 10.1 Required evidence

The active proof suite assembles the compiler and generated program with AZM,
runs the result through Debug80, and checks source-level observations. It must
cover the accepted and rejected Chapter 21 programs as implementation stages
make them available, including normal output, static data, alias-visible
mutation, recursion, recoverable failure, every reachable trap, exact
diagnostic positions, and capacity boundaries.

A module or boundary proof may test a smaller path. It must identify the
language or contract rule it establishes and may not substitute a fixed
program template for a claimed general compiler feature.

### 10.2 Measurement reports

Every target size or timing claim comes from fresh assembled output and names
the proof that produced it. Reports separate compiler code, compiler immutable
data, peak workspace, generated program, target runtime, fixed runtime state,
activation storage, instruction count, and T-states. A projection states its
measured basis; an untested expectation is labelled a hypothesis.

### 10.3 Historical NVM material

The retired Nucleus Virtual Machine specification, interpreter, encoders,
images, and comparison proofs are preserved under `archive/nucleus-nvm/` as
historical research. They are not active authorities, package tests,
publication inputs, or requirements on new compiler work.
