# Changelog

## 0.1.16

- Fixed Matrix Keyboard capture shutdown so held matrix keys are released before
  capture is disabled, preventing stale pressed keys in the emulator runtime.
- Clarified TEC-1G matrix keyboard documentation so keyboard capture is distinct
  from MON-3 Matrix CONFIG mode.
- Removed the separate MON-3 Matrix checkbox; opening the Matrix Keyboard
  accordion now emulates keyboard attachment and sets the Matrix CONFIG bit.
- Disabled the hex keypad while the Matrix Keyboard accordion is open, matching
  MON-3's matrix-input takeover model.
- Added matrix keyboard mappings for MON-3 low control codes such as arrow,
  Backspace, and Tab keys so matrix-aware programs can read the full key set.
- Moved the Debug80 Engineering Manual into `docs/codebase` so the codebase
  reference lives in the repository beside the source it describes.

## 0.1.15

- Updated AZM to `0.2.8`.
- Renamed Debug80's AZM integration terminology from "register care" to
  "register contracts".
- Updated AZM launch/config options to use the new `registerContracts`,
  `registerContractsProfile`, and `registerContractsInterfaces` names.
- Updated register contract report handling for AZM's new artifact naming.
- Changed generated report output from `.regcare.txt` to `.regcontracts.txt`.
- Updated Debug80 UI labels, package schema text, docs, and tests to match
  AZM's new terminology.
- Preserved existing user-facing modes: `Enforce`, `Audit`, and `Off`.
- Verified the update with TypeScript checks, targeted backend/extension tests,
  webview tests, webview build, formatting checks, and Fallow audit.

## 0.1.14

- Fixed project initialization so selecting and initializing a new workspace
  folder no longer jumps back to the previously selected project.
- Simplified the Project panel state model by consolidating
  project/setup/root-selection state into a clearer `ProjectPanelState` flow,
  reducing duplicated setup-card and project-status logic, and adding focused
  webview tests for project panel behavior.
- Audited the main Debug80 panel UI state model and documented the next cleanup
  priorities in the code-quality audit.
- Extracted the register strip into its own controller so registers are no
  longer mixed directly into the memory panel implementation, with focused
  register panel tests.
- Added a Matrix Keyboard routing cue: when the Matrix Keyboard accordion is
  open, the Machine panel now shows that PC keyboard input is routed to the
  Matrix Keyboard, the keypad is marked disabled, and the Matrix Keyboard
  accordion header shows an active marker.
- Kept accordion open state as the single source of truth for Matrix Keyboard
  routing; no extra toggle was added.
- Verified the work with TypeScript checks, full webview tests, webview build,
  Fallow changed-file audit, and git diff checks.

## 0.1.13

- Improved TEC-1G SD SPI emulation for MON3 and ZAD-style host-backed storage
  workflows, including `0xFD` port behavior, command-frame preservation across
  short CS-high idle gaps, and 512-byte sector read/write coverage.
- Improved DS1302 RTC protocol behavior and tests around port `0xFC`.
- Corrected TEC-1G `SYS_CTRL` caps lock mapping to follow MON3, with CAPSLOCK
  on bit `0x80` and bit `0x20` no longer treated as caps.
- Displayed `SYS_CTRL` bits `0x08`, `0x10`, `0x20`, and `0x40` as Memory
  Expansion bank lamps, while keeping bit `0x08` as the current `E_A14`
  two-bank selector for the `0x8000-0xBFFF` expansion window.
- Retired remaining source-map cache fallback remnants and clarified Debug80's
  native AZM D8 map policy for build and bundled outputs.
- Improved source-map diagnostics and added path resolving/mapping tests to
  protect the AZM-only source-map policy.
- Deduplicated runtime control logic while preserving stepping, pause, run, and
  temporary-breakpoint behavior.
- Repaired e2e adapter step tests and added shared adapter harness helpers for
  launch, stop, stopped-frame, termination, and source-map e2e coverage.
- Split platform panel message routing into smaller project, serial, platform,
  runtime, tab, and edit message modules with clearer typed message boundaries.
- Added reusable platform panel and webview message fixtures.
- Pruned stale repository docs that moved to the external Debug80 manual/docs
  site, added `docs/code-quality-audit.md`, and updated TEC-1G future-work notes
  for peripherals, SD/PATA, RTC, FRAM, joystick, expansion decks, and the
  current MON3/SYS_CTRL contract.

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
