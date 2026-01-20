# TEC-1 ROMs

Bundled TEC-1 monitor ROMs for Debug80.

## MON-1B

- File: `mon-1b.hex`
- ASM: `mon-1b.asm`
- Source: `/Users/johnhardy/Documents/projects/Software/monitors/Mon-1/Mon-1B/mon1B.asm`
- License: GPL-3.0

## MON-2

- File: `mon-2.hex`
- ASM: `mon-2.asm`
- Source: `/Users/johnhardy/Documents/projects/Software/monitors/Mon-2/Mon-2-original/mon2-orig.asm`
- License: GPL-3.0

Note: `mon-2.asm` is a direct disassembly listing and may need cleanup to
assemble cleanly with asm80.

If you want to use a different ROM (MON-1A, JMON), set `tec1.romHex` in your
project config to point at your chosen ROM file.
