# TEC-1 Platform

This is the classic TEC-1 single-board computer with 2 KB ROM and 2 KB RAM.
Debug80 runs a bundled MON-1B ROM by default and emulates the keypad, 7-seg
display, speaker, and bitbanged serial.

## Memory map

- ROM: 0x0000–0x07ff (0–2047)
- RAM: 0x0800–0x0fff (2048–4095)
- Reset/entry: 0x0000
- User programs: see ROM-specific notes below

## Clock speeds

Debug80 exposes two modes:
- Slow: 400 kHz (default for MON-1 style timing)
- Fast: 4 MHz

The TEC-1 panel has a toggle for slow/fast.

## Ports

### Input
- `IN 0x00` (KEYBUF): keycode in lower bits, serial RX on bit 7.
  - Keycode values:
    - 0x00–0x0f: hex digits 0–F
    - 0x10: ADDRESS
    - 0x11: UP
    - 0x12: GO
    - 0x13: DOWN
  - Shift latch:
    - Bit 5 (0x20) is **high** when unshifted.
    - Bit 5 is **low** when shift is latched.
    - The shift latch clears after the next key press.
  - Bit 7 (0x80) is serial RX (DIN).

### Output
- `OUT 0x01` (SCAN): digit select + speaker + serial TX.
  - Bits 0–5: digit select (one-hot). Bit 0 is rightmost digit, bit 5 is leftmost.
  - Bit 6 (0x40): serial TX (DOUT), idle high.
  - Bit 7 (0x80): speaker.
- `OUT 0x02` (DISPLY): segment bits (latched).

### NMI
- NMI vector at 0x0066 on keypress.

## 7-seg display

6 digits are multiplexed by rapid scanning (persistence of vision). A write to
`OUT 0x01` selects which digit is active; `OUT 0x02` provides the segment pattern.

Segment bit mapping (PORTSEGS):
- 0x01 = a (top)
- 0x02 = f (upper-left)
- 0x04 = g (middle)
- 0x08 = b (upper-right)
- 0x10 = dp (decimal point)
- 0x20 = c (lower-right)
- 0x40 = e (lower-left)
- 0x80 = d (bottom)

Decimal points are used to indicate whether the address or data field is active.

## Keypad

The TEC-1 keypad is 20 keys:
- Hex digits 0–F
- ADDRESS, GO, UP, DOWN

Shift is a normal momentary push-button in hardware (not a latch). Debug80’s UI
uses a latch for convenience; it clears after the next key press.

Shift affects bit 5 in the keycode:
- Bit 5 (0x20) is **high** when unshifted.
- Bit 5 is **low** when shift is held.

## Speaker

The speaker is controlled by bit 7 on `OUT 0x01`. The ROM toggles it rapidly to
produce tones. Debug80 measures the cycles between rising edges and derives
frequency from the current clock speed.

## Serial (bitbang, always available)

TEC-1 uses a simple async serial bitbang on the keypad/display ports:

- TX (DOUT): bit 6 on `OUT 0x01` (SCAN)
- RX (DIN): bit 7 on `IN 0x00` (KEYBUF)

Debug80 only models the bitbang line for TEC-1 (no ACIA support).

Protocol details (from MINT1.2 ROM):
- Idle = high.
- Start bit = low.
- 8 data bits, LSB first.
- 2 stop bits.
- Timing derived from a software delay loop (BAUD value).

Debug80 decodes TX (bit 6) into the TEC-1 panel’s serial monitor.
This is output-only for now; RX will be wired later.

Side effect: during serial TX, the ROM writes `OUT 0x01` with only bit 6 set,
so digit scanning is paused and the display can blank. This is expected.
When writing SCAN for display, avoid toggling bit 6 to prevent spurious serial
activity.

## ROM-specific RAM usage

Not every ROM uses RAM the same way:
- MON-1: user programs typically start at 0x0800.
- Later ROMs (e.g. MON-2): user programs typically start at 0x0900 to leave
  0x0800–0x08ff for variables/workspace.
- MINT: uses RAM as data only and does not require an initial program in RAM.

In Debug80, set `appStart` per ROM so that assembled programs do not overwrite
reserved RAM.

## ROMs

Default ROM (bundled):
- `roms/tec1/mon-1b.hex`

You can override with `romHex` in the platform config.

## Debug80 config example

```json
{
  "platform": "tec1",
  "tec1": {
    "regions": [
      { "start": 0, "end": 2047, "kind": "rom" },
      { "start": 2048, "end": 4095, "kind": "ram" }
    ],
    "appStart": 2048,
    "entry": 0,
    "romHex": "roms/tec1/mon-1b.hex",
    "updateMs": 16,
    "yieldMs": 0
  }
}
```

## Where the platform lives in code

- Emulator and I/O: `src/debug/adapter.ts`
- Webview panel UI: `src/extension/extension.ts`
- Bundled ROM: `roms/tec1/mon-1b.hex`
