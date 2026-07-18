# Debug80 Z80 Development Toolchain

Debug80 is a Z80 development environment built around source-level debugging.
This monorepo contains the three parts of that environment:

1. **Debug80 and its runtime** build, run, inspect, and debug Z80 programs.
2. **AZM** assembles Z80 source and records how the machine code maps back to it.
3. **Glimmer** adds a reactive game language that compiles through AZM while
   keeping handwritten Z80 assembly available where it is needed.

They form one source-to-debugging pipeline:

```text
.asm / .z80 source ───────────────> AZM ──> HEX or BIN + D8 debug map

.glim source ──> Glimmer ──> generated AZM ──> HEX or BIN + D8 debug map
                                                    │
                                                    v
                                      Debug80 IDE + Z80 runtime
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
has no dependency on VS Code, AZM, Glimmer, or the Debug Adapter Protocol. It
can therefore run the same programs headlessly in tests, build pipelines, and
other Node.js tools. Its public headless API supports bounded execution,
symbol-aware memory access, input controls, and snapshots of emulated devices.

Start here:

- [Debug80 extension guide](apps/debug80-vscode/README.md)
- [Debug80 user manual](https://debug80.com/manual/)
- [Debug80 runtime and headless API](packages/debug80-runtime/README.md)
- [Debug80 engineering manual](apps/debug80-vscode/docs/codebase/index.md)
- [D8 debug-map format](apps/debug80-vscode/docs/codebase/appendices/g-d8-debug-map-format.md)

## 2. AZM

[AZM](packages/azm/README.md) is the assembler at the centre of the toolchain.
It accepts `.asm` and `.z80` source and emits Intel HEX, flat binary, listings,
and D8 debug maps. You can use its command-line interface on its own or let
Debug80 invoke it as part of a project build.

AZM assembles ordinary Z80 instructions, but it also provides language features
for larger programs: local and exported symbols, layout types, enums, inline
operations, interface files, and register contracts. Register contracts make
routine inputs, outputs, and clobbered registers explicit, allowing the
assembler to diagnose mistakes that instruction encoding alone cannot find.

Start here:

- [AZM README and condensed manual](packages/azm/README.md)
- [AZM grammar reference](packages/azm/docs/reference/azm-grammar.md)
- [AZM examples](packages/azm/examples/README.md)
- [AZM books and manual](https://debug80.com/azm-book/)

## 3. Glimmer

[Glimmer](packages/glimmer/README.md) is a reactive language and project format
for Z80 games. It supplies declarations for state, input bindings, timers,
pulses, effects, rendering, screens, sound, and game resources. Z80 bodies
remain visible inside Glimmer blocks for the parts of a game that need direct
control of the machine.

Glimmer generates readable AZM and then uses AZM to produce the final program.
Its build pipeline rewrites the resulting D8 map so breakpoints and diagnostics
lead back to the original `.glim` source rather than leaving the programmer in
generated glue code. Debug80 treats `.glim` as a first-class source format and
uses the same debugging workflow for Glimmer and assembly projects.

Start here:

- [Glimmer README](packages/glimmer/README.md)
- [Glimmer language manual](packages/glimmer/docs/manual/)
- [Glimmer grammar reference](packages/glimmer/docs/reference/glim-grammar.md)
- [Glimmer Book](https://debug80.com/glimmer-book/)
- [Glimmer examples and corpus](packages/glimmer/corpus/README.md)

## Choosing an Entry Point

| You want to...                                | Begin with...                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Build and debug a Z80 program in VS Code      | [Debug80 extension guide](apps/debug80-vscode/README.md)                 |
| Assemble an existing `.asm` or `.z80` program | [AZM README](packages/azm/README.md)                                     |
| Learn AZM syntax and register contracts       | [AZM books](https://debug80.com/azm-book/)                               |
| Write a reactive Z80 game                     | [Glimmer Book](https://debug80.com/glimmer-book/)                        |
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

| Path                       | Package                                       |
| -------------------------- | --------------------------------------------- |
| `apps/debug80-vscode`      | Debug80 VS Code extension                     |
| `packages/debug80-runtime` | UI-independent Z80 and machine runtime        |
| `packages/azm`             | AZM assembler and compile API                 |
| `packages/glimmer`         | Glimmer language, generator, and build API    |
| `integration`              | Private end-to-end package integration checks |

Each published package has its own version. The monorepo allows changes across
the toolchain to be built and tested together without publishing intermediate
packages.

## Debugging the Extension

Open the monorepo root in VS Code, choose **Debug80 Extension** under **Run and
Debug**, and press `F5`. The launch task builds the extension and opens
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

Glimmer depends on AZM because generated Glimmer programs are assembled by AZM.
The Debug80 extension consumes AZM, Glimmer, and Debug80 Runtime. Debug80 Runtime
remains independent so it can execute already-built programs without bringing
an assembler, language frontend, editor API, or UI into a headless process.

All repository-owned JavaScript output is ESM. Debug80 requires VS Code 1.100 or
newer and ships as a bundled extension without a runtime `node_modules`
directory.
