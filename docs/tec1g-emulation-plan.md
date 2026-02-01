# TEC-1G Emulation Review and Plan

Date: 2026-02-01

## Scope and sources reviewed
- Runtime implementation: `src/platforms/tec1g/runtime.ts`
- SysCtrl decoder: `src/platforms/tec1g/sysctrl.ts`
- Debug adapter memory handling: `src/debug/adapter.ts`, `src/debug/tec1g-shadow.ts`
- Platform docs: `docs/platforms/tec1g/README.md`, `src/platforms/tec1g/README.md`
- MON-3 ROM source: `/Users/johnhardy/Documents/projects/debug80-tec1g/roms/tec1g/mon-3/mon-3.source.asm`
- TEC-1G schematic: `/Users/johnhardy/Documents/projects/TEC-1G/TEC-1G_Schematic_v1-21.pdf`

Schematic note:
- The v1-21 schematic was located and used to confirm SYS_CTRL/SYS_INPUT and matrix keyboard wiring.

## Executive summary
The TEC-1G platform emulates the core trainer workflow (keypad/NMI, seven-seg, speaker,
LCD, serial) and a substantial GLCD model (text + graphics). Shadow/protect/expand are
implemented but are missing bank-selection and some latch/system-input bits. The largest
hardware gaps are matrix keyboard input, RTC (DS1302), SD card SPI, cartridge flags/mapping,
and SYS_CTRL/SYS_INPUT extra bits that MON-3 expects for add-on detection.

## Feature-by-feature review (status vs. MON-3 expectations)

### Memory mapping and system control
- Shadow/Protect/Expand: **Implemented** in runtime + adapter.
  - Shadow read aliasing and ROM copy logic: `src/debug/adapter.ts`, `src/debug/tec1g-shadow.ts`
  - Protect blocks writes to 0x4000-0x7FFF: `src/debug/adapter.ts`
  - Expand window at 0x8000-0xBFFF: `src/debug/adapter.ts`
- Bank selection for expansion: **Missing** (only one 16K bank in memory).
- SYS_CTRL latch extra bits: **Missing**.
  Schematic confirms SYS_CTRL latch (U13 74HCT273) bit map:
  - Q0: SHADOW
  - Q1: PROTECT
  - Q2: EXPAND
  - Q3: FF-D3
  - Q4: FF-D4
  - Q5: FF-D5
  - Q6: FF-D6
  - Q7: CAPS
  Current code only decodes bits 0-2.
- SYS_INPUT (0x03) full bit map: **Partial**.
  Schematic shows a latched system input (U18 74HCT373) driven by:
  - D3: EXPAND
  - D4: CART
  - D5: G.IMP
  - D6: KDA (keypad disable / matrix mode)
  Other inputs are pulled high via RN3 and DIP-configured. Runtime currently synthesizes
  only protect/expand/key/serial and does not model the latch or these add-on flags.

### Keypad and NMI
- Keypad input and NMI on keypress: **Implemented** (`applyKey` sets NMI; key hold timing present).
- Function key behavior: **Indirect** (depends on ROM, not emulation).
- Matrix keyboard mode disabling keypad: **Missing** (matrix mode not emulated).

### Seven-segment display and speaker
- Digit select + segment latch: **Implemented** (`updateDisplayDigits`).
- Speaker toggle + frequency estimation: **Implemented** (`calculateSpeakerFrequency`).
- FTDI RX/TX LEDs/diagnostic LEDs: **Missing** (no modeled LED outputs beyond panel display).

### LCD (HD44780)
- DDRAM write/read, address counter, busy flag: **Implemented** (`lcdReadStatus`, `lcdReadData`).
- Clear/home/addr set: **Implemented**.
- CGRAM custom characters: **Missing** (no CGRAM storage or command handling).
- Instruction set coverage: **Partial** (only clear/home/addr; other HD44780 commands ignored).

### GLCD (ST7920-style)
- Text DDRAM + graphics GDRAM read/write: **Implemented**.
- Busy flag + status reads: **Implemented**.
- Display on/off, cursor, blink, entry mode, scroll/reverse: **Implemented**.
- Standby handling: **Partial** (treated as display off).
- Instruction coverage: **Mostly complete**, but no explicit CGRAM model and no hardware
  read-modify-write quirks.

### Serial (bit-bang)
- 4800 8N2 bit-bang TX + RX injection: **Implemented** (`BitbangUartDecoder`).
- FTDI status bits on 0x03 / LED status: **Missing** (0x03 only mirrors RX state).

### LED matrix (8x8)
- Row select + column latch output: **Implemented** (`updateMatrixRow`).
- Input matrix keyboard: **Missing** (read of 0xFE always 0xFF).
- Note: Schematic confirms matrix scan is gated by MATRIX-FE (U19 74HCT245),
  so emulation must examine the full 16-bit port value, not just the low byte.

### RTC (DS1302) and SD card
- RTC/PRAM (0xFC): **Missing** (reads return 0xFF; writes only logged).
- SD card SPI (0xFD): **Missing** (writes logged, reads return 0xFF).
- ROM uses add-on detection bits and PRAM checksum routines; these are not satisfied.

### Cartridge boot / ROM mapping
- Cartridge boot flag and ROM mapping: **Missing**.

### Docs accuracy
- `src/platforms/tec1g/README.md` says GLCD/LCD busy-flag are not emulated, but the runtime
  now implements both. This doc is stale and should be corrected.

## Recommended plan (prioritized)

### Phase 1 — Correct docs + lock spec (fast, high value)
1) Add schematic reference (once provided) and update `docs/platforms/tec1g/README.md` to:
   - Mark GLCD and LCD busy-flag as implemented.
   - Explicitly list current gaps: matrix keyboard, RTC, SD, cartridge, SYS_CTRL/SYS_INPUT bits.
2) Add a concise “hardware contract” section that documents:
   - Port 0x03 bit map (current + missing).
   - Port 0xFF latch bits (current + missing).
   - Matrix scan requirement (full 16-bit port value).

### Phase 2 — Matrix keyboard (core missing input path)
1) Implement matrix keyboard input on 0xFE:
   - Use full 16-bit port address (A8–A15) in IO read handler (MATRIX-FE decode).
   - Emulate keypad-disable behavior when matrix mode active.
2) Add matrix key mapping table aligned to MON-3 expectations.
3) Provide UI toggle/overlay to send matrix key events (distinct from LED matrix output).

### Phase 3 — RTC (DS1302)
1) Implement bit-banged DS1302 on 0xFC:
   - CS on bit 4, CLK on bit 6, data line with R/W semantics.
   - Emulate PRAM storage with checksum update routines.
2) Add “RTC present” indicator bit in SYS_INPUT (and any latch bits if applicable).

### Phase 4 — SD card SPI (0xFD)
1) Implement minimal SD card SPI state machine:
   - MOSI on bit 0, CLK on bit 1, chip select mask per MON-3 diag.
   - Provide dummy card responses for initial commands used by DIAG.
2) Expose “SD present” indicator bit in SYS_INPUT.

### Phase 5 — SYS_CTRL and SYS_INPUT completeness
1) Expand SYS_CTRL decoding to include:
   - Caps lock bit (Q7).
   - Additional latch bits (Q3–Q6) as pass-through state for future expansion/LEDs.
2) Expand SYS_INPUT (0x03) to include:
   - Cartridge flag (CART).
   - G.IMP header status.
   - Matrix mode state (KDA).
   - Add-on presence bits (RTC/SD).
   - FTDI TX/RX indicator status if relevant.
 3) Model the system-input latch behavior (U18 74HCT373) rather than live combinational reads,
    if MON-3 timing proves sensitive.

### Phase 6 — Expansion bank selection + cartridge
1) Implement bank selection logic for expansion window (0x8000–0xBFFF) based on
   actual hardware bit(s) from schematic.
2) Implement cartridge ROM mapping and boot flag behavior.

## Verification plan
- Add unit tests for new I/O behaviors (matrix scan, SYS_CTRL/SYS_INPUT bits, RTC/SD state).
- Add integration tests against MON-3 routines:
  - LCD busy polling loop
  - GLCD terminal routines
  - Matrix scan + ASCII conversion
  - RTC presence + PRAM read/write
  - SD “idle” command behavior used by DIAG

## Open items blocking higher-fidelity emulation
1) TEC-1G schematic (needed to confirm SYS_CTRL/SYS_INPUT bit assignments and expansion banking).
2) Any ROM behavior differences between MON-3 builds (v1.4 vs v1.5 vs BC24-15).
