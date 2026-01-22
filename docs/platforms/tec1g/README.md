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
- Exact MMU control ports and bit assignments.
- LCD command/data port numbers.
- FTDI port numbers and handshake behavior.
- Default ROM mapping for different chip sizes.
- MON-3 API expectations for peripherals.

## Current Decisions
- Initial target ROM: MON-3.
- DIAG ROMs will be used as a reference for diagnostics and low-level behavior.
- GLCD is deferred for v1.

## References
- TEC-1G/README.md
- TEC-1G/Documentation/Functional Description.md
