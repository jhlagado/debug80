# Changelog

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
