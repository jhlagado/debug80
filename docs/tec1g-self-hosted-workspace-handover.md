# TEC-1G Self-Hosted Workspace Handover

Date: 2026-05-31

## Purpose

This document captures an early project concept: use the TEC-1G graphical LCD,
matrix keyboard, and file storage capabilities to build a self-hosted development
environment. The near-term goal is not to replace MON3 immediately. The first
useful slice should run alongside MON3, probably as an additional ROM image in
the expansion area above the monitor, and provide a small editor plus an
interpreted language that can load, save, and run source files from disk.

The long-term ambition is larger: make the TEC-1G feel more like a classic
self-contained development machine, comparable in spirit to an Apple II booting
into BASIC, but not necessarily constrained to a 1970s line-numbered BASIC
model. The presence of file storage means the environment can be file-oriented
from the beginning.

## Current Platform Capabilities Relevant To This Project

The following points are grounded in the current Debug80 repository and bundled
MON3 material.

### CPU And Memory Model

- The machine is a Z80 target.
- MON3 occupies the high ROM area, documented as `0xC000-0xFFFF`.
- The default user workbench RAM is `0x4000-0x7FFF`.
- `0x8000-0xBFFF` is an expansion window that can expose RAM or ROM, with
  banking semantics.
- The expansion socket can hold 32 KiB, visible as a 16 KiB window at a time.
- Protect mode can make `0x4000-0x7FFF` read-only to protect user programs.
- Shadow mode maps monitor ROM into low memory for legacy compatibility.
- Debug80 has support for Shadow, Protect, Expand, and the 16 KiB expansion
  window, though some high SYS_CTRL bits are not fully wired to memory banking.

Project implication: a first editor/interpreter ROM probably belongs in the
expansion window at `0x8000-0xBFFF`, launched from MON3 or a small trampoline.
It should treat `0x4000-0x7FFF` as precious workspace RAM and be explicit about
whether Protect is enabled or disabled.

### MON3 Service Surface

MON3 exposes a structured API through `RST 10H`. The bundled source includes
`api_includes.z80`, which lists monitor service numbers. The relevant services
include:

- Keyboard:
  - `scanKeys_`
  - `scanKeysWait_`
  - `matrixScan_`
  - `matrixScanASCII_`
  - `parseMatrixScan_`
- Character LCD:
  - `LCDBusy_`
  - `stringToLCD_`
  - `charToLCD_`
  - `commandToLCD_`
- GLCD terminal:
  - `getGLCDTerm_`
  - `setGLCDTerm_`
- GLCD graphics/text library, through the secondary GLCD API table:
  - `initTerminal_`
  - `sendCharToLCD_`
  - `sendStringToLCD_`
  - `sendRegToLCD_`
  - `setCursor_`
  - `displayCursor_`
  - `autoLF_`
  - `underline_`
  - `plotAlways_`
  - drawing primitives such as `drawPixel_`, `drawLine_`, `drawBox_`,
    `drawCircle_`, `drawGraphic_`, and `plotToLCD_`
- File/storage-related services:
  - `loadFromDisk_`
  - `openFile_`
  - `readSector_`
  - `writeSector_`
- Serial:
  - `txByte_`
  - `rxByte_`
  - `intelHexLoad_`
  - `sendToSerial_`
  - `receiveFromSerial_`
  - `sendAssembly_`
  - `sendHex_`
- System state:
  - `getCaps_`, `setCaps_`, `toggleCaps_`
  - `getShadow_`, `setShadow_`
  - `getProtect_`, `setProtect_`
  - `getExpand_`, `setExpand_`

Project implication: the first version should use MON3 APIs wherever possible.
That keeps the new ROM smaller, gives it proven hardware access, and leaves more
ROM budget for the editor and language runtime.

### GLCD

The TEC-1G GLCD is modeled as an ST7920 device on:

- `OUT 0x07`: GLCD instruction/command
- `OUT 0x87`: GLCD data
- `IN 0x07`: GLCD status
- `IN 0x87`: GLCD data

Debug80 currently emulates ST7920 text mode, graphics mode, busy flag behavior,
DDRAM, GDRAM, display/cursor/blink state, scroll/reverse commands, and rendering
in the TEC-1G webview.

MON3 includes a GLCD terminal abstraction:

- `initTerminal` initializes GLCD terminal mode, scroll buffers, graphics buffer,
  cursor management, and the LCD.
- `sendCharToLCD` prints ASCII and handles control characters.
- Supported terminal behaviors include carriage return, ignoring line feed,
  form feed clear, backspace, tabs as four spaces, and scroll up/down control
  codes.
- The terminal layer includes a 10-line scrollback history.

Project implication: the first editor does not have to directly drive pixels.
It can start by using the GLCD terminal layer for shell output, prompts, errors,
and simple editor screens. Direct graphics can be added later for a richer
editor UI, status bars, inverse video, cursor rendering, or split views.

### Matrix Keyboard

MON3 supports an optional QWERTY or mechanical matrix keyboard. In matrix mode,
the onboard hex keypad is disabled except Reset.

Debug80 has a matrix keymap aligned with MON3 behavior:

- ASCII conversion is modeled through MON3-like matrix scan logic.
- Shift, Ctrl, Fn, caps lock, carriage return, escape, space, quote, backslash,
  and printable ASCII are mapped.
- Matrix reads use port `0xFE`, with row selection encoded in the high address
  byte.

Project implication: the editor should treat matrix keyboard ASCII as the main
input path. It should avoid relying on the hex keypad for normal text editing.
However, a small fallback path for keypad-only operation may be useful for
bootstrapping, diagnostics, or emergency exit.

### File Storage

The bundled MON3 sources include `pata_fat32.z80`. The MON3 API table exposes
disk/file-sector style routines such as `loadFromDisk_`, `openFile_`,
`readSector_`, and `writeSector_`.

Debug80's current TEC-1G storage emulation is named SD SPI rather than PATA:

- `OUT 0xFD`: SD SPI bit-banged data port
- Debug80 can load an image from `tec1g.sdImagePath`.
- Writes can be persisted back to the image.
- The runtime supports SD single-block read and write behavior when enabled.

Project implication: there is a mismatch to investigate between the user's
hardware goal of PATA/FAT32 and the current Debug80 runtime's SD SPI emulation.
The MON3 source contains FAT/PATA code, but Debug80's current emulated storage
surface is SD SPI. A handover discussion should decide whether the development
path targets real PATA first, Debug80 SD images first, or abstracts storage so
both can be supported.

### Serial

MON3 treats serial as a first-class workflow:

- 4800 baud
- 8 data bits
- no parity
- 2 stop bits
- TX on bit 6 of `OUT 0x01`
- RX mirrored on bit 7 of `IN 0x00` and `IN 0x03`

Project implication: serial can provide a bootstrap and recovery channel. It is
also a useful way to import/export source files while the disk editor and file
manager are immature.

### Existing Debug80 Value For This Project

Debug80 can already support a strong development workflow for this project:

- Assemble Z80 code with AZM.
- Run a TEC-1G MON3 target.
- Show GLCD, LCD, seven-seg, RGB matrix, serial, and memory views.
- Debug ROM and user code with source maps.
- Configure matrix mode, protect state, expansion bank selection, and storage
  image settings.
- Persist SD image writes when configured.

Project implication: Debug80 should be the primary development and regression
environment before moving to real hardware.

## Project Concept

The project can be described as a "TEC-1G Workspace ROM": a resident development
environment that provides a command shell, text editor, file access, and a small
interpreted language. The environment initially runs above MON3 and uses MON3 as
its BIOS. Over time it can absorb more responsibilities and eventually become a
replacement monitor.

The user experience should be closer to:

```text
READY
> dir
> edit hello.tg
> run hello.tg
> save hello.tg
```

than to:

```text
10 PRINT "HELLO"
20 GOTO 10
RUN
```

The goal is not to reject BASIC's virtues. The goal is to avoid being trapped in
line-numbered program editing when the machine has a real file system and a
matrix keyboard.

## Proposed Milestone Structure

### Milestone 0: Confirm Hardware And ROM Assumptions

Before implementation, verify:

- Exact address and banking behavior for the proposed 16 KiB ROM area.
- How a ROM in the expansion window should be entered from MON3.
- Whether the environment can rely on MON3's API entry while executing from the
  expansion window.
- How much RAM is safely available after MON3 variables, stack, GLCD buffers,
  disk buffers, and keyboard state are accounted for.
- Whether real hardware target storage is PATA/FAT32, SD/FAT32, or both.
- Whether MON3's file routines are stable enough for editor save/load use.

### Milestone 1: Shell Plus GLCD Terminal

Build the smallest useful interactive workspace:

- Initialize the GLCD terminal.
- Read ASCII from the matrix keyboard.
- Display a prompt.
- Parse a command line.
- Implement a few commands:
  - `help`
  - `cls`
  - `type`
  - `dir`, if directory listing support is available
  - `load`
  - `save`
  - `run`, initially a stub
  - `exit` or `mon` to return to MON3

This milestone proves input, output, control flow, and monitor coexistence.

### Milestone 2: Text Buffer And Editor

Add an editor for one text file or memory buffer at a time.

Likely first editor model:

- Full-screen GLCD editor using text terminal primitives.
- Cursor movement by arrow/Fn keys.
- Insert printable ASCII.
- Backspace/delete.
- Newline.
- Save buffer to file.
- Load file into buffer.
- Status line with file name, modified flag, cursor row/column, and mode.

Avoid overbuilding at first. A 4-line or terminal-scroll editor may be enough
for initial testing. A more polished editor can later use direct GLCD drawing for
inverse cursor, soft wrapping, and status regions.

### Milestone 3: Script Interpreter

Add a compact interpreter that can execute source files from disk or the editor
buffer.

Recommended first language shape:

- File-oriented, not line-numbered.
- Shell-like commands with simple arguments.
- Variables.
- Labels or named procedures.
- Basic conditionals.
- Basic loops, if ROM/RAM budget allows.
- Hardware commands for GLCD, keyboard, sound, memory, and files.

Example direction:

```text
print "hello"
set x 10
if eq x 10 then print "ready"
waitkey k
print k
```

or:

```text
let x 10
while nz key
  sleep 1
end
print "done"
```

The exact syntax is still open. The safest implementation path is a simple
token/word interpreter, where each line begins with a command word.

### Milestone 4: File-Oriented Development Loop

Once editing and interpreting exist independently, connect them into a smooth
workflow:

- `edit foo`
- `run foo`
- Runtime error reports file and line.
- Return to editor at or near the failing line.
- Save/load preserves plain text source.
- Serial import/export provides a backup path.

### Milestone 5: Path Toward Self Hosting

Later work can add:

- A resident assembler.
- Symbol table and source listing output.
- Build command that writes binary files.
- `runbin` or loader support.
- Better file manager.
- Library/include support.
- Boot directly into the workspace ROM.
- Replace MON3 services one subsystem at a time.

## Language Direction

### Why Not Start With BASIC

BASIC is proven, approachable, and historically appropriate. It also has strong
advantages on tiny machines:

- Program storage can be line-record based.
- Editing can be line-oriented.
- The interpreter can scan and execute incrementally.
- Error locations are naturally line numbers.

However, BASIC's line numbers are less necessary when a machine has file
storage, a matrix keyboard, and a GLCD. If this project aims to feel like a
small self-hosted development machine rather than a retro clone, a file-backed
script language is more attractive.

### Recommended First Language Style

Use a small command/script language:

- One statement per line.
- First token selects the command.
- Strings are quoted.
- Numbers can be decimal and hex.
- Variables are simple named slots.
- Expressions are deliberately limited at first.
- Built-in commands expose system services.

Possible built-ins:

- `print`
- `input`
- `key`
- `waitkey`
- `cls`
- `locate`
- `beep`
- `sleep`
- `peek`
- `poke`
- `call`
- `load`
- `save`
- `open`
- `read`
- `write`
- `close`
- `if`
- `goto` or `jump`
- `label` or `:name`
- `while` / `end`, if affordable

The syntax can evolve. The implementation should preserve room for future
structured control flow even if the first version uses labels.

## Editor Design Ideas

### Buffer Strategies

Possible text buffer models:

1. Flat memory buffer with gap
   - Good interactive editing behavior.
   - More complex insert/delete code.
   - Best if editing files that fit comfortably in RAM.

2. Line table plus text pool
   - Natural for line navigation and error reporting.
   - More metadata overhead.
   - Useful if the interpreter needs line-level access.

3. Page/sector-backed buffer
   - Better for larger files.
   - Much more complex.
   - Probably too much for the first version.

Recommendation: start with a flat buffer or simple line table, with a hard file
size limit. Make the limit explicit and friendly. A small reliable editor is
better than a fragile "large file" editor.

### Display Strategies

1. Use MON3 GLCD terminal only
   - Fastest to build.
   - Smallest ROM footprint.
   - Limited layout control.

2. Use MON3 GLCD graphics/text primitives
   - Better editor UI.
   - Status bar, cursor, inverse text, and redraw regions become possible.
   - More code and redraw complexity.

3. Direct ST7920 access
   - Maximum control.
   - Highest implementation burden.
   - Should wait until MON3 APIs are insufficient.

Recommendation: use MON3 GLCD terminal for shell and early editor. Move to GLCD
graphics primitives only when the editor's usability demands it.

### Keyboard Strategies

The environment should assume matrix keyboard input. It needs a command mapping
for editing actions:

- Printable ASCII inserts text.
- Enter inserts newline or accepts command.
- Escape cancels or opens command mode.
- Backspace deletes previous character.
- Arrow keys move cursor if available through matrix mapping.
- Fn/Control combinations can map to save, run, quit, page up/down, home/end.

Open question: confirm the exact key combinations that are comfortable on the
physical matrix keyboard, not only in Debug80.

## Storage Design Ideas

The storage layer should be abstracted early:

```text
open(name, mode)
read(handle, buffer, count)
write(handle, buffer, count)
close(handle)
list(path)
delete(name)
rename(old, new)
```

Even if MON3 only exposes lower-level sector routines, the editor/interpreter
should call through a small project-owned storage adapter. This prevents the
language and editor from depending directly on PATA, SD, FAT32, or MON3-specific
calling conventions.

Open questions:

- Does MON3 currently provide full file write/create support, or mainly load and
  sector primitives?
- How are directory entries enumerated?
- Are long filenames available, or should the environment use 8.3 names?
- What file extension should scripts use?
- Can writes be made safe against power loss, or is the first version allowed to
  be simple and risky?

## ROM And RAM Budget Concerns

The user's working assumption is that there is a 16 KiB area above MON3 suitable
for the first ROM. That is plausible based on the documented expansion window,
but it must be verified against hardware and MON3 banking behavior.

Likely ROM consumers:

- Entry/trampoline code.
- MON3 API call wrappers.
- Shell.
- Command parser.
- Editor.
- Text buffer management.
- Interpreter.
- Error reporting.
- Storage adapter.
- String/number parsing.
- Small standard library.

Likely RAM consumers:

- Editor text buffer.
- Current command line.
- File name/path buffer.
- Parser token buffer.
- Interpreter variables.
- Runtime stack or control-flow stack.
- File/sector buffer.
- GLCD terminal buffers, if MON3 owns them in RAM.
- Z80 stack.

Guiding principle: do not make the interpreter and editor compete blindly for
RAM. Define a workspace memory layout early.

## Suggested Architecture

The project should be divided into small Z80 modules:

- `entry.z80`
  - ROM entrypoint.
  - Version banner.
  - MON3 return path.

- `mon3_api.z80`
  - Wrappers around MON3 API calls.
  - Keeps service numbers and calling conventions in one place.

- `console.z80`
  - GLCD terminal output.
  - Character input.
  - Prompt and line input.

- `keys.z80`
  - Matrix ASCII input.
  - Editor command key mapping.

- `storage.z80`
  - File open/read/write/list abstraction.
  - MON3/PATA/SD implementation hidden behind stable routines.

- `buffer.z80`
  - Text buffer operations.
  - Insert/delete/newline/cursor movement.

- `editor.z80`
  - Full-screen editor behavior.
  - Redraw logic.
  - Status line.

- `shell.z80`
  - Command loop.
  - Command dispatch.

- `script.z80`
  - Interpreter.
  - Statement dispatch.
  - Variable handling.
  - Runtime errors.

- `stdlib.z80`
  - Built-in script commands.
  - Hardware/file helpers exposed to scripts.

This structure keeps the first version compatible with a future MON3
replacement. Later, `mon3_api.z80` can be replaced with native drivers while the
editor, shell, and script layers stay mostly intact.

## Open Questions For Discussion

### Hardware And Boot

- What is the exact ROM layout available above MON3?
- Is the extra ROM selected through the expansion window at `0x8000-0xBFFF`?
- Can code execute from that window while calling MON3 APIs in high ROM?
- What is the desired launch path: MON3 menu item, cartridge flag boot, manual
  jump, or reset-time boot?
- Should the first version return cleanly to MON3?

### Storage

- Is the target hardware PATA, SD SPI, or both?
- Which storage path should Debug80 emulate first for this project?
- What file API does MON3 actually expose above raw sector access?
- Is FAT32 mandatory for the first version?
- Should the first implementation use fixed-size files or a simpler custom
  format before full FAT write support?

### Editor

- What is the acceptable maximum file size for version one?
- Should editing be full-screen from the start, or command-line `edit` with a
  simpler line editor first?
- How should save failures be reported?
- Should there be an autosave or backup file convention?
- Should tabs be stored as tabs or spaces?
- Should files use CR, LF, or CRLF line endings?

### Language

- Should variables be typed or all numeric/string slots?
- Should the first version have labels and `goto`, or structured `if/end` and
  `while/end`?
- Should expressions support infix syntax, or command-style prefix syntax?
- What should comments look like?
- Should scripts be tokenized on load for speed, or interpreted from text each
  run for simplicity?
- What hardware should scripts expose first: GLCD, keyboard, sound, memory,
  files, RTC, serial?

### Debug80 Support

- Does Debug80 need a project profile for an expansion ROM in addition to MON3?
- Does source-level debugging work cleanly when the user ROM lives at
  `0x8000-0xBFFF` and MON3 lives at `0xC000-0xFFFF`?
- Should Debug80 add explicit PATA/FAT32 emulation, or should this project target
  the currently emulated SD SPI path first?
- Should test fixtures include a tiny script file system image?

## Recommended Next Step

The next useful artifact is a narrow design spec for Milestone 1:

- ROM entry location and launch mechanism.
- MON3 API wrappers needed for GLCD terminal and matrix keyboard input.
- Minimal shell command syntax.
- Minimal storage assumptions.
- Memory layout for command line, stack, and scratch buffers.
- Debug80 launch configuration for development.

Do not start with the assembler or a full MON3 replacement. The smallest
meaningful proof is:

```text
boot or jump into workspace ROM
initialize GLCD terminal
read commands from matrix keyboard
run help/cls/echo
return to MON3
```

After that works, add file load/save and only then the editor and interpreter.
