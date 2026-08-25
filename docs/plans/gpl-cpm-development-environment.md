# Plan: a GPL CP/M-compatible development environment

Status: Phase C complete; Phase D Atom, Phase E editor, and Phase F Nucleus vertical slices implemented

Date: 2026-08-26

## Current position

The first ideal-machine vertical slice now exists on `main`. It uses
the real CP/M 2.2 CCP and BDOS, a project-owned Debug80 BIOS, a deterministic
IBM 3740 disk image, the TypeScript Z80 runtime, an 80-by-24 terminal, and an
atomic sector device. The guest reaches `A>`, lists and reads bundled files,
runs `SMOKE.COM`, writes `RESULT.TXT`, warm-boots, and reads the result back.
The BIOS source map also stops the debugger at `ConsoleOutput` with the output
byte in register C.

The project workflow now assembles a transient program at `$0100`, publishes an
exact host `.com` file, installs it under an explicit 8.3 name in a private copy
of drive A, boots CP/M, and runs it from the CCP. The same filesystem image code
builds the bundled disk and performs session installation. Custom images,
replacement, full-directory and full-disk failures, read-only sessions, and the
58,112-byte TPA boundary have executable proofs.

Native Atom now runs as a 14,133-byte CP/M transient. With no arguments it
reads `INPUT.ASM` and publishes `OUTPUT.COM`; `ATOM SOURCE OUTPUT.COM` selects
another pair of current-drive CP/M 8.3 names, and `ATOM PLAN OUTPUT.COM @`
assembles an ordered source plan. It compiles with the checked Z80 core, applies
forward patches in an 18,304-byte TPA image, and publishes through a recoverable
temporary-file sequence. Headless and Extension Host proofs exercise all three
command forms and execute the resulting COM files. Each source part may contain
at most 65,535 logical bytes; a bounded plan holds as many as 255 parts. The
acceptance disk includes a 16,535-byte single source and a 66,000-byte two-part
program with a forward reference crossing the part boundary.

Native Nucleus now runs as a 20,987-byte CP/M transient. It keeps the fixed
16,314-byte compiler core intact, supplies CP/M source, diagnostic, runtime,
command, and transactional output adapters, and compiles directly into a
23,808-byte addressed image buffer. Forward patches update that buffer before
the completed `.COM` is published; the native path does not serialize NOBJ.
Headless and Extension Host proofs compile the bundled `INPUT.NU`, execute its
`OUTPUT.COM`, preserve an existing output through a rejected transaction, and
exercise recovery, multipart diagnostics, and the real CCP stack boundary.

The first native editor now runs as a 2,504-byte CP/M transient. It opens the
bundled Atom and Nucleus sources, renders an 80-by-24 full-screen view, supports
bounded insertion, deletion, navigation, and scrolling, and saves through a
recoverable `.$$$` and `.BAK` transaction. Its contiguous arena holds 47,104
text bytes; fixed workspace is 228 bytes and the deepest measured private stack
use is 20 bytes. Isolated Z80 proofs, headless CP/M acceptance, and the real
Extension Development Host exercise the same production transient.

This does not complete the wider development-environment project. Search and
other editor facilities, replacement utilities, optional graphics, and a
project-owned operating-system core remain later phases.

## Purpose

This project will study CP/M as a complete small development environment and
use that study to design a modern, source-complete replacement toolchain. The
intended result is an ideal Z80 CP/M-compatible platform in Debug80 with Atom
as its native assembler, a practical full-screen editor, source-level debugging,
and Nucleus running as a native modern BASIC-family compiler.

The research has a second purpose. CP/M is small enough to explain as a whole.
The operating system, its programming interface, the standard utilities, and
several native assemblers can be examined at instruction-level resolution. The
resulting notes should support books that explain both the historical system
and the design of new software for it.

Implementation does not begin with a wholesale rewrite. The first work is a
measured study of CP/M, its utilities, and its alternative assemblers. Each
later program must have a written contract, a reproducible size account, and a
clear provenance record before it becomes part of the system image.

## Intended result

The complete environment should eventually provide:

- a real guest CCP, BDOS, and BIOS executing on Debug80's Z80 runtime;
- an idealized CP/M 2.2-compatible machine rather than an emulation of one
  historical computer;
- a canonical 80-by-24 text terminal, disk, and device contract implemented by
  the Debug80 TypeScript platform;
- Atom as a native, single-pass, streaming Z80 assembler;
- direct, transactional `.COM` generation for native Atom and Nucleus, with a
  separate materializer only where a future target actually needs one;
- a nano-style full-screen editor rather than an ED-compatible line editor;
- a debugger that can use Atom symbols and Debug80 source maps;
- Nucleus as a native modern BASIC-family compiler and as a language for
  suitable utilities;
- GPL source for every project-owned component and a reproducible system-image
  build; and
- documentation that separates historical fact, measured reconstruction, and
  new design.

Compatibility applies at the CP/M program boundary. A portable transient
program should use the documented BDOS interface and the selected terminal
profile. Debug80-specific services may extend the environment, but ordinary
programs must not require host-side interception of BDOS calls.

## System shape

```text
                         books and engineering record
                                      |
                                      v
source -> editor -> Atom or Nucleus -> addressed image -> transactional COM
             |             |                 |
             |             +------ D8 source information
             |                               |
             +---------------- Debug80 debugger

guest programs and tools
          |
          v
       CCP / BDOS / BIOS on the emulated Z80
          |
          v
Debug80 TypeScript text terminal, disks, clock, and devices
```

The guest operating system remains visible to the debugger. TypeScript models
devices and persistent media; it does not replace the guest BDOS with host
filesystem traps.

## Starting evidence

The following figures establish scale. They are not target budgets for the new
programs.

| Program or account                                   | Classification          |  Bytes |
| ---------------------------------------------------- | ----------------------- | -----: |
| Digital Research `ASM.COM`                           | Measured file           |  8,192 |
| Z80MR `Z80MR.COM`                                    | Measured file           | 13,440 |
| ZSM4 `zsm4.com`                                      | Measured file           | 22,400 |
| Atom code and immutable tables                       | Measured native account | 11,682 |
| Atom fixed workspace                                 | Measured native account |    714 |
| Atom linked resident extent                          | Measured native account | 12,396 |
| Atom margin below 16 KiB                             | Measured native account |  3,988 |
| Native CP/M Atom COM                                 | Measured file           | 14,133 |
| CP/M-specific Atom resident increment                | Measured linked account |  1,734 |
| Native CP/M Nucleus COM                              | Measured file           | 20,987 |
| Nucleus compiler core                                | Measured fixed account  | 16,314 |
| CP/M-specific Nucleus host region                    | Measured linked account |  4,603 |
| Nucleus direct generated-image buffer                | Measured TPA capacity   | 23,808 |
| Principal CP/M development utilities examined so far | Measured files          | 36,736 |

The final line is 35.875 KiB and includes ASM, DDT, DUMP, ED, LOAD, PIP, STAT,
SUBMIT, and XSUB. It excludes MOVCPM and SYSGEN. The small total makes a
complete replacement suite plausible, but each replacement requires its own
measurement.

Atom already supplies the central native mechanism. Its Z80 parser makes one
semantic pass, emits monotonically ordered IMAGE bytes, retains bounded
unresolved references, and emits final PATCH bytes when symbols resolve.
Tokenizer lookahead and string emission may reread source bytes through the
source service. The CP/M adapter now supplies BDOS file access, bounded source
plans, direct COM materialization, and recoverable publication. Preprocessing,
NOBJ framing, Intel HEX, listings, and D8 maps remain Mac-host facilities. Any
later CP/M profile must account for the services it adds instead of moving
their cost into an unreported account.

Digital Research ASM provides a useful lower-bound study. Its 8 KiB file
contains a two-pass 8080 assembler, file handling, a one-kilobyte source buffer,
768-byte listing and HEX buffers, compact mnemonic tables, and hashed symbol
lookup. It rereads the source for its second pass and uses free TPA above the
loaded image for symbols.

Z80MR proves that a CP/M-resident Zilog-syntax assembler with macros,
conditional assembly, listings, and file handling can remain near 13 KiB. Its
surviving distribution lacks maintainable source and has uncertain modern
provenance, so it is an object of study and compatibility testing rather than
the planned implementation base.

## Project rules

### Measurements

Every implementation milestone freezes its source revision, assembler version,
target memory map, entry point, and accounting boundary. Reports keep these
accounts separate:

- executable code;
- immutable tables and strings;
- fixed writable workspace;
- caller-supplied arenas and buffers;
- stack;
- generated or materialized output;
- shared runtime or operating-system code;
- disk bytes read and written;
- Z80 instructions and T-states; and
- wall time under named storage models.

A smaller `.COM` file does not count as a resident saving when the same bytes
move into mandatory high-memory workspace. Likewise, a smaller native core
does not count as a complete saving when a required adapter grows by more than
the reduction.

### Provenance and licensing

This is not a formal clean-room project. Historical programs may be read,
disassembled, executed, and documented. The project may learn algorithms,
data structures, CP/M programming techniques, compatibility rules, and
measured tradeoffs from them.

The following boundaries apply:

- Every studied program receives a provenance and licence entry.
- Notes distinguish observed behaviour from implementation detail.
- New code uses project-owned structure and terminology rather than a
  transliteration of a historical binary.
- Direct reuse requires a clear licence compatible with the destination.
- Uncertain claims of public-domain status do not authorize source reuse.
- GPL source may be reused only after the exact GPL version and combination
  boundary have been checked.
- Book quotations and reproduced listings receive attribution and remain
  within their applicable permissions.

Atom is currently GPL-3.0-only. A GPLv2-only BDOS or assembler cannot simply be
linked into one GPLv3 program. Separate CP/M transient programs may constitute
mere aggregation, but the project must obtain a specific licensing review
before publishing a combined system image. A uniform GPL system may therefore
require a project-owned CCP, BDOS, and BIOS or a deliberate relicensing and
compatibility decision.

### Portability

Project-owned transient programs should call documented CP/M services. Direct
BIOS calls require a measured reason and an isolated adapter. Terminal-specific
escape sequences and key decoding belong behind a small terminal profile so
that the tools can move beyond Debug80's ideal machine.

### Text console and optional devices

The first machine profile is text-only. Debug80 presents one fixed 80-column by
24-row character-cell terminal. This is the standard VT100 screen shape and is
large enough for the CCP, assembler diagnostics, and the full-screen
editor. The guest cannot resize it, and resizing the Debug80 panel must scale or
scroll the view rather than reflow the guest screen.

CP/M defines console character input, output, and status operations; it does not
define cursor addressing or a particular terminal. The first profile therefore
selects a bounded VT100-compatible ANSI mode as a machine contract rather than
claiming that VT100 behaviour is part of CP/M. Project tools target this profile
through a small terminal adapter.

The initial output contract contains:

- printable 7-bit ASCII;
- `BEL`, `BS`, `HT`, `LF`, and `CR`, with fixed eight-column tab stops and
  separate carriage-return and line-feed behaviour;
- automatic wrapping and scrolling within the 80-by-24 screen;
- cursor up, down, forward, and back (`CSI A`, `CSI B`, `CSI C`, and `CSI D`);
- absolute cursor position (`CSI row;column H` and `CSI row;column f`);
- erase in display and erase in line (`CSI J` and `CSI K`, parameters 0, 1,
  and 2); and
- normal, bold, underline, and reverse rendition (`CSI m` parameters 0, 1, 4,
  and 7).

Colour, 132-column mode, VT52 mode, alternate character sets, programmable
tabs, application cursor-key mode, function keys, and private terminal queries
are outside the first contract. Unsupported escape sequences have deterministic
ignore behaviour and never appear as printable text.

Keyboard input is a raw byte stream. Printable ASCII and control characters
pass through unchanged; Return sends `CR`; Backspace sends `BS`; Delete sends
`DEL`; and the four arrow keys send `ESC [ A`, `ESC [ B`, `ESC [ C`, and
`ESC [ D`. The terminal performs no local echo because the guest CCP, BDOS, or
application controls echo. Keypad and extended navigation mappings can be
added only after a program demonstrates a need.

The CP/M platform retains Debug80's byte-I/O plumbing. The character-cell state
machine lives in `debug80-runtime`; the terminal webview renders that state and
forwards raw key bytes. Headless tests and debugger inspection can observe the
runtime's cells, attributes, cursor, and pending input.

Additional hardware belongs to optional machine-profile devices. A TMS9918 or
another video display processor receives its own ports, TypeScript device model,
and Debug80 view. Software that accesses it is specific to that profile. The
optional display does not replace the CP/M console unless a later profile
explicitly supplies a different BIOS mapping. Atom, Nucleus, the materializer,
and the first editor remain usable on the text-only profile.

### Compatibility and improvement

Replacement utilities need not reproduce historical command syntax or defects
unless existing software depends on them. Each utility specification must name
which boundary it preserves:

- binary ABI compatibility;
- file-format compatibility;
- command-line compatibility;
- source-language compatibility; or
- functional replacement with a new interface.

The project should improve diagnostics, reliability, and interactive use while
retaining the small-machine character of CP/M.

## Research programme

### 1. CP/M platform anatomy

Document the complete execution path from reset to a transient command:

- cold and warm boot;
- page-zero vectors and the command tail;
- CCP command parsing and transient loading;
- BDOS entry, register convention, and error behaviour;
- BIOS jump table and target-specific implementation;
- FCB layout, sequential and random record operations;
- disk parameter blocks, directory entries, allocation, extents, and user
  areas;
- console, reader, punch, and list devices; and
- TPA placement, stack use, and termination.

The first Debug80 platform description should specify one canonical 64 KiB
memory map, disk geometry, the fixed 80-by-24 terminal contract, clock policy,
boot image, and BIOS-to-device boundary. Historical hardware compatibility and
optional video processors are outside the first platform.

### 2. Comparative assembler study

Study DRI ASM, Z80MR, Z80ASM 2.4, ZM, ZMAC, ZSM4, and Atom under one measurement
template. For every assembler record:

- licence and source provenance;
- executable and workspace size;
- pass structure and source I/O;
- mnemonic and operand dispatch;
- expression representation;
- symbol records, hashing, scope, and lookup;
- forward-reference representation;
- instruction and directive coverage;
- macro and conditional facilities;
- listing, HEX, COM, and relocatable output;
- diagnostics and retained source position;
- maximum practical source and symbol capacity; and
- representative assembly time under the same emulated CPU and disk model.

The study should identify reusable design patterns without turning visual
similarity into evidence of a saving. Table-driven dispatch, compact symbol
records, shared error tails, buffering, and pass structure must be measured as
complete paths.

### 3. Atom on CP/M

The first implementation experiment supplies Atom's existing source and sink
contracts through CP/M. It should preserve the native language and output
semantics before adding new assembler features.

The source side must provide ordered parts, logical offsets, preprocessing, and
bounded buffering. The output side must preserve tentative begin, append-only
IMAGE and PATCH streams, commit, abort, and materialization.

Three output designs require independent measurement:

1. Store Atom NOBJ and materialize `.COM` or HEX with a separate utility.
2. Write a `.COM` file through CP/M random-record read, modify, and write for
   resolved patches.
3. Retain a bounded image in TPA, apply patches in memory, and write it
   sequentially.

Intel HEX with later overlapping patch records is not the portable default.
Digital Research LOAD requires HEX addresses in ascending order, so that stream
would require a project-specific loader. Standard HEX remains a materialized
delivery format after patches have been applied.

The first Atom/CP/M milestone excludes macros. Existing Atom source, instruction
forms, expressions, directives, private labels, forward references, and exact
range checks remain the accepted language. Macro design belongs to a later
proposal supported by real source pressure.

### 4. Optional object materializer and loader

The native Atom and Nucleus measurements selected the same simpler answer:
retain a bounded addressed image in TPA, apply forward patches there, and write
the final `.COM` sequentially. Neither compiler needs NOBJ, Intel HEX, or a
separate materializer on the current CP/M profile.

Reopen a common framing or materializer only when a concrete program exceeds
the retained image capacity or needs offline object transport. Such a utility
would need to:

- validate record order, extents, CRC, and commit;
- apply final-byte patches exactly once;
- produce a CP/M `.COM` image when placement permits;
- produce ascending Intel HEX;
- preserve an optional source/debug sidecar; and
- fail without replacing the previous runnable artifact.

Atom's flat object map and Nucleus's runtime map are not automatically one file
format. A future proposal must measure common framing against two
profile-specific front ends and include the added disk traffic and loader size.

### 5. Full-screen editor

The editor is a new program, not an ED emulation. Its first vertical slice has
a full screen of text, visible status and command hints, direct cursor movement,
insertion and deletion, file open, recoverable save, and explicit error
reporting. Search, replace, selection, multiple buffers, and undo remain later
features.

The editor uses the fixed 80-by-24 VT100 profile above. Its terminal adapter
emits only the contracted cursor, erase, and rendition sequences and decodes the
contracted raw key bytes. A reverse-video final row may hold status and command
hints; it remains part of the guest screen rather than a host-side overlay.

Independent prototypes compared a contiguous sequence, a movable gap, and line
descriptors over a text arena. The retained contiguous representation was the
smallest complete candidate. It provides a 47,104-byte capacity and uses `LDDR`
and `LDIR` for insertion and deletion. The settled file contract preserves LF
and CRLF, treats `$1A` as text EOF, rejects invalid control bytes, and pads a
partial saved record with `$1A`.

### 6. Native Nucleus

The CP/M Nucleus milestone runs the existing Z80 compiler as a transient
program and maps its source, diagnostic, storage, and output services onto the
CP/M environment. It does not introduce a second compiler implementation.

The retained design supports single-source and eight-part plan commands,
positioned hexadecimal diagnostics, a CP/M target startup and service provider,
and transactional `.COM` publication. It applies the compiler's addressed
image and patch operations directly to a 23,808-byte TPA buffer. The complete
transient is 20,987 bytes, of which 16,314 bytes are the unchanged compiler
core and 4,603 bytes are the host region. Its independent resident and
workspace allowances retain 1,285 and 421 bytes respectively.

Suitable utilities and demonstrations may now be written in Nucleus. The first
editor is handwritten Z80; a Nucleus implementation remains a candidate only
if the language and service boundary can express its buffer and terminal
requirements without distorting either project.

### 7. Utility replacement

Replace utilities in an order that supplies infrastructure for later work:

1. object materializer and HEX/COM loader;
2. dump and inspection tools;
3. file copy, concatenation, rename, erase, directory, and drive status;
4. full-screen editor extensions (the first vertical slice is complete);
5. debugger and symbol tools;
6. batch command execution;
7. CCP improvements; and
8. a project-owned BDOS and BIOS if a uniformly licensed system remains the
   goal.

MOVCPM and SYSGEN solve historical relocation and disk-installation problems.
The ideal platform should replace them with a reproducible host image builder
rather than copy their interfaces without need.

### 8. Books and documentation

Research notes should be written for later use rather than reconstructed after
implementation. Every experiment records the specimen, revision or digest,
tools, commands, measurements, conclusions, and unresolved questions.

The likely publication structure is:

1. **Understanding CP/M** — boot, memory, CCP, BDOS, BIOS, files, disks, and
   transient programs.
2. **Inside the CP/M workshop** — ASM, LOAD, DDT, ED, PIP, STAT, and comparative
   assembler studies.
3. **Building a modern CP/M development system** — Debug80's ideal machine,
   Atom, the editor, the materializer, Nucleus, and the GPL replacement suite.

The books should reproduce measured experiments from checked repositories. A
book explanation is not the authority for a machine contract; the applicable
specification and executable proof remain authoritative.

## Ordered phases

### Phase A: research baseline

Deliverables:

- a frozen corpus of assembler binaries, sources, manuals, licences, and
  digests;
- a reproducible CP/M 2.2 reference image;
- an exact utility size census;
- a standard Z80 source corpus and timing workload; and
- the first CP/M architecture notes.

Exit gate: every measurement identifies its file, digest, load address,
resident extent, workspace treatment, and execution environment.

### Phase B: comparative assembler report

Deliverables:

- one architecture and capacity report per assembler;
- cross-assembler instruction and directive matrix;
- representative cycle and disk-I/O measurements;
- recorded optimization candidates for Atom; and
- an Atom/CP/M adapter specification with measured projections.

Exit gate: the proposed adapter accounts for every source, output, workspace,
and materialization byte and identifies all semantics that differ from the Mac
host.

### Phase C: ideal Debug80 CP/M platform

Deliverables:

- Z80 memory and boot contract;
- a headless 80-by-24 VT100-subset screen model and raw-key input model;
- a Debug80 character-cell terminal view built on the existing serial path;
- TypeScript disk, clock, and device models with optional-device registration;
- guest BIOS implementation;
- selected open CCP and BDOS for initial bootstrapping; and
- headless boot, console, and file-operation tests.

Exit gate: the real guest operating system boots, executes transient programs,
persists disk changes, and remains visible to Debug80's debugger. The terminal
tests distinguish cursor position, screen contents, attributes, scrolling,
input bytes, reset, and fragmented escape-sequence input.

### Phase D: Atom/CP/M vertical slice

Deliverables:

- source reader and output sink;
- one selected patch/materialization path;
- exact diagnostics and abort behaviour;
- a native self-assembly or equivalent large acceptance build; and
- flat binary, ascending HEX, and `.COM` artifacts where valid.

Exit gate: CP/M Atom matches the checked Mac Atom output for the common target
profile, and the complete resident and execution accounts are measured.

The retained profile supplies executable evidence for that gate with one
representative flat COM, an independently checked 16,535-byte single source, a
66,000-byte two-part source, and the exact 65,535-byte per-part and 18,304-byte
output boundaries. It selects the in-TPA image; the complete CP/M-specific
resident increment is 1,734 bytes after command-tail filenames, source-plan
validation, bounded descriptors, dynamic transaction names, and the BDOS
source caches. The measured random-record and NOBJ output kernels remain lower
bounds rather than complete implementations.

### Phase E: editor

This phase is complete for the first vertical slice.

Deliverables:

- a compact adapter for the canonical text-terminal contract;
- bounded editing model;
- safe file open and save;
- interactive Debug80 tests; and
- one sustained editing session on representative Atom and Nucleus source.

Exit gate: a failed save leaves the previous file recoverable, all editing
operations preserve the buffer invariants, and the size and workspace reports
are complete. The retained 2,504-byte editor satisfies this gate through its
isolated production-code proof, complete CP/M acceptance, and real Extension
Development Host workflow.

### Phase F: native Nucleus

This phase was completed before Phase E so the editor can later be exercised
against both native toolchains.

Deliverables:

- CP/M compiler application;
- CP/M target and service provider;
- direct addressed-image patching and transactional `.COM` publication;
- positioned diagnostics; and
- compiled acceptance programs executed under the guest system.

Exit gate: strict standalone proofs and Debug80's real guest path compile the
scoped source, preserve exact diagnostic positions and transaction rollback,
and execute the generated program. This gate is satisfied without requiring
byte identity with the differently packaged host NOBJ path.

### Phase G: replacement distribution

Deliverables:

- remaining project-owned utilities;
- reproducible boot and development disks;
- complete source and licence manifests;
- self-hosting build instructions; and
- publication-ready documentation.

Exit gate: a source checkout can reproduce the distributed images, every
binary has an identified source and licence, and the system can edit, assemble,
compile, load, debug, and run its own representative programs.

## Research questions

The initial study should answer these questions before any CP/M adapter is
retained:

1. What is Atom's exact clean assembled account at the selected baseline?
2. How much CP/M code and RAM does its existing source-service contract need?
3. Which host preprocessing facilities belong in the first native tool?
4. Under what future output size or transport requirement should direct
   in-memory `.COM` patching be replaced by random-record or NOBJ storage?
5. If that requirement appears, can Atom and Nucleus share framing, CRC,
   storage, and materialization code while retaining their distinct map
   semantics?
6. Which compact operand-dispatch and symbol-table techniques from the
   historical assemblers improve Atom after complete-path measurement?
7. Which additional terminal profiles are worth supporting beyond the
   canonical VT100 profile?
8. Does the first system use an existing open CCP and BDOS as bootstrap
   components, or begin with project-owned replacements?
9. Which GPL version and aggregation model governs the complete distribution?
10. Which research results belong in normative specifications, engineering
    reports, and teaching prose respectively?

## Immediate next work

1. Measure the next editor facility against the retained 2,504-byte transient,
   beginning with interactive search and repeat-search.
2. Write the common assembler-analysis template and complete the DRI ASM study
   before using historical implementation details as design evidence.
3. Revisit external object storage only when a real source exceeds Atom's
   18,304-byte or Nucleus's 25,600-byte `.COM` capacity.

## Reference starting points

- [Atom](https://github.com/jhlagado/atom)
- [Nucleus](https://github.com/jhlagado/nucleus)
- [Debug80](https://github.com/jhlagado/debug80)
- [CP/Mish](https://github.com/davidgiven/cpmish)
- [ZSM4](https://github.com/hperaza/ZSM4)
- [Digital Research ASM disassembly archive](https://www.cpm.z80.de/source.html)
- [CP/M 2.2 Operating System Manual](https://adamarchive.org/archive/Manuals/Universal/CP-M%202.2%20Operating%20System%20Manual%20%28Jul82%29.pdf)
- [DEC VT100 User Guide: programmer information](https://vt100.net/docs/vt100-ug/chapter3.html)
- [Historical CP/M assembler archive](https://dflund.se/~pi/cpm/files/ftp.mayn.de/pub/cpm/archive/asmutl/)
