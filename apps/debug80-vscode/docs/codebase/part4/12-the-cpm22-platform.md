---
layout: default
title: 'Chapter 12 — The CP/M 2.2 Platform'
parent: 'Part IV — Platform Runtimes'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 4
---

[← The TEC-1G Platform](11-the-tec-1g-platform.md) | [Part IV](index.md)

# Chapter 12 — The CP/M 2.2 Platform

The CP/M 2.2 platform boots an idealized single-drive CP/M machine rather than a front-panel hardware monitor. It combines the real CP/M 2.2 CCP and BDOS with a Debug80 BIOS, an 80×24 terminal, and a workspace-to-guest installation path for built transient programs. The result is a launch flow where the host still builds a normal HEX artifact while the guest sees a conventional `A>` prompt and runs a normal `.COM` file.

The platform lives in `src/platforms/cpm22/` on the extension side and `packages/debug80-runtime/src/platforms/cpm22/` in the shared runtime package.

---

## Memory and boot model

The CP/M guest does not boot by loading the built application directly at the CPU entry point. Instead, `createCpm22PlatformProvider()` loads three bundled assets:

- `cpm22.img` — the default IBM 3740 boot disk image
- `bootstrap.bin` — the bootstrap image copied to address `0x0000`
- `bios.d8m.json` — the bundled BIOS debug map

`prepareProgram()` copies `bootstrap.bin` to address `0x0000`, sets `program.startAddress = 0`, and marks that bootstrap range writable in the loaded program image. `resolveEntry()` then returns `0`, so the Z80 starts in the bootstrap rather than in the transient program body.

The launch path also prepends the bundled BIOS debug map to `debugMaps` and appends the bundled ROM directory to `sourceRoots`. Breakpoints and stack traces can therefore stop in BIOS routines such as `ConsoleOutput` even though the guest is running a CP/M session.

---

## The `.COM` materialization path

The CP/M platform treats the built HEX file as the source for a transient-program install.

`materializeCpm22ComArtifact()` in `src/platforms/cpm22/com-artifact.ts`:

1. parses the Intel HEX artifact into a `HexProgram`
2. verifies that every initialized range lies inside the CP/M transient-program area `0x0100..0xE3FF`
3. requires the first initialized byte to be exactly at `0x0100`
4. slices the initialized image into a contiguous `.COM` byte stream
5. writes that byte stream atomically beside the HEX artifact as `<artifactBase>.com`

The platform uses `cpm22.programName` when present, otherwise it derives `<hex basename>.COM`. The filename is validated as a canonical user-0 CP/M 8.3 `.COM` name before launch continues.

If the launch has no app input, the platform boots the disk image without installing a transient program. If app input exists, the provider passes the `.COM` bytes and canonical filename into `installCpm22File()`, which installs the program into the guest's private drive-A image before the runtime starts.

---

## Disk handling

The runtime package owns the disk emulator. `createCpm22PlatformRuntime()` receives:

- the disk image bytes
- the guest-writable flag
- terminal and BIOS device wiring

`cpm22.diskImage` overrides the bundled disk with a workspace-relative IBM 3740 image. `cpm22.writable` controls whether guest sector writes persist for the lifetime of the debug session. The default is `true`.

Host installation is separate from guest write protection. When `cpm22.writable` is `false`, Debug80 still installs the built `.COM` program into a private in-memory copy of the source image before boot, then exposes that copy to the guest as a write-protected disk.

Launch validation rejects malformed media and install failures before runtime creation. The current checks cover:

- disk-image byte length
- invalid CP/M 8.3 program names
- non-`.COM` program names
- empty transient programs
- transient programs that start outside `0x0100`
- initialized ranges outside `0x0100..0xE3FF`
- directory or allocation exhaustion while installing the built program

---

## Bundled native tools

The default CP/M 2.2 disk image also carries a small set of checked native guest
tools that the Debug80 regression suite treats as product surface:

- `ATOM.COM` publishes `.COM` files from the bundled `.ASM` sources
- `NUC.COM` is the bundled native Nucleus compiler
- `EDIT.COM` is the full-screen editor exercised by the terminal-panel contract

The imported `NUC.COM` artifact lives in `third_party/nucleus/` with reviewed
provenance metadata beside it. `scripts/cpm22/import-nucleus.mjs` rebuilds that
binary from a neighbouring Nucleus checkout only when the exact reviewed commit
and SHA-256 digest match the committed artifact.

In the guest session, `NUC ?` prints the compact command contract:

`NUC [SOURCE [OUTPUT.COM|OUTPUT.BIN|OUTPUT.HEX]]`

When the caller supplies only a source path such as `INPUT.NU`, the compiler
publishes `INPUT.COM` by basename rather than using a fixed `OUTPUT.COM`
default. The acceptance and VS Code host integration suites also guard the
collision path where `NUC INPUT.NU KEEP.COM` must fail without overwriting the
existing guest file.

---

## Terminal I/O

The CP/M platform owns an 80×24 terminal rather than a hardware panel. `buildIoHandlers()` returns a `TerminalState` with fixed port assignments:

- TX port `0`
- RX port `1`
- status port `2`

Every write to port `0x00` is treated as terminal output. The provider forwards the byte through `callbacks.onTerminalOutput({ text })`, which the extension host routes into the shared terminal panel in `cpm22` mode. That mode no longer behaves like the stream terminal used for TEC serial output. The webview keeps an explicit 80×24 cell buffer, tracks bold, underline, and reverse-video attributes, and applies cursor-motion, erase, and rendition CSI sequences as bytes arrive from the guest. This is the path that lets the bundled CP/M editor paint a stable full-screen UI inside the standard Debug80 terminal view.

Input entered in the panel is buffered in `terminalState.input`; the provider flushes that queue into `platformRuntime.terminal.enqueueInput()` before the next guest port read. The panel mode matters because CP/M expects carriage-return line endings and editor-style raw key input. Enter posts `\r` rather than `\n`, printable characters are forwarded without browser-local echo, arrow keys become `ESC [` cursor sequences, Backspace sends `\b`, Delete sends `0x7f`, and the current editor shortcuts map `Ctrl-F`, `Ctrl-N`, `Ctrl-Q`, `Ctrl-R`, and `Ctrl-S` to their control bytes.

---

## Provider shape

`createCpm22PlatformProvider()` returns a `ResolvedPlatformProvider` with:

- `id: 'cpm22'`
- `payload: { id: 'cpm22' }`
- `registerCommands: () => undefined`
- `buildIoHandlers()` creating terminal-backed port handlers
- `loadAssets()` resolving the disk image, optional app install, and runtime instance
- `prepareProgram()` injecting the bootstrap at `0x0000`
- `resolveEntry(): 0`

Unlike TEC-1 and TEC-1G, the CP/M platform registers no platform-specific DAP commands. Session interaction stays on the standard DAP surface plus the shared terminal-input requests.

---

## Project scaffolding and tests

The built-in project kit is `cpm22/default`. New CP/M projects scaffold `debug80.json` with:

- `platform: "cpm22"`
- `cpm22: { "writable": true, "programName": "MAIN.COM" }`
- a starter source rooted at `src/main.asm`

The VS Code host integration suite now includes a CP/M extension-host scenario that boots to `A>`, stops in the source-mapped BIOS, runs the bundled `SMOKE` flow, and exercises native Atom on the bundled single-source, large-source, and multipart examples. The same scenario also runs the bundled Nucleus compiler through `NUC INPUT.NU`, verifies the resulting `INPUT.COM` guest artifact, then opens the Debug80 terminal panel, drives the bundled full-screen editor through search, literal replacement, save, quit, and new-file creation, and verifies the resulting guest files through `TYPE`. The expected transcript lives in `tests/integration-vscode/expected/cpm22-transcript.json`.

---

[← The TEC-1G Platform](11-the-tec-1g-platform.md) | [Part IV](index.md)
