# Z80 finalized-image contract

## Purpose

Atom and Nucleus both produce ordered IMAGE records followed by PATCH records.
The records differ in their surrounding NOBJ profiles, but their final step is
the same: allocate target memory, copy each IMAGE, apply the final patch bytes,
and publish a file or runnable memory image.

`@jhlagado/z80-tool-services` owns that common final step. Language packages
remain responsible for parsing and validating their NOBJ version, MAP record,
entry metadata, and language-specific constraints. They pass a normalized
generation to `materializeTargetImage` only after the serialized generation
has a valid terminal COMMIT and checksum.

This operation is not symbol linking. PATCH records contain final bytes. The
materializer does not read symbol names, evaluate relocation expressions, or
choose addresses.

## Normalized generation

A generation supplies:

- image base, capacity, and fill byte;
- bank count, entry bank, and entry address;
- one used length for each bank;
- ordered IMAGE records;
- ordered PATCH records; and
- a PATCH policy.

Every IMAGE and PATCH record contains a bank, a 16-bit address, and one or more
bytes. IMAGE records must be monotonic and non-overlapping within each bank.
PATCH records must not overlap one another.

The `image` PATCH policy requires every patched byte to have appeared in an
IMAGE record. Atom uses this policy. The `used` policy also permits a patch to
replace an implicit fill byte inside the used extent. Nucleus uses this policy.

## Materialized result

The result contains one capacity-sized `Uint8Array` per bank. Each array is
initialized with the declared fill byte, then receives IMAGE bytes followed by
PATCH bytes. The result also retains each bank's used length. File renderers
publish only the used extent; callers that load a target region into RAM may
use the full capacity-sized array.

`flatImage` is present only when the generation has one bank. Banked BIN and
Intel HEX output require an explicit bank selection because an ordinary file
does not describe the target's bank-switching policy.

## Output formats

`renderTargetBinary` returns the selected bank's used bytes without a header.
The file does not retain its load address.

`renderTargetCpmCom` returns the same raw bytes after checking that the image is
flat, the load address is `$0100`, the entry address is `$0100`, and the used
extent fits the CP/M transient-program region. A CP/M COM file has no header.

`renderTargetIntelHex` emits addressed data records with checksums followed by
the standard end-of-file record. The current contract uses 16-bit addresses;
banked callers select one bank rather than flattening several banks into a
linear address space.

## Publication rule

A parser must validate the complete serialized generation before allowing it
to replace a committed file or runnable image. A native implementation may
materialize while reading only when it writes into isolated tentative storage
that remains unreachable until the final COMMIT and checksum succeed. A
consumer that writes directly into live target memory first validates the
complete generation, rewinds it, and then materializes it.

BIN and COM publication uses the exact logical used length. CP/M 2.2 writes
physical 128-byte records, so the final disk record may contain padding. Intel
HEX retains the logical length through its records and end-of-file marker.

## Native CP/M renderer

`native/cpm22-final-image.asm` supplies the shared Z80 Intel HEX renderer. A
tool provides aliases for its open output FCB, BDOS wrapper, 128-byte DMA
buffer, source cursor, target address, remaining length, and small renderer
state. `ZTS_CPM_HEX_BEGIN` starts one output, `ZTS_CPM_HEX_SEGMENT` accepts a
contiguous source segment, and `ZTS_CPM_HEX_END` writes the end-of-file record
and pads the final physical CP/M record with `$1A`.

Several segment calls may describe one logical image whose bytes occupy
different resident buffers. This accommodates a compiler that combines a
runtime prefix with generated code without copying both regions into a second
contiguous buffer. The module performs no file naming, creation, rename, or
rollback. Each tool's CP/M publisher owns that transaction and calls the
renderer only after the final image is patched.
