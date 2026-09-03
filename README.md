# Debug80 Z80 Development Toolchain

**Documentation: [debug80.com](https://debug80.com/)** — the Debug80 manual,
the Atom reference, and the AZM books.

Debug80 is a Z80 development environment built around source-level debugging.
This repository contains the Debug80 application and the packages that have
not yet completed their move to independent repositories:

1. **Debug80 and its runtime** build, run, inspect, and debug Z80 programs.
2. **Atom** assembles Z80 source through a Z80-native assembler core and records
   how the machine code maps back to it.
3. **AZM** remains available for compatibility and for larger host-side
   assembly features that Atom does not claim.

They form one source-to-debugging pipeline:

```text
.asm / .z80 source ──> Atom ───────┐
.nu source ──────────> Nucleus ────┼─> BIN, HEX, COM, or D8 map
                                   └─> Debug80 IDE + Z80 runtime
```

HEX and BIN files contain the program delivered to hardware or an emulator.
The D8 map connects addresses in that program to source lines, symbols, and
included files. Debug80 uses the map for breakpoints, stepping, definitions,
hover information, and other source-level tools.

## 1. Debug80 and the Runtime

[Debug80](apps/debug80-vscode/README.md) is a Visual Studio Code extension for
building and debugging Z80 software. It provides the normal VS Code debugging
controls alongside Z80 registers, flags, memory, symbols, source-mapped
breakpoints, terminal I/O, and panels for emulated hardware.

Debug80 currently has detailed machine profiles for the TEC-1 and TEC-1G. A
profile supplies the memory map, monitor ROM workflow, reset behaviour, and the
devices belonging to that machine. The TEC-1G profile includes its keypad,
seven-segment display, LCD and GLCD, RGB matrix, serial connection, speaker,
and expansion-memory controls.

The extension delegates CPU and machine behaviour to
[`@jhlagado/debug80-runtime`](packages/debug80-runtime/README.md). The runtime
has no dependency on VS Code, AZM, Nucleus, or the Debug Adapter Protocol. It
can therefore run the same programs headlessly in tests, build pipelines, and
other Node.js tools. Its public headless API supports bounded execution,
symbol-aware memory access, input controls, and snapshots of emulated devices.

Start here:

- [Debug80 extension guide](apps/debug80-vscode/README.md)
- [Debug80 Book 1 — Getting started](https://debug80.com/debug80-book/book1/)
- [Debug80 runtime and headless API](packages/debug80-runtime/README.md)
- [Debug80 engineering manual](apps/debug80-vscode/docs/codebase/index.md)
- [D8 debug-map format](apps/debug80-vscode/docs/codebase/appendices/g-d8-debug-map-format.md)

## 2. Atom

[Atom](https://github.com/jhlagado/atom) is the default assembler for `.asm`, `.inc`,
and `.z80` source in Debug80. Its assembler core is written in Z80 assembly and
runs either on a real Z80 system or in the Debug80 runtime. The host layer
handles files, conditional preprocessing, binary inclusion, finished artifacts,
and Debug80 maps.

Atom supports the complete Z80 instruction set, global and `.`-private labels,
`EQU`, `ORG`, `DB`, `DW`, `DS`, `ALIGN`, `INCBIN`, byte functions, character
literals, and common string forms. Its native source assembles itself byte for
byte and fits inside one 16 KiB bank.

Start here:

- [Atom repository](https://github.com/jhlagado/atom)
- [Atom command-line guide](https://github.com/jhlagado/atom/blob/main/docs/command-line.md)
- [Atom language reference](https://github.com/jhlagado/atom/blob/main/docs/language-reference.md)

## Nucleus language

[Nucleus](packages/nucleus/README.md) is a small, safe, statically typed
language for systems where memory and machine cost remain visible. Its first
implementation is a handwritten Z80 compiler whose executable core and
required immutable data must fit in one 16 KiB bank.

The language uses fixed-width scalars, nominal records, fixed arrays, bounded
strings, structured control, typed routines, static aggregate storage, and an
explicit failure model. Its compiler emits Z80 machine code directly. A compact
runtime and backend contract defines packed storage, calls, services, traps,
and generated-code integrity without introducing a bytecode interpreter.

Start here:

- [Nucleus project](packages/nucleus/README.md)
- [Nucleus 0.1 Language Specification](packages/nucleus/docs/specification.md)
- [Nucleus Z80 Runtime and Backend Contract](packages/nucleus/docs/z80-runtime-contract.md)
- [Published Nucleus books](https://debug80.com/nucleus/)

## Choosing an Entry Point

| You want to...                                | Begin with...                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Build and debug a Z80 program in VS Code      | [Debug80 extension guide](apps/debug80-vscode/README.md)                 |
| Assemble an existing `.asm` or `.z80` program | [Atom repository](https://github.com/jhlagado/atom)                      |
| Learn Atom syntax                             | [Atom language reference](https://github.com/jhlagado/atom/blob/main/docs/language-reference.md) |
| Use AZM-specific host features                | [AZM README](packages/azm/README.md)                                     |
| Read or implement Nucleus                     | [Nucleus project](packages/nucleus/README.md)                            |
| Run Z80 programs in automated tests           | [Debug80 runtime](packages/debug80-runtime/README.md)                    |
| Understand or extend the implementation       | [Debug80 engineering manual](apps/debug80-vscode/docs/codebase/index.md) |

## Working in the Monorepo

The repository uses npm workspaces. Node.js 20 or newer is required.

```sh
npm install
npm run build
npm run check
```

The main workspaces are:

| Path                         | Package                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `apps/debug80-vscode`        | Debug80 VS Code extension                                         |
| `packages/debug80-runtime`   | UI-independent Z80 and machine runtime                            |
| `packages/atom`              | Temporary release bridge for the independent Atom repository     |
| `packages/azm`               | AZM assembler and compile API                                     |
| `packages/nucleus`           | Nucleus language, direct Z80 compiler, specifications, and proofs |
| `packages/z80-tool-services` | Shared host-service contracts for Z80 tools                       |
| `integration`                | Private end-to-end package integration checks                     |

Atom and Debug80 Runtime now have independent local repositories. Their
remaining workspace copies are release bridges: Debug80 can remove each copy
after a published version contains the API and behaviour exercised by this
repository. Glimmer source and history have moved to its own repository and are
not part of the Debug80 extension or workspace.

## Debugging the Extension

Open the monorepo root in VS Code. The **Debug80 Extension** launch
configuration is available under **Run and Debug**; pressing `F5` builds the
extension and opens
[`examples/debug80-dev`](examples/debug80-dev) in an Extension Development Host.
That project contains RGB-matrix and seven-segment smoke targets, plus an
unconfigured assembly file for testing target addition and removal.

Set extension or adapter breakpoints in the original VS Code window. To enter
the debug adapter from the development host, start a Debug80 session in that
second window. The adapter runs inside the extension host, so its TypeScript
breakpoints stop in the original window.

Two additional launch configurations are available:

- **Debug80 Extension (performance diagnostics)** enables `DEBUG80_PERF=1`.
- **Debug80 Extension (Simple E2E fixture)** opens the minimal adapter fixture.

Restart the extension-development session after changing extension or webview
code so its pre-launch task rebuilds both bundles.

## Dependency Boundaries

Atom depends on Debug80 Runtime for Node-hosted execution and on
`z80-tool-services` for host-service contracts. The Debug80 extension consumes
Atom, AZM, Nucleus, and Debug80 Runtime.
Debug80 Runtime remains independent so it can execute already-built programs
without bringing an assembler, language frontend, editor API, or UI into a
headless process.

All repository-owned JavaScript output is ESM. Debug80 requires VS Code 1.100 or
newer and ships as a bundled extension without a runtime `node_modules`
directory.
