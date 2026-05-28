# Changelog

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

- Updated the AZM backend integration to use AZM's native D8 debug-map output
  without requiring a legacy listing artifact.
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
