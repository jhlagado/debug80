# TEC-1G Platform Notes

This document consolidates current findings about the TEC-1G platform and what it implies for emulation in Debug80. It is based on the TEC-1G repo documentation (README and Functional Description).

## Summary
- Backward compatible with classic TEC-1 monitors.
- Default memory: 16K ROM + 32K RAM (up to 64K RAM + 16K ROM).
- Shadowed low 2K ROM into 0x0000-0x07FF when SHADOW is enabled.
- Banked RAM with MMU control; bank 2 always mapped.
- 20x4 LCD is the primary display, 7-seg display remains.
- Keypad + matrix keyboard options; keypress status on port 0x03 bit 6.
- Fast clock is a 4.0 MHz crystal; slow clock retained.
- Expanded I/O decode in the 0xF8-0xFF range for new peripherals.
- Serial via optional FTDI/FT232 module.

## Hardware Differences vs Classic TEC-1
### Memory and MMU
- Bank 0/1/3 controlled by MMU; bank 2 is always mapped.
- Low 2K ROM is shadowed at 0x0000-0x07FF when SHADOW is active.
- RAM write protection for bank 1 via PROTECT signal.
- Expansion RAM socket (bank 2) supports 8K-32K devices.

### Displays
- 20x4 character LCD is primary display.
- 7-seg display remains for compatibility.
- GLCD support exists via external board (defer for initial emulation).

### Input
- Hex keypad remains.
- Matrix keyboard option + joystick options.
- Keypress detection is built into hardware (bit 6 on port 0x03).

### Clock and Timing
- FAST clock is a 4.0 MHz crystal oscillator.
- Slow clock retained for older monitors.
- MON-3 timing assumes 4.0 MHz.

### Serial and I/O
- Optional FTDI/FT232 module (USB serial).
- Classic I/O decode for 0x00-0x07 retained.
- New decode for 0xF8-0xFF for modern peripherals.

## I/O Port Map (from MON3 + DIAG includes)
These come from `ROMs/MON3/source/mon3.z80` and `ROMs/DIAGs/source/Diags_includes.asm`.

### Classic ports (0x00-0x07)
- `0x00` KEYB: hex keypad encoder.
- `0x01` DIGITS: 7‑seg digit select.
- `0x02` SEGS: 7‑seg segment data.
- `0x03` SYS_INPUT / SIMP3: system input (key‑press status on bit 6).
- `0x04` LCDCMD / LCD_INST: LCD instruction.
- `0x84` LCDDATA / LCD_DATA: LCD data.
- `0x05` LED8X8H / ex8X: 8x8 LED horizontal.
- `0x06` LED8X8V / ex8Y: 8x8 LED vertical.
- `0x07` GLCD_INST: graphics LCD instruction.
- `0x87` GLCD_DATA: graphics LCD data.

### Expanded ports (0xF8-0xFF)
- `0xFC` RTC: DS1302 RTC GPIO board.
- `0xFD` SDIO / spiport: SD / SPI I/O (8‑bit GPIO board).
- `0xFE` MATRIX: QWERTY keyboard matrix.
- `0xFF` SYS_CTRL / SYSCTRL: system control latch.

### SYS_CTRL bits
From DIAGs:
- `0x01` SHADOW: shadow ROM enable.
- `0x02` PROTECT: RAM write protection.
- `0x04` EXPAND: expansion memory select.
- `0x20` CAPSL: caps lock (DIAGs definition).

From MON3:
- `0x01` SHADOW
- `0x02` PROTECT
- `0x04` EXPAND
- `0x10` CART (cartridge present flag)
- `0x80` CAPSLOCK (MON3 definition)

Notes:
- DIAGs and MON3 disagree on the caps lock bit (0x20 vs 0x80). Prefer MON3 (0x80) unless schematics prove otherwise.
- MON3 `getShadow` flips the bit, implying SHADOW is active-low in the latch (on=0). Treat SHADOW as active-low unless confirmed otherwise.
- Current emulation treats PROTECT as write-block for 0x4000-0x7FFF and applies SHADOW in memory reads (0x0000-0x07FF mirrors 0xC000-0xC7FF when enabled).

### LCD row addresses
- `0x80` row 1, `0xC0` row 2, `0x94` row 3, `0xD4` row 4.

## Memory Map Constants (from DIAGs + MON3)
From DIAGs (`Diags_includes.asm`):
- `RAMST = 0x0800` (start of RAM)
- `RAMBL1 = 0x4000` (bank 1)
- `RAMEND = 0x7FFF` (end of base RAM)
- `STAKLOC = 0x4000` (top of non‑protected RAM for stack)
- `HIROM = 0xC000` (16K ROM area, bank 3)
- `HIBASE = 0x0300` (high ROM code base)

From MON3 (`mon3.z80`):
- `MON_RAM = 0x0800` (monitor RAM start)
- `STACK_SIZE = 0x80`, `STACK_TOP = MON_RAM + 0x80`
- `USER_ADDR = 0x4000` (user program start in MON3 context)
- `BASE_ADDR = 0xC000` (monitor base)

These values imply a default RAM layout of 0x0800–0x7FFF (32K), with ROM mapped at 0xC000 and shadowed into 0x0000–0x07FF.

## MON-3 API Expectations (RST 0x10)
MON-3 exposes a ROM API via `RST 10h` with the call number in `C`. This is the primary contract for ROM-aware programs, so treat it as authoritative when it conflicts with DIAG docs.

### LCD (20x4, HD44780)
- `_LCDBusy` (C=0x0C): wait until LCD is ready.
- `_stringToLCD` (C=0x0D): HL points at ASCIIZ string.
- `_charToLCD` (C=0x0E): A is the character.
- `_commandToLCD` (C=0x0F): A is the LCD command.
- `_LCDConfirm` (C=0x37): UI helper (details in MON3 API doc).

### Keypad / Matrix
- `_scanKeys` (C=0x10): generic key scan (hex pad or matrix).
- `_scanKeysWait` (C=0x11): blocking key scan.
- `_matrixScan` (C=0x12): E is key (00h-3Fh), D is modifier (FF=no key, 00=shift, 01=ctrl, 02=fn).
- `_matrixScanASCII` (C=0x35): converts matrix scan DE into ASCII.

### Serial (FTDI bit-bang)
- `_serialEnable` (C=0x14), `_serialDisable` (C=0x15).
- `_txByte` (C=0x16) and `_rxByte` (C=0x17).
- MON-3 assumes 4800-8-N-2 for bit-bang FTDI in the API doc.
- `_intelHexLoad` (C=0x18), `_sendToSerial` (C=0x19), `_receiveFromSerial` (C=0x1A).

### System Control
- `_getCaps/_setCaps/_toggleCaps` (C=0x25/0x29/0x30) expect 0x80 for caps on.
- `_getShadow/_setShadow` (C=0x26/0x2A) uses 0x01.
- `_getProtect/_setProtect` (C=0x27/0x2B) uses 0x02.
- `_getExpand/_setExpand` (C=0x28/0x2C) uses 0x04.
 - MON3 `getShadow` flips the bit (active-low) and `setShadow` treats input as on/off then inverts before writing SYS_CTRL.

## Emulation Implications
1. Memory is not flat. MMU, shadow, and write protect must be modeled.
2. LCD is primary UI; 7-seg should remain for compatibility.
3. Keypad polling should use port 0x03 bit 6 behavior (DAT-style).
4. Timing must model slow/fast clock accurately for serial and LCD updates.
5. I/O in 0xF8-0xFF range must be stubbed or implemented.

## Proposed Emulation Phases
### Phase 1: Core Memory
- Implement MMU bank mapping.
- Implement SHADOW and PROTECT behaviors.

### Phase 2: Base I/O
- Map classic ports (0x00-0x07).
- Add port 0x03 bit 6 keypress behavior.
- Stub 0xF8-0xFF with logging.

### Phase 3: LCD + 7-Seg
- Implement 20x4 LCD (HD44780 style).
- Keep 7-seg display active.

### Phase 4: Serial + Keyboard
- FTDI serial port emulation (byte-based).
- Matrix keyboard scan support.

### Phase 5: Expansion Modules (Later)
- RTC, SD, GPIO, GLCD, etc.

## Open Questions
- Exact MMU control sequencing and latch behavior (beyond SHADOW/PROTECT/EXPAND bits).
- FTDI serial port numbers/handshake behavior (documented in MON3 user guide).
- Default ROM mapping for different ROM sizes and Hi/Lo selection.
- Confirmation of CAPSLOCK bit (0x20 vs 0x80) and CART flag behavior.

## Current Decisions
- Initial target ROM: MON-3.
- DIAG ROMs will be used as a reference for diagnostics and low-level behavior.
- GLCD is deferred for v1.

## References
- TEC-1G/README.md
- TEC-1G/Documentation/Functional Description.md
