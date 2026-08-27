# Atom platform architecture

Status: accepted target architecture

Date: 2026-08-27

The Node-hosted, Debug80-integrated, CP/M-native, and TEC-native profiles are
implemented and proved under emulation. The reusable native named-object
harness, TEC-FS source provider, and TecMate launcher are implemented. TEC
hardware acceptance, the broader project-corpus migration, and eventual
compatibility-default change remain active work.

## Product decision

Atom is Debug80's first-class Z80 assembler. The authoritative Atom product
lives in this monorepo as `packages/atom`, is published independently as the
`atom-z80` npm package, and retains the `atom` command. Its native programs and
source remain deployable without Node or Debug80.

The package move does not make the assembler a component of the emulator.
Package dependencies enforce this direction:

```text
z80-tool-services ----+
                      +--> atom-z80 --> debug80-vscode AtomBackend
debug80-runtime ------+

z80-tool-services --------> Nucleus
```

`debug80-runtime` owns processors and emulated machines. It does not know Atom,
NOBJ, source preparation, or compiler publication policy.

## Terms

These names are normative in code, documentation, tests, and status reports.

| Term                    | Meaning                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z80-native Atom         | A self-contained Z80 program using a Z80 operating environment such as CP/M, MON3, or TEC-FS. It needs no Node service while running.                     |
| Node-hosted Atom        | The Atom Z80 engine runs in `debug80-runtime`; Node supplies project preparation and tool services.                                                       |
| Debug80-integrated Atom | Node-hosted Atom invoked through Debug80's assembler backend.                                                                                             |
| hardware execution      | Atom's Z80 instructions execute on a physical Z80-compatible processor.                                                                                   |
| emulated execution      | Atom's Z80 instructions execute in Debug80 or another emulator.                                                                                           |
| native profile          | A statically composed Z80 harness and provider for one operating environment.                                                                             |
| project                 | A Node-only JSON build description. Native profiles do not parse it.                                                                                      |
| prepared source set     | The immutable ordered source parts obtained by following active `%INCLUDE` directives from one root source. This is an internal value, not a file format. |
| target profile          | Address limits, banking, entry convention, fill policy, and deployment constraints.                                                                       |
| tool-service provider   | The adapter from portable named-object, transaction, and console operations to Node, BDOS, or TEC-FS.                                                     |

`ATOM.COM` running in Debug80 is the CP/M-native profile under emulated
execution. It follows the same CCP, BDOS, and BIOS path as hardware execution;
only the processor and devices are emulated.

## Layers

```text
7. Product frontend
   atom CLI | Atom API | Debug80 AtomBackend | CP/M command | TEC command

6. Project preparation
   %INCLUDE | conditionals | INCBIN | identities | provenance

5. Atom Z80 harness
   run lifecycle | source access | diagnostics | NOBJ or direct output profile

4. Atom Z80 core
   tokenizer | parser | symbols | directives | encoder | IMAGE/PATCH decisions

3. Z80 tool-services ABI
   named-object reads | transactional writes | optional console

2. Platform provider
   Node provider | CP/M provider | TEC provider

1. Operating environment
   Node | CP/M BDOS | MON3/TEC-FS

0. Processor and machine
   Debug80 emulator | physical Z80 | memory | terminal | storage hardware
```

Layers 4 and 5 always execute as Z80 code. Node may prepare sources, execute
the Z80 image, provide objects, and render artifacts, but it does not
reimplement assembly semantics.

## Atom core

The core remains the size-critical, platform-independent assembler. It:

- reads bytes through `AtomSourceReadByte(part, offset)`;
- receives bounded source, symbol, pending, target, and stack regions;
- emits begin, IMAGE, PATCH, commit, and abort operations;
- retains exact source-part ordinals and offsets for diagnostics;
- contains no filename, path, filesystem, operating-system, command-line, NOBJ
  framing, or artifact-format code; and
- remains subject to the existing 16 KiB code gate.

The compact Atom callback ABI remains separate from Nucleus's compiler vector.
The common layer begins below both tool-specific adapters.

## Atom harness

The harness is Atom-owned Z80 code around the core. Reusable source modules own
run-level lifecycle, source access, diagnostics, and output adaptation. Native
profiles select only the required modules at link time; there is no universal
binary that makes every small system pay for every service.

The reusable named-object harness exposes a link-time source-reader target.
The ordinary target reads prepared bytes directly. A native preparation profile
may replace it with an equal-offset filtering reader that masks only directives
validated during preflight. This composition point remains outside the Atom
core and does not add filesystem or preprocessor policy to the named-object ABI.
It also exposes a measured postlude region after the shared adapter. A native
profile keeps its small fixed-origin dispatcher in the prelude and places its
larger launcher or preparation code in this postlude. Both regions are included
in the deployed resident extent and the 16 KiB bank gate.

NOBJ belongs in an optional harness output module, not in the core or the
filesystem provider. A constrained profile may retain a measured direct-image
sink when it is smaller. Core, harness, provider, workspace, buffers, and
generated output are measured separately, with an additional deployed-image
gate for each native profile.

## Tool services

`packages/z80-tool-services` is the language-neutral authority for:

- `openRead`, `read`, `seek`, `rewind`, and `close`;
- `beginWrite`, `write`, `commit`, and `abort`;
- byte-transparent transfers and EOF separate from data;
- canonical status values;
- transaction states and failure atomicity;
- provider capabilities and limits;
- Z80 request, register, flag, stack, and bank contracts;
- TypeScript types and reference providers; and
- provider conformance vectors shared by Node, CP/M, and TEC environments.

The package contains no Atom- or Nucleus-specific policy. It may publish
generated Z80 include files so native clients can pin an ABI version without
requiring npm at build or run time.

## Source preparation

One root `.ASM` file is the only authored build input. Active `%INCLUDE`
directives discover dependencies. Each included file remains a distinct source
part, preserving identity and local offsets; the implementation does not need
to concatenate all bytes into Z80 memory.

The public interface has one source-composition model: a root source plus active
`%INCLUDE` directives. Existing composition interfaces remain temporarily
available only until the replacement passes the same multipart, diagnostic,
capacity, and failure proofs.

Node resolves includes, conditionals, definitions, and `INCBIN` into an
immutable prepared source set before starting the Z80 core. A Node project may
describe repeatable target and output policy in JSON, but neither the core nor
any Z80-native profile parses JSON.

A Z80-native profile starts from one root source and follows `%INCLUDE` through
its tool-service provider. Target geometry and available output modules are
linked into the profile. The current CP/M and TEC profiles implement leading
`%INCLUDE`; `%DEFINE`, `%IF`, `%ELSE`, `%ENDIF`, and `INCBIN` remain Node-hosted
preparation features. A future native profile may add those features without
changing the root-source interface or exposing an intermediate ordering file.

## Host profiles

| Profile            | Execution                      | Provider                         | Normal product                 |
| ------------------ | ------------------------------ | -------------------------------- | ------------------------------ |
| Node-hosted        | `debug80-runtime` Z80 emulator | JavaScript named-object provider | `atom` CLI and programming API |
| Debug80-integrated | same Node-hosted execution     | same provider                    | Debug80 `AtomBackend`          |
| CP/M-native        | physical or emulated Z80       | BDOS `$0005` provider            | `ATOM.COM`                     |
| TEC-native         | physical or emulated Z80       | MON3/TEC-FS provider             | TecMate `ASM` command          |

Debug80's CP/M machine remains below the guest BIOS. It supplies emulated disk
and terminal devices and does not intercept Atom or BDOS.

## Artifacts

The core emits one logical generation. Output modules may serialize or render:

- Atom NOBJ as the portable append-oriented object;
- flat BIN;
- Intel HEX;
- validated CP/M COM;
- a source listing; and
- a D8 map.

D8 and host listings are Node renderers. They do not enter the native core,
tool-service ABI, or normal CP/M profile. COM is a validated flat image loaded
and entered at `$0100`; it adds no header and no assembler semantics.

Only requested public artifacts are published. Integrity metadata for an
immutable artifact generation is publication state, not source composition,
and uses generation or receipt terminology.

## Versioned contracts

The migration publishes and tests these contracts independently:

1. Atom Core ABI v1.
2. Z80 Tool Services ABI v1.
3. Atom prepared-source-set model.
4. Atom output-event and NOBJ profile.
5. Atom CLI v1.
6. Atom public Node API.
7. Native image metadata: Atom version, ABI versions, profile, entry points,
   digest, memory map, and measured limits.

## Acceptance

A checkpoint may become authoritative only when the affected profile proves:

- byte-identical output over Atom's complete claimed Z80 instruction space;
- native self-host reproduction;
- exact register, flag, stack, memory, and callback contracts;
- exact source identity and diagnostic offsets across includes;
- no partial output after source, capacity, provider, or commit failure;
- fresh code, immutable data, workspace, buffer, and cycle accounts;
- Node package and CLI operation without a repository checkout;
- CP/M execution through real guest BDOS and BIOS under Debug80; and
- provider conformance before TEC hardware acceptance.
