# Atom platform contract

Status: authoritative

Date: 2026-08-31

## Product shape

Atom is always a Z80 program. On a desktop, Debug80 executes the Atom Z80 core
and Node supplies files and artifact services. On a native system, the same
core runs through a Z80 harness that calls CP/M, MON3, TEC-FS, or another local
operating environment.

The normal caller shapes are:

```text
atom main.asm build/main.bin build/main.hex
atom --project atom.json
ATOM SOURCE OUTPUT
assembleAtomProject({ root, entry, target })
```

The desktop command and API may expose richer preparation and output policy.
A native command remains small and positional. Neither frontend changes Atom's
instruction, expression, symbol, or directive semantics.

Atom lives in `packages/atom` and is published as `atom-z80`. The emulator is a
dependency of the desktop profile, not the owner of the assembler.

## Ownership map

```text
frontend
  -> source preparation
  -> Atom Z80 harness
  -> Atom Z80 core
  -> logical IMAGE/PATCH generation
  -> optional NOBJ serialization
  -> finalized-image consumer
  -> requested files or runnable memory

filesystem adapter <-> source preparation, harness, and NOBJ consumer
```

| Layer | Owns | Must not own |
| --- | --- | --- |
| Frontend | command syntax, project selection, target selection, requested outputs | assembly-language semantics |
| Source preparation | dependency discovery, conditional filtering, source identity, provenance | tokens, symbols, instruction encoding |
| Atom harness | run lifecycle, source callback, platform adaptation, diagnostics | project JSON or portable filesystem policy |
| Atom core | tokenizer, expressions, symbols, directives, encoding, forward patches | filenames, NOBJ framing, BIN, COM, HEX, listing, D8 |
| Finalized-image layer | NOBJ validation, IMAGE/PATCH materialization, BIN, COM, HEX | symbol lookup or relocation expressions |
| Filesystem adapter | object naming, reads, writes, seek, commit, abort | include grammar or compiler policy |

This contract deliberately rejects three broader designs:

- one universal resident binary, because small systems should link only the
  source, output, console, and filesystem modules they use;
- one register-level compiler ABI, because Atom and Nucleus already have
  compact internal calls suited to their different cores; and
- mandatory NOBJ serialization, because a platform that already owns the
  completed generation can materialize it directly.

The shared boundary is therefore semantic: source bytes, named objects,
transactions, IMAGE/PATCH generations, and finalized target images. Small
adapters translate each tool's native calls to those meanings.

## Atom Z80 core

`AtomAssemble` receives bounded source descriptors, caller-owned symbol and
pending arenas, and a target range. It reads source through
`AtomSourceReadByte`, emits begin, IMAGE, PATCH, commit, and abort calls, and
returns exact source-part and byte offsets for diagnostics.

The core has no filesystem, path, command-line, JSON, NOBJ, or artifact-format
code. The same code runs on hardware and under emulation.
The core and its fixed workspace remain subject to Atom's 16 KiB resident gate.

IMAGE records contain bytes produced in source order. PATCH records contain
final replacement bytes after a forward symbol resolves. They never contain a
symbol name or an unevaluated expression.

## Source service and preparation

The core-facing source contract is deliberately small:

```text
AtomSourceReadByte(partOrdinal, logicalOffset) -> byte or failure
```

The harness implements that callback from one of three sources:

- immutable JavaScript snapshots in the desktop profile;
- a random-record file cache in the CP/M profile; or
- a TEC-FS or other native object reader in a small-system profile.

Each source part keeps its own identity and 16-bit offset domain. Parts are not
copied into one Z80 input buffer. The native driver accepts 1 through 255
ordered parts, each containing at most 65,535 bytes.

Source preparation starts from one root `.asm` file. Active `%INCLUDE`
directives form an import-once dependency graph. Dependencies precede their
importer, repeated direct imports and diamonds contribute one part, and cycles
fail before assembly begins.

Node additionally supports `%DEFINE`, `%IF`, `%ELSE`, `%ENDIF`, and `INCBIN`.
It masks or lowers host-owned source without changing byte offsets. Native
CP/M and TEC profiles currently implement leading `%INCLUDE` only. Native
profiles do not parse Node project JSON or an intermediate manifest.

The detailed rules are in the
[Z80 source preparation contract](z80-source-preparation.md).

## Filesystem and tool-service adapters

Filesystem policy stays below the assembler and outside the shared service
ABI. Node paths, CP/M FCB names, and TEC-FS catalogue identities are different
provider concerns. There is no portable `resolvePath` operation.

`@jhlagado/z80-tool-services` defines the common named-object operations:
open, read, seek, rewind, close, begin write, write, commit, and abort. Atom's
compact callbacks and Nucleus's compiler vector retain their own register-level
shapes; their harness adapters translate to the common service meanings.

A provider must keep EOF separate from byte values, leave a cursor unchanged
after a failed read or seek, and prevent a failed update from replacing the
last committed object. The provider retains no caller pointer after a
synchronous request.

The register and transaction rules are in
[Z80 Tool Services ABI v1](z80-tool-services-abi-v1.md).

## NOBJ and finalized images

NOBJ is the portable stored form of a logical generation. It is not a linker
input and it is not mandatory between Atom and a final file. A platform may
choose either path:

```text
Atom generation -> materialize directly -> BIN, COM, HEX, or RAM
Atom generation -> NOBJ -> validate and materialize -> BIN, COM, HEX, or RAM
```

The second path is useful when assembly and final publication happen at
different times or on different machines. The consumer validates the complete
NOBJ envelope and the selected Atom or Nucleus profile before changing visible
target memory. It then initializes the target, applies IMAGE records, and
applies final PATCH bytes.

This operation is called validation and materialization, not linking. It never
looks up symbols, chooses addresses, or evaluates relocation expressions.

The shared Node implementation owns NOBJ envelope validation, target-image
materialization, and BIN, COM, and Intel HEX rendering. The shared native Z80
implementation can read a stored NOBJ through a sequential byte callback,
validate it, rewind it, and materialize it without retaining the complete file
in RAM. Atom and Nucleus supply separate profile validators.

A COM file is the selected flat binary with load and entry address `$0100`; it
has no header. A BIN file carries raw bytes and no load address. Intel HEX
carries addressed records and checksums.

The detailed rules are in the
[Z80 finalized-image contract](z80-finalized-image.md).

## Frontend responsibilities

The desktop command owns project JSON, full preprocessing, target selection,
positive output selection, listings, and D8 maps. It supports BIN, COM, HEX,
NOBJ, listing, and D8 output. It renders and stages every requested file before
replacing any previous output.

The native CP/M command accepts:

```text
ATOM
ATOM SOURCE
ATOM SOURCE OUTPUT
ATOM ?
```

It emits one COM, BIN, or HEX file. Target geometry, fill, filesystem provider,
and available renderers belong to the linked native profile rather than command
options. A TEC command follows the same small positional principle, with its
own platform defaults.

Debug80 integration uses the Atom programming API directly. Tools select the
`atom` assembler explicitly for ordinary `.asm` files; the filename does not
select a source language.

The exact command contract is in [Atom CLI v1](atom-cli-v1.md).

## Platform profiles

| Profile | Z80 execution | Source and storage provider | Product surface |
| --- | --- | --- | --- |
| Desktop | Debug80 runtime | Node snapshots and transactional files | `atom` CLI and `atom-z80` API |
| Debug80-integrated | same desktop execution | same Node providers | Debug80 Atom backend |
| CP/M native | physical or emulated Z80 | BDOS `$0005`, FCBs, record cache | `ATOM.COM` |
| TEC native | physical or emulated Z80 | MON3 and TEC-FS services | TecMate command profile |

The desktop and CP/M products are complete paths. The reusable TEC harness and
provider components are proved under emulation; final TecMate product
integration, target memory-map acceptance, and physical-hardware acceptance are
separate deployment checkpoints.

Running `ATOM.COM` in Debug80 is still the native CP/M profile: the guest uses
the real CCP, BDOS, and BIOS path, while Debug80 emulates the processor and
devices. The desktop profile is different because Node directly provides the
Atom harness services.

## Lifecycle and failure rules

One build follows this order:

1. resolve and validate the complete source set;
2. allocate descriptors and caller-owned arenas;
3. begin one tentative logical generation;
4. run the Z80 assembler once over the ordered parts;
5. commit the generation or abort it exactly once;
6. optionally serialize or consume NOBJ;
7. materialize the requested target image; and
8. publish every requested file as one transaction.

Preparation fails before the core starts. A failure after begin aborts the
tentative generation. NOBJ validation fails before visible target memory or a
committed output file changes. A frontend failure leaves the previous files in
place.

These rules apply equally to Node files, CP/M temporary-and-backup publication,
and a native object store, even though their physical mechanisms differ.

## Dependency direction

`debug80-runtime` owns processors and emulated machines. It does not know Atom,
NOBJ, source preparation, or compiler publication policy.

`z80-tool-services` owns language-neutral source, object, transaction, NOBJ
envelope, and finalized-image facilities. It does not import Atom or Nucleus
language policy.

`atom-z80` depends on those two packages for its desktop profile. Native Atom
images contain the Z80 code and platform adapters they need; they do not depend
on Node or npm at run time.

## Acceptance

A platform profile is authoritative only when its executable proof covers:

- exact Atom output for every claimed instruction form;
- self-assembly of the native core;
- register, flag, stack, memory, and callback contracts;
- source identity and offsets across multiple files;
- exact capacity boundaries;
- failure atomicity for preparation, assembly, NOBJ consumption, and
  publication; and
- separate measurements for core code, immutable data, workspace, adapter
  state, output storage, stack, and execution cost.
