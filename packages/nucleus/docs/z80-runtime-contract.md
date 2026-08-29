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

The [Nucleus Target System Specification](target-system-specification.md)
governs target profiles, image composition, startup, entry, and banked-program
placement. This contract defines their direct-Z80 representation.

The [Nucleus Object Stream Format](nucleus-object-format.md) governs the binary
record tags, framing, payloads, patch order, integrity check, and terminal
commit used to publish that representation.

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

The first implementation emits ordinary Z80 machine code into one or more flat
16-bit bank images. It is not tied to one computer, monitor, operating system,
port map, or physical memory layout. A target adapter supplies memory regions,
source-part bank assignments, service vectors, stack policy, and reporting
metadata.

All runtime addresses remain 16-bit target addresses. No source operation
exposes, constructs, compares, converts, or calculates with one. A bank ordinal
is also private target metadata. The compiler retains the type, extent, root
category, and bank information required for every aggregate address carrier.

### 2.2 Separate accounts

The implementation reports these bounded accounts separately:

| Account            | Contents                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| Compiler core      | Z80 code and immutable data required while compiling.                            |
| Compiler workspace | Peak simultaneously live writable compiler state.                                |
| Generated program  | Emitted Z80 code, static program data, and required startup material.            |
| Target runtime     | Shared helpers, service adapter, trap support, and fixed writable runtime state. |
| Activation storage | Bounded storage used by simultaneously active routine calls.                     |
| External storage   | Source, append-only object streams, maps, manifests, and service buffers.        |

The compiler-core acceptance gate is 16 KiB. Moving required compiler code or
immutable tables into another account does not satisfy it. The target runtime
and generated program remain measured even though they do not enter that gate.

### 2.3 Target description

Nucleus source contains no physical placement, and a target description
contains no source-symbol reference. Source preparation supplies declarations
in order as source parts. A target profile supplies machine regions, the
runtime revision, and an optional mapping from source-part ordinal to bank.
The compiler assigns offsets within those regions and computes final
addresses.

The external profile may contain device names, access attributes, bank
selectors, device offsets, output-file choices, and other host information.
The adapter validates those attributes and reduces the flat placement data to
this compact compiler descriptor:

| Field              | Meaning                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `runtimeIdentity`  | Runtime source/ABI revision, link rules, linked length, vector layout, and helper-offset identity. |
| `imageBase`        | First target address of startup, runtime, code, and image bytes.                                   |
| `imageCapacity`    | Maximum byte extent of each selected image region.                                                 |
| `writableBase`     | First target address of runtime vectors, fixed state, and program writable storage.                |
| `writableCapacity` | Combined vector, fixed state, data, BSS, free, and optional stack extent.                          |
| `establishStack`   | Boolean; false inherits `SP`, true establishes it inside writable.                                 |

The identity, base, and capacity fields are unsigned 16-bit words;
`establishStack` is one byte and must be zero or one. A base and capacity
describe one half-open region. Validation computes the mathematical end with a
seventeenth bit, so a nonempty region may end at `$10000` without a sentinel.

A banked profile also supplies one bounded bank ordinal for each source-part
ordinal and these fields:

| Field            | Meaning                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `bankWindowBase` | Target address at which every selected bank appears.             |
| `bankCapacity`   | Capacity of each bank separately, not the combined device image. |
| `bankCount`      | Number of admitted bank ordinals.                                |
| `entryBank`      | Bank containing startup and `main`.                              |
| `partBank[]`     | One bank ordinal for each source-part ordinal.                   |

The mapping is distinct from source preparation and does not key on filenames.
A direct definition belongs to its part's bank. A forward declaration and its
abbreviated completion must have the same assignment.

`bankWindowBase`, `bankCapacity`, `writableBase`, and `writableCapacity` are
unsigned 16-bit words. `bankCount`, `entryBank`, and each `partBank` entry are
bounded byte ordinals. `establishStack` remains Boolean.

Before reduction, the adapter verifies that image mappings can be loaded and
executed and that writable permits writes. Hardware attributes and device
offsets remain external and add no source-visible property.

The runtime identity must equal the constant carried by the compiler before
publication. It identifies the canonical runtime source revision, private ABI,
RAM-vector and helper layout, deterministic link rules, and expected linked
length. It does not identify one address-bound byte sequence. A mismatch is a
target-configuration diagnostic, not a runnable artifact.

The operating layer supplies fully linked helper bytes through a runtime
provider keyed by that identity. The adapter gives it the complete validated
link context: runtime base, writable/vector state addresses, service
destinations, and every data or read-only-data bound consumed by the runtime.
The provider deterministically assembles or links the canonical source for
that context and verifies the resulting length and helper offsets against the
identity. The compiler retains the identity, expected length, vector layout,
and helper offsets; it does not retain the linked image. At each derived
runtime base it submits the bank, target address, identity, link context, and
expected length to the bounded provider operation. The provider appends fully
resolved bytes to the image spool as ordinary NOBJ `IMAGE` records. NOBJ
contains no runtime relocation records. An unavailable source revision,
unsupported context, identity, length, or helper-layout mismatch, or output
failure aborts the generation before commit.

### 2.4 Loaded and ROM mappings

The relationship between the image and writable regions determines startup
mode; the descriptor contains no mode flag.

- When the complete writable region lies inside the image region, the target is
  loaded. Initialized bytes are emitted at their runtime addresses and startup
  emits no copy.
- When the complete writable region lies outside the image region, the target
  is ROM-resident. Initial values occupy an image record and startup copies them
  to `writableBase`.
- Partial overlap between the regions is invalid.

A banked target requires writable to lie outside the half-open bank window
beginning at `bankWindowBase` with extent `bankCapacity`. It therefore always
uses ROM mode, and its startup copy is unconditional under Section 4.3.

The runtime vector table begins at offset zero in writable storage. The
identity-fixed runtime state follows the table, program initialized objects
follow that state, and BSS begins at the complete used initialized length
rather than at a reserved capacity. Their sum must fit `writableCapacity`
without mathematical overflow.

In loaded mode, `writableBase` must begin after startup, runtime, generated
code, and other non-writable used image bytes. The map reports the first free
image address. In banked mode, writable must lie wholly outside the banked
window so a RAM address denotes the same bytes in every bank.

### 2.5 Address assignment and validation

Every produced branch, call, object address, entry, image record, and patch
uses a target address. The compiler sends generated bytes to the append-only
object sink in Chapter 9 and need not map the target image into its own address
space. Private compiler pointers identify only bounded compiler state; they are
never substituted for a target address.

Before the terminal commit, the compiler and adapter together establish all of
these facts:

- every mathematical region end is at most `$10000`;
- the runtime identity and `establishStack` value are valid;
- writable is wholly inside or wholly outside image for a flat target;
- writable lies outside the bank window for a banked target;
- image bytes, runtime vectors, initialized data, BSS, and optional stack fit
  their capacities;
- loaded-mode writable storage begins after other used image bytes;
- every part ordinal and bank ordinal is in range;
- the entry bank contains the part defining `main`, after every part whose
  declarations `main` uses;
- every forward declaration and completion has a compatible bank assignment;
- every bank contains the complete selected runtime helper image and fits that
  image, its code, and its read-only bytes after the reserved three-byte entry
  slot within `bankCapacity`;
- the entry bank also fits startup and the complete initialized-data load image
  without spilling into another bank;
- every branch, call, far call, data reference, entry pair, and patch is in
  range;
- every cross-bank aggregate use satisfies Section 6.5;
- every pending output fixup fits its bounded table and resolves once; and
- every image and patch record lies within its selected image region.

### 2.6 Banked program model

A banked ROM contains one logical compilation and one program, not one program
per bank. Manifest order remains declaration order. A separate adapter mapping
assigns each source part to a bank by ordinal.

For a TECM8 four-bank target, `bankWindowBase == $8000` and
`bankCapacity == $4000`. The host places bank records at device offsets `$0000`,
`$4000`, `$8000`, and `$C000`. Device offsets and hardware selector values are
host metadata rather than Z80 target addresses.

The complete program has one `main`, one startup, one writable region, and one
published `(entryBank, entryAddress)` pair. The entry bank contains the part
defining `main`, after every source part whose declarations `main` uses. Startup
and the initialized-data load image occupy that bank. Runtime vectors and
program variables occupy always-visible writable RAM outside the bank window.

Calls within one bank use ordinary `CALL`. Calls across banks use the far-call
vector in Section 8.6. Every bank contains the complete selected runtime helper
image. The runtime identity therefore fixes one byte length and one set of
helper offsets for every bank. Every bank reserves the first three bytes of the
window, and its runtime begins at `bankWindowBase + 3`; this version performs no
per-bank subsetting.

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

Compiler metadata retains every complete aggregate extent, fixed-array length,
fixed-array stride, and record-field offset as an unsigned 16-bit value. The
same word-sized extent machinery applies to records, arrays, and bounded
strings. This is compiler metadata only; it adds no header to an aggregate
object.

### 3.3 Bounded strings

`string[N]` occupies `N + 2` bytes. Byte zero is the current logical length
`L`; bytes 1 through `N` are the content capacity; and byte `N + 1` is always
`$00`. The compiler writes that final byte while building the static image,
and no runtime operation writes it again. Bytes `L + 1` through `N` are also
zero. The invariant is `0 <= L <= N`, and the complete object extent is at
most 255 bytes because the source capacity is at most 253. This string-specific
limit does not constrain the complete extent of a containing record or array.

The address `carrier + 1` is always zero-terminated within `N + 1` bytes, so a
terminator-consuming routine can never read past the end of the object. This
does not make the payload a C string of exactly `L` bytes. Embedded zero bytes
are ordinary Nucleus content, but a C consumer stops at the first one. The
guarantee prevents a runaway read; it does not preserve counted length for a C
consumer.

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
containing object's storage. Aggregate constants are complete objects in the
generated read-only-data region. Routine activations contain no owned aggregate
object.

The compiler determines every program object's address, type, extent, and
initial bytes before it commits the generated object. It retains initialized
data length, aggregate-constant length, total read-only-data length, and BSS
length as separate words. A constant symbol retains an offset relative to the
aggregate-constant image, so later initialized declarations cannot change its
identity. The compiler must reject a layout whose mathematical end exceeds the
selected region.

### 4.2 Transcript barrier and image layout

The compiler reads the source stream once. Parsing and checking finish before
the backend consumes the private semantic transcript, and that transcript is
consumed once. The parser finalizes the initialized-data, BSS, and
per-bank aggregate-constant used lengths before the backend emits any image
record. Startup and selected-runtime lengths are also known. Startup copy and
clear lengths, aggregate-constant addresses, each code base, and the ROM-mode
copy source therefore require no fixup. Forward code addresses, including
`main`, may use placeholder bytes followed by patch records under Section 9.2.

In a flat image, startup begins at `imageBase`, the selected runtime follows the
startup stub, generated read-only bytes follow the runtime, and generated code
follows the read-only extent. In ROM mode the read-only bytes contain the
complete initialized-RAM load image followed by aggregate-constant bytes. In
loaded mode initialized bytes occupy their runtime addresses within the image,
and the generated read-only extent contains only aggregate constants.

Every bank reserves three bytes at `bankWindowBase`. The entry bank emits
`JP startup` there; the other banks leave the slot to host image fill. The
complete selected runtime begins at `bankWindowBase + 3` in every bank. In the
entry bank, startup follows that runtime, generated read-only data follows
startup, and generated code follows the read-only extent. In every other bank,
read-only data follows the runtime and precedes code. Only the entry bank
contains startup and the initialized-RAM load image. The runtime identity fixes
the canonical source, link rules, linked length, helper offsets, and RAM vector
layout; this version performs no helper subsetting. Banks with the same
complete link context use byte-identical linked helper images.

The initialized block begins with the adapter-selected runtime vector table,
continues with the identity-fixed writable runtime state, and then contains
source-declared initialized variables. The adapter contributes the vector and
runtime-state bytes at contract-defined offsets; they are not Nucleus
initializers. BSS follows the complete used initialized length.

The operating-layer runtime provider emits each complete, fully linked helper
image at the derived runtime base. The compiler advances the corresponding
target cursor by the identity's fixed length only after the provider accepts
the operation. The helper bytes never occupy compiler workspace. The provider
operation serializes as ordinary image records and adds no NOBJ record class or
relocation phase.

For a flat artifact, the runtime base is `imageBase` plus the exact startup-stub
length. For every banked image, the runtime base is `bankWindowBase + 3`. The
entry bank's first instruction transfers over that runtime to startup. The
ROM-mode copy-source operand is emitted as a placeholder. After the final code
and read-only offsets are known, the compiler emits its resolved patch record.
The startup transfer to `main` uses the same checked patch discipline.

### 4.3 Initial state

Before `main` begins, the runtime vectors have their adapter-selected targets,
every program variable has its language-defined zero or explicit static value,
and every aggregate constant has its complete declared value. In ROM mode
startup unconditionally copies the complete initialized block, including the
nonempty vector table and any initialized-variable bytes, then clears BSS. The
copy therefore cannot be elided merely because source declares no initialized
variable. In loaded mode startup omits the copy and clears BSS. Startup never
copies aggregate-constant bytes or exposes a partly initialized object to
source execution.

Static words use little-endian order. Record and array initializers follow the
packed layout in Chapter 3. A bounded-string initializer writes its length and
decoded bytes, zeros payload bytes `L + 1` through `N`, and writes `$00` at
`N + 1`. Those bytes beyond `L` remain outside source-readable string content.
The compiler may reuse its existing one-object initializer buffer while
building either a variable or an aggregate constant; it does not require a
second read-only-image-sized workspace buffer.

### 4.4 Program entry and exit

The flat entry address is `imageBase`; a banked artifact publishes
`(entryBank, bankWindowBase)`. Startup optionally establishes the stack,
unconditionally copies the complete initialized block in ROM mode, clears BSS,
and then enters `main`. Copy and clear therefore precede the entry transfer. In
inherited-stack mode the transfer is a patched `JP main`; `main` returns through
the caller's existing return address. In established-stack mode startup uses a
patched `CALL main`, restores the incoming `SP` after successful completion,
and then returns to the original caller. Failure and trap paths restore it
through their terminal handling under Section 6.4.

In a banked artifact, the entry-bank instruction at `bankWindowBase` is an
ordinary three-byte `JP startup`. It preserves the monitor-supplied stack while
keeping every bank's runtime base and helper addresses identical.

Startup invokes `main` with no source parameters. Successful return terminates
normally. Failure returned by `main` performs `unhandled-error`. No source
routine runs before all variables and aggregate constants have their complete
initial values.

The compiler emits no reset, restart, or interrupt vector table. A loader,
monitor, or machine reset binding enters flat `imageBase` or the published
banked entry pair outside the source language.

## 5. Checked access and aggregate copying

### 5.1 Region checks

A generated access of width `w` at address `a` is permitted only when the
mathematical half-open region `[a, a + w)` lies wholly within either the used
writable region or the generated read-only-data region. The calculation must
not use wrapped 16-bit arithmetic as evidence that the region fits.

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
byte, complete capacity, and permanent terminator. Self-assignment has no
effect. Nucleus types cannot produce proper partial overlap between distinct
same-type aggregate paths.

The source checker rejects an assignment rooted directly at an aggregate
constant. The runtime carrier has no read-only bit, so an alias derived from a
constant uses the same region and copy checks as another aggregate alias. A
target may map generated read-only data to RAM, ROM, or protected memory. A
physical write through such an alias may therefore change bytes, be ignored, or
be rejected by the target; the language requires no dynamic permission check.

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

### 6.4 Entry stack modes and interrupts

When `establishStack` is false, startup inherits the caller's stack and does not
write `SP`. The compiler reports the complete per-compilation stack requirement
but performs no capacity validation because the descriptor makes no claim
about the caller's available stack.

When `establishStack` is true, startup establishes `SP` at the mathematical end
of the writable region. Runtime vectors, initialized variables, and BSS grow
upward from `writableBase`; the stack grows downward from that end. The unused
writable extent must cover the published stack requirement plus the two-byte
saved incoming `SP`.

Startup first selects the new stack and pushes the incoming `SP`, placing that
saved value in the top two bytes. It restores the value on every terminal path:
normal return, unhandled recoverable failure, and trap. The value `$0000`
represents a stack end of `$10000`, not an empty region.

After restoration, the generated terminal dispatcher reaches the initialized
RAM vector selected by the recorded run state: success, unhandled failure, or
trap. These vector entries are terminal calls in the target ABI. If an adapter
returns from one during a monitor or proof run, execution returns to the
original caller through the restored stack.

The activation-depth and activation-byte limits remain independent bounded
resources. A call that would exceed either limit performs
`activation-capacity` before the callee begins or caller state changes.

This activation contract is not interrupt-reentrant. The compiler emits no
interrupt entry and the service adapter supplies no interrupt-safe-call
guarantee. A machine interrupt handler must remain outside Nucleus, preserve the
program's complete machine state, and not enter a Nucleus routine or service.

### 6.5 Cross-bank aggregate restrictions

These are banked-target restrictions rather than language type rules. A valid
source program may receive a target diagnostic when it cannot be represented
safely under them.

An aggregate carrier contains a 16-bit address and no bank identity. The
compiler therefore enforces all three restrictions at a cross-bank boundary:

1. an aggregate constant is bank-local and cannot be named from another bank;
2. every aggregate argument must be rooted directly in a top-level program
   variable, including a field or array element selected from that root; and
3. the call cannot return an aggregate result.

A constant-rooted, parameter-rooted, or transient-result-rooted aggregate
argument cannot cross banks because its provenance is not represented in the
runtime carrier. Scalar arguments and results cross without this restriction.
A bank-local accessor may expose a scalar from a banked aggregate constant, and
a banked routine may operate on caller-owned RAM through a directly
variable-rooted aggregate argument.

## 7. Recoverable failure and traps

### 7.1 Recoverable completion

A failable routine completes with either success or one `u8` error code. No
success result exists on failure. `else fail` returns that code from the caller;
`handle NAME` stores it only after suppressing the success-result store. These
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
and adapters. Generated programs call their entries in the RAM-resident runtime
vector table. Each entry is one `JP`, and the runtime identity fixes the table's
base, order, and offsets.

The target environment establishes the table before source execution. ROM
startup copies it; a loaded image places it directly at its run address. Its
initialized bytes come from the selected adapter runtime rather than from
source declarations. The table also contains the terminal success,
unhandled-failure, and trap entries required by Chapter 7 and the far-call and
far-jump entries in Section 8.6.

Every vector destination must remain callable under every bank selector. A
banked target therefore binds these entries to fixed memory, always-visible
RAM, or another adapter path whose behavior is independent of the currently
selected bank.

Arithmetic and aggregate helpers remain ordinary local calls. They are not
placed in the vector table.

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
bytes, cursors, else failures from an earlier run. The external execution
interface identifies the reset execution as a distinct run.

Resuming or restarting generated code while retaining mutated service state is
a debugger or target-specific continuation, not a new conforming run.

### 8.6 Banked calls

The source-part bank mapping lets the compiler classify each routine call as
local or cross-bank. A local call uses ordinary `CALL`. A cross-bank call uses
the far-call vector and supplies a compiler-generated destination bank ordinal
and checked 16-bit target address through its private ABI. Source code exposes
neither value.

The far-call adapter selects the destination bank, enters the ordinary Nucleus
routine ABI, and installs a fixed-memory return path. Identity `$0004` uses the
selected-bank byte at writable-state offset eight and a sixteen-byte far-return
arena after the saved root-frame words. Each live far call uses the zero-based
slot `ActivationDepth - 1`: depth one selects slot zero, and the published
depth-eight boundary selects the final slot. The slot retains both the return
address and caller bank in always-visible state; neither value is inserted
among hardware-stack arguments. The callee returns with an ordinary `RET`; the
return path restores the caller's bank. The far-jump vector provides the
corresponding non-returning transfer.

On TECM8 the adapter may implement these entries through the monitor's
`Tecm8FarCall` and `RST 10h` facilities. Generated code never writes `SYS_CTRL`
directly. Parameters, results, activation state, runtime vectors, and service
state occupy always-visible RAM. Cross-bank aggregate traffic remains subject
to Section 6.5.

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
- every image, writable, and established-stack condition in Chapter 2; and
- every bounded compiler table needed to finish emission.

### 9.2 Append-only object records

The compiler-and-adapter object interface is the ordered logical record stream
encoded by the [Nucleus Object Stream Format](nucleus-object-format.md). The
adapter adds profile-only fields, including image fill, without adding them to
the compact compiler descriptor. Its record classes are:

| Record   | Required fields                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| `begin`  | format revision, runtime identity, flat or banked form, bank count, image bases, capacities, and fill byte |
| `image`  | bank ordinal, 16-bit target address, nonempty byte payload                                                 |
| `patch`  | bank ordinal, 16-bit target address, nonempty final replacement-byte payload                               |
| `map`    | the complete publication fields in Section 9.5                                                             |
| `commit` | entry bank and address, preceding record count, and encoding integrity fields                              |

A flat object uses bank ordinal zero and one image region. Exactly one `begin`
record comes first. Image records follow it and do not overlap one another.
They provide startup, the selected runtime, read-only and initialized-load
bytes, and generated code. Image and patch records together determine every
non-fill byte in the committed used extents. A payload occupies increasing
target addresses and cannot cross a bank boundary.

Patch records follow the last image record. A patch may replace an emitted byte
or an implicit image-fill byte. Patch addresses may appear in resolution order
rather than target-address order. Their extents must not overlap, must remain
inside the committed used extent, and must contain only fully resolved and
range-checked replacement bytes. Exactly one map record follows the patches.
Exactly one commit record comes last. No record may follow commit.

The compiler retains bounded source symbols and currently unresolved fixup
metadata while it emits image records. It may not retain complete bank images
or generated routines merely to patch them later, and it does not retain the
selected runtime image. It emits placeholder bytes at unresolved sites and
calculates each final absolute word or relative byte during the same
compilation. The output sink accepts each resolved patch into a separate
append-only spool, then serializes that spool after the image spool. The patch
consumer performs byte replacement only. It never resolves a source name,
branch kind, or relocation expression and is not a linker.

NOBJ is the standard stored-object envelope. Intel HEX, raw binary, `.COM`,
serial framing, and device images remain materialized delivery formats rather
than compiler output formats.

### 9.3 Atomic commit and consumption

The object sink accepts `begin`, `image`, `runtimeImage`,
`runtimeInitialImage`, `patch`, `map`, `commit`, and `abort`. `runtimeImage`
obtains fully linked helper bytes for the validated context from the
operating-layer provider. `runtimeInitialImage` obtains that identity's
resolved vector table and fixed initial writable-state bytes for the same
context. Both append ordinary image records and have no distinct wire
representation. The sink maintains separate sequential image
and patch spools, then drains or chains them in NOBJ order. Only a stream with
a valid terminal commit is published and runnable. A diagnostic or sink failure
aborts the current generation; an incomplete stream cannot replace the prior
committed generation. The compiler therefore needs no image rollback, runtime
blob, or routine buffer. The sink supplies serialized framing, record count,
and integrity fields while it forms the final order. The commit integrity
fields cover every preceding record, and the compiler does not reread the
object.

A consumer validates the complete committed stream before exposing it as a
runnable program. It initializes each output image with the profile fill byte,
applies image records, then applies patch records, and publishes the materialized
result atomically. A RAM loader uses a private or non-runnable load area until
validation is complete. A ROM utility materializes and patches the images
before invoking a separate programmer or burner.

A direct wire loader can materialize a banked object in one pass only when it
has isolated writable backing for every selected bank. Otherwise it stores the
NOBJ and materializes the banks during a later read. A flat loader may write
directly when one isolated target extent fits available RAM.

The adapter must not patch an unchecked value or silently truncate a bank,
address, displacement, size, source location, or static datum. It must reject
an invalid record order, overlap, range, target, integrity value, or missing
commit.

### 9.4 Source locations

Each emitted dynamic trap site retains enough information to report the best
available source location required by the language specification. A compiler
may use a side map, inline constants, shared trap stubs with an established
location carrier, or another measured representation. Entering a shared helper
must not replace the source location with the helper's address.

### 9.5 Published map

The committed artifact reports at least its runtime identity, vector layout,
object format revision, image fill byte, entry bank and address, source-part
bank mapping, bank-tagged image-record extents, first free image address per
bank, initialized-data run extent, BSS run extent, aggregate-constant extent,
writable region, stack mode, and measured stack requirement. The report
distinguishes used lengths from capacities. Host tools may add hardware
selector values, device offsets, or filenames, but those values do not enter
source semantics.

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

Object-stream producer, materializer, and storage proofs cover the required
cases in the NOBJ format separately from source-language execution.
They include runtime-provider identity, link-context, helper-layout, and length
mismatch, execution at two distinct linked layouts including runtime base
`$8003` with changed writable-state addresses, deferred `MAP.usedLength`
validation, direct flat wire loading, and stored banked
materialization without private backing for every bank.

### 10.2 Measurement reports

Every target size or timing claim comes from fresh assembled output and names
the proof that produced it. Reports separate compiler code, compiler immutable
data, peak workspace, generated program, target runtime, fixed runtime state,
activation storage, instruction count, and T-states. A projection states its
measured basis; an untested expectation is labelled a hypothesis.
