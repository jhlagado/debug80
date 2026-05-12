# TEC-1G Platform (MON-3)

This is Debug80's TEC-1G platform implementation. It targets the MON-3 monitor
workflow and hardware contract. For full MON-3 behavior notes, see
`docs/platforms/tec1g/README.md`.

## Current support
- Keypad + NMI on keypress, seven-seg display, speaker.
- LCD write/read emulation (HD44780-style), including busy-flag status.
- Serial bit-bang TX/RX at 4800-8-N-2 (MON-3 timing).
- Shadow/Protect/Expand memory behavior and the 0x8000-0xBFFF expansion window.
- 8x8 RGB LED matrix output (row select + red/green/blue column latches).
- RTC (DS1302) and SD SPI (0xFC/0xFD) when enabled in config.

## Not yet emulated
- Cartridge boot entry uses CART flag (MON-3 style) and maps payload into expansion banks.
- SYS_CTRL bits 3-7: latched and decoded but bank switching not yet wired to memory.
- SYS_INPUT bits 0 (SKEY), 4 (RKEY), 5 (GIMP): state exposed but no hardware trigger wired.
- LCD entry mode, display on/off, cursor shift, function set, CGRAM.

## Memory map (MON-3 view)
- 0x0000-0x00FF: RAM (RST vectors).
- 0x0100-0x07FF: RAM.
- 0x0800-0x0FFF: monitor RAM.
- 0x1000-0x3FFF: RAM.
- 0x4000-0x7FFF: user RAM (protect-capable).
- 0x8000-0xBFFF: expansion window (banked).
- 0xC000-0xFFFF: ROM (MON-3).

Shadow mode maps ROM 0xC000-0xC7FF into 0x0000-0x07FF for legacy monitors.

## Clock speeds
- Slow: 400 kHz
- Fast: 4 MHz

The TEC-1G panel can switch speed modes; the serial timing assumes FAST mode.

## Ports

### Input
- `IN 0x00` (KEYBUF): keycode in lower bits, serial RX on bit 7 (idle high).
  - Keycodes: 0x00-0x0f (hex), 0x10 (▶ right), 0x11 (◀ left), 0x12 (GO), 0x13 (AD), 0x02 (FN). (ROMs may use K_PLUS/K_MINUS; keycaps are chevrons.)
- `IN 0x03` (SYS_INPUT): system flags (U18 74HCT373).
  - Bit 0 (0x01): SKEY — shift key (not yet emulated).
  - Bit 1 (0x02): PROTECT — fed back from SYS_CTRL.
  - Bit 2 (0x04): EXPAND — fed back from SYS_CTRL.
  - Bit 3 (0x08): CART — cartridge present flag.
  - Bit 4 (0x10): RKEY — raw key detection (not yet emulated).
  - Bit 5 (0x20): GIMP — G.IMP diagnostic signal (not yet emulated).
  - Bit 6 (0x40): KDA — key data available, inverted (1 = no key).
  - Bit 7 (0x80): RX — serial receive (idle high).
- `IN 0x04`: LCD busy flag + address counter (HD44780 status read).
- `IN 0x84`: LCD data read (supported).
- `IN 0xFE`: matrix keyboard rows (returns 0xFF when matrix mode is disabled).

### Output
- `OUT 0x01` (SCAN): digit select + speaker + serial TX.
  - Bits 0-5: digit select (one-hot).
  - Bit 6 (0x40): serial TX (idle high).
  - Bit 7 (0x80): speaker.
- `OUT 0x02` (SEGS): seven-seg segment data (latched).
- `OUT 0x04/0x84`: LCD instruction/data.
- `OUT 0x05`: LED matrix row select.
- `OUT 0x06`: LED matrix red columns (TEC-Expander 8x8 RGB).
- `OUT 0xF8`: LED matrix green columns.
- `OUT 0xF9`: LED matrix blue columns.
- `OUT 0x07/0x87`: GLCD instruction/data (ST7920 — text, graphics, busy flag all emulated).
- `OUT 0xFF` (SYS_CTRL): system latch (U13 74HCT273).
  - Bit 0: ~SHADOW (active low — 0 = shadow on).
  - Bit 1: PROTECT (1 = write-protect 0x4000-0x7FFF).
  - Bit 2: EXPAND (1 = expansion window at 0x8000-0xBFFF).
  - Bit 3: FF-D3 / E_A14 (expansion bank select — not yet decoded).
  - Bit 4: FF-D4 (reserved — not yet decoded).
  - Bit 5: CAPS (caps lock — not yet decoded).
  - Bits 6-7: FF-D5/FF-D6 (reserved — not yet decoded).
- `OUT 0xFC`: RTC DS1302 (bit-banged emulation).
- `OUT 0xFD`: SD card SPI (bit-banged emulation, SPI mode; read + write single block).

## Serial (bitbang)
- TX uses bit 6 on `OUT 0x01`; RX uses bit 7 on `IN 0x00` (mirrored on `IN 0x03`).
- 4800 baud, 8 data bits, no parity, 2 stop bits.
- Debug80 decodes TX into the panel serial view and can inject RX bytes.

## DIAG ROM expectations
The TEC-1G DIAG ROM exercises several device behaviors directly:
- LCD busy-flag polling: `IN 0x04` bit 7 is polled before each LCD write.
- LCD data read: after init, the DIAG checks for a space (0x20) from `IN 0x84`.
- FTDI loopback test: toggles TX on `OUT 0x01` bit 6 and expects RX state on `IN 0x03` bit 7.
- Matrix keyboard scan: reads `IN 0xFE` while varying the high address lines (A8-A15). Emulation
  should look at the full 16-bit port value, not just the low byte.
- SD card SPI: bit-banged on `OUT 0xFD` with MOSI on bit 0, CLK on bit 1, and a CS mask
  (see `Diags_sd.asm`). Reads shift the sampled input bit via `RLA`.
- RTC (DS1302): bit-banged on `OUT/IN 0xFC` with CS on bit 4 and CLK on bit 6; data is shifted out
  and read back on the data line (see `Diags_RTC.asm`).

## Shadow / Protect / Expand
- Shadow mirrors ROM into 0x0000-0x07FF for legacy monitors; writes go to RAM.
- Protect makes 0x4000-0x7FFF read-only.
- Expand exposes a banked 16K window at 0x8000-0xBFFF.

## ROMs and config
Debug80 ships a bundled MON-3 profile for scaffolded projects. New projects
record bundled asset references in `debug80.json`; launch resolves the extension
bundle directly when no workspace copy exists. You can still provide `romHex` in
the platform config (and optionally ROM listings via `extraListings`) to override
the bundled profile or debug a custom ROM.

**Shared MON-3 settings (recommended):** Put `romHex`, `entry`, and any other
fields that are the same for every build under **`debug80.json` root** `tec1g`,
not only under each `targets.<name>` entry. That way every target (ASM, ZAX,
different demos) loads the same monitor ROM without duplicating paths or
depending on merge order. Use per-target `tec1g` only for overrides (for example
`appStart`, `matrixMode`, or `extraListings`).

```json
{
  "platform": "tec1g",
  "tec1g": {
    "romHex": "../roms/tec1g/mon-3/mon-3.hex",
    "appStart": 16384,
    "entry": 0,
    "matrixMode": false,
    "protectOnReset": false,
    "expansionBankHi": false,
    "sdEnabled": false,
    "sdHighCapacity": true,
    "sdImagePath": ""
  }
}
```

`matrixMode`, `protectOnReset`, and `expansionBankHi` correspond to the CONFIG DIP
switches (keyboard mode, protect on reset, expansion bank select).

## Panel keyboard shortcuts

Keyboard input is routed to the keypad only when the keypad has focus. Click
anywhere in the UI panel (display, background, keypad area) to claim focus. A
focus ring appears around the keypad while it is active.

### Hex / control keys

| Key(s) | Keypad button | Code sent |
|--------|--------------|-----------|
| `0`–`9`, `A`–`F` | Hex digit | 0x00–0x0F |
| `Space` | `0` | 0x00 |
| `Tab` | AD | 0x13 |
| `Enter` | GO | 0x12 |
| `←` | ◀ (left) | 0x11 |
| `→` | ▶ (right) | 0x10 |
| `↑` | AD | 0x13 |
| `↓` | GO | 0x12 |

### Special keys

| Key | Action |
|-----|--------|
| `Escape` | Reset (clears FN latch first) |
| `Shift` (hold) | FN modifier — hold while pressing another key to send that key in function mode; releasing Shift without pressing a key cancels |

### FN key behaviour

The on-screen FN button is a **latch**: click FN (it highlights), then click or
press the target key — FN unlatches automatically after one key. Using the
physical `Shift` key is equivalent: hold `Shift` + press a key.

### Focus

- The keypad auto-focuses when the panel loads.
- Click anywhere in the UI tab (display, background, status area, between keys)
  to restore focus after interacting with other controls.
- Native controls (`input`, `select`, `button`) keep their own focus normally.

## Examples
- See the separate `debug80-tec1g` repo for MON-3 example workspaces and demos.
