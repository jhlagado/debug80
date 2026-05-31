# Changelog

## 0.1.12

- Fixed matrix keyboard recovery after extension/webview restart.
- Matrix key input now self-recovers if the accordion restored open but the
  initial `matrixMode` sync was missed by the debug session.
- Fixed TEC-1G panel message forwarding so the `fn` modifier reaches the
  adapter.
- Added regression coverage for missed startup matrix-mode sync and modifier
  forwarding.
- Included the matrix keyboard rework from late May 31: keycap-based modifier
  lights, CapsLock latch behavior, right Shift, separate Fn/Alt handling,
  matrix-mode tied to accordion visibility, compact keyboard styling, and
  default accordion ordering.

## 0.1.11

- Refactored launch argument handling so project config, target selection,
  platform blocks, artifacts, source paths, and bundled ROM/source-map paths are
  merged through smaller focused helpers.
- Documented Debug80's fallback policy: UI state can be tolerant, but build
  artifacts and AZM-native D8 source maps are strict source-of-truth
  requirements.
- Split watch expression handling into tokenizer, parser, evaluator, shared
  types, and public facade modules.
- Centralized debug session event emission for runtime stops,
  request-controller events, stop-on-entry, breakpoint refresh, and
  console/status output.
- Cleaned legacy source-map/config paths, including removal of remaining
  `.debug80.json` discovery and obsolete compatibility-map references.
- Removed several unused exported symbols from extension, mapping, opcode,
  CoolTerm, bundle manifest, workspace selection, and keypad modules.
- Extracted memory panel formatting and memory dump rendering helpers from the
  main webview memory panel.
- Extracted project target dropdown rendering and "Send to TEC-1/TEC-1G" label
  logic from the project status UI.
- Kept behavior covered by focused debug/webview tests and the full webview
  test suite.

## 0.1.10

- Added workspace-wide symbol search backed by the latest Debug80 source map,
  making it easier to jump to known labels and symbols from the active build.
- Improved command palette classification for the symbol search command.
- Strengthened AZM build failure reporting with clearer build-failed
  notifications, better Problems panel diagnostics, correct project-relative
  source path resolution, and empty or invalid HEX output handling as a build
  failure instead of silently loading zeros.
- Added TEC-1G CoolTerm settings for the standard serial transfer setup:
  4800 baud, 8 data bits, no parity, and 2 stop bits.
- Expanded watch and conditional breakpoint expression syntax to support `=`,
  `==`, `<>`, `!=`, `<`, `<=`, `>`, and `>=`, while keeping existing word forms
  such as `eq`, `ne`, `lt`, `le`, `gt`, and `ge`.

## 0.1.9

- Updated AZM to `0.2.5`.
- Fixed MON-3 ROM source breakpoints using native `.d8.json` source maps.
- Removed the old `.debug80` source-map cache and more legacy source-map
  fallback logic.
- Updated docs for the AZM-only source-map flow.
- Improved the TEC-1G starter program with LCD text and scanned `HELLO` output.
- Shortened CoolTerm serial status messages to show filenames only.
- Fixed stale Debug80 project status after webview restore and focus changes.
- Improved TEC-1 / TEC-1G seven-segment brightness using scan duty-cycle
  integration.
- Added regression tests for ROM mapping, source maps, serial status text,
  project refresh, and display duty-cycle behavior.

## 0.1.8

- Added `main.asm` as a recognized Debug80 target entry-point convention,
  alongside `.z80` and `.main.asm`.
- Improved the TEC-1G / MON-3 starter project so new projects now display
  `Debug80 TEC-1G` on the LCD and continuously scan `HELLO` on the
  seven-segment display.
- Made keypad keyboard input easier to use: clicking the TEC-1 / TEC-1G Machine
  or Displays panel now routes keyboard input to the keypad, while native
  controls keep normal focus.
- Removed the legacy `.debug80/cache` source-map cache machinery. Debug80 now
  relies on AZM's build-side `.d8.json` maps instead of creating project-local
  cache maps.
- Updated generated `.gitignore` blocks so new projects no longer ignore or
  imply use of `.debug80/`.
- Updated documentation around D8 source maps, cache deprecation, project
  targets, and the AZM-only direction.
- Confirmed MON-3 serial HEX transfer behavior: Debug80 no longer expects
  `PASS` / `FAIL` text over serial; MON-3 reports load status on the TEC-1G
  seven-segment display.
- Boosted TEC-1G RGB 8x8 LED matrix intensity for better visibility while
  preserving duty-cycle brightness variation.
- Refined the TEC-1G platform layout and status strip behavior in the Debug80
  panel.
- Added and updated tests covering target discovery, keypad focus routing,
  starter project content, source-map cache removal, serial transfer behavior,
  and display intensity behavior.

## 0.1.4

Marketplace release candidate refresh.

- Updated the bundled AZM assembler dependency to `0.2.3`.

## 0.1.3

Marketplace release candidate fix.

- Updated the AZM backend integration to use AZM's native D8 debug-map output.
- Removed stale AZM compile options from Debug80's assembler calls.
- Added regression coverage for the current AZM compile artifact contract.

## 0.1.2

Marketplace release candidate fix.

- Fixed AZM diagnostic handling when the assembler returns diagnostics without
  a source file. Debug80 now reports the real AZM diagnostic instead of failing
  with `Cannot read properties of undefined (reading 'localeCompare')`.

## 0.1.1

Marketplace release candidate refresh.

- Updated the bundled AZM assembler dependency to `0.2.2`.
- Excluded generated `build/` artifacts from packaged VSIX contents.
- Added VSIX verification coverage to reject accidental top-level `build/`
  packaging regressions.

## 0.1.0

Initial Marketplace candidate for Debug80.

- Source-level Z80 debugging in VS Code.
- Built-in Z80 assembly workflow with native D8 debug-map support.
- Breakpoints, stepping, restart, register inspection, and memory inspection.
- Debug80 Run and Debug sidebar view for project, target, platform, display,
  serial, terminal, and memory workflows.
- Built-in TEC-1 and TEC-1G platform profiles for hardware-focused workflows.
- Bundled TEC-1 and TEC-1G ROM/profile assets with workspace override support.
- Z80 assembly language associations and syntax highlighting for `.asm`,
  `.z80`, and `.asmi` files.
- Automatic target discovery for `.z80` and `.main.asm` entry points.
