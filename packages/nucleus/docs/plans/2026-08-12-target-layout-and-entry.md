# Plan: target memory, startup, and program entry

Status: proposed for approval; no implementation authorised
Date: 2026-08-12
Supersedes: the target-profile design in
[program storage and implicit startup](2026-08-10-program-storage-and-startup.md)
Baseline: `bfc934b7`

## Purpose

Nucleus needs one deployment model for two ordinary cases:

- a loaded program, such as a CP/M program whose executable image and mutable
  storage occupy RAM; and
- a ROM-resident program, entered at a fixed address, whose mutable variables
  occupy RAM elsewhere.

Both preserve the same source rules. A `var` is writable storage. An explicit
initializer supplies its value before `main`; a declaration without one
supplies its zero value. Aggregate constants occupy program-lifetime image
storage and do not consume writable storage.

The programmer declares each object once. The compiler and adapter own copying,
clearing, entry transfer, and physical placement.

The governing rule is:

> Nucleus source contains no physical placement. The target description
> contains no source-symbol reference.

## Existing foundation

The current compiler already has:

- one ordered multipart source stream;
- declaration-before-use with explicit routine forwards;
- separate initialized-data and BSS allocation;
- generated copy-before-clear startup;
- aggregate-constant bytes in generated read-only data;
- a patched transfer to `main`;
- segmented publication and rollback; and
- address-tagged segment measurements in the proof adapter.

The remaining work is to replace proof-only fixed addresses with a compact
target description and to separate target addresses from compiler staging
addresses.

## Settled boundaries

### Source and target inputs

The source manifest selects source parts and their order. It contains no target
addresses. The target profile selects memory regions and a runtime revision. It
contains no source names.

The compiler receives one flat 16-bit target mapping per compilation. It has no
bank selector, bank identity, cross-bank fixup, or bank-switching calling
convention.

### Interrupts and vectors

Nucleus defines no interrupt routine, interrupt or restart vector declaration,
interrupt-reentrant activation model, or interrupt-safe service guarantee. The
compiler emits no vector table. A loader, monitor, or reset binding enters the
artifact at its published entry address.

An external interrupt handler must preserve the program's machine state and
cannot enter a Nucleus routine or service.

### Banking

Bank-switched ROM packaging is outside this design. A host may place separately
compiled artifacts into a device image, and a monitor may supply bank services,
but neither operation changes a Nucleus compilation. No startup-suppression
mode, shared-RAM convention, selector field, or bank service enters this slice.

## Human profile and compiler descriptor

A human-facing profile may describe devices, access permissions, filenames,
and other adapter concerns. The adapter validates those properties and reduces
the profile to seven words:

```text
runtimeIdentity
imageBase
imageCapacity
writableBase
writableCapacity
stackBase
stackCapacity
```

`image` contains startup, the selected runtime, generated code, aggregate
constants, and any ROM-mode initialized-data image. `writable` contains
initialized variables followed immediately by BSS.

`stackCapacity == 0` selects inherited-stack mode and requires
`stackBase == 0`. A nonzero pair selects an established stack region.

Each region uses base plus capacity rather than base plus an inclusive limit.
Validation calculates its mathematical end with a seventeenth bit. A region
may therefore end exactly at `$10000` without a sentinel rule.

The runtime identity is compared with a compiler constant before publication.
It binds the compiler's runtime byte length and helper offsets to the supplied
runtime image and turns a revision mismatch into a configuration diagnostic.

## Derived loaded and ROM modes

The target profile contains no mode flag.

### Loaded mode

When the complete writable region lies inside the image region, initialized
bytes are emitted at their runtime addresses. Startup emits no data copy. It
still clears BSS before `main`.

### ROM mode

When the writable region lies wholly outside the image region, the initialized
bytes form an image record after generated code. Startup copies that complete
record to `writableBase`, then clears BSS.

### Rejected mapping

Partial overlap between image and writable regions is invalid. The two regions
must be nested as loaded mode or disjoint as ROM mode.

## Writable layout

Initialized variables begin at offset zero in the writable region. BSS begins
at the used initialized-data length:

```text
writableBase
    initialized variables     initializedDataLength bytes
    BSS                       bssLength bytes
```

The required extent is:

```text
initializedDataLength + bssLength
```

It must fit `writableCapacity`. The profile does not reserve separate data and
BSS capacities, so unused initialized-data capacity cannot strand RAM before
BSS.

This first model supports one contiguous writable region. Fragmented RAM would
require bounded copy and clear record tables and is a separate measured
extension.

## Image layout

The image entry is `imageBase`. Its logical order is:

```text
startup
runtime
generated code
generated read-only data
```

The runtime begins immediately after the exact startup length. Generated code
follows the runtime. Read-only bytes follow generated code.

In ROM mode, generated read-only data contains the initialized-data load image
followed by aggregate-constant bytes. In loaded mode, initialized bytes appear
at their runtime addresses and the trailing read-only data contains only
aggregate constants.

The compiler assigns all offsets. The adapter supplies bases and capacities;
it does not compute final source-object or routine addresses.

## Transcript barrier and fixups

Parsing and checking finish before backend publication. The parser has finalized
the initialized-data, BSS, and aggregate-constant used lengths before any code
byte is emitted. Copy and clear lengths therefore need no fixup.

Code addresses still need fixups. The compiler emits and retains checked patch
sites for:

- the final transfer to `main`; and
- the ROM-mode data-copy source, whose image address follows generated code.

The second patch uses the same publication discipline as the existing `main`
patch. A failed patch or capacity check prevents publication.

## Startup and entry

Startup performs the applicable operations in this order:

1. establish the configured stack when requested;
2. copy initialized data in ROM mode;
3. clear BSS when its used length is nonzero; and
4. enter `main` through the stack mode's patched transfer.

Copy and clear precede the transfer to `main`. No source routine runs before
them, and source code cannot call startup.

Inherited-stack mode tail-jumps to `main`, whose `RET` consumes the caller's
existing return address. Established-stack mode calls `main`, restores the
incoming `SP` on successful completion, and then returns to the original
caller. Its unhandled-failure and trap paths restore the incoming `SP` through
the same terminal discipline.

The program has one published entry, `imageBase`. There is no additional entry
name, source vector, reset declaration, or interrupt table.

## Stack modes

### Inherit

The default descriptor uses zero for both stack words. Startup leaves `SP`
unchanged. The program returns on the caller's stack. The compiler reports its
maximum stack requirement in the map but cannot validate the caller's available
space.

### Establish

A nonzero stack capacity reserves one disjoint region. Its first two bytes hold
the saved incoming `SP`; downward stack growth uses the remaining bytes. The
capacity must cover those two bytes plus the complete reported stack
requirement, including the established-mode call of `main`.

Startup establishes `SP` at `stackBase + stackCapacity`. It restores the
incoming value on normal return, unhandled failure, and every trap path.

An end of `$10000` is represented by loading `SP` with `$0000`. Capacity
validation still uses the mathematical end rather than wrapped arithmetic.

## Target and staging addresses

The compiler may build an image in RAM while targeting ROM elsewhere. A staging
address identifies the temporary output byte. A target address identifies the
address recorded in generated branches, calls, object references, and the
published map.

The preferred representation keeps staging cursors unchanged and retains
generated labels and fixups as image-relative offsets. For an image offset
`offset`:

```text
targetAddress = imageBase + offset
```

This localizes the change to target-address production. Byte writes, capacity
checks, backup, rollback, and staging cursors continue to use staging addresses.
An implementation may use an equivalent bias representation only if assembled
measurement and failure-path review show it is smaller without confusing the
two address classes.

## Output and publication

The compiler publishes address-tagged records in memory. It does not publish
Intel HEX text, raw binaries, `.COM` files, serial frames, padding, archives, or
containers. Host encoders produce those forms from the committed records.

Output remains buffered until commit. Streaming may transport committed records
after publication; it may not expose tentative bytes during compilation because
that would violate rollback.

The published map includes:

- runtime identity;
- entry address;
- image record addresses and used lengths;
- initialized-data and BSS run extents;
- aggregate-constant extent;
- stack mode and configured region; and
- measured maximum stack requirement.

Used lengths and capacities remain distinct.

## Validation

Before publication, the compiler and adapter establish:

- every region's mathematical end is at most `$10000`;
- the runtime identity matches the compiler;
- writable is wholly inside or wholly outside image;
- image and writable used bytes fit their capacities;
- initialized-data load and run extents have equal lengths;
- a load and run extent is identical or disjoint, never partially overlapping;
- in loaded mode, initialized-data records occupy the writable region while
  startup, runtime, generated code, and aggregate constants remain outside it;
- every target label, branch, call, object address, entry, and patch is in
  range;
- an established stack is disjoint and large enough for its two-byte saved-SP
  slot plus the reported requirement;
- every staging write fits its independent capacity;
- every address-tagged record lies inside the image region; and
- a late failure restores every previously published byte, record, size,
  address, entry, runtime identity, and map field.

A rollback proof must make tentative bytes and metadata differ from the prior
publication before forcing failure.

## Illustrative profiles

### TEC-1 ROM

```text
runtime identity  nucleus-z80-0.1
image             $8000 + $4000
writable          $2000 + $2000
stack             $7000 + $0F00
```

The monitor enters `$8000`. Startup copies initialized values from their final
image record into RAM, clears BSS, and transfers to `main`.

### Loaded program

```text
runtime identity  nucleus-z80-0.1
image             $0100 + $6F00
writable          $6000 + $0800
stack             inherit
```

The writable region lies inside the loaded image. Initialized bytes are already
at their runtime addresses, so startup omits the copy and clears only BSS.

## Feasibility and gates

The verified `bfc934b7` baseline is:

| Account            | Measured value |
| ------------------ | -------------: |
| Compiler code      |   13,612 bytes |
| Immutable data     |      393 bytes |
| Compiler core      |   14,005 bytes |
| Compiler workspace |    3,600 bytes |
| Target runtime     |      582 bytes |

The 16 KiB gate leaves 2,379 compiler-core bytes. The implemented data/BSS
allocator, generated copy and clear paths, aggregate-constant image, and
segmented rollback are already inside this baseline.

No byte estimate for the remaining target-description work is treated as
measured. Stop for design and size review if the accumulated compiler-core
increment reaches 600 bytes.

## Implementation sequence after approval

1. Record the no-interrupt and no-vector boundary in every authority.
2. Add the compact descriptor to the proof adapter without changing output.
3. Validate the runtime identity and all base-plus-capacity arithmetic.
4. Separate target offsets from staging addresses using deliberately unequal
   proof addresses.
5. Derive loaded and ROM modes and prove copy omission versus complete copy.
6. Merge initialized data and BSS into one writable-region allocation.
7. Add inherited and established stack proofs, including restoration on normal,
   failure, and trap exits.
8. Publish address-tagged records and the programmer-facing map.
9. Force divergent late failures and prove complete rollback.
10. Run a read-only adversarial correctness review, measure compression, and
    run a second correctness-and-size review before commit.

Every step reports compiler code, immutable data, core, workspace, generated
records, startup bytes, runtime, instruction count, and T-states separately.

## Explicitly outside this slice

- banking, selectors, bank-aware calls, and startup suppression;
- interrupt handlers, vectors, and restart declarations;
- multiple writable regions or multiple startup copy records;
- per-object placement or alignment;
- source-visible origins, segment names, or initialization calls;
- loader guarantees that suppress BSS clearing; and
- new aggregate-constant syntax or semantics.

Aggregate constants are already a separate language feature. This plan only
places their bytes in the image selected by the target profile.
