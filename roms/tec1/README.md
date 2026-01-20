# TEC-1 ROMs

Bundled TEC-1 monitor ROMs for Debug80.

## MON-1B (`mon-1b/`)

- File: `mon-1b/mon-1b.hex`
- ASM (wrapper): `mon-1b/mon-1b.asm` (INCBIN of `mon-1b/mon-1b.bin`)
- ASM (source): `mon-1b/mon-1b.source.asm`
- Source: `Software/monitors/Mon-1/Mon-1B/mon1B.asm`
- License: GPL-3.0

## MON-2 (`mon-2/`)

- File: `mon-2/mon-2.hex`
- ASM (wrapper): `mon-2/mon-2.asm` (INCBIN of `mon-2/mon-2.bin`)
- ASM (source): `mon-2/mon-2.source.asm` (based on MON2A_JH)
- ASM (disassembly): `mon-2/mon-2.disasm.asm`
- Source: `Software/monitors/Mon-2/Mon-2-original/mon2-orig.asm`
- License: GPL-3.0

Note: `mon-2/mon-2.disasm.asm` is a direct disassembly listing and may need cleanup
to assemble cleanly with asm80.

## JMON (JMON_SOURCE_01) (`jmon/`)

- File: `jmon/jmon.hex`
- ASM (wrapper): `jmon/jmon.asm` (INCBIN of `jmon/jmon.bin`)
- ASM (source): `jmon/jmon.source.asm`
- LCD charset reference: `jmon/HD44780-charset.png`
- Source: `Software/monitors/JMon/JmonSource/JMON_SOURCE_01.asm`
- License: GPL-3.0

If you want to use a different ROM (MON-1A, JMON), set `tec1.romHex` in your
project config to point at your chosen ROM file.
