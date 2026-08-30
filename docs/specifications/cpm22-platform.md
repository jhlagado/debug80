# Debug80 ideal CP/M 2.2 platform contract

Status: active implementation contract

Date: 2026-08-26

## Purpose

This document defines the first Debug80 CP/M 2.2 platform. The platform runs a
real guest CCP, BDOS, and BIOS on Debug80's Z80 runtime. TypeScript implements
the ideal terminal and disk devices below the BIOS. It does not replace BDOS
calls with host filesystem operations.

The [tool-service boundary](tool-service-boundary.md) specifies how the native
Atom and Nucleus tools reach CP/M and direct-host providers without extending
the BIOS or exposing compiler capabilities to generated programs.

The acceptance system is deliberately small: one CPU, one 80-by-24 text
terminal, one writable disk, and one reproducibly built guest image. The image
includes native Atom, Nucleus, and full-screen editor vertical slices. Optional
graphics, additional drives, and printer devices remain separate milestones.

## Frozen implementation baseline

| Item                     | Frozen value                               |
| ------------------------ | ------------------------------------------ |
| Debug80 integration base | `08017a979abe1343d86dd13a41943a37e905d2f9` |
| Branch                   | `main`                                     |
| Node.js                  | 24.18.0                                    |
| npm                      | 11.16.0                                    |
| AZM                      | 0.3.9                                      |
| CPU                      | documented Z80 instruction set             |
| Address space            | one flat 64 KiB space                      |

The untracked `.worktrees/` directory is outside this work.

## Guest source provenance

The CCP and BDOS source comes from
[`brouhaha/cpm22`](https://github.com/brouhaha/cpm22) commit
`01018abbccce0bdf4874b0b2ed1a048c5fcc2987`.

| File          | SHA-256                                                            |
| ------------- | ------------------------------------------------------------------ |
| `ccp.asm`     | `015dc5754a911c48eb50bbb6ec97bd170be39d000da9409f4064594782e9b5c3` |
| `bdos.asm`    | `2f715ad880257a4beee802d8fd9c38ec132fdeaf26b8bc4e391a324df072ad99` |
| `LICENSE.txt` | `a9bcdbc66bb31b86882e84469f133b3bd5598f46423b4c6bbb6bedb9f2eac754` |

The repository licence records DRDOS, Inc.'s grant to use, distribute, modify,
enhance, and otherwise make CP/M and its derivatives available. Any vendored
copy must preserve that licence and the original notices. Project-owned BIOS,
device, build, test, and integration code remains under the Debug80 licence.
The distribution manifest must keep those provenance classes separate.

The upstream sources use Intel 8080 mnemonics and Macro Assembler AS
directives. The Debug80 copy will be a mechanical Zilog-syntax conversion that
assembles with AZM. Conversion is accepted only when complete-image comparison
against a checked upstream build or historical binary proves the resulting CCP
and BDOS bytes, apart from documented serial-number fields.

Native `ATOM.COM` is built from `packages/atom` under GPL-3.0-only. The current
14,660-byte artifact has SHA-256
`9048475453092a12f2e509cedc7931683698b6edafeb8645d95d1049be485ebb`.
`packages/atom/proofs/cpm22-census.json` records the corresponding strict build,
capacity account, and artifact digest. The CP/M image build verifies that
census before installing the program.

Native `NUCLEUS.COM` comes from
[`jhlagado/nucleus`](https://github.com/jhlagado/nucleus) commit
`44aa22c6fff7e15ed30fec5ea4811b3e331183ba` under GPL-3.0-only. Its
21,004-byte artifact has SHA-256
`bf4f7f4273b08afe54af08eb27f24ed819186e019c1e4b3cc268f1f24f1dad7f`.
Debug80 records the source path, revision, digest, and length in
`third_party/nucleus/PROVENANCE.json`; the import command also requires strict
AZM register-contract assembly.

## Memory and reset

The platform has writable RAM from `$0000` through `$FFFF`. Debug80 loads a
small project-owned bootstrap at `$0000` and starts the Z80 at `$0000` after a
cold reset. The bootstrap reads the guest system area through the disk ports,
loads the high-memory image, and jumps to the cold-boot BIOS vector at `$FA00`.

| Region                                                       | Inclusive addresses |                Size |
| ------------------------------------------------------------ | ------------------- | ------------------: |
| Page-zero vectors, FCBs, command tail, and bootstrap overlay | `$0000..$00FF`      |           256 bytes |
| Transient program area                                       | `$0100..$E3FF`      |        58,112 bytes |
| CCP                                                          | `$E400..$EBFF`      |         2,048 bytes |
| BDOS image                                                   | `$EC00..$F9FF`      |         3,584 bytes |
| BIOS                                                         | `$FA00..$FFFF`      | at most 1,536 bytes |

The public BDOS entry is `$EC06`. The BIOS jump table begins at `$FA00` and
contains the seventeen CP/M 2.2 entries from `BOOT` through `SECTRAN` in the
documented order.

Cold boot initializes page zero, selects drive A, initializes terminal and disk
device state, and enters the CCP at `$E400`. Warm boot reloads the CCP and BDOS
from the disk system area, restores the page-zero vectors, preserves mounted
disk contents, and re-enters the CCP. A new Debug80 session starts from the
configured disk image and has no CPU, terminal, or pending-I/O state from the
previous session.

## I/O decoding

The ideal devices decode the low eight bits of the Z80 I/O address. The upper
eight bits do not select another device or register. Unassigned ports read as
zero and ignore writes.

### Terminal ports

| Low port | Read                                       | Write                      |
| -------- | ------------------------------------------ | -------------------------- |
| `$00`    | zero                                       | transmit one terminal byte |
| `$01`    | dequeue one input byte, or zero when empty | ignored                    |
| `$02`    | status bits                                | ignored                    |

Terminal status bit 0 is one when an input byte is available. Bit 1 is always
one because output is ready. All other status bits are zero. Reading an empty
input queue does not change its state. The guest controls echo.

### Disk ports

| Low port | Read                    | Write                    |
| -------- | ----------------------- | ------------------------ |
| `$10`    | command status          | command                  |
| `$11`    | selected drive          | selected drive           |
| `$12`    | track low byte          | track low byte           |
| `$13`    | track high byte         | track high byte          |
| `$14`    | sector                  | sector                   |
| `$15`    | next read-transfer byte | next write-transfer byte |

The first platform has drive 0 only. Sector numbers are one-based. Command 1
begins a 128-byte read transfer. Command 2 begins a 128-byte write transfer.
The status values are:

| Status | Meaning                           |
| -----: | --------------------------------- |
|      0 | ready or completed successfully   |
|      1 | unavailable drive                 |
|      2 | invalid track                     |
|      3 | invalid sector                    |
|      4 | invalid command or transfer state |
|      5 | write-protected disk              |

A read command validates the complete address before exposing data. A write
command collects all 128 bytes in private device state and publishes them to
the mounted image only after the final byte arrives. An error, reset, replacement
command, or incomplete transfer leaves the destination sector unchanged.

## Drive A

The initial disk uses the IBM 3740 logical shape used by the standard CP/M
distribution format:

| Property               |       Value |
| ---------------------- | ----------: |
| Tracks                 |          77 |
| Sectors per track      |          26 |
| Bytes per sector       |         128 |
| Image bytes            |     256,256 |
| Reserved system tracks |           2 |
| Allocation block       | 1,024 bytes |
| Directory entries      |          64 |

The CP/M disk parameter block is `SPT=26`, `BSH=3`, `BLM=7`, `EXM=0`,
`DSM=242`, `DRM=63`, `AL0=$C0`, `AL1=$00`, `CKS=16`, and `OFF=2`.
`SECTRAN` converts BDOS logical sectors 0 through 25 to the device's physical
sector numbers 1 through 26.

The system tracks contain the CCP, BDOS, and BIOS image in ascending sector
order. The cold bootstrap reads all 52 reserved sectors into `$E400`. Warm boot
reloads the first 44 sectors, which cover `$E400..$F9FF`, and retains the active
BIOS.

The initial user-0 directory contains `README.TXT`, `SMOKE.COM`, `ATOM.COM`,
`INPUT.ASM`, `HELLO.ASM`, the 16,535-byte `LARGE.ASM` acceptance source,
`PART1.ASM`, `PART2.ASM`, `BUILD.ASM`, `NUCLEUS.COM`, `INPUT.NU`, and
`EDIT.COM`. `ATOM.COM` reads and writes through the guest BDOS. With no
arguments it uses `INPUT.ASM` and `OUTPUT.COM`; `ATOM SOURCE OUTPUT.COM` selects
another pair of current-drive CP/M 8.3 names. A source may place `%INCLUDE`
directives in its leading header. Atom resolves those current-drive CP/M 8.3
names once, rejects cycles and malformed or late includes during preflight,
and assembles dependencies before their importer.

Each source part may contain at most 65,535 logical bytes. Atom retains up to
255 parts, assigns one-based part ordinals, and resets the diagnostic byte
offset at each part boundary. All source reads use a 128-byte random-record
cache. The output remains one transactional, 18,304-byte in-TPA COM image;
multipart input does not raise that output limit. `BUILD.ASM` includes two
33,000-byte parts whose program leaves a forward reference in the first part
and resolves it in the second.

Atom's compiler-facing source and publication entries form a private
tool-service boundary. The CP/M adapter translates them to public BDOS calls
and preserves IX and IY around `$0005`; it adds no BIOS entry. FCBs, DMA
addresses, temporary names, and backup names remain inside the adapter.

### Native Nucleus compiler

`NUCLEUS.COM` runs the standalone 16 KiB Nucleus compiler core as a CP/M
transient. With no arguments it reads `INPUT.NU` and publishes `OUTPUT.COM`.
`NUCLEUS SOURCE OUTPUT.COM` selects one entry source and output pair. The entry
source may declare leading `//% import "NAME.NU"` dependencies. The native
harness resolves those dependencies before compiler execution, includes each
source identity once, rejects cycles and malformed or late imports during
preflight, and compiles dependencies before their importer. Filenames are
current-drive CP/M 8.3 names, the output extension must be `.COM`, and preflight
rejects a source/output name conflict. Each source part may contain at most
65,535 logical bytes. Native Nucleus does not parse JSON and does not expose a
separate source-plan command.

The compiler uses Nucleus's ordinary forward-patch stream without serializing
NOBJ. Its CP/M output adapter places generated image bytes in a 23,808-byte TPA
buffer and applies later patch writes to the addressed bytes in that buffer.
Commit writes the completed image to a temporary CP/M file and then replaces
the requested `.COM`; abort removes transaction files and preserves any prior
output. This direct path can publish at most 25,600 `.COM` bytes, including the
fixed `$0100..$07FF` target prefix.

Generated Nucleus programs enter the public BDOS gateway at `$0005` for
blocking console input and console output. They do not call Debug80's absolute
BIOS addresses or terminal ports. Their file-storage operations remain a
separate, byte-transparent capability.

The native placement is independently bounded:

| Account                                         | Inclusive or half-open range | Measured use or capacity |
| ----------------------------------------------- | ---------------------------- | -----------------------: |
| Transient artifact                              | `$0100..$530B`               |             21,004 bytes |
| Fixed compiler core                             | within `$0103..$40BC`        |             16,314 bytes |
| CP/M host vector, adapters, assets, and startup | `$4100..$530B`               |              4,620 bytes |
| Unused host-resident allowance                  | `$530C..$57FF`               |              1,268 bytes |
| Host workspace                                  | `$5800..$5E5A`               |              1,627 bytes |
| Unused host-workspace allowance                 | `$5E5B..$5FFF`               |                421 bytes |
| Compiler workspace reservation                  | `$6000..$6FFF`               |              4,096 bytes |
| Streaming source reservation                    | `$7000..$77FF`               |              2,048 bytes |
| Generated-image buffer                          | `$7800..$D4FF`               |             23,808 bytes |
| Compiler stack                                  | `$D500..$E3FF`               |              3,840 bytes |

CP/M enters a transient with the CCP's stack in resident system memory.
`NUCLEUS.COM` therefore saves the exact incoming stack pointer, performs the
complete compile on its reserved stack, restores the pointer, and returns. It
is a writable, non-reentrant transient; a proof starts it with the real CCP
stack address and verifies that `$E400..$EFFF` remains byte-for-byte unchanged.

### Native full-screen editor

`EDIT.COM` opens `INPUT.NU` by default; `EDIT NAME.EXT` selects a current-drive
text filename. An existing file is loaded normally, while an absent explicit
name opens a dirty empty buffer and is published on its first save. The bare
default must still exist. The editor renders on the platform's 80-by-24
terminal, supports insertion, deletion, four-way movement, scrolling, forward
literal search, repeat-search, single literal replacement, save, and confirmed
discard, and preserves LF and CRLF input. The complete transient is 3,003 bytes
with SHA-256
`bbe4ac2b6236d178089fcd01822d0d7fa3c6159f0d2da3655eba1212dda5aa02`.
It uses 292 bytes of fixed workspace, a 47,104-byte contiguous text arena, and
a private stack whose deepest measured use is 24 bytes.

Saving an existing file writes `NAME.$$$`, renames the previous file to
`NAME.BAK`, installs the new file, and deletes the backup after successful
publication. The first save of a new buffer keeps the same reserved-name and
temporary-file checks but skips the backup rename. A failed existing-file phase
restores the previous selected file; a deliberately failed rollback leaves the
previous contents recoverable under the selected or backup name. The complete
language, terminal, memory, and transaction contract is
[`cpm22-editor.md`](cpm22-editor.md).

## Transient program build and installation

A CP/M project assembles its transient program at `$0100`. Debug80 extracts the
initialized range from `$0100` through the final emitted byte, fills any gaps
with zero, and writes that exact byte sequence beside the HEX artifact with a
lowercase `.com` suffix. The first initialized byte must be `$0100`; every
initialized range must lie within `$0100..$E3FF`. The maximum `.COM` artifact is
therefore 58,112 bytes. An empty artifact, a different origin, or the first byte
above the limit stops the build or launch without replacing an existing host
`.com` file.

The `cpm22.programName` setting names the file installed in user 0 of drive A.
It must be a valid CP/M 8.3 filename with a `.COM` extension. New CP/M projects
set it to `MAIN.COM`. When the setting is absent, Debug80 derives the guest name
from the HEX basename and validates the result by the same rule.

At launch, Debug80 copies the bundled or configured IBM 3740 image and installs
the artifact in that private session image. Installation uses ordinary CP/M
directory entries, 16 KiB extents, 1 KiB allocation blocks, and 128-byte records.
Unused bytes in the final record contain `$1A`. Rebuilding the same guest name
replaces all of its old user-0 extents; other files retain their directory order
and contents. Allocation is deterministic from the first available directory
entry and block.

The configured disk file is never changed by host installation. The
`cpm22.writable` setting controls sector writes made by the guest after the
session starts, so a program is still installed when `writable` is `false`.
Malformed media, a full directory, or insufficient allocation blocks stop the
launch before runtime creation and leave the source image unchanged. Debug80
does not intercept BDOS calls during build, installation, or execution.

## Terminal screen

The runtime terminal owns the authoritative 80-column by 24-row cell matrix, a
zero-based cursor, current attributes, pending-wrap state, parser state, input
FIFO, and a bell counter. The Debug80 terminal view mirrors the same bounded
control subset from emitted bytes and forwards raw key bytes to the runtime.

The output contract contains printable 7-bit ASCII, `BEL`, `BS`, `HT`, `LF`,
`CR`, automatic wrap, scrolling, `CSI A/B/C/D`, `CSI H/f`, `CSI J/K` modes 0,
1, and 2, and `CSI m` attributes 0, 1, 4, and 7. CSI positions are one-based and
clamped to the screen. A character written in column 80 leaves the cursor there
with wrap pending; the next printable character performs the wrap. Cursor and
format controls cancel pending wrap. Unsupported escape sequences are ignored
and never rendered as printable characters.

Input is a byte stream. Return sends `CR`, Backspace sends `BS`, Delete sends
`DEL`, and the arrow keys send `ESC [ A`, `ESC [ B`, `ESC [ C`, and
`ESC [ D`. The host performs no local echo.

## Acceptance boundary

The platform is complete when a clean checkout can create, build, and launch a
bundled `cpm22` target, publish its exact `.COM` artifact, display the real CCP
`A>` prompt, and run this interaction on a disposable session disk:

```text
A>DIR
A: README TXT : SMOKE COM : ATOM COM : INPUT ASM
A: HELLO ASM : LARGE ASM : PART1 ASM : PART2 ASM
A: BUILD ASM : NUCLEUS COM : INPUT NU : EDIT COM
A: MAIN COM

A>MAIN
Hello from Debug80 CP/M

A>TYPE README.TXT
Debug80 CP/M 2.2 platform

A>SMOKE
Wrote RESULT.TXT

A>TYPE RESULT.TXT
CP/M file services are working

A>ATOM
OUTPUT.COM written

A>OUTPUT
Hello from native Atom

A>ATOM HELLO.ASM MADE.COM
MADE.COM written

A>MADE
Hello from native Atom

A>ATOM LARGE.ASM LARGE.COM
LARGE.COM written

A>LARGE
Hello from native Atom

A>ATOM BUILD.ASM MULTI.COM
MULTI.COM written

A>MULTI
Hello from native Atom

A>NUCLEUS

A>OUTPUT
OK
```

The automated proof must also compare the host `.com` bytes, reach a
source-mapped breakpoint in guest BIOS `CONOUT`, observe the expected output
byte in register C, and then continue to the prompt. The complete gate covers
terminal parsing at every chunk boundary, input FIFO behavior, filesystem
allocation and rollback, disk bounds and atomic writes, read-only session
injection, boot and warm boot, sequential-session isolation, platform
selection, native Atom byte equivalence and rollback, Debug80 UI integration,
no-argument, selected-filename, and multipart Atom commands, typechecking,
formatting, lint, the 16,535-byte single-source path, the 66,000-byte
cross-part forward-reference path, native Nucleus rollback and recovery,
positioned multipart diagnostics, direct-patch byte placement, generated COM
execution, native editor rendering, forward search, repeat-search, and
literal replacement with save and reload, new-file creation with transactional
first save, raw editor control keys, scoped tests, full tests, and diff checks.
