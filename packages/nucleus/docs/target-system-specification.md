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
ABI. The [Nucleus Object Stream Format](nucleus-object-format.md) governs the
binary records used to publish and materialize the resulting object. This
document governs the boundary between those authorities and a target adapter.

The object-stream and materialization rules below change target publication,
not source syntax or source meaning. They require no language-specification
change.

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
monitor conventions. It also supplies the byte used for unwritten image
addresses. The adapter validates those properties before invoking the compiler.

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

The operating layer owns a runtime-image provider keyed by `runtimeIdentity`.
Before compilation begins, the adapter establishes that the provider has the
canonical helper image and that its declared length, vector layout, and helper
offsets match the compiler's identity. The compiler retains the identity and
the corresponding layout constants, not the helper-image bytes.

At each derived runtime address, the compiler submits a bounded
`runtimeImage(bank, address, runtimeIdentity, expectedLength)` operation. The
provider streams the canonical bytes into the image spool as one or more
ordinary `IMAGE` records in increasing target-address order. It must report
exactly `expectedLength`; an unavailable image, identity mismatch, length
mismatch, or output failure aborts the generation. `runtimeImage` is a
compiler-facing sink operation, not an NOBJ record kind.

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
generated read-only data
generated code
```

The runtime begins immediately after the exact startup length. Read-only bytes
follow the runtime, and generated code follows those bytes. Read-only data
includes aggregate constants and, in ROM mode, the initialized-data load image.

Every bank reserves the same three-byte entry slot at `bankWindowBase`. The
entry bank fills it with `JP startup`; the other banks leave the slot to the
host's ordinary image fill. Every complete runtime helper image therefore
begins at `bankWindowBase + 3`.

The entry bank contains, in logical order:

```text
entry JP
selected runtime
startup
generated read-only data
generated code
```

Every other bank contains the reserved entry slot, the same complete runtime,
then that bank's read-only bytes and code. Only the entry bank contains startup
and the initialized-data load image. The runtime identity fixes one complete
helper image, one common vector layout, and one set of helper offsets for every
bank. This version performs no per-bank helper subsetting.

The operating-layer runtime provider supplies each helper-image copy at the
derived runtime address. The compiler advances its target cursor by the known
runtime length after the provider accepts the complete operation; it never
holds or copies the helper-image bytes in compiler workspace.

The parser finalizes initialized-data, BSS, and per-bank aggregate-constant used
lengths before the backend emits any image byte. The exact startup length and
selected runtime length are also known. The compiler can therefore derive each
read-only base, the ROM copy-source address, and each code base before code
emission begins. Copy lengths, clear lengths, aggregate-constant addresses, and
the ROM copy-source address need no patch. Forward code addresses still use the
checked patch records in Chapter 9.

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

The writable base must begin after startup, runtime, generated read-only data,
generated code, and other non-writable used image bytes. The published map
records the first free image address so a profile can be corrected in one
recompilation when its chosen writable base is too low.

### 4.4 ROM mode

When the writable region lies wholly outside the image region, the complete
initialized block occupies the entry bank's read-only area before generated
code. Startup copies that block to `writableBase`, then clears BSS.

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

## 9. Append-only object stream and publication

### 9.1 Single-pass output boundary

The [Nucleus Object Stream Format](nucleus-object-format.md) defines the exact
record tags, framing, fields, byte order, CRC, and commit representation. This
chapter defines their target-system meaning.

One compilation produces one logical append-only object stream. The compiler
reads the ordered source stream once and consumes its private checked semantic
transcript once. It does not perform a second source pass, replay emission once
per bank, seek in earlier output, or run a later layout pass.

Each selected bank has a target-address cursor that advances only. Emitting a
placeholder records its target location without moving that cursor backward.
Resolution changes no emitted byte in place; it produces a patch-spool call.

The stream contains these logical records in order:

1. one begin record carrying the target and runtime identities needed to
   interpret the stream, including the image fill byte;
2. one or more image records, each carrying a bank ordinal, a 16-bit target
   address, and bytes to place there;
3. zero or more patch records, each carrying a bank ordinal, a 16-bit target
   address, and the complete replacement bytes;
4. one map record containing the fields in Chapter 10; and
5. one terminal commit record.

The adapter contributes the profile-only fill byte when it creates the begin
record; the compact compiler descriptor does not gain a field that compilation
arithmetic never reads.

A flat artifact uses bank ordinal zero. Image records may contain placeholders
for forward code addresses. The compiler retains only currently unresolved
fixup sites. When a target becomes known, it calculates the final absolute word
or relative displacement and submits those replacement bytes to the output
sink. A patch contains final bytes, not a symbol name, relocation expression,
branch kind, or request for name resolution. The consumer therefore performs
byte replacement, not linking.

The sink owns two append-only storage spools while compilation runs. `image`
and `runtimeImage` calls append to the image spool. Resolved patch calls append
to the patch spool in resolution order, which need not be target-address order.
Finalization writes or chains the image spool before the patch spool so the
serialized NOBJ still has the record order above. This division is an
operating-layer service, not a second compiler pass, and requires no
compiler-resident image or routine buffer.

The existing bounded fixup state remains the controlling compiler capacity.
Language-level `forward` declarations are uncommon under declaration before
use, but ordinary control flow also creates forward code sites. Several sites
may target one enclosing label, so unresolved-site capacity is not defined by
nesting depth alone.

Image records supply startup, the selected runtime, read-only and
initialized-data-load bytes, and generated code. The selected-runtime records
come from the provider operation in Section 3.1; all remain ordinary image
records in the serialized object. Image and patch records together determine
every non-fill byte in the committed used extents. Payload bytes occupy
increasing target addresses and cannot cross a bank boundary.

The compiler publishes no Intel HEX text, raw binary, `.COM` file, padding,
serial framing, archive, or physical device-image container. Those remain
encodings of the logical stream supplied by an operating or host layer.

### 9.2 Commit and failure

The output sink provides bounded `begin`, `image`, `runtimeImage`, `patch`,
`map`, `commit`, and `abort` operations. `runtimeImage` obtains the canonical
bytes from the adapter-selected provider and appends ordinary image records;
it has no distinct wire representation. The sink writes the image and patch
spools to sequential external storage and may drain or chain them when it
forms the final NOBJ. The compiler is not required to retain tentative image
bytes, runtime-image bytes, complete bank images, or a generated routine in
its address space.

Only a stream ending in a valid commit record is a published artifact. The sink
adds storage framing, the record count, and the integrity check while forming
the serialized order. It continues the final CRC while draining the patch
spool after the image spool. These fields do not require compiler buffering. A
diagnostic, target-capacity failure, output failure, reset, or truncated stream
before commit leaves an incomplete object that a loader or materializer must
reject. The sink may discard that object or retain it for diagnosis, but it
must not replace the previously committed artifact. Commit atomically makes
the completed generation current.

This rule supplies publication atomicity without compiler-side output rollback.
The compiler never restores earlier emitted bytes. It aborts the current
generation, and the storage layer preserves the previous committed generation.

### 9.3 Consumers

A materializer validates the complete committed stream, creates each bank or
flat image with the target profile's fill byte, applies image records, applies
patch records in stream order, and publishes the resulting image only after all
records pass their checks. It must reject an out-of-range bank, address, extent,
descending or overlapping image record, overlapping patch, patch outside the
committed used extent, duplicate commit, record after commit, or incomplete
stream. Patch addresses need not increase because nested targets and completed
forward bodies can resolve in a different order from their sites.

A RAM program loader may perform the same work directly into a private or
otherwise non-runnable load area, then transfer control through the committed
entry pair. It must not expose or enter partially patched code. A loader that
cannot isolate partial writes first materializes elsewhere and copies the
validated result into place.

A direct one-pass wire loader can materialize a banked object only when the
machine provides isolated writable backing for every selected physical bank
and prevents execution before commit. An ordinary flat 64 KiB Z80 address
space cannot privately hold several complete bank images alongside the loader.
Without isolated bank backing, the receiver must spool the NOBJ to sequential
storage, validate the committed object, and materialize its banks during a
later read. Flat objects still permit direct wire loading when one isolated
load extent fits available RAM.

ROM production is deliberately host-side in Nucleus 0.1. A utility on CP/M or
another development system materializes the bank images, applies the patches,
and controls the ROM programmer. A future TEC-family ROM burner may consume the
same object stream, but ROM burning is a separate tool and not a compiler or
language responsibility.

TECM8 and TEC-FS integration requires two sequential temporary spools plus an
atomic generation commit. The filesystem may copy the patch spool after the
image spool or join their storage chains without changing their logical order.
It does not require random-access patching while the compiler runs. A later
loader or host utility consumes the stored object.

## 10. Published map

The committed map reports at least:

- object format revision and image fill byte;
- runtime identity and vector-table layout;
- entry bank and entry address;
- source-part ordinal to bank assignment;
- bank-window base, per-bank capacity, bank-tagged image-record extents, used
  lengths, and first free image addresses;
- initialized-data, BSS, aggregate-constant, and vector-table extents;
- writable base and capacity;
- stack mode and measured requirement; and
- every target restriction or capacity relevant to rebuilding the artifact.

Used lengths and capacities remain distinct.

## 11. Validation and commit

Before emitting the terminal commit, the compiler and adapter establish:

- the runtime provider has the selected canonical image and its identity, byte
  length, vector layout, and helper offsets match;
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
- every pending fixup fits its bounded compiler table and resolves exactly
  once;
- every object-sink append succeeds;
- every `runtimeImage` operation emits exactly the selected runtime length at
  the derived address; and
- every image and patch record lies within its selected bank or flat image
  region.

A publication proof must begin with one committed artifact, write a different
generation, force a late failure after at least one image record, and establish
that the failed stream has no commit and the earlier committed generation is
still current. Separate consumer proofs must reject truncation before commit,
an invalid patch target, and a record following commit.

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
vector. TEC-FS may store the append-only object sequentially. A host utility
later materializes its committed records at the device offsets defined by the
TECM8 profile and supplies the images to the ROM programmer.

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
