# Atom and Nucleus tool-service boundary

Status: implemented for Atom's Node, CP/M, and TEC profiles; Nucleus convergence remains

Date: 2026-08-26

The package ownership, platform terminology, source-preparation boundary, and
migration sequence are governed by [Atom platform architecture](atom-platform-architecture.md)
and [Atom first-class migration](atom-first-class-migration.md). The concrete
CLI is governed by [Atom CLI v1](atom-cli-v1.md).
The request, transaction, and failure contract is defined by
[Z80 Tool Services ABI v1](z80-tool-services-abi-v1.md).

## Boundary

Atom and Nucleus use private tool services to reach source objects, binary
output, transactional publication, and an optional human-facing console. This
boundary belongs to the compilers and their development components. It is not
a CP/M BIOS extension, a Nucleus source-language service, or an interface
available to generated programs.

The compilers retain different compact client adapters. Atom keeps its source,
IMAGE, PATCH, commit, and abort entries. Nucleus keeps its fourteen-entry
compiler-host vector. A provider translates either adapter to the same service
meanings without forcing an identical register-level call shape into either
resident core.

## Provider mapping

| Client           | Selected profile | Provider path                                                                                               |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Atom             | direct Node host | private Atom gateway to source packaging and transactional artifact storage                                 |
| Atom             | CP/M transient   | compact adapter to public BDOS `$0005` calls                                                                |
| Atom             | TEC native       | compact adapter to the shared request ABI, ordinary TEC-FS source files, and transactional object storage   |
| Nucleus compiler | direct Node host | fourteen-entry compiler adapter to source, runtime-catalogue, addressed output, commit, and abort providers |
| Nucleus compiler | CP/M transient   | fourteen-entry adapter to public BDOS `$0005` calls and a bounded addressed output image                    |
| Nucleus program  | CP/M transient   | twelve-entry generated-program vector to public BDOS console and binary storage operations                  |

Debug80's normal CP/M profile does not intercept the tool boundary or replace
BDOS. It runs the real guest CCP, BDOS, and BIOS. The BIOS talks to Debug80's
ideal terminal and disk devices. A direct Node run is explicitly host-backed;
its private provider may use Debug80's Z80 runtime without intercepting
arbitrary BIOS calls, BDOS calls, or memory accesses.

TECM8 implements the shared request shape for its bounded transactional object
store and exposes ordinary TEC-FS catalogue files through Atom's Z80-native
read provider. Its filesystem-local path resolver reduces absolute or
importer-relative names to canonical one-byte catalogue identities. The Atom
launcher follows leading `%INCLUDE` directives, retains up to 255 source
identities, assembles dependency-first, and publishes the requested object
transactionally. These operations are proved under Debug80 emulation; physical
TEC hardware acceptance remains a separate deployment checkpoint.

Path resolution is not a shared named-object operation. Node paths, CP/M FCB
names, and TEC-FS catalogue lookup remain provider-local policy. The common ABI
starts after a profile has selected the object name it will open.

## Console and binary objects

Console text and binary storage are different capabilities. The CP/M console
uses standard blocking input and output through BDOS. Input follows CP/M echo,
control processing, and operator-break behaviour. Portable console text is
ASCII `$00..$7F`; high-bit terminal behaviour is not promised.

Source, NOBJ, COM, machine-code, IMAGE, PATCH, and stored-object transfers
remain byte-transparent. `$1A` is a source-text EOF convention only. It is not
binary EOF, and `$00`, `$1A`, `$7F`, `$80`, and `$FF` survive binary transfer.
FCBs, DMA addresses, CP/M records, Node paths and descriptors, host object
references, and Debug80 device ports remain inside their providers.

## Failure and publication

Private gateway calls return success with carry clear and failure with carry
set plus a nonzero status in `A`. Each published client contract defines its
other register damage. The stack returns to its entry depth, the selected bank
is restored, and IX and IY are preserved unless the client contract explicitly
allows otherwise. A provider retains no caller pointer after a synchronous
call.

EOF is distinct from every byte value. A failed read does not advance its
cursor. IMAGE and PATCH operations remain ordered. Failed output is aborted,
and a failed commit cannot replace the previously committed generation.

Generated Nucleus programs receive only their published runtime-vector
capabilities. They cannot read compiler sources or spools, resolve imports,
select runtime catalogues, or publish compiler output. Atom output receives no
compiler service boundary at all.
