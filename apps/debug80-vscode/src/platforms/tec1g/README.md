# TEC-1G Platform (MON-3)

This is Debug80's TEC-1G platform implementation. It targets the MON-3 monitor
workflow and hardware contract. User-facing TEC-1G guidance belongs in the
external Debug80 manual at https://debug80.com/.

## Current support

- Keypad + NMI on keypress, seven-seg display, speaker.
- LCD write/read emulation (HD44780-style), including busy-flag status.
- Serial bit-bang TX/RX at 4800-8-N-2 (MON-3 timing).
- Shadow/Protect/Expand memory behavior and the 0x8000-0xBFFF expansion window.
- 8x8 RGB LED matrix output (row select + red/green/blue column latches).
- TMS9918/TMS9929 video card on fixed ports 0xBE/0xBF, attached while the
  TMS9918 Video accordion is open.
- RTC (DS1302) and SD SPI (0xFC/0xFD) when enabled in config.
- SYS_CTRL bits 3-6 decoded as the Memory Expansion bank field. Bit 3 is also
  the legacy low/high page select when the upper three bank bits are zero.

## Not yet emulated

- Per-bank expansion roles for EPROM programmer, cartridge, RAM, and shadowed
  RAM/ROM overlays.
- Cartridge boot entry uses CART flag (MON-3 style) and maps payload into expansion banks.
- SYS_INPUT bits 4 (RKEY) and 5 (GIMP): state exposed but no hardware trigger wired.
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
  - Bit 0 (0x01): Matrix CONFIG — MON-3 matrix keyboard takeover mode. The webview
    sets this while the Matrix Keyboard accordion is open, matching the hardware
    keyboard attachment reed switch.
  - Bit 1 (0x02): PROTECT — fed back from SYS_CTRL.
  - Bit 2 (0x04): EXPAND — fed back from SYS_CTRL.
  - Bit 3 (0x08): CART — cartridge present flag.
  - Bit 4 (0x10): RKEY — raw key detection (not yet emulated).
  - Bit 5 (0x20): GIMP — G.IMP diagnostic signal (not yet emulated).
  - Bit 6 (0x40): KDA — key data available, inverted (1 = no key).
  - Bit 7 (0x80): RX — serial receive (idle high).
- `IN 0x04`: LCD busy flag + address counter (HD44780 status read).
- `IN 0x84`: LCD data read (supported).
- `IN 0xBE`: TMS9918/TMS9929 VRAM data port when the Video panel is open.
- `IN 0xBF`: TMS9918/TMS9929 status port when the Video panel is open. Status reads
  clear the VDP frame interrupt flag and deassert VDP NMI.
- `IN 0xFE`: matrix keyboard rows. The raw matrix port remains readable whether
  or not MON-3 Matrix CONFIG mode is enabled.

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
- `OUT 0xBE`: TMS9918/TMS9929 VRAM data port when the Video panel is open.
- `OUT 0xBF`: TMS9918/TMS9929 command/register port when the Video panel is open.
  Debug80 intentionally does not decode 0xB0-0xBD aliases for the TEC-1G card.
- `OUT 0xFF` (SYS_CTRL): system latch (U13 74HCT273).
  - Bit 0: ~SHADOW (active low — 0 = shadow on).
  - Bit 1: PROTECT (1 = write-protect 0x4000-0x7FFF).
  - Bit 2: EXPAND (1 = expansion window at 0x8000-0xBFFF).
  - Bit 3: E_A14 / Memory Expansion bit 0.
  - Bit 4: Memory Expansion bit 1.
  - Bit 5: Memory Expansion bit 2.
  - Bit 6: Memory Expansion bit 3.
  - Bit 7: CAPSLOCK, matching MON-3's `CAPSLOCK .equ 80H`.
- `OUT 0xFC`: RTC DS1302 (bit-banged emulation).
- `OUT 0xFD`: SD card SPI (bit-banged emulation, SPI mode; read + write single block).

## Serial (bitbang)

- TX uses bit 6 on `OUT 0x01`; RX uses bit 7 on `IN 0x00` (mirrored on `IN 0x03`).
- 4800 baud, 8 data bits, no parity, 2 stop bits.
- Debug80 decodes TX into the panel serial view and can inject RX bytes.

## TMS9918/TMS9929 video

- The TMS9918 Video accordion controls whether the card is attached to the bus.
  Collapsing the panel disconnects ports 0xBE/0xBF and VDP NMI but preserves VRAM
  and register state for convenience.
- PAL 50 Hz is the default cadence. The panel can switch to NTSC 60 Hz; this
  changes only the frame/vblank cadence used for the VDP status interrupt.
- The first emulated display path targets Graphics I with sprites, including the
  four-sprites-per-scanline display limit used by Damian's TEC-1G demo.

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
- The banked window supports two legacy 16K expand pages plus seven additional
  16K expansion windows. SYS_CTRL bits 3-6 are decoded as a mode field:
  upper-three value 0 preserves legacy two-page behavior; upper-three values
  1-7 select the additional windows.

## ROMs and config

Debug80 ships a bundled MON-3 profile for scaffolded projects. New projects
record bundled asset references in `debug80.json`; launch resolves the extension
bundle directly when no workspace copy exists. You can still provide `romHex` in
the platform config to override the bundled profile or debug a custom ROM.
Use `expansionRomHex` when the project owns an optional 16K to 144K expansion ROM
for the banked 0x8000-0xBFFF window.

**Shared MON-3 settings (recommended):** Scaffolded projects record MON-3 under
a shared profile and point `tec1g.romHex` at a stable workspace-relative
override path. When the local file is absent, launch uses the bundled extension
copy. Put per-target `tec1g` fields only where a target actually differs, for
example `appStart` or `protectOnReset`.

```json
{
  "platform": "tec1g",
  "sourceRoots": ["src", "roms/tec1g/mon3"],
  "tec1g": {
    "romHex": "roms/tec1g/mon3/mon3.bin",
    "appStart": 16384,
    "entry": 0,
    "protectOnReset": false,
    "expansionBankHi": false,
    "sdEnabled": false,
    "sdHighCapacity": true,
    "sdImagePath": ""
  }
}
```

The `tec1g/custom` project kit writes project-owned paths instead of bundled
assets:

```json
{
  "platform": "tec1g",
  "profile": "custom",
  "sourceRoots": ["src", "roms/tec1g/custom"],
  "tec1g": {
    "romHex": "roms/tec1g/custom/monitor.bin",
    "expansionRomHex": "roms/tec1g/custom/expansion.bin",
    "appStart": 16384,
    "entry": 0
  }
}
```

`protectOnReset` and `expansionBankHi` correspond to CONFIG DIP switches. The
Matrix CONFIG bit is normally controlled by Matrix Keyboard panel visibility,
which models attaching or removing the keyboard.

## Panel keyboard shortcuts

Keyboard input is routed to the keypad whenever the Debug80 webview has focus
and the active element is not a native control. Click the Displays or Machine
panel to claim keypad focus for games. Project selectors, text fields, buttons,
and serial controls keep their own keyboard focus normally.

### Hex / control keys

| Key(s)           | Keypad button | Code sent |
| ---------------- | ------------- | --------- |
| `0`–`9`, `A`–`F` | Hex digit     | 0x00–0x0F |
| `Space`          | `0`           | 0x00      |
| `Tab`            | AD            | 0x13      |
| `Enter`          | GO            | 0x12      |
| `←`              | ◀ (left)      | 0x11      |
| `→`              | ▶ (right)     | 0x10      |
| `↑`              | AD            | 0x13      |
| `↓`              | GO            | 0x12      |

### Special keys

| Key            | Action                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Escape`       | Reset (clears FN latch first)                                                                                                   |
| `Shift` (hold) | FN modifier — hold while pressing another key to send that key in function mode; releasing Shift without pressing a key cancels |

### FN key behaviour

The on-screen FN button is a **latch**: click FN (it highlights), then click or
press the target key — FN unlatches automatically after one key. Using the
physical `Shift` key is equivalent: hold `Shift` + press a key.

### Focus

- The keypad auto-focuses when the panel loads.
- Click anywhere in the Displays or Machine panels to restore keypad routing
  after interacting with other controls.
- Native controls (`input`, `select`, `textarea`, `button`) keep their own
  focus normally.

## Examples

- See the separate `debug80-tec1g` repo for MON-3 example workspaces and demos.
