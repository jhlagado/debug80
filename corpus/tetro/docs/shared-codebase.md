# Shared codebase

Tetro and Pacmo are different games, but they run on the same tight hardware loop.

There are no interrupts and no background task. The CPU has to keep the RGB matrix visible, scan the six-digit seven-segment display, service the speaker, poll input, and run game logic from one cooperative loop. The shared codebase is the small set of routines that make that possible without turning either game into a generic engine.

This document describes the shared contract used by both game targets. The game-specific tours explain what each game does on top of it.

---

## Target structure

Each game has its own top-level assembly file:

```text
src/tetro/tetro.main.asm
src/pacmo/pacmo.main.asm
```

Those files own the `ORG`, reset entry, main loop, and include order. Debug80 can load either target directly without knowing how the internal helper files are split.

Both targets use the same low-level scan primitive and the same high-level
scan policy: scan a complete visible matrix frame with fixed row dwell, blank
the matrix, then run one game logic frame.

```asm
Start:
    CALL    InitState

MainLoop:
    CALL    ScanFrame
    CALL    LogicTick
    JR      MainLoop
```

`ScanTick` is still the shared primitive that emits one row and services sound
and the seven-segment display. Each game owns its local `ScanFrame` policy so
the dwell constant and future timing experiments can remain game-local.

The include order matters because AZM resolves forward references. `shared/scan-tick.asm` calls `SndService` and `HudScanDig`, but those labels are supplied later by the shared sound and HUD files. This keeps scanout generic while allowing each target to include its own game wrappers after the generic services.

---

## Shared and local code

The shared layer is deliberately low-level. It contains hardware facts and buffer operations that are true for Tetro, Pacmo, and future 8x8 games.

Currently shared and generic:

- `src/shared/constants.asm`: hardware ports, MON-3 API constants, key codes, matrix dimensions, colour bits, composite colour names, and speaker bit
- `src/shared/scan-tick.asm`: matrix row scanout and scan-state advance
- `src/shared/framebuffer-core.asm`: back-buffer clear and copy helpers
- `src/shared/framebuffer-draw.asm`: matrix x-to-mask conversion and RGB Framebuffer drawing primitives
- `src/shared/sound.asm`: speaker divider state machine
- `src/shared/hud.asm`: seven-segment digit scan, blanking, shared digit/glyph tables, and decimal Score formatting
- `src/shared/lcd.asm`: HD44780 primitive operations, script renderer, row string writer, and table-character writer

The games keep their own rules, state, tuning, display text, Score events, and presentation wrappers. A routine belongs in `src/shared` only when its contract is hardware-shaped or buffer-shaped rather than game-shaped.

There are no transitional Tetro-shaped input or rendering files in `src/shared`. Tetro input lives in `src/tetro/input.asm`, and Tetro rendering lives in `src/tetro/render.asm`.

---

## Scan tick

`ScanTick` lives in `src/shared/scan-tick.asm`.

Each call:

1. Clears the active row select.
2. Reads three bytes from `Framebuffer` through `ScanPtr`.
3. Writes those bytes to the red, green, and blue matrix ports.
4. Enables the row selected by `ScanMask`.
5. Calls `SndService`.
6. Calls `HudScanDig`.
7. Calls `ScanNext`.

Clearing the row before changing colour data matters. If the row stayed enabled while new colour bytes were written, the previous row could briefly show the next row's colour data.

`ScanNext` rotates `ScanMask` and moves `ScanPtr` to the next four-byte Framebuffer row. When the scan wraps back to row zero, it resets the pointer and increments `FramePhase`.

`FramePhase` is just a shared scan-state counter. Tetro uses it as splash-screen entropy. Pacmo currently does not use it for randomness, but it still gets the same counter because it uses the same scan state.

---

## Frame timing

The runtime displays a whole matrix frame first. During that visible frame,
each row gets the same fixed dwell delay. `ScanFrame` blanks the matrix before
returning, and `LogicTick` then performs game work while no row is selected.

This makes visible row brightness independent of how much computation one game
frame needs. Expensive work can still lengthen the inter-frame blanking period,
but it no longer makes one scan row brighter than another.

The exact frame duties are game-specific. Tetro owns falling-piece timing,
line-clears, and board rendering. Pacmo owns movement, power timing, monster
updates, level gates, and maze rendering. The shared codebase provides the row
scan primitive and buffer helpers; it does not decide what a game frame means.

---

## Framebuffer contract

The front Framebuffer is the buffer read by `ScanTick`:

```text
Framebuffer
```

The back Framebuffer is where game logic composes the next image:

```text
FramebufferBack
```

Both buffers are 32 bytes:

```text
8 rows x 4 bytes per row
```

For each row:

```text
byte 0 = red plane
byte 1 = green plane
byte 2 = blue plane
byte 3 = aux / padding
```

The scanout emits only the red, green, and blue bytes. The fourth byte keeps row stride simple and leaves room for local scratch conventions.

`shared/framebuffer-core.asm` provides:

- `FbClearAll`
- `FbClearRow`
- `FbCopyRow`
- `FbCopyAll`

Those routines know the buffer shape, but not the game meaning of the pixels.

`src/shared/framebuffer-draw.asm` provides small drawing primitives over the same RGB row layout:

- `MxMask`
- `FbSetCell`
- `FbOrRow`

`MxMask` converts a screen x coordinate to the matrix bit convention where x 0 maps to the most significant bit. `FbSetCell` writes one RGB cell to an exact colour, clearing planes that are not part of that colour. `FbOrRow` ORs a row mask into the selected colour planes. Game renderers decide what to draw; these helpers only implement the shared Framebuffer mechanics.

---

## Speaker service

`shared/sound.asm` contains the generic speaker state machine.

`SndStart` takes:

```text
A = duration in scan ticks
C = divider reload / half-period
```

It initializes `SoundTimer`, `SndDivReload`, `SndDivCount`, and clears `SpeakerPort`.

`SndService` runs once per scan tick. It decrements the sound timer and toggles `SpeakerPort` whenever the divider expires. When the timer reaches zero, it silences the speaker state.

The shared service does not know what a sound means. Tetro and Pacmo keep local event wrappers that load their own duration and divider constants, then tail-call `SndStart`.

---

## Seven-segment HUD

`src/shared/hud.asm` owns multiplexing and common formatting for the six seven-segment digits.

`HudScanDig` reads one byte from `HudSegBuffer`, writes it to `PortSegs`, combines the selected digit mask with `SpeakerPort`, and writes the result to `PortDigits`. This is why the speaker and digit display share timing: both use the digit latch.

`HudScanIndex` advances modulo six so each scan tick refreshes one digit.

`HudBlankDig` clears the six-byte segment buffer.

The shared HUD file also owns:

- `HudMaskTbl`
- `HudGlyphTbl`
- `HudWriteU16`
- `HudDecDigit`

Game-local Score wrappers load their game Score into `HL` and tail-call the shared formatter. The shared formatter owns the `HudSegBuffer` destination, including the leading zero glyph and the five decimal digits. This keeps scoring events local while sharing the decimal-to-seven-segment conversion.

---

## LCD primitives

`shared/lcd.asm` contains the generic HD44780 operations:

- `LcdBusy`
- `LcdCmd`
- `LcdClear`
- `LcdString`
- `LcdScript`
- `LcdPutc`
- `LcdRowStr`
- `LcdPutcTbl`

`LcdScript` reads a simple table:

```text
DB row_command
DW text_pointer
...
DB 0
```

The shared LCD layer knows how to execute that table, position a row before writing a string, and append a table-indexed character. It does not decide which screens exist. Tetro and Pacmo keep their own LCD text, script tables, and wrapper routines.

---

## Boundary rule

A helper is a good shared candidate when it can be documented without naming Tetro pieces, Pacmo Monsters, scores, levels, walls, pills, or LCD states.

Good shared candidates:

- hardware port operations
- LCD primitive operations
- matrix scanout
- seven-segment multiplexing
- speaker divider timing
- Framebuffer clear/copy operations
- small pure bit helpers after coordinate semantics are confirmed

Code should stay game-local when it encodes:

- Tetro piece, collision, gravity, rotation, lock, line-clear, or next-preview behaviour
- Pacmo maze, viewport, player, monster, pill, power-mode, respawn, or level behaviour
- game-specific sound event names and tuning
- game-specific LCD screen names and text
- game-specific Score variable names unless wrapped behind a clear shared contract

The goal is reuse without hiding game logic. Shared code should make the hardware easier to use; it should not make the games harder to understand.
