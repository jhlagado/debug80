# Nucleus Target System Specification 0.1

- Status: proposed for approval; no implementation authorised
- Date: 2026-08-12
- Baseline: `d611a696`

## 1. Authority and purpose

This document specifies target profiles, program images, startup, entry, and
banked-program composition for Nucleus 0.1. The
[language specification](specification.md) governs source meaning. The
[Z80 runtime and backend contract](z80-runtime-contract.md) governs packed
representation, generated-code integrity, runtime vectors, and the private Z80
ABI. This document governs the boundary between those authorities and a target
adapter.

Nucleus supports both loaded programs and ROM-resident programs without
changing source declarations. A `var` is mutable program-lifetime storage. An
explicit initializer establishes its value before `main`; a declaration
without one establishes its zero value. An aggregate `const` occupies
read-only image storage and no writable storage.

The governing rule is:

> Nucleus source contains no physical placement. The target description
> contains no source-symbol reference.

Source selects declarations and their order. A target profile selects memory,
runtime, service bindings, and bank placement. Neither input names objects from
the other.

## 2. Language and target boundary

### 2.1 Source manifest

The source manifest remains the ordered list defined by the language
specification. It establishes one logical compilation unit and one program
scope. It contains no address, segment, device, or bank annotation.

A banked target supplies a separate mapping from source-part ordinal to bank.
The ordinal is the part's position in the manifest. The mapping does not key on
filenames and does not alter manifest order, declaration visibility, or source
identity.

### 2.2 Physical placement

The target profile contains no source names. The adapter supplies region bases
and capacities; the compiler assigns declaration and code offsets and computes
final target addresses.

Source has no origin, segment, bank, address, alignment, initialization-call,
or vector declaration. Target placement can therefore change without changing
the program's source meaning.

### 2.3 Interrupt boundary

Nucleus defines no interrupt routine, interrupt or restart vector declaration,
interrupt-reentrant calling convention, or interrupt-safe service guarantee.
The compiler emits no interrupt vector table.

An external interrupt handler must preserve the complete Nucleus machine state
and must not enter a Nucleus routine or service. Machine reset and monitor entry
also remain outside the source language.

## 3. Target profile and compiler descriptor

### 3.1 Human-facing profile

A human-facing profile may name devices, memory permissions, bank selectors,
device-image offsets, output files, service implementations, and loader or
monitor conventions. The adapter validates those properties before invoking
the compiler.

For a flat target, the adapter reduces the profile to:

```text
runtimeIdentity
imageBase
imageCapacity
writableBase
writableCapacity
establishStack
```

The first five fields are unsigned 16-bit words. `establishStack` is Boolean.

For a banked target, the adapter supplies:

```text
runtimeIdentity
bankWindowBase
bankCapacity
bankCount
writableBase
writableCapacity
establishStack
entryBank
partBank[partCount]
```

`bankWindowBase` is the Z80 address at which every selected bank appears.
`bankCapacity` applies separately to each bank; it is not the combined device
image capacity. `bankCount` bounds valid bank ordinals. `entryBank` identifies
the bank containing startup and `main`. The bounded `partBank` array maps each
manifest ordinal to one of those banks.

`runtimeIdentity`, `bankWindowBase`, `bankCapacity`, `writableBase`, and
`writableCapacity` are unsigned 16-bit words. `bankCount`, `entryBank`, and each
`partBank` entry are bounded byte ordinals. `establishStack` remains Boolean.

`runtimeIdentity` binds the compiler to the supplied runtime's exact byte
length, vector layout, and helper offsets. A mismatch is a target-configuration
diagnostic and cannot produce a runnable artifact.

### 3.2 Base and capacity

Every region uses a base and capacity, never an inclusive limit. Validation
calculates the mathematical end with a seventeenth bit. A nonempty region may
therefore end at `$10000` without a zero sentinel.

The external profile retains read, write, execute, device, and bank attributes.
The compact descriptor contains only values required by compiler arithmetic.

## 4. Image and writable regions

### 4.1 Image region

The flat image contains, in logical order:

```text
startup
selected runtime
generated code
generated read-only data
```

The runtime begins immediately after the exact startup length. Generated code
follows the runtime. Read-only bytes follow generated code. They include
aggregate constants and, in ROM mode, the initialized-data load image.

Every bank reserves the same three-byte entry slot at `bankWindowBase`. The
entry bank fills it with `JP startup`; the other banks leave the slot to the
host's ordinary image fill. Every complete runtime helper image therefore
begins at `bankWindowBase + 3`.

The entry bank contains, in logical order:

```text
entry JP
selected runtime
startup
generated code
generated read-only data
```

Every other bank contains the reserved entry slot, the same complete runtime,
then that bank's code and read-only bytes. Only the entry bank contains startup
and the initialized-data load image. The runtime identity fixes one complete
helper image, one common vector layout, and one set of helper offsets for every
bank. This version performs no per-bank helper subsetting.

The parser finalizes initialized-data, BSS, and aggregate-constant used lengths
before the backend emits any code byte. Copy and clear lengths therefore need
no fixup. Code addresses and the ROM copy-source address may require checked
publication-time patches.

### 4.2 Writable region

The writable region has one upward-growing allocation:

```text
writableBase
    runtime vector table
    initialized program variables
    BSS
    free capacity
    optional established stack, growing downward
writableBase + writableCapacity
```

The runtime vector table is adapter-contributed initialized data at its defined
offset. Program initialized data follows it. BSS begins immediately after the
used initialized length, not after a reserved initialized-data capacity.

The complete upward allocation must fit `writableCapacity`. When stack
establishment is enabled, the unused space above BSS must also cover the
published stack requirement and the saved incoming stack pointer.

This version has one contiguous writable region. Fragmented RAM requires
bounded copy and clear record tables and is a separate extension.

### 4.3 Loaded mode

When the writable region lies wholly inside the image region, initialized
bytes are emitted at their runtime addresses. Startup emits no copy and still
clears BSS.

The writable base must begin after startup, runtime, generated code, and other
non-writable used image bytes. The published map records the first free image
address so a profile can be corrected in one recompilation when its chosen
writable base is too low.

### 4.4 ROM mode

When the writable region lies wholly outside the image region, the complete
initialized block forms an image record after generated code. Startup copies
that block to `writableBase`, then clears BSS.

Partial overlap between image and writable regions is invalid. No loaded/ROM
mode flag exists.

A banked target requires writable storage to lie wholly outside its bank
window. It is therefore always ROM mode. Its entry-bank startup unconditionally
copies the complete initialized block before clearing BSS.

## 5. Startup, entry, and stack

### 5.1 Startup order

Startup performs these operations in order:

1. establish the stack when requested;
2. copy the complete initialized block in ROM mode;
3. clear BSS when nonempty; and
4. transfer to `main` through a checked patched address.

The initialized block always begins with the nonempty runtime vector table.
The ROM-mode copy is therefore unconditional even when source declares no
initialized variable. Its length includes both the vector table and every
initialized program-variable byte.

No source routine runs before initialization completes. Startup is implicit and
is not source-callable.

### 5.2 Inherited stack

The default profile sets `establishStack` to false. Startup does not modify
`SP`. The program uses the caller's stack and returns through the return address
already supplied by the caller.

The compiler publishes the complete per-compilation stack requirement but
cannot validate the caller's available space.

### 5.3 Established stack

When `establishStack` is true, variables grow upward from `writableBase` and the
stack grows downward from `writableBase + writableCapacity`. The capacity check
is:

```text
writableCapacity - upwardUsedLength
    >= stackRequirement + savedIncomingSpBytes
```

Startup records the incoming `SP` on the new stack, where it occupies the top
two bytes, before entering source code. Normal return, unhandled failure, and
every trap restore that value before returning to the original caller.

The activation-depth and activation-byte capacities in the runtime contract
remain binding. A new call traps atomically before the callee begins when its
activation cannot fit.

### 5.4 Entry

The flat artifact entry is `imageBase`. A banked artifact publishes
`(entryBank, bankWindowBase)`. Exactly one `main` exists for the complete
program, and the entry pair names the bank containing its startup path.

The entry bank's three-byte slot transfers to startup after the local runtime.
All banks consequently use the same runtime base and helper addresses while the
external entry address remains `bankWindowBase`.

The target environment may enter the pair through a loader, monitor call, or
reset binding. Bank zero is a permitted convention, not a language or compiler
requirement.

## 6. Runtime vector table

Generated programs call target services through a RAM-resident table of `JP`
entries. The target environment establishes the table before `main`: ROM
startup copies it, while a loaded image places it directly at its run address.
Its initial bytes belong to the adapter-selected runtime rather than to a
Nucleus initializer.

The table contains:

- the six standard services in the Z80 runtime contract;
- the terminal success, unhandled-failure, and trap paths required by that
  contract; and
- target far-call and far-jump entries.

The table lies in the writable region and therefore remains visible from every
bank. Every vector destination must also remain callable under every bank
selector. The runtime identity fixes its entry order and offsets. Generated
code never assumes a platform-specific service address.

Arithmetic and aggregate helpers remain local code within each bank. They are
not vectored or reached through a bank switch.

## 7. Banked programs

### 7.1 One program and one compilation

A banked ROM contains one Nucleus program: one ordered source stream, one
program scope, one `main`, one set of variables, and one startup. Banks control
visibility and placement; they do not create separate programs.

Each source part is assigned to a bank by its manifest ordinal. A top-level
declaration belongs to the bank assigned to the part containing its canonical
declaration. An abbreviated body completing a forward declaration must be in a
part assigned to the same bank as that declaration.

`entryBank` must contain the part that defines `main`. That part follows every
part containing a declaration that `main` uses. Bank order is independent of
manifest order: libraries may occupy any bank, but their declarations remain
earlier in the logical source stream than the mainline.

### 7.2 TECM8 mapping

For the four-bank TECM8 arrangement, all banks use the same Z80 window:

```text
target window          $8000 + $4000
bank 0 device offset   $0000
bank 1 device offset   $4000
bank 2 device offset   $8000
bank 3 device offset   $C000
```

The bank selector and device offset are target metadata. The host encodes each
bank's records at the corresponding device offset.

The writable region must lie outside the banked window. A RAM address then has
the same meaning in every bank, and the vector table and all program variables
remain visible during a switch.

### 7.3 Calls

A call to a routine in the current bank is an ordinary Z80 `CALL`. A call to a
routine in another bank uses the far-call vector. The compiler supplies the
private checked bank ordinal and target address required by that vector; source
code supplies neither.

The far-call implementation selects the destination bank, enters the ordinary
routine ABI, and installs a return path that restores the caller's bank. The
callee returns with an ordinary `RET`. A far jump provides the corresponding
non-returning transfer where the backend requires one.

The initialized-data image and startup code live in the entry bank. Runtime
helpers are duplicated in full in every bank except for the RAM-resident vector
table.

Startup and the complete initialized-data load image must fit in the entry bank
alongside its runtime, code, and read-only data. This version cannot spill that
image into another bank. Exceeding the entry-bank capacity is a target-capacity
diagnostic even when other banks have free space.

## 8. Cross-bank restrictions

These restrictions describe what this banked target can compile. They do not
change Nucleus source validity. A program that exceeds them receives a target
diagnostic in the same way that an otherwise valid program can exceed a
compiler capacity.

Aggregate aliases contain a 16-bit address and no bank identity. The following
rules prevent an alias to bank-local bytes from crossing a bank boundary:

1. An aggregate constant is bank-local. Source in another bank cannot name it.
2. Every aggregate argument to a cross-bank call must be rooted directly in a
   top-level `var`, including a field or array element selected from that root.
   A constant-rooted, parameter-rooted, or transient-result-rooted alias cannot
   cross.
3. A cross-bank call cannot return an aggregate result.

Scalar arguments and results cross freely. A banked table can expose an
accessor routine in its own bank that returns a scalar. A banked library can
operate on caller-owned RAM because a directly `var`-rooted aggregate remains
valid in every bank.

## 9. Output and publication

The compiler publishes buffered address-tagged records through a transactional
record store. A banked record includes its bank ordinal as well as its 16-bit
target address. The compiler publishes no Intel HEX text, raw binary, `.COM`
file, padding, serial framing, archive, or device-image container.

Host encoders transform committed records into those formats. Tentative output
cannot be streamed because a later diagnostic must leave the previously
published artifact unchanged. Delivery may stream records only after commit.

One banked compilation publishes one logical artifact containing all bank
records and one entry pair. The storage and rollback representation remains an
open implementation decision. External staging is a candidate, not an approved
mechanism, until a proof demonstrates atomic publication and restoration after
a late failure. The current flat proof adapter's in-memory store does not settle
that choice.

## 10. Published map

The committed map reports at least:

- runtime identity and vector-table layout;
- entry bank and entry address;
- source-part ordinal to bank assignment;
- bank-window base, per-bank capacity, bank-tagged image records, used lengths,
  and first free image addresses;
- initialized-data, BSS, aggregate-constant, and vector-table extents;
- writable base and capacity;
- stack mode and measured requirement; and
- every target restriction or capacity relevant to rebuilding the artifact.

Used lengths and capacities remain distinct.

## 11. Validation and rollback

Before publication, the compiler and adapter establish:

- the runtime identity, byte length, vector layout, and helper offsets match;
- every mathematical region end is at most `$10000`;
- writable is wholly inside or wholly outside image for a flat target;
- writable lies outside the banked window for a banked target;
- initialized bytes, BSS, vectors, optional stack, code, and read-only data fit
  their regions without wrapped arithmetic;
- loaded-mode writable storage begins after all other used image bytes;
- every part ordinal and bank ordinal is in range;
- `entryBank` contains the part defining `main`, after every source part whose
  declarations `main` uses;
- a forward declaration and its completion have compatible bank assignments;
- each bank's complete runtime helper image and selected code and read-only data
  fit `bankCapacity` after its reserved three-byte entry slot;
- the entry bank additionally fits startup and the complete initialized-data
  load image without spilling to another bank;
- every branch, call, far call, data reference, entry, and patch is in range;
- every cross-bank aggregate use satisfies Chapter 8;
- every staging write fits its separately reported capacity; and
- every output record lies within its selected bank or flat image region.

A late failure restores every previously published byte, record, bank tag,
size, address, entry pair, runtime identity, and map field. A rollback proof
must make tentative bytes and metadata differ from the previous publication
before forcing failure.

## 12. Illustrative profiles

### 12.1 TEC-1 ROM

```text
runtime identity  nucleus-z80-0.1
image             $8000 + $4000
writable          $2000 + $2000
establish stack   true
```

Startup establishes the stack at the top of writable memory, copies the runtime
vectors and initialized values to RAM, clears BSS, and enters `main`.

### 12.2 Loaded program

```text
runtime identity  nucleus-z80-0.1
image             $0100 + $6F00
writable          $6000 + $1000
establish stack   false
```

Initialized bytes, including the runtime vectors, already occupy their runtime
addresses. Startup omits the copy, clears BSS, and uses the caller's stack. The
image and writable profiles together cover the complete illustrative
`$0100..$7000` transient program area. The published first-free image address
distinguishes used space from unused capacity.

### 12.3 TECM8 banked ROM

```text
runtime identity  nucleus-z80-0.1
bank window       $8000 + $4000
writable          $2000 + $2000
establish stack   true
entry              bank 0, $8000
part banks         1, 2, 3, 0, 0
```

The compiler processes all five parts as one ordered unit. Startup and the
initialized-data image occupy bank 0 with the final mainline parts. The three
library parts precede them in the source stream while occupying banks 1 through 3. Calls within a bank are ordinary calls; calls between banks use the far-call
vector. The host places records at the device offsets defined by the TECM8
profile.

## 13. Deferred extensions and exclusions

This specification does not add:

- source-visible banks, origins, addresses, segments, placement, or alignment;
- interrupt routines, vectors, or restart declarations;
- multiple writable regions or multiple startup copy records;
- fragmented writable RAM;
- loader guarantees that suppress BSS clearing;
- inline machine code or unrestricted calls; or
- new aggregate-constant syntax or semantics.

Aggregate constants retain the source semantics already defined by the
language specification. This target specification governs their placement and
the bank-local restriction only.
