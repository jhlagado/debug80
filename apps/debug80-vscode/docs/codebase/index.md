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
- [Chapter 3 — ROM Development Project Config](part1/03-rom-development-project-config.md)

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

This manual is updated against the codebase state through **2026-07-11**. These notes give maintainers a quick view of changes that affect several chapters:

- **Assembler backends:** Debug80 now ships two in-process build paths that both emit native `.d8.json` maps: AZM for `.asm`, `.inc`, and `.z80`, plus Glimmer for `.glim`. The old listing-derived mapping path has been removed from active project behaviour. Active targets should be expected to build a HEX plus a native D8 source map.
- **Editor grammars:** Debug80 owns TextMate syntax highlighting for both Z80/AZM assembly and Glimmer sources. `package.json` contributes the `z80-asm` grammar for `.asm`, `.z80`, and `.asmi`, plus the `glim` grammar for `.glim`, with breakpoint registration for both language ids.
- **Target discovery:** project targets are discovered across the workspace by explicit entry conventions: files named exactly `main.asm` and files ending in `.main.asm`. A conventional `src/` root is no longer required. `.z80` files remain supported Z80/AZM source files, but they are no longer auto-discovered as runnable targets.
- **Project initialization:** the panel now treats a Debug80 project as a workspace folder with `debug80.json` at its root. Scaffolding writes root `debug80.json`, optional starter source and the standard Debug80 `.gitignore` block; it does not create a `.vscode` directory unless launch scaffolding is explicitly requested.
- **Runtime performance:** `createZ80Runtime()` keeps stable decoder callbacks whose implementations read the current hardware hooks dynamically. Runtime-control now uses a shared execution-loop implementation for Continue, Step Over, Step Out and temporary run targets, while still recording starvation data so long chunks and yield delays can be observed during extension-host debugging. TEC display rendering keeps scanned seven-segment duty tracking, while the TEC-1G matrix path now publishes live row-latch state plus captured scan cycles for webview playback instead of maintaining per-pixel duty buffers in the runtime.
- **Webview audio:** speaker mute state is session-local. New webviews start muted because browsers and VS Code webviews require a user gesture before reliable audio playback.
- **Scaffold:** new projects can merge a standard **Debug80** `.gitignore` block via `ensureDebug80Gitignore()` in `src/extension/project-gitignore.ts`, invoked from `scaffoldProject()`.
- **TEC-1G panel UI:** peripheral visibility checkboxes have been removed from the main panel; core displays, keypad and support widgets are arranged into tighter Debug80 accordion panels. The Displays panel holds the GLCD and RGB matrix, the Machine panel holds LCD, seven-segment and keypad, and matrix keyboard / serial tools live in separate accordion sections.
- **TEC-1G video and joystick panels:** the TEC-1G panel now includes dedicated **TMS9918 Video** and **Joystick** accordion sections. Opening the video section attaches a TMS9918/TMS9929 card on fixed ports `0xBE` and `0xBF`, preserves its VRAM and registers across panel collapse and session rehydration, and lets the webview switch PAL 50 Hz versus NTSC 60 Hz frame cadence. The joystick section drives an active-low joystick mask that is merged into matrix row 3 reads, with pointer and keyboard bindings routed through a dedicated `debug80/tec1gJoystick` request.
- **TEC-1G keyboard focus ownership:** the TEC-1G webview now routes host keyboard events through an explicit owner controller. Opening **Matrix Keyboard** promotes matrix typing to the active owner, opening **Joystick** can promote joystick control when matrix mode is closed, clicking the Machine section returns ownership to the hex keypad, and blur or panel-close paths release the active matrix or joystick state without disturbing the rest of the session.
- **TEC-1G matrix keyboard UI:** opening the Matrix Keyboard accordion models attaching the hardware keyboard, sets the MON-3 Matrix CONFIG bit, routes typed keys to the matrix keyboard and disables scanned hex-keypad keys while leaving RESET active. Closing the accordion releases held matrix keys, clears the CONFIG bit and returns control to the hex keypad. Matrix modifier handling now distinguishes Shift, Ctrl, Fn and Alt, applies shifted ASCII for clicks, keeps CAPS LOCK latched, reflects modifier state on keycaps, and maps matrix arrow/editing keys to MON-3 low control codes. Debug80 reasserts matrix mode after RESET and when a session starts with the accordion already open, so persisted webview state stays aligned with the runtime.
- **TEC-1G reset fidelity:** `debug80/tec1gReset` now always restarts from the hardware reset vector at `0x0000` while preserving MON-3 monitor RAM, restores MON-3's default menu presentation fields after the RAM restore, and can carry an `fn` flag from the keypad reset path so the runtime exposes a one-shot Fn latch on the first post-reset keypad read.
- **TEC-1G matrix scan commit and routing:** matrix key transitions now stage into a pending scan image and become visible to MON-3 only at the next matrix-row boundary, which keeps a full scan pass internally consistent. Ctrl-letter chords are routed through the letter cell plus the Ctrl modifier row, and failed `debug80/tec1gMatrixKey` forwards are now logged by the extension host instead of disappearing silently.
- **TEC-1G matrix scan playback:** the TEC-1G runtime records each complete 8-row latch scan as a `matrixScanCycles` trace with per-row dwell timing and forwards it through the `debug80/tec1gUpdate` payload. The webview integrates those scans into exposure-based canvas frames through `matrix-scan-player.ts`, reports scan rate, effective CPU rate, buffer lag, and dropped-scan counts, and falls back to the latest static row masks when scan playback goes idle. The canvas renderer also restores the original LED lens styling so dim duty-weighted pixels still keep the TEC-1G front-panel look.
- **TEC-1G ROM-first launch path:** TEC-1G launches can now assemble explicit `tec1g.romArtifacts` before runtime creation. Active source-backed artifacts mutate launch args in place: a monitor artifact becomes `tec1g.romHex`, an expansion artifact becomes `tec1g.expansionRomHex`, generated D8 maps are prepended to `debugMaps`, and generated source directories are prepended to `sourceRoots` so ROM-relative D8 paths win over older app roots. ROM-artifact assembly forces AZM register-contract analysis off and suppresses register-report output so monitor and expansion builds do not inherit app-scoped contract policy. Validation currently enforces one active monitor artifact and one active expansion artifact, fixed monitor geometry at `0xC000`/`0x4000`, and a Phase 2 expansion model where the visible bank window remains `0x8000-0xBFFF`.
- **TEC-1G expansion ROM banking:** the old single-memory-image cartridge helper has been replaced by explicit expansion-bank images. Single-source monitor and expansion ROM artifacts are padded to their configured size after assembly. Multibank expansion artifacts can now declare per-bank sources keyed by physical bank; Debug80 assembles each bank at `0x8000-0xBFFF`, pads each bank binary to 16K, writes configurable output recipes for physical runtime images, contiguous deliverables and per-bank files, and prepends each bank's D8 map. `.bin` / `.d8.json` output paths must match AZM's artifact-base conventions, and an active monitor artifact now keeps the TEC-1G launch entry on configured `tec1g.entry` instead of adopting an expansion-ROM boot entry. Auxiliary ROM D8 maps also resolve project-relative source paths through the workspace root before falling back to the map directory.
- **TEC-1G bank-aware source mapping:** when multiple expansion-ROM banks share the same visible `0x8000-0xBFFF` window, Debug80 now tags ROM-artifact D8 maps with a physical-bank address space and can rebase artifact-relative auxiliary-map addresses into that live CPU window. Breakpoints, source-map status, stack frames, nearest-symbol lookup, run-to-here targets, editor-facing source-map symbols, and one-shot breakpoint-skip handling all match the active bank first and operate on the visible runtime address.
- **Panel layout reset:** the visible command `debug80.resetPanelLayout` tells `PlatformViewProvider` to focus the Debug80 view and post a `resetPanelLayout` webview message. The shared accordion controller then restores the default panel order and default open/closed state while preserving normal project and session state.
- **Mapping and MON-style includes:** native D8 maps are the source of truth for breakpoints, stepping, F12, hovers, workspace symbols, Variables, Watch expressions and stack display. Include-anchor remapping remains as a defensive D8 cleanup pass for inherited path attribution.
- **Workspace symbol command:** `debug80.searchWorkspaceSymbols` is a visible command that delegates to VS Code's `workbench.action.showAllSymbols`. Results still come from Debug80's active-target D8 workspace symbol provider.
- **Z80 debugger stepping:** a single **Step** over the ED block-repeat instructions (LDIR, LDDR, CPIR, CPDR, INIR, INDR, OTIR, OTDR) runs the instruction to completion in one user-visible step.
- **ST7920 GLCD and matrix display:** the emulator keeps a full 4-bit GLCD column counter and derives the upper/lower 64x64 chip bank from it. The TEC-1G GLCD webview canvas is rendered at an exact 3× scale to avoid uneven pixel thickness from non-integer scaling. The TEC-1G 8x8 RGB matrix mirrors hardware column bits into left-to-right visible columns, and the webview can replay captured row scans at monitor cadence while still rendering the latest static row masks between scan bursts. The seven-segment display colours now distinguish address digits from data digits.
- **Source-map-backed editor features:** F12 / Go to Definition, hover details, workspace symbol search, source-map freshness messages and the Variables panel are backed by the active target's D8 map. The current D8 symbol flow also preserves AZM 0.3 declaration identity, visibility, and source-unit provenance so owner-local and source-private declarations can resolve correctly across includes and generated-source paths. If the source map is missing or stale, the user-facing guidance is to build the target.
- **Watch and conditional breakpoint expressions:** the adapter implements DAP `evaluateRequest` and conditional breakpoint support. Watches and breakpoint conditions share a small Z80-focused expression language with registers, AZM-style flag names, D8 symbols, byte memory reads via square brackets, arithmetic, bitwise operators, word comparisons (`eq`, `ne`, `lt`, `le`, `gt`, `ge`), symbolic comparison aliases (`=`, `==`, `<>`, `!=`, `<`, `<=`, `>`, `>=`) and logical `and`/`or`/`not`.
- **AZM build diagnostics:** AZM failures carry source-root-resolved file paths, line/column information and source text when available into `debug80/assemblyFailed`. Debug80 reports the error through the Debug Console, the revealed Debug80 Output channel, VS Code Problems and an error-coloured project status line. The adapter completes and terminates a failed build session without returning the launch error that opens VS Code's launch-configuration modal. A nominal AZM success without a D8 map or without HEX data records is treated as an assembly failure.
- **Call stack display:** stack traces now combine the current PC frame with up to eight best-effort return-address candidates read from the Z80 stack. Mapped candidates are labelled with nearest symbols and can be used with the Call Stack context menu action `Run to Here`.
- **AZM project controls:** Debug80 uses AZM's current register-contract API names (`registerContracts`, `registerContractsProfile`, `registerContractsInterfaces`) on the `@jhlagado/azm` 0.3 line. Every Project panel includes a project-persisted **Case-sensitive symbols** checkbox backed by `azm.symbolCase`, while the TEC-1G Project panel also includes session-scoped Register Contracts and Contract Update controls. These controls map to launch-time AZM options, and AZM strict-mode stack-discipline diagnostics flow through Debug80's normal assembly-failure reporting.
- **Hardware send workflow:** Debug80 can hand a built HEX artifact to a real board through CoolTerm's Remote Control Socket. It now treats CoolTerm transfer completion as the host-side endpoint and no longer waits for `PASSED` or `FAILED` text from MON3; the user reads `PASS` or `ERROR` from the TEC-1G seven-segment display. The source repo includes `tec-1g.CoolTermSettings` as a CoolTerm preset for TEC-1G 4800 8N2 raw transfers. This lives in the extension host and is intentionally separate from the emulated serial terminal.
- **Webview modules:** shared `common/` modules cover serial UI, Web Audio, matrix rendering, seven-segment display, keypad handling, TEC keycap layout and styles. The TEC-1 and TEC-1G panels share more code and present consistent keyboard behaviour.
- **Extension file handling:** `.asm`, `.z80` and `.asmi` files are assigned the `z80-asm` language id on open so decorations and breakpoints align with `files.associations` in `package.json`.
- **Source map cache removal:** Debug80 no longer writes or consults project-local `.debug80/cache` D8 maps. Active target maps resolve to build-side `<artifactBase>.d8.json`; missing, invalid or non-native maps produce build-required diagnostics and an empty mapping rather than a fallback parse path.
- **TEC-1G peripheral fidelity:** the TEC-1G system-control register now treats CAPS as bit 7 and decodes bits 3-6 as the memory-expansion bank field: legacy two-page mode when the upper selector is zero, and seven additional expansion windows when it is non-zero. The SD-card SPI helper preserves command/response state across short MON3 chip-select idle gaps and supports the current initialization, status, CID/CSD, single-block read and single-block write paths used by monitor programs.
- **Message routing modules:** extension-host webview routing is split by project, serial and active-platform message families. Shared platform-panel routing is split into layout, edit and runtime handlers, leaving `platform-view-messages.ts` and `panel-messages.ts` as thin composition layers.

Longer-standing architecture facts:

- The project manifest uses the version 2 model: `projectVersion`, `projectPlatform`, `profiles`, `defaultProfile` and `bundledAssets`.
- Project creation records bundled ROM asset references, and launch resolves missing workspace files from the extension bundle automatically.
- The panel lifecycle has three states: `noWorkspace`, `uninitialized` and `initialized`.
- The project header owns project selection, target selection, stop-on-entry, restart and workspace-folder addition.
- Memory snapshot handling is split across debug and extension modules.
