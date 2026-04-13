[← The TEC-1 Platform](10-the-tec-1-platform.md) | [Part IV](README.md)

# Chapter 11 — The TEC-1G Platform

The TEC-1G is an expanded successor to the TEC-1 with a much richer hardware set: an RGB LED matrix, a 128×64 graphics LCD (GLCD), a 4-row×20-column text LCD, a full matrix keyboard, memory banking with shadow RAM, a real-time clock, and an SD card interface. The TEC-1G platform in debug80 emulates all of these with sufficient fidelity to run the MON-3 monitor and user programs unmodified.

The platform lives in `src/platforms/tec1g/`.

---

## Memory layout

The TEC-1G has a richer address space than the TEC-1:

```
0x0000–0x07FF    ROM0 (2KB) — MON-3 monitor, or shadowed from 0xC000
0x0800–0x3FFF    RAM (14KB) — general purpose
0x4000–0x7FFF    RAM (16KB) — write-protectable via SYSCTRL
0x8000–0xBFFF    Expansion (16KB) — banked, two banks selectable
0xC000–0xFFFF    ROM1 (16KB) — MON-3 extended ROM
```

This map is managed dynamically by the memory hooks installed in `finalizeRuntime()`. The base 64KB array holds the static image; the hooks intercept every read and write to apply the current banking state.

### Shadow ROM

The TEC-1G's shadow mechanism mirrors ROM1 (0xC000–0xFFFF) into the low 2KB (0x0000–0x07FF). When shadow is enabled, reads from 0x0000–0x07FF return the byte at 0xC000 plus the same offset. Writes to 0x0000–0x07FF are ignored.

Shadow mode is the normal operating state — the MON-3 monitor runs from ROM at 0xC000+ but boots the CPU at 0x0000, relying on the shadow to provide the reset vector and initial code.

The `ensureTec1gShadowRom()` function in `src/platforms/tec1g/tec1g-shadow.ts` initialises this at launch. If ROM data exists at 0x0000 but not at 0xC000, it copies the data up and clears the low region. This handles ROM images loaded in the conventional way.

### Memory protection

Port 0xFF bit 1 enables write protection for the 0x4000–0x7FFF region. Writes to protected addresses are silently ignored. This allows the monitor to protect itself or user data from accidental overwrite.

### Expansion banking

Port 0xFF bit 2 enables the expansion window at 0x8000–0xBFFF. Two 16KB banks are available; port 0xFF bit 3 selects between them. The banks are independent `Uint8Array` instances. The memory hooks intercept reads and writes in this range and redirect them to the selected bank.

Cartridge images (loaded from `tec1gConfig.cartridgeHex`) are placed into the expansion banks during `finalizeRuntime()`.

---

## Platform state

`Tec1gState` in `src/platforms/tec1g/runtime.ts` is larger than the TEC-1 equivalent. It groups hardware into four subsystems.

### display

```typescript
display: {
  digits: number[];                 // 6 × 7-segment display values
  digitLatch: number;
  segmentLatch: number;

  // 8×8 RGB LED matrix
  ledMatrixRowLatch: number;
  ledMatrixRedLatch: number;
  ledMatrixGreenLatch: number;
  ledMatrixBlueLatch: number;
  ledMatrixRedRows: number[];       // Per-row red plane values
  ledMatrixGreenRows: number[];
  ledMatrixBlueRows: number[];
  ledMatrixBrightnessR: number[];   // 64-entry per-pixel brightness 0–255
  ledMatrixBrightnessG: number[];
  ledMatrixBrightnessB: number[];
  matrixStagingR: number[];         // Accumulation buffers (64 entries)
  matrixStagingG: number[];
  matrixStagingB: number[];
  matrixRowsVisitedMask: number;    // Bitmask of rows written this frame
  matrixLastActivityCycle: number;

  glcdCtrl: GlcdState;              // ST7920 128×64 graphics LCD
}
```

### input

```typescript
input: {
  matrixKeyStates: Uint8Array;      // 16 rows × 8 columns, active-low
  matrixModeEnabled: boolean;
  keyValue: number;                 // Hex keypad (0x7F = none)
  keyReleaseEventId: number | null;
  nmiPending: boolean;
  shiftKeyActive: boolean;
  rawKeyActive: boolean;
}
```

### audio

```typescript
audio: {
  speaker: boolean;
  speakerHz: number;
  lastEdgeCycle: number | null;
  silenceEventId: number | null;
}
```

### system

```typescript
system: {
  sysCtrl: number;            // Raw port 0xFF value
  shadowEnabled: boolean;
  protectEnabled: boolean;
  expandEnabled: boolean;
  bankA14: boolean;
  capsLock: boolean;          // Bit 5 of port 0xFF
  cartridgePresent: boolean;
  gimpSignal: boolean;
}
```

There is also a `lcdCtrl` field of type `Tec1gLcdState` for the HD44780 text LCD, and a `timing` field containing `clockHz`, `updateMs`, and `yieldMs`.

---

## I/O ports

The TEC-1G maps its hardware to a richer port space:

| Port | Dir | Hardware |
|------|-----|---------|
| 0x00 | IN  | Hex keypad value + serial RX bit |
| 0x01 | OUT | Digit select + speaker (bit 7) + serial TX (bit 6) |
| 0x02 | OUT | 7-segment pattern |
| 0x03 | IN  | Status register (see below) |
| 0x04 | OUT | Text LCD command (HD44780) |
| 0x05 | OUT | RGB LED matrix row select |
| 0x06 | OUT | RGB LED matrix red latch |
| 0x07 | OUT | GLCD command (ST7920) |
| 0x84 | OUT | Text LCD data |
| 0x87 | OUT | GLCD data |
| 0xF8 | OUT | RGB LED matrix green latch |
| 0xF9 | OUT | RGB LED matrix blue latch |
| 0xFC | I/O | RTC (DS1302 bit-bang) |
| 0xFD | I/O | SD card (SPI bit-bang) |
| 0xFE | IN  | Matrix keyboard (row in port high byte) |
| 0xFF | OUT | System control (shadow/protect/expand/bank/caps) |

The **status port (0x03)** is a read-only register:
- Bit 0: Shift key active
- Bit 1: Protect enabled
- Bit 2: Expand enabled
- Bit 3: Cartridge present
- Bit 4: Any key pressed (raw)
- Bit 5: GIMP signal
- Bit 6: No key pressed (1 = idle, inverted logic)
- Bit 7: Serial RX level

---

## The seven-segment display

The TEC-1G shares the same 7-segment display interface as the TEC-1 — ports 0x01 and 0x02, same bit encoding, same multiplexing scheme. The `updateDisplayDigits()` shared utility handles both. Display data appears in the `Tec1gUpdatePayload` alongside the RGB matrix and GLCD data.

---

## The RGB LED matrix

The TEC-1G has an 8×8 RGB LED matrix — 64 individually addressable LEDs, each with independent red, green, and blue channels. Three latches control the colour planes:

- **Port 0x05**: Row select — a bitmask indicating which rows to update
- **Port 0x06**: Red column data — one bit per column, 1 = illuminate
- **Port 0xF8**: Green column data
- **Port 0xF9**: Blue column data

### Staging and commit

Programs drive the matrix by rapidly cycling through rows (multiplexing). The emulator cannot snapshot a single write — it needs to accumulate the full frame across all eight row-writes before displaying a stable image.

When port 0x05 or any colour port is written:

1. `accumulateMatrixStagingFromRows()` runs for each selected row.
2. For each row bit set in the row latch, the current colour latches are converted to per-pixel values (0 or 255) and accumulated into the staging buffers (`matrixStagingR/G/B`).
3. `matrixRowsVisitedMask` records which rows have been written. When the mask reaches 0xFF (all eight rows written), the staging buffers are committed to the brightness arrays (`ledMatrixBrightnessR/G/B`), the visit mask is reset, and a UI update is queued.

The brightness arrays contain the final frame — 64 values per channel, ready for the webview to render.

### Idle flush

If a program updates fewer than eight rows (partial refresh), the staging never commits via the mask. An idle flush fires after `TEC1G_MATRIX_IDLE_FLUSH_MS` (40ms) with no new port writes. It commits whatever staging has accumulated, ensuring partial updates reach the display.

---

## The text LCD (HD44780, 4×20)

The TEC-1G's text LCD is larger than the TEC-1's — four rows of twenty characters rather than two rows of sixteen. Port 0x04 receives commands; port 0x84 receives character data.

The DDRAM address map:
- Row 0: 0x80–0x93 → buffer bytes 0–19
- Row 1: 0xC0–0xD3 → buffer bytes 20–39
- Row 2: 0x94–0xA7 → buffer bytes 40–59
- Row 3: 0xD4–0xE7 → buffer bytes 60–79

The controller in `src/platforms/tec1g/lcd.ts` maintains the 80-byte DDRAM buffer plus a 64-byte CGRAM for up to eight custom characters. It handles the full HD44780 command set including entry mode configuration (auto-increment, display shift), display on/off, cursor visibility, and function bits.

---

## The graphics LCD (ST7920, 128×64)

The GLCD is an ST7920 controller driving a 128×64 pixel monochrome display. Port 0x07 receives commands; port 0x87 receives data. The controller is implemented in `src/platforms/tec1g/glcd.ts`.

`GlcdState` holds:
- `gdram` — 1024 bytes of graphics data (one bit per pixel, 16 bytes per row, 64 rows)
- `ddram` — 256 bytes of text data
- Addressing registers: `addrY`, `addrX`, and bank bits
- Control flags: display on, graphics mode, extended register mode, cursor blink

The GDRAM addressing scheme interleaves two 64-pixel banks horizontally. Each DDRAM address maps to a 16-pixel wide column; the bank bit selects the left or right half. The webview receives the full GDRAM array and renders it as a bitmap.

---

## The matrix keyboard

The TEC-1G supports a full alphanumeric matrix keyboard in addition to the original hex keypad. The matrix has 16 rows and 8 columns. Port 0xFE returns the key state for the row specified in the high byte of the port address — the Z80's `IN r,(C)` instruction places BC on the port bus, and the high byte (B) selects the row.

`matrixKeyStates` is a 16-byte `Uint8Array`, one byte per row. Each bit represents a column. The values are **active-low**: 0 means the key is pressed, 1 means released. This matches the real hardware where keys pull the line low.

### ASCII translation

`matrixScanAscii()` in `src/platforms/tec1g/matrix-keymap.ts` converts a (key, shift, capsLock) combination to an ASCII character code. The function:

1. Checks for special keys (Enter, Escape, Space, Delete, function keys) — returns the appropriate control code.
2. For letter keys, applies CAPS LOCK and Shift to determine case.
3. For digit and punctuation keys, applies Shift to select the shifted variant.

This is used by the `debug80/tec1gMatrixKey` request to translate keyboard events from the webview into character codes the program can consume.

### Matrix mode

Matrix mode (`debug80/tec1gMatrixMode`) switches the keyboard input model from hex keypad (NMI-driven) to matrix keyboard (polled via port 0xFE). The MON-3 monitor polls the matrix continuously; the webview sends individual key-down and key-up events as `debug80/tec1gMatrixKey` requests, which update `matrixKeyStates` directly.

`setMatrixMode(enabled)` is also called by the webview's own controls (the on-screen keyboard toggle) and is passed through the `PlatformCommandContext` during `registerCommands()`.

---

## System control (port 0xFF)

Every write to port 0xFF updates the system control register, which `decodeSysCtrl()` in `src/platforms/tec1g/sysctrl.ts` unpacks into named flags:

```
Bit 0: shadow_n  (active-low: 0 = shadow enabled)
Bit 1: protect   (1 = 0x4000–0x7FFF write-protected)
Bit 2: expand    (1 = expansion window enabled)
Bit 3: bankA14   (selects expansion bank 0 or 1)
Bit 5: capsLock  (CAPS LOCK LED state)
```

The decoded state is applied to `system.shadowEnabled`, `system.protectEnabled`, etc., and to the memory hook state. Subsequent memory reads and writes obey the new configuration immediately.

---

## Serial communication

The TEC-1G serial interface operates at 4800 baud (slower than the TEC-1's 9600), bitbang on the same port lines. `Tec1gSerialController` in `src/platforms/tec1g/serial.ts` manages TX decoding and RX injection.

The controller architecture is the same as the TEC-1 but with a different baud rate and a different startup timing: the start-bit lead is 2× `cyclesPerBit` rather than the TEC-1's value. Both are recalculated when the clock speed changes.

Serial output bytes are delivered via the `onTec1gSerial` callback as `debug80/tec1gSerial` DAP events. Serial input is queued via `debug80/tec1gSerialInput`.

---

## The real-time clock (DS1302)

`src/platforms/tec1g/ds1302.ts` implements a minimal DS1302 real-time clock. Port 0xFC provides the bit-bang interface: CE (chip enable), CLK, and a bidirectional data line.

The class maintains 16 BCD-encoded time registers (seconds, minutes, hours, date, month, day, year, write-protect) and 32 bytes of battery-backed RAM. Reads and writes are performed by clocking individual bits. The initial time is set to a fixed value at construction.

This is enough for programs that read the RTC to display the time or schedule events, but the RTC does not advance in real time — it reflects whatever the program last wrote.

---

## The SD card (SPI bit-bang)

`src/platforms/tec1g/sd-spi.ts` implements a minimal SD card SPI interface on port 0xFD. Three lines are used: MOSI (bit 0), CLK (bit 1), and CS (bit 2). MISO is returned on reads.

The implementation supports SDHC commands sufficient for block reads and writes (CMD0 reset, CMD1 initialise, CMD17 read single block, CMD24 write single block). A backing `Uint8Array` image holds the card contents. The image is created at construction and optionally persisted via a callback.

This provides enough functionality for programs that write to or read from the SD card in simple block mode.

---

## Update coordination

The TEC-1G has more subsystems to keep synchronised than the TEC-1. `Tec1gUpdateController` in `src/platforms/tec1g/update-controller.ts` coordinates updates across all of them.

`buildUpdatePayload()` assembles a `Tec1gUpdatePayload` by reading from all subsystems at once:

```typescript
interface Tec1gUpdatePayload {
  digits: number[];
  matrixBrightnessR/G/B: number[];   // 64-entry per-channel brightness
  glcd: number[];                    // 1024-byte GDRAM
  glcdDdram: number[];
  glcdState: { displayOn, graphicsOn, cursorOn, ... };
  lcd: number[];                     // 80-character buffer
  lcdState: { displayOn, cursorOn, ... };
  lcdCgram: number[];
  speaker: number;
  speedMode: 'fast' | 'slow';
  sysCtrl: number;
  capsLock: boolean;
  bankA14: boolean;
  speakerHz?: number;
}
```

This snapshot is sent as a `debug80/tec1gUpdate` DAP event. The extension host receives it and posts it to the webview. The webview renders all subsystems from the single payload — a complete hardware state at one point in time.

Speed changes propagate through the update controller: `setSpeed()` calls `setClockHz()` on the LCD, GLCD, and serial controllers, then immediately sends an update.

---

## Asset loading and runtime finalisation

The TEC-1G supports cartridge images — additional ROM content loaded into the expansion banks. The provider's `loadAssets()` method reads `tec1gConfig.cartridgeHex`, parses it, and returns a `Tec1gCartridgeImage` with the loaded memory and entry point.

`finalizeRuntime()` runs after the Z80 runtime is created:

1. Installs the memory hooks (`createTec1gMemoryHooks()`) onto `runtime.hardware`, replacing the default `memRead` and `memWrite` with banking-aware versions.
2. Copies the cartridge image into expansion bank 1 if a cartridge was loaded.
3. Sets `system.cartridgePresent` to true, which will be reflected in the status port.

The memory hooks are set at this stage rather than at platform creation because they need a reference to the runtime's hardware — which does not exist until `createZ80Runtime()` returns.

---

## Custom DAP commands

The TEC-1G provider registers six commands:

| Command | Action |
|---------|--------|
| `debug80/tec1gKey` | Queue a hex keypad press |
| `debug80/tec1gMatrixKey` | Press or release a matrix keyboard key |
| `debug80/tec1gMatrixMode` | Enable or disable matrix keyboard mode |
| `debug80/tec1gReset` | Reset CPU and all platform state |
| `debug80/tec1gSpeed` | Switch clock speed |
| `debug80/tec1gSerialInput` | Queue bytes for serial RX |

The reset command additionally clears the `matrixHeldKeys` map in the session — this tracks which matrix keys the webview believes are held down, and it must be flushed on reset to prevent stale key state after the CPU restarts.

---

## Summary

- The TEC-1G extends the TEC-1 with memory banking (shadow ROM, write protection, expansion banks), an RGB LED matrix, a 4×20 text LCD, a 128×64 graphics LCD, a matrix keyboard, a real-time clock, and an SD card.

- Memory management is handled by hooks installed at runtime finalisation. Shadow, protect, and expansion modes are controlled by writing to port 0xFF; the hooks apply the current state on every memory access.

- The RGB LED matrix uses a staging/commit architecture. Row writes accumulate into per-channel staging buffers; when all eight rows have been written, the staging commits to the brightness arrays and a UI update fires. Partial frames flush after 40ms idle.

- The text LCD (HD44780) is larger than the TEC-1 version — four rows of twenty characters with CGRAM support. The GLCD (ST7920) provides 128×64 pixel graphics with both text and graphics modes.

- The matrix keyboard polled via port 0xFE uses active-low column values, with the row index in the high port byte. ASCII translation handles modifiers and CAPS LOCK.

- Serial operates at 4800 baud, bitbang. TX is decoded from port 0x01 bit 6; RX is injected at cycle-accurate timing.

- The DS1302 RTC and SPI SD card provide hardware stubs sufficient for programs that use them in basic block/byte mode.

- `Tec1gUpdateController` coordinates timed updates across all subsystems and assembles a single `Tec1gUpdatePayload` snapshot on each tick, sent as a `debug80/tec1gUpdate` event for the webview.

---

[← The TEC-1 Platform](10-the-tec-1-platform.md) | [Part IV](README.md)
