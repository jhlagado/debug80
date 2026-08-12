# Nucleus Object Stream Format 0.1

- Status: proposed for approval; no implementation authorised
- Date: 2026-08-12
- Baseline: `9659be78`
- Recommended extension: `.nobj`

## 1. Authority and scope

This document defines the binary format of a Nucleus append-only object stream.
It governs record framing, byte order, record payloads, patch application,
integrity checking, and terminal commit. A producer and consumer conform to the
same format whether the object is held by TEC-FS, a CP/M file, a host build
directory, or another sequential store.

The [Nucleus Target System Specification](target-system-specification.md)
governs target profiles, addresses, bank assignment, startup, and published map
meaning. The [Nucleus Z80 Runtime and Backend Contract](z80-runtime-contract.md)
governs generated Z80 representation and execution. This document governs the
stored object when either authority refers to an image, patch, map, or commit
record.

The format changes no Nucleus source syntax or source meaning. It does not
belong to the language specification.

## 2. Design boundary

One object contains one completely placed Nucleus program. It may contain one
flat image or several bank images, but it has one runtime identity, one source
unit, one map, and one entry pair.

An object is not relocatable. Every image and patch record contains a final
bank ordinal and Z80 target address. A patch contains final replacement bytes,
not a source name, symbol-table index, relocation expression, or request for
name resolution. Combining several objects or resolving symbols between them
requires a different format and is outside Nucleus 0.1.

The producer writes records in one direction. It never seeks to an earlier
byte. The storage sink may calculate framing and integrity fields while it
writes. A consumer may materialize the object later without access to compiler
state.

## 3. Integer and address conventions

All integers wider than one byte use little-endian order. `u8` and `u16` below
mean unsigned 8- and 16-bit fields.

A target location is the pair `(bank, address)`:

- `bank` is one `u8` ordinal;
- `address` is one `u16` Z80 target address; and
- a flat object uses bank zero exclusively.

Device offsets and hardware selector values are not target addresses and do
not appear in the object. The target profile maps a bank ordinal to those
external values.

Address validation uses a mathematical seventeenth bit. For a byte extent of
length `n` at address `a`, `a + n` must not wrap and must be no greater than the
selected image-region end. A record cannot cross a bank boundary.

## 4. Record framing

Every record begins with this three-byte header:

| Offset | Field           | Type  | Meaning                           |
| -----: | --------------- | ----- | --------------------------------- |
|      0 | `kind`          | `u8`  | Record kind from Section 5.       |
|      1 | `payloadLength` | `u16` | Number of bytes after the header. |

`payloadLength` excludes the three-byte header. The next record begins
immediately after the declared payload. A truncated header or payload rejects
the complete object.

NOBJ 0.1 assigns these kinds:

| Value | Name     |
| ----: | -------- |
| `$01` | `BEGIN`  |
| `$02` | `IMAGE`  |
| `$03` | `PATCH`  |
| `$04` | `MAP`    |
| `$05` | `COMMIT` |

Every other value is reserved. A 0.1 reader rejects a reserved kind rather
than skipping it.

The only valid record sequence is:

```text
BEGIN IMAGE+ PATCH* MAP COMMIT EOF
```

There is at least one `IMAGE` and exactly one `BEGIN`, `MAP`, and `COMMIT`. No
`IMAGE` follows a `PATCH`, no image or patch follows `MAP`, and no byte follows
`COMMIT`. `abort` is a storage operation rather than a serialized record; an
aborted write ends without `COMMIT`.

## 5. `BEGIN` record

`BEGIN` has kind `$01` and payload length 15.

| Payload offset | Field             | Type       | Required value or meaning                       |
| -------------: | ----------------- | ---------- | ----------------------------------------------- |
|              0 | `magic`           | four bytes | ASCII `NOBJ`, bytes `$4E $4F $42 $4A`.          |
|              4 | `majorVersion`    | `u8`       | `$00`.                                          |
|              5 | `minorVersion`    | `u8`       | `$01`.                                          |
|              6 | `flags`           | `u8`       | Bit 0 is banked; bits 1 through 7 are zero.     |
|              7 | `runtimeIdentity` | `u16`      | Exact selected runtime identity.                |
|              9 | `bankCount`       | `u8`       | Number of image banks.                          |
|             10 | `imageFill`       | `u8`       | Initial value of every materialized image byte. |
|             11 | `imageBase`       | `u16`      | Flat image base or common bank-window base.     |
|             13 | `imageCapacity`   | `u16`      | Capacity of the flat image or of each bank.     |

For a flat object, the banked flag is zero and `bankCount` is one. For a banked
object, the flag is one and `bankCount` is at least two. `imageCapacity` is
nonzero, and the mathematical end `imageBase + imageCapacity` is at most
`$10000`. Reserved flag bits must be zero.

The adapter contributes `imageFill` from the target profile. The compact
compiler descriptor need not carry that byte when the object sink already has
the profile.

NOBJ 0.1 readers accept exactly version 0.1. They reject another version rather
than guessing whether its records remain compatible.

## 6. `IMAGE` record

`IMAGE` has kind `$02`. Its payload is:

| Payload offset | Field     | Type              | Meaning                                |
| -------------: | --------- | ----------------- | -------------------------------------- |
|              0 | `bank`    | `u8`              | Selected bank ordinal.                 |
|              1 | `address` | `u16`             | Address of the first payload byte.     |
|              3 | `bytes`   | one or more bytes | Bytes written at increasing addresses. |

The byte count is `payloadLength - 3`, so a valid payload length is 4 through
65,535 and one record carries 1 through 65,532 image bytes.

`bank` must be less than `BEGIN.bankCount`. The consumer first fills every image
byte with `imageFill`, then applies image records. Within each bank, image
addresses must increase monotonically and image extents must not overlap.
Records for different banks may be interleaved. Gaps retain `imageFill`.

Image records supply the initial startup, runtime, generated-code,
read-only-data, and initialized-data-load bytes. Image and patch records
together determine every non-fill byte in the committed used extent.

## 7. `PATCH` record

`PATCH` has kind `$03` and the same physical payload shape as `IMAGE`:

| Payload offset | Field     | Type              | Meaning                                      |
| -------------: | --------- | ----------------- | -------------------------------------------- |
|              0 | `bank`    | `u8`              | Selected bank ordinal.                       |
|              1 | `address` | `u16`             | Address of the first replacement byte.       |
|              3 | `bytes`   | one or more bytes | Final bytes written at increasing addresses. |

Its valid payload and replacement lengths are also 4 through 65,535 and 1
through 65,532.

`bank` must be less than `BEGIN.bankCount`. The consumer applies every patch
after all image records. A patch may replace an image byte or the implicit fill
byte at a gap. Within each bank, patch addresses must increase monotonically and
patch extents must not overlap. Records for different banks may be interleaved.
Every patch must remain inside the selected image region and inside the bank's
committed used length from the `MAP` record.

This rule avoids a reader-side bitmap of earlier image coverage. It does not
let a compiler emit an unchecked patch: the compiler must still create a
placeholder or otherwise reserve the target location, resolve the value once,
and range-check every replacement byte before `COMMIT`.

## 8. `MAP` record

`MAP` has kind `$04`. Its payload records the layout required to load, run, and
report the program. All addresses are target addresses.

### 8.1 Fixed prefix

| Payload offset | Field                  | Type  | Meaning                                          |
| -------------: | ---------------------- | ----- | ------------------------------------------------ |
|              0 | `mapRevision`          | `u8`  | `$01`.                                           |
|              1 | `flags`                | `u8`  | Bit 0 ROM mode; bit 1 established stack.         |
|              2 | `entryBank`            | `u8`  | Bank selected at program entry.                  |
|              3 | `entryAddress`         | `u16` | Z80 entry address.                               |
|              5 | `writableBase`         | `u16` | First byte of the writable region.               |
|              7 | `writableCapacity`     | `u16` | Complete writable-region capacity.               |
|              9 | `vectorBase`           | `u16` | Runtime vector-table run address.                |
|             11 | `vectorLength`         | `u16` | Runtime vector-table extent.                     |
|             13 | `initializedRunBase`   | `u16` | Run address of the complete initialized block.   |
|             15 | `initializedRunLength` | `u16` | Complete initialized block extent.               |
|             17 | `bssBase`              | `u16` | Run address of BSS.                              |
|             19 | `bssLength`            | `u16` | BSS extent.                                      |
|             21 | `stackRequirement`     | `u16` | Published stack requirement.                     |
|             23 | `dataLoadBank`         | `u8`  | Bank containing the initialized block's image.   |
|             24 | `dataLoadAddress`      | `u16` | Image address of the initialized block.          |
|             26 | `dataLoadLength`       | `u16` | Initialized block's image extent.                |
|             28 | `partCount`            | `u8`  | Number of source-part bank ordinals that follow. |

Only bits 0 and 1 of `flags` are defined. All other bits are zero. A banked
object is always in ROM mode. The established-stack flag must match the target
descriptor.

`partCount` is followed immediately by `partCount` one-byte bank ordinals in
manifest order. NOBJ can encode 1 through 255 parts. The first Z80 compiler's
smaller published source-part capacity remains binding.

### 8.2 Bank entries

The byte after the source-part bank ordinals is `bankEntryCount`. It must equal
`BEGIN.bankCount`. Exactly that many ten-byte entries follow in bank-ordinal
order, beginning with bank zero:

| Entry offset | Field                     | Type  | Meaning                                    |
| -----------: | ------------------------- | ----- | ------------------------------------------ |
|            0 | `usedLength`              | `u16` | Used extent relative to `BEGIN.imageBase`. |
|            2 | `readOnlyBase`            | `u16` | Generated read-only-data address.          |
|            4 | `readOnlyLength`          | `u16` | Generated read-only-data extent.           |
|            6 | `aggregateConstantBase`   | `u16` | Aggregate-constant address.                |
|            8 | `aggregateConstantLength` | `u16` | Aggregate-constant extent.                 |

The complete `MAP` payload length is:

```text
30 + partCount + 10 * bankEntryCount
```

No trailing byte is permitted.

`usedLength` is nonzero and no greater than `BEGIN.imageCapacity`. The first
free target address is the mathematical sum `BEGIN.imageBase + usedLength`,
which may equal `$10000`. The highest end address reached by an image or patch
record in that bank must equal this used extent.

A zero-length read-only or aggregate-constant extent has base zero. A nonzero
extent must lie inside that bank's used image extent. The aggregate-constant
extent must lie inside the read-only extent.

`dataLoadLength` equals `initializedRunLength`. In loaded mode,
`dataLoadBank` is zero and `dataLoadAddress` equals `initializedRunBase`. In ROM
mode, the data-load extent lies in `dataLoadBank`; a banked object uses its
entry bank. Every source-part bank ordinal and every bank field is less than
`BEGIN.bankCount`.

The vector, initialized, and BSS extents must satisfy the writable allocation
and startup rules in the target-system specification. In Nucleus 0.1,
`vectorBase` and `initializedRunBase` equal `writableBase`, `vectorLength` is
nonzero and no greater than `initializedRunLength`, and `bssBase` is the
mathematical end of the initialized run extent. The combined initialized and
BSS extent fits `writableCapacity`; established-stack mode also leaves the
required stack space above it. The entry pair must lie inside the selected
bank's used image extent.

## 9. `COMMIT` record and integrity

`COMMIT` has kind `$05` and payload length 7.

| Payload offset | Field          | Type  | Meaning                                 |
| -------------: | -------------- | ----- | --------------------------------------- |
|              0 | `recordCount`  | `u16` | Total record count, including `COMMIT`. |
|              2 | `entryBank`    | `u8`  | Must equal `MAP.entryBank`.             |
|              3 | `entryAddress` | `u16` | Must equal `MAP.entryAddress`.          |
|              5 | `crc16`        | `u16` | CRC-16/CCITT-FALSE integrity value.     |

`recordCount` must equal the number of record headers encountered from `BEGIN`
through `COMMIT`. An object contains at most 65,535 records. The stream ends
immediately after `crc16`.

The CRC uses polynomial `$1021`, initial value `$FFFF`, no reflection, and
final XOR `$0000`. It covers every serialized byte from the `BEGIN` kind byte
through the high byte of `COMMIT.entryAddress`. It therefore includes every
record header and payload except the final stored `crc16` field. The check
value for ASCII `123456789` is `$29B1`.

CRC-16 detects accidental corruption; it is not authentication. A target that
requires protection against a malicious object needs a separate authenticated
container or trusted delivery path.

## 10. Reader algorithm

A conforming reader performs these operations:

1. Read and validate the exact `BEGIN` record.
2. Allocate or select one private image area per bank and fill it with
   `imageFill`.
3. Read `IMAGE` records, checking framing, bank, monotonic non-overlap, and
   target extent before writing each payload.
4. Read `PATCH` records, checking framing, bank, monotonic non-overlap, and
   target extent before writing each replacement payload.
5. Read and validate the exact `MAP`, including every cross-field relationship
   in Section 8.
6. Read `COMMIT`, verify its duplicate entry pair, record count, CRC, and
   immediate end of stream.
7. Publish or enter the materialized image only after every check succeeds.

The reader rejects the complete object on the first failed check. It does not
run code, publish bank images, or replace a current artifact after partial
validation. A RAM loader writes to a private or otherwise non-runnable area
until step 6 succeeds. A ROM utility finishes validation before it invokes a
programmer.

A reader with insufficient private memory may validate the stored object once
and materialize it during a second read. That is a loader strategy, not another
compiler source pass.

## 11. Producer and storage obligations

The compiler-facing sink supports `begin`, `image`, `patch`, `map`, `commit`,
and `abort`. The sink may add headers, profile-only fields, and the running CRC.
No operation requires random access to earlier object bytes.

The compiler retains bounded fixup metadata rather than a complete image. It
emits every patch only after the resolved bank, address, and replacement bytes
are known. A capacity or output failure prevents `COMMIT`.

The storage layer writes a new generation separately from the current
generation. Only a complete stream whose terminal record passes Section 9 may
become current. Power loss, compiler reset, explicit abort, or write failure
leaves the previous committed generation selected. The storage layer may
delete or retain the incomplete generation for diagnosis.

TECM8 and TEC-FS need sequential creation plus an atomic current-generation
update. They do not need random writes or in-place patching during compilation.
A CP/M or host tool may use a temporary file and rename it after validation.

## 12. Materialized outputs

The object format does not prescribe a final delivery format. A consumer may
produce Intel HEX, a flat binary, a CP/M `.COM` file, serial records, individual
bank images, or a device image. The target profile supplies device offsets,
bank selectors, file choices, and any fill rules beyond the byte already
recorded in `BEGIN`.

ROM burning is separate from compilation. A host utility validates and
materializes NOBJ, then passes the completed image to a programmer. A future
TEC-family burner may consume the same format without changing the compiler.

## 13. Invalid objects and conformance cases

Conformance evidence must include:

- one flat object and one multi-bank object;
- an image gap that retains `imageFill`;
- a patch over image bytes and a patch over an implicit fill byte;
- records for alternating banks while each bank remains monotonic;
- the nearest accepted and first rejected image-region end;
- duplicate, descending, and overlapping image and patch records;
- an invalid bank ordinal and reserved flag or record kind;
- a malformed `MAP` length or inconsistent entry pair;
- an incorrect record count and CRC;
- truncation in every record header and payload class;
- a byte after `COMMIT`;
- a failed generation after at least one image record while an earlier
  committed generation remains current; and
- successful compilation and publication after that failure.

These cases test the object producer, serialized framing, materializer, and
storage-generation boundary separately. A terminal success marker alone does
not establish that a partial or corrupted object remained unselected.

## 14. Worked record example

An entry jump at bank zero, address `$8000`, may first be emitted with a zero
operand and then patched to `$8134`:

```text
02 06 00  00 00 80  C3 00 00
03 05 00  00 01 80  34 81
```

The first record is `IMAGE`: kind `$02`, payload length 6, bank 0, address
`$8000`, and bytes `C3 00 00`. The second is `PATCH`: kind `$03`, payload
length 5, bank 0, address `$8001`, and replacement bytes `34 81`. The record
kind distinguishes original image data from a later replacement; both records
remain append-only.
