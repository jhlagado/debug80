---
layout: default
title: 'Debug80 Engineering Manual'
nav_order: 90
has_children: true
has_toc: false
---

# Debug80 Engineering Manual

A technical reference for engineers working with the Debug80 codebase.

The chapters begin with the repository shape and project model, then follow the runtime path from launch configuration through the debug adapter, emulator, platform runtimes, extension UI, source mapping and extension points.

## Part I — Orientation

- [Chapter 1 — Debug80 Architecture](part1/01-what-debug80-is.md)
- [Chapter 2 — Project Configuration](part1/02-project-configuration.md)

## Part II — The Debug Adapter

- [Chapter 3 — DAP and the Debug Session](part2/03-dap-and-the-debug-session.md)
- [Chapter 4 — The Launch Pipeline](part2/04-the-launch-pipeline.md)
- [Chapter 5 — Execution Control](part2/05-execution-control.md)

## Part III — The Z80 Emulator

- [Chapter 6 — The Z80 Runtime](part3/06-the-z80-runtime.md)
- [Chapter 7 — Instruction Decoding](part3/07-instruction-decoding.md)
- [Chapter 8 — Memory, I/O, and Interrupts](part3/08-memory-io-interrupts.md)

## Part IV — Platform Runtimes

- [Chapter 9 — The Simple Platform](part4/09-the-simple-platform.md)
- [Chapter 10 — The TEC-1 Platform](part4/10-the-tec-1-platform.md)
- [Chapter 11 — The TEC-1G Platform](part4/11-the-tec-1g-platform.md)

## Part V — The Extension UI

- [Chapter 12 — The Extension Host UI](part5/12-the-extension-host-ui.md)
- [Chapter 13 — The Webview Panels](part5/13-the-webview-panels.md)

## Part VI — Source Mapping

- [Chapter 14 — Mapping Data Structures](part6/14-mapping-data-structures.md)
- [Chapter 15 — Parsing and Lookup](part6/15-parsing-and-lookup.md)

## Part VII — Extending the Codebase

- [Chapter 16 — Adding a New Platform](part7/16-adding-a-new-platform.md)
- [Chapter 17 — Custom Commands, UI Panels, and Source Mapping](part7/17-custom-commands-ui-and-mapping.md)

## Appendices

- [Appendix A — Custom DAP Request Reference](appendices/a-custom-dap-requests.md)
- [Appendix B — Platform Configuration Reference](appendices/b-platform-config.md)
- [Appendix C — Session State Reference](appendices/c-session-state.md)
- [Appendix D — ROM Bundle Infrastructure](appendices/d-bundle-manifest.md)
- [Appendix E — Release and Local VSIX Testing](appendices/e-release-and-local-vsix.md)
- [Appendix F — Regression Gates](appendices/f-regression-gates.md)
- [Appendix G — D8 Debug Map Format](appendices/g-d8-debug-map-format.md)

## Current Codebase Notes

This manual is updated against the codebase state through **2026-06-04**. These notes give maintainers a quick view of changes that affect several chapters:

- **AZM-only assembler integration:** Debug80 now treats AZM and its native `.d8.json` output as the build path. The old listing-derived mapping path has been removed from active project behaviour. Active targets should be expected to build a HEX plus a native D8 source map.
- **Editor grammar:** Debug80 owns TextMate syntax highlighting for Z80/AZM assembly sources. `package.json` contributes the `z80-asm` grammar, default file associations for `.asm`, `.z80` and `.asmi`, and token colour customisations for comments, AZMDoc contract comments, labels, directives, instructions, registers, conditions, strings, symbols, constants, numbers and AZM layout syntax.
- **Target discovery:** project targets are discovered across the workspace by explicit entry conventions: files named exactly `main.asm`, files ending in `.z80`, and files ending in `.main.asm`. A conventional `src/` root is no longer required.
- **Project initialization:** the panel now treats a Debug80 project as a workspace folder with `debug80.json` at its root. Scaffolding writes root `debug80.json`, optional starter source and the standard Debug80 `.gitignore` block; it does not create a `.vscode` directory unless launch scaffolding is explicitly requested.
- **Runtime performance:** `createZ80Runtime()` keeps stable decoder callbacks whose implementations read the current hardware hooks dynamically. Runtime-control now uses a shared execution-loop implementation for Continue, Step Over, Step Out and temporary run targets, while still recording starvation data so long chunks and yield delays can be observed during extension-host debugging. TEC display rendering models scanned seven-segment and RGB LED duty cycle directly instead of relying on artificial persistence caches.
- **Webview audio:** speaker mute state is session-local. New webviews start muted because browsers and VS Code webviews require a user gesture before reliable audio playback.
- **Scaffold:** new projects can merge a standard **Debug80** `.gitignore` block via `ensureDebug80Gitignore()` in `src/extension/project-gitignore.ts`, invoked from `scaffoldProject()`.
- **TEC-1G panel UI:** peripheral visibility checkboxes have been removed from the main panel; core displays, keypad and support widgets are arranged into tighter Debug80 accordion panels. The Displays panel holds the GLCD and RGB matrix, the Machine panel holds LCD, seven-segment and keypad, and matrix keyboard / serial tools live in separate accordion sections.
- **TEC-1G matrix keyboard UI:** matrix keyboard mode is tied to the panel accordion visibility, restores after webview reload, routes typed keys only while that panel is active, and keeps the hex keypad clickable. Matrix modifier handling now distinguishes Shift, Ctrl, Fn and Alt, applies shifted ASCII for clicks, keeps CAPS LOCK latched, and reflects modifier state on keycaps.
- **Mapping and MON-style includes:** native D8 maps are the source of truth for breakpoints, stepping, F12, hovers, workspace symbols, Variables, Watch expressions and stack display. Include-anchor remapping remains as a defensive D8 cleanup pass for inherited path attribution.
- **Workspace symbol command:** `debug80.searchWorkspaceSymbols` is a visible command that delegates to VS Code's `workbench.action.showAllSymbols`. Results still come from Debug80's active-target D8 workspace symbol provider.
- **Z80 debugger stepping:** a single **Step** over the ED block-repeat instructions (LDIR, LDDR, CPIR, CPDR, INIR, INDR, OTIR, OTDR) runs the instruction to completion in one user-visible step.
- **ST7920 GLCD and matrix display:** the emulator keeps a full 4-bit GLCD column counter and derives the upper/lower 64x64 chip bank from it. The TEC-1G 8x8 RGB matrix mirrors hardware column bits into left-to-right visible columns, and the webview maps scanned duty-cycle brightness to a stronger visible LED intensity. The seven-segment display colours now distinguish address digits from data digits.
- **Source-map-backed editor features:** F12 / Go to Definition, hover details, workspace symbol search, source-map freshness messages and the Variables panel are backed by the active target's D8 map. If the source map is missing or stale, the user-facing guidance is to build the target.
- **Watch and conditional breakpoint expressions:** the adapter implements DAP `evaluateRequest` and conditional breakpoint support. Watches and breakpoint conditions share a small Z80-focused expression language with registers, AZM-style flag names, D8 symbols, byte memory reads via square brackets, arithmetic, bitwise operators, word comparisons (`eq`, `ne`, `lt`, `le`, `gt`, `ge`), symbolic comparison aliases (`=`, `==`, `<>`, `!=`, `<`, `<=`, `>`, `>=`) and logical `and`/`or`/`not`.
- **AZM build diagnostics:** AZM failures now carry source-root-resolved file paths, line/column information and source text when available into `debug80/assemblyFailed`. Debug80 reports the error through the Debug Console, VS Code diagnostics, project status and a notification. A nominal AZM success without a D8 map or without HEX data records is treated as an assembly failure.
- **Call stack display:** stack traces now combine the current PC frame with up to eight best-effort return-address candidates read from the Z80 stack. Mapped candidates are labelled with nearest symbols and can be used with the Call Stack context menu action `Run to Here`.
- **AZM register contract controls:** Debug80 uses AZM's current register-contract API names (`registerContracts`, `registerContractsProfile`, `registerContractsInterfaces`) and depends on `@jhlagado/azm` 0.2.8. The TEC-1G Project panel includes session-scoped Register Contracts and Contract Update controls. These map to launch-time AZM options; AZM strict-mode stack-discipline diagnostics flow through Debug80's normal assembly-failure reporting.
- **Hardware send workflow:** Debug80 can hand a built HEX artifact to a real board through CoolTerm's Remote Control Socket. It now treats CoolTerm transfer completion as the host-side endpoint and no longer waits for `PASSED` or `FAILED` text from MON3; the user reads `PASS` or `ERROR` from the TEC-1G seven-segment display. The source repo includes `tec-1g.CoolTermSettings` as a CoolTerm preset for TEC-1G 4800 8N2 raw transfers. This lives in the extension host and is intentionally separate from the emulated serial terminal.
- **Webview modules:** shared `common/` modules cover serial UI, Web Audio, matrix rendering, seven-segment display, keypad handling, TEC keycap layout and styles. The TEC-1 and TEC-1G panels share more code and present consistent keyboard behaviour.
- **Extension file handling:** `.asm`, `.z80` and `.asmi` files are assigned the `z80-asm` language id on open so decorations and breakpoints align with `files.associations` in `package.json`.
- **Source map cache removal:** Debug80 no longer writes or consults project-local `.debug80/cache` D8 maps. Active target maps resolve to build-side `<artifactBase>.d8.json`; missing, invalid or non-native maps produce build-required diagnostics and an empty mapping rather than a fallback parse path.
- **TEC-1G peripheral fidelity:** the TEC-1G system-control register now treats CAPS as bit 7 and exposes bits 3-6 as the future memory-expansion bank field. The SD-card SPI helper preserves command/response state across short MON3 chip-select idle gaps and supports the current initialization, status, CID/CSD, single-block read and single-block write paths used by monitor programs.
- **Message routing modules:** extension-host webview routing is split by project, serial and active-platform message families. Shared platform-panel routing is split into layout, edit and runtime handlers, leaving `platform-view-messages.ts` and `panel-messages.ts` as thin composition layers.

Longer-standing architecture facts:

- The project manifest uses the version 2 model: `projectVersion`, `projectPlatform`, `profiles`, `defaultProfile` and `bundledAssets`.
- Project creation records bundled ROM asset references, and launch resolves missing workspace files from the extension bundle automatically.
- The panel lifecycle has three states: `noWorkspace`, `uninitialized` and `initialized`.
- The project header owns project selection, target selection, stop-on-entry, restart and workspace-folder addition.
- Memory snapshot handling is split across debug and extension modules.
