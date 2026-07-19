---
layout: default
title: 'Chapter 11 — The TEC-1G Platform'
parent: 'Part IV — Platform Runtimes'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 3
---

[← The TEC-1 Platform](10-the-tec-1-platform.md) | [Part IV](index.md)

# Chapter 11 — The TEC-1G Platform

The TEC-1G is an expanded successor to the TEC-1 with a much richer hardware set: an RGB LED matrix, a 128×64 graphics LCD (GLCD), a 4-row×20-column text LCD, a full matrix keyboard, optional TMS9918/TMS9929 video hardware, memory banking with shadow RAM, a real-time clock, and an SD card interface. The TEC-1G platform in Debug80 emulates all of these with sufficient fidelity to run the MON-3 monitor and user programs unmodified.

The platform lives in `src/platforms/tec1g/`.

---

## Module layout

The platform is split across focused modules. `runtime.ts` is now a thin facade: it re-exports `normalizeTec1gConfig` and `Tec1gState`, and exports `createTec1gRuntime()` and the `Tec1gRuntime` interface. All substantive logic lives in the files below.

| File                   | Responsibility                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `runtime.ts`           | Facade — wires the other modules together and exports the public `Tec1gRuntime` interface and `createTec1gRuntime()` factory |
| `runtime-config.ts`    | `normalizeTec1gConfig()` — applies defaults, validates bounds, and produces `Tec1gPlatformConfigNormalized`                  |
| `runtime-state.ts`     | `Tec1gState` interface definition and `createTec1gInitialState()` — the full mutable hardware state object                   |
| `io-handlers.ts`       | TEC-1G port reads/writes, seven-segment and matrix latch updates, matrix scan-cycle capture, and keyboard row reads          |
| `runtime-storage.ts`   | `createTec1gSdSpi()` — SD card image loading and file-backed persistence wiring                                              |
| `runtime-lifecycle.ts` | `silenceTec1gSpeaker()` and `resetTec1gRuntimeState()` — speaker mute and full hardware reset                                |
| `tms9918.ts`           | `createTms9918()` — TMS9918/TMS9929 VRAM, register, status-interrupt, and framebuffer model                                 |

---

## Memory layout

The TEC-1G has a richer address space than the TEC-1:

```
0x0000–0x07FF    ROM0 (2KB) — MON-3 monitor, or shadowed from 0xC000
0x0800–0x3FFF    RAM (14KB) — general purpose
0x4000–0x7FFF    RAM (16KB) — write-protectable via SYSCTRL
0x8000–0xBFFF    Expansion (16KB) — banked legacy/extended window
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

Port 0xFF bit 2 enables the expansion window at 0x8000–0xBFFF. Debug80 models two legacy 16KB expand pages plus seven additional 16KB expansion windows. The four-bit memory expansion field is decoded rather than treated as a flat bank number: bit 3 is the legacy A14 low/high page indicator, and bits 4-6 are the upper selector. Upper selector value 0 preserves legacy two-page behavior. Upper selector values 1-7 select the additional expansion windows. The banks are independent `Uint8Array` instances. The memory hooks intercept reads and writes in this range and redirect them to the decoded physical bank.

Expansion ROM images are loaded by `loadTec1gExpansionRomImage()` in `src/platforms/tec1g/tec1g-expansion-rom.ts`. Raw `.bin` files are split into up to nine fixed 16 KB banks. Legacy HEX-backed 64 KB images are still accepted, but they remain a compatibility path projected into bank 0 from `0x8000-0xBFFF` and bank 1 from the following 16 KB span. `finalizeRuntime()` copies those banks into the live runtime hook state.

---

## Platform state

`Tec1gState` in `src/platforms/tec1g/runtime-state.ts` is larger than the TEC-1 equivalent. It groups hardware into four subsystems.

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
  matrixScanCycles: Tec1gMatrixScanCycle[]; // Completed 8-row scans queued for the webview
  matrixDroppedScanCycles: number;          // Runtime-side drops after queue trimming
  matrixNextScanCycleId: number;
  matrixActiveStartCycle: number | null;
  matrixFrameStartCycle: number | null;
  matrixScanRows: Array<Tec1gMatrixScanRow | null>;
  matrixScanRowOrder: Tec1gMatrixScanRow[];
  matrixScanSeenMask: number;

  glcdCtrl: GlcdState;              // ST7920 128×64 graphics LCD
}
```

### input

```typescript
input: {
  matrixKeyStates: Uint8Array; // 16 rows × 8 columns, active-low
  matrixPendingKeyStates: Uint8Array; // Next scan image waiting for the next row-boundary commit
  matrixPendingDirty: boolean; // True while pending rows differ from the committed scan image
  matrixLastReadRow: number | null; // Last row read through port 0xFE in the current scan pass
  matrixModeEnabled: boolean;
  joystickState: number; // Active-low joystick bits merged into matrix row 3
  keyValue: number; // Hex keypad (0x7F = none)
  resetKeyValue: number | null; // One-shot Fn latch for reset-time keypad sampling
  keyReleaseEventId: number | null;
  keyUserHeld: boolean; // True while the UI or headless API still reports the key pressed
  keyHeldCode: number; // Active-low latched keypad value currently being held
  keyMinPulseDone: boolean; // Minimum tap pulse completed, release may now clear the latch
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
  sysCtrl: number; // Raw port 0xFF value
  shadowEnabled: boolean;
  protectEnabled: boolean;
  expandEnabled: boolean;
  bankA14: boolean;
  capsLock: boolean; // Bit 5 of port 0xFF
  cartridgePresent: boolean;
  gimpSignal: boolean;
}
```

There is also a `lcdCtrl` field of type `Tec1gLcdState` for the HD44780 text LCD, and a `timing` field containing `clockHz`, `updateMs`, and `yieldMs`.

---

## I/O ports

The TEC-1G maps its hardware to a richer port space:

| Port | Dir | Hardware                                           |
| ---- | --- | -------------------------------------------------- |
| 0x00 | IN  | Hex keypad value + serial RX bit                   |
| 0x01 | OUT | Digit select + speaker (bit 7) + serial TX (bit 6) |
| 0x02 | OUT | 7-segment pattern                                  |
| 0x03 | IN  | Status register (see below)                        |
| 0x04 | OUT | Text LCD command (HD44780)                         |
| 0x05 | OUT | RGB LED matrix row select                          |
| 0x06 | OUT | RGB LED matrix red latch                           |
| 0x07 | OUT | GLCD command (ST7920)                              |
| 0x84 | OUT | Text LCD data                                      |
| 0x87 | OUT | GLCD data                                          |
| 0xF8 | OUT | RGB LED matrix green latch                         |
| 0xF9 | OUT | RGB LED matrix blue latch                          |
| 0xFC | I/O | RTC (DS1302 bit-bang)                              |
| 0xFD | I/O | SD card (SPI bit-bang)                             |
| 0xBE | I/O | TMS9918/TMS9929 VRAM data port when attached       |
| 0xBF | I/O | TMS9918/TMS9929 control/status port when attached  |
| 0xFE | IN  | Matrix keyboard (row in port high byte)            |
| 0xFF | OUT | System control (shadow/protect/expand/bank/caps)   |

The **status port (0x03)** is a read-only register:

- Bit 0: Shift key active
- Bit 1: Protect enabled
- Bit 2: Expand enabled
- Bit 3: Cartridge present
- Bit 4: Any key pressed (raw)
- Bit 5: GIMP signal
- Bit 6: No key pressed (1 = idle, inverted logic)
- Bit 7: Serial RX level

### Hex keypad latch model

The TEC-1G keeps the original front-panel keypad on port `0x00`, but the runtime no longer models it as a fixed one-shot pulse. `applyKey(code, pressed?)` now supports two paths:

- The legacy single-argument call keeps the old fixed-pulse behavior for compatibility and automatically clears the latch after the minimum hold interval.
- The press/release form latches the selected key until the matching release arrives, while still enforcing the same minimum hold interval so a fast tap cannot disappear between MON-3 keypad scans.

`setKeyLatch()` writes the active-low keypad value into `input.keyValue`, updates `rawKeyActive` and `shiftKeyActive`, optionally raises the keypad NMI, and schedules a `keyReleaseEventId` timer for the minimum pulse window. When that timer fires it marks `keyMinPulseDone`. If the UI or headless caller has already released the key, the latch is cleared at that point. If the key is still held, the runtime keeps the same code in `keyValue` until a later release clears it.

This change makes MON-3's `scanKeys` polling path observe sustained front-panel input instead of a 30 ms edge only. It also means Glimmer `held` bindings can autorepeat under emulation because the keypad state remains visible for the whole press.

---

## The seven-segment display

The TEC-1G shares the same 7-segment display interface as the TEC-1 — ports 0x01 and 0x02, same bit encoding, same multiplexing scheme. The current implementation records segment duty over the scan window and sends per-segment intensities to the webview, so uneven scan timing produces visibly uneven brightness. In the TEC-1G styling, the four address digits are rendered as red LEDs and the two data digits as green LEDs, matching the hardware front panel.

---

## The RGB LED matrix

The TEC-1G has an 8×8 RGB LED matrix — 64 individually addressable LEDs, each with independent red, green, and blue channels. Three latches control the colour planes:

- **Port 0x05**: Row select — a bitmask indicating which rows to update
- **Port 0x06**: Red column data — one bit per column, 1 = illuminate
- **Port 0xF8**: Green column data
- **Port 0xF9**: Blue column data

### Row latches and scan capture

Programs drive the matrix by rapidly cycling through rows. The runtime now keeps two matrix views in parallel:

1. `ledMatrixRedRows`, `ledMatrixGreenRows`, and `ledMatrixBlueRows` hold the latest row-latch image, one byte per visible row.
2. `matrixScanCycles` records complete 8-row scans with per-row dwell timing so the webview can replay the monitor's multiplexing rhythm.

When port `0x05`, `0x06`, `0xF8`, or `0xF9` is written, `updateLedMatrixLatches()` in `src/platforms/tec1g/io-handlers.ts` first closes the previously active row, then updates the current row-select and colour latches, then rebuilds the row-mask arrays that feed the steady-state panel image.

`recordActiveMatrixRow()` snapshots the active row as `{ row, red, green, blue, dwellCycles }`. Once all eight rows have been seen in one pass, `publishMatrixScanCycle()` appends a `Tec1gMatrixScanCycle` record with `startCycle`, `endCycle`, and the eight captured row images. Repeated row visits before all eight rows have appeared reset the partial capture and begin a new scan from that row, which matches the monitor's actual scan boundary rather than synthesizing a blended frame.

The row masks keep the latest electrical latch state visible even when the monitor pauses mid-scan. The scan queue preserves the higher-frequency trace that the webview uses for exposure playback.

### Queue limits and orientation

`trimMatrixScanQueue()` caps the runtime-side backlog at 240 complete scans. If the webview falls behind, the oldest scans are dropped and `matrixDroppedScanCycles` records how many were discarded before the next update payload is sent.

On the webview side, `matrix-scan-player.ts` does not paint one active row at a time. It keeps a playhead in emulated cycle space, renders slightly behind the newest captured scan, integrates overlapping row dwell time into per-LED exposure accumulators, normalizes one clean 1/8-duty scan to full brightness, and applies a gamma curve before drawing. If the buffered emulated time grows past the configured lag budget, the player jumps the playhead forward and counts the skipped scans as playback drops.

The hardware column bits stay mirrored into visible columns at render time. The runtime stores each row as the hardware latch byte. `matrix-scan-player.ts` and the static row renderer both map hardware bit 7 to the leftmost visible LED and bit 0 to the rightmost visible LED, so the visible matrix matches the board orientation without a separate runtime-side pixel buffer.

---

## TMS9918/TMS9929 video card

Debug80 now models the TEC-Deck TMS9918/TMS9929 video card in `src/platforms/tec1g/tms9918.ts`. The runtime owns the full 16 KB VRAM image, the eight VDP registers, the status register, and a 256×192 framebuffer snapshot that is serialized into the webview update payload.

The card is gated by panel state rather than by static project configuration alone. Opening the **TMS9918 Video** accordion sends `debug80/tec1gTms9918Active`, which sets `sessionState.ui.tec1gTms9918Active` and attaches the VDP to ports `0xBE` and `0xBF`. Collapsing the accordion detaches the ports and VDP NMI source, but the runtime preserves VRAM, registers, and the latest framebuffer so reopening the panel or rehydrating the webview restores the same card state.

`debug80/tec1gTms9918VideoStandard` switches the emulated frame cadence between PAL 50 Hz and NTSC 60 Hz. This changes the VDP frame timing and status-interrupt cadence only; the port map and rendering path stay the same.

Port handling follows the hardware split:

- `OUT 0xBE` writes VRAM data
- `OUT 0xBF` writes either the VRAM address latch or a VDP register command
- `IN 0xBE` reads VRAM data
- `IN 0xBF` reads VDP status, clears the frame-interrupt flag, and deasserts the VDP NMI

The runtime advances the VDP on CPU cycle counts. Dirty video state is published on frame cadence rather than on every port write, while direct control changes that affect attachment or cadence queue an immediate UI refresh.

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

The GDRAM addressing scheme interleaves two 64-pixel wide regions horizontally. The emulated **column address** is a full 4-bit value (0–15): the **active ST7920 chip (upper vs lower 64×64)** is selected from **bit 3** of that counter, and auto-increment is capped at 0x0F per the datasheet, **not** masked to 3 bits. This matters for monitor code paths such as `clearGrLCD` that write 16 words per display row in one pass, relying on X auto-increment to walk across both chips — an earlier 3-bit column mask would leave the lower half of the display uncleared.

The webview receives the full GDRAM array and renders it as a bitmap.

---

## The matrix keyboard

The TEC-1G supports a full alphanumeric matrix keyboard in addition to the original hex keypad. The matrix has 16 rows and 8 columns. Port 0xFE returns the key state for the row specified in the high byte of the port address — the Z80's `IN r,(C)` instruction places BC on the port bus, and the high byte (B) selects the row.

`matrixKeyStates` is the committed 16-byte scan image that port `0xFE` returns, one byte per row. Each bit represents a column. The values are **active-low**: 0 means the key is pressed, 1 means released. This matches the real hardware where keys pull the line low.

`matrixPendingKeyStates` holds the next scan image while key transitions are arriving from the adapter. `applyMatrixKey()` updates this pending array and marks `matrixPendingDirty` instead of mutating the committed rows immediately.

The row select is also active-low. `decodeMatrixKeyboardRow()` in `src/platforms/tec1g/io-handlers.ts` decodes the high byte on the Z80 port bus and uses the first selected low bit as the row that `IN r,(C)` should read.

### Joystick overlay

The current codebase also overlays joystick input onto matrix row 3. `debug80/tec1gJoystick` carries a byte mask that `setJoystickState()` stores as `input.joystickState`. When `readMatrixKeyboardRow()` serves row 3, it returns `matrixValue & ~input.joystickState`, so asserted joystick bits pull the corresponding lines low in the same active-low form as the keyboard matrix.

This keeps the joystick path inside the existing scan hardware model rather than adding a separate read port. `resetTec1gRuntimeState()` clears `joystickState` on reset.

`readMatrixKeyboardRow()` commits the pending scan image only at a scan boundary: either the first matrix-row read after an idle period or when the requested row number wraps back to an earlier row than the previous read. This keeps one MON-3 scan pass internally consistent even if host input changes while the monitor is walking the matrix.

### ASCII translation

`matrixScanAscii()` in `src/platforms/tec1g/matrix-keymap.ts` converts a (key, shift, capsLock) combination to MON-3's matrix character/control code. The function:

1. Checks for special keys (arrow keys, Backspace, Tab, Enter, Escape and Space) — returns the appropriate low control/key code.
2. For letter keys, applies CAPS LOCK and Shift to determine case.
3. For digit and punctuation keys, applies Shift to select the shifted variant.

This is used by the `debug80/tec1gMatrixKey` request to translate keyboard events from the webview back into the matrix row/column positions that would produce those codes through MON-3. Ctrl-letter chords are resolved through the unmodified letter cell plus the Ctrl modifier row rather than by collapsing the payload to ASCII control codes up front. Arrow and editing keys use the same low-code convention as MON-3: Up `0x03`, Down `0x04`, Left `0x05`, Right `0x06`, Backspace `0x08`, Tab `0x09`, Enter `0x0D`, and Escape `0x1B`.

### Matrix keyboard attachment

Matrix mode (`debug80/tec1gMatrixMode`) represents the TEC-1G matrix-keyboard CONFIG input. On hardware, attaching the keyboard brings magnets near a reed switch and sets this bit. In the webview, opening the Matrix Keyboard accordion is treated as attaching the keyboard: Debug80 enables matrix mode, disables the scanned hex keypad keys and exposes a captured-versus-released host-keyboard state inside the attached panel. RESET remains active because it is a board-level reset control rather than a scanned keypad key. Closing the accordion releases any held matrix keys, disables host-keyboard capture and clears matrix mode.

The accordion open state is persisted by the webview, but MON-3 Matrix CONFIG is session runtime state. Debug80 therefore reasserts matrix mode when a debug session becomes active with the accordion already open, and again after a RESET clicked while the accordion is open. This keeps persisted UI state and runtime input routing aligned without requiring a close/reopen cycle.

The TEC-1G reset path also carries an optional reset-time Fn latch. When the user arms Fn on the hex keypad and then triggers RESET, the webview sends that `fn` flag with `debug80/tec1gReset`. The provider translates it into `holdKeyForReset(0x02)`, which loads the Fn key code into the dedicated `resetKeyValue` latch without raising keypad NMI. Port `0x00` returns that latched key once on the first post-reset keypad read, then clears it. This matches MON-3's expectation that the boot path can sample a held key during reset rather than receiving it as a later asynchronous keypad event.

The raw matrix port remains readable through port 0xFE. The MON-3 monitor uses the CONFIG bit to decide whether its monitor key scan should use the matrix keyboard as the input source. The webview sends individual key-down and key-up events as `debug80/tec1gMatrixKey` requests. The adapter expands those payloads into matrix row/column transitions, updates `matrixPendingKeyStates`, and lets the runtime publish the new scan image on the next matrix-row boundary.

While the accordion is open, pointer focus controls keyboard capture. Clicking within the emulator display, machine, or matrix-keyboard surfaces captures the host keyboard. Clicking elsewhere in the document or blurring the window releases it. The routing cue and accordion header reflect both states separately: attached means MON-3 reads the matrix keyboard, captured means the host keyboard is currently being forwarded into that matrix scan path.

The on-screen matrix keyboard maintains visible modifier state for Shift, Ctrl, Fn, Alt and CAPS LOCK. CAPS LOCK is latched. Mouse clicks on Shift, Ctrl, Fn, and Alt arm one-shot modifiers for the next non-modifier click rather than toggling a persistent state. Shifted clicks send shifted ASCII where appropriate, and Alt is sent as its own raw secondary modifier rather than being collapsed into another key state.

Physical PC keyboard events use direct keydown/keyup timing, preserve the modifier set captured at keydown for the matching keyup, and treat Ctrl-letter chords as matrix control-letter input. Raw physical `Shift`, `Control`, `Fn`, and `Alt` key events also map directly onto the matrix modifier row, so a held host modifier stays visible to MON-3 even before the primary key of a chord arrives. Meta/Command chords are ignored by the matrix input layer so host shortcuts remain host-owned. When a raw modifier is already held, the adapter suppresses the duplicate modifier cell that would otherwise be added by an ASCII combo expansion. This prevents a chord release from clearing the shared matrix cell while the raw modifier key is still down.

The adapter applies combo transitions in matrix order rather than payload order. On press, the modifier row is asserted before the primary key so MON-3 samples the chord as modified input on the first eligible scan. On release, the primary key is cleared before any synthesized modifier row is released. Plain Escape is forwarded to MON-3, while Ctrl-Escape releases host-keyboard capture without sending an Escape key to the emulated machine. Mouse-clicked matrix keys are held briefly before release so MON-3's polling loop can sample them reliably.

---

## System control (port 0xFF)

Every write to port 0xFF updates the system control register, which `decodeSysCtrl()` in `src/platforms/tec1g/sysctrl.ts` unpacks into named flags:

```
Bit 0: shadow_n  (active-low: 0 = shadow enabled)
Bit 1: protect   (1 = 0x4000–0x7FFF write-protected)
Bit 2: expand    (1 = expansion window enabled)
Bit 3: bankA14 / memory expansion bit 0
Bit 4: memory expansion bit 1
Bit 5: memory expansion bit 2
Bit 6: memory expansion bit 3
Bit 7: capsLock  (CAPS LOCK LED state)
```

The decoded state is applied to `system.shadowEnabled`, `system.protectEnabled`, etc., and to the memory hook state. `memoryExpansionBankBits` and `memoryExpansionBankValue` expose the raw four-bit field from bits 3-6, while `memoryExpansionMode`, `memoryExpansionLegacyBank`, `memoryExpansionExtendedWindow`, and `memoryExpansionPhysicalBank` expose the resolved legacy/extended decode. Subsequent memory reads and writes obey the new configuration immediately.

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

`src/platforms/tec1g/sd-spi.ts` implements a minimal SD card SPI interface on port 0xFD. Three lines are used: MOSI (bit 0), CLK (bit 1), and CS (bit 2). MISO is returned on bit 7 during reads, matching the MON-3 `in a,(SDIO)` / `rla` sampling path.

The implementation supports the SDHC-style command sequence used by monitor programs: CMD0 reset, CMD8 voltage check, CMD55/ACMD41 initialisation, CMD58 OCR, CMD16 block length, CMD13 status, CMD9 CSD, CMD10 CID, CMD17 read single block and CMD24 write single block. A backing `Uint8Array` image holds the card contents. The image is created at construction and optionally persisted via a callback.

The SPI helper keeps pending command, response and write state across short chip-select idle gaps when MON-3 briefly releases the line between byte frames. That preserves the frame-level transaction while still resetting state when there is no active transaction. This provides enough functionality for programs that write to or read from the SD card in simple block mode.

---

## Update coordination

The TEC-1G has more subsystems to keep synchronised than the TEC-1. `Tec1gUpdateController` in `src/platforms/tec1g/update-controller.ts` coordinates updates across all of them.

`buildUpdatePayload()` assembles a `Tec1gUpdatePayload` by reading from all subsystems at once:

```typescript
interface Tec1gUpdatePayload {
  digits: number[];
  matrix: number[];                  // 8 row masks for the red plane
  matrixGreen?: number[];
  matrixBlue?: number[];
  matrixScanCycles?: Tec1gMatrixScanCycle[];
  matrixDroppedScanCycles?: number;
  matrixClockHz?: number;
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

This snapshot is sent as a `debug80/tec1gUpdate` DAP event. The extension host receives it, updates its mirrored `Tec1gUiState`, and forwards the same stable row-mask fields to the webview. When the payload also carries `matrixScanCycles`, the extension host passes those transient scan records through unchanged so the webview can replay them without trying to persist them across reloads.

Speed changes propagate through the update controller: `setSpeed()` calls `setClockHz()` on the LCD, GLCD, and serial controllers, then immediately sends an update.

---

## Asset loading and runtime finalisation

The TEC-1G supports optional expansion ROM images and a ROM-first launch path. `buildLaunchSession()` now calls `buildTec1gRomArtifactsIfRequested()` before local monitor overrides or platform resolution. Active source-backed artifacts assemble with AZM, emit `.hex`, `.bin`, and `.d8.json` outputs, and then `applyTec1gRomArtifactsToLaunchArgs()` mutates the launch args so:

1. a monitor artifact becomes `tec1g.romHex`
2. an expansion artifact becomes `tec1g.expansionRomHex`
3. generated D8 maps are prepended to `debugMaps`
4. each artifact source directory is appended to `sourceRoots`

That ROM-artifact assembly path does not inherit app-scoped AZM register-contract settings. `buildTec1gRomArtifactsIfRequested()` forces `registerContracts: 'off'` and `emitRegisterReport: false` for both the HEX and BIN passes, then pads the generated monitor or expansion binary to the configured image size before launch continues.

The provider's `loadAssets()` method then reads the resolved `tec1gConfig.expansionRomHex`, parses it, and returns a `Tec1gExpansionRomImage` with its bank list, projected memory image, and boot entry.

`createTec1gPlatformProvider()` also treats an active monitor artifact as the authoritative owner of launch entry. When `args.tec1g.romArtifacts` contains an active monitor entry, `resolveEntry()` returns configured `tec1g.entry` even if the loaded expansion image carries a boot entry. Expansion ROM boot entries are used only when no active monitor artifact owns the session.

`finalizeRuntime()` runs after the Z80 runtime is created:

1. Installs the memory hooks (`createTec1gMemoryHooks()`) onto `runtime.hardware`, replacing the default `memRead` and `memWrite` with banking-aware versions.
2. Copies the expansion ROM image into the expansion banks if one was loaded.
3. Sets `system.cartridgePresent` to true only when an expansion image was loaded, which drives the `CART` status bit.

The memory hooks are set at this stage rather than at platform creation because they need a reference to the runtime's hardware — which does not exist until `createZ80Runtime()` returns.

---

## Custom DAP commands

The TEC-1G provider registers nine commands:

| Command                    | Action                                 |
| -------------------------- | -------------------------------------- |
| `debug80/tec1gKey`         | Press, hold, or release a hex keypad key |
| `debug80/tec1gMatrixKey`   | Press or release a matrix keyboard key |
| `debug80/tec1gMatrixMode`  | Enable or disable matrix keyboard mode |
| `debug80/tec1gJoystick`    | Set the active joystick overlay mask   |
| `debug80/tec1gTms9918Active` | Attach or detach the TMS9918/TMS9929 video card |
| `debug80/tec1gTms9918VideoStandard` | Switch the TMS9918/TMS9929 frame cadence |
| `debug80/tec1gReset`       | Reset CPU and platform state from the hardware reset vector while preserving MON-3 monitor RAM at `0x0800-0x0FFF` |
| `debug80/tec1gSpeed`       | Switch clock speed                     |
| `debug80/tec1gSerialInput` | Queue bytes for serial RX              |

The reset command snapshots the active MON-3 monitor RAM window at `0x0800-0x0FFF`, performs the cold runtime reset at address `0x0000`, restores that RAM range, resets TEC-1G platform state and clears the `matrixHeldKeys` map in the session. After the restore, `resetMon3PresentationState()` rewrites MON-3's CEL and MCB monitor-RAM fields so the monitor returns to its default menu presentation while still keeping the warm-boot signature and other monitor-owned RAM. When the request payload includes `{ fn: true }`, the provider also primes the runtime's reset-time key latch so MON-3 can sample Fn during its first keypad poll after reset. This preserves monitor-owned state such as MON-3 workspace data across a panel reset while restoring the board to the same reset entry and front-panel presentation that hardware uses.

`debug80/tec1gKey` accepts `{ code, pressed? }`. Omitting `pressed` takes the legacy fixed-pulse path. Sending `{ pressed: true }` latches the key as user-held until the matching `{ pressed: false }` arrives. The provider passes that flag through `handleKeyRequest()` into `runtime.applyKey(code, pressed)` and suppresses RESET handling on release, so releasing the Reset key does not trigger a second reset edge.

---

## Summary

- The TEC-1G extends the TEC-1 with memory banking (shadow ROM, write protection, expansion banks), an RGB LED matrix, a 4×20 text LCD, a 128×64 graphics LCD, a matrix keyboard, a real-time clock, and an SD card.

- Memory management is handled by hooks installed at runtime finalisation. Shadow, protect, and expansion modes are controlled by writing to port 0xFF; the hooks apply the current state on every memory access.

- The RGB LED matrix uses a staging/commit architecture. Row writes accumulate into per-channel staging buffers; when all eight rows have been written, the staging commits to the brightness arrays and a UI update fires. Partial frames flush after 40ms idle.

- The text LCD (HD44780) is larger than the TEC-1 version — four rows of twenty characters with CGRAM support. The GLCD (ST7920) provides 128×64 pixel graphics with both text and graphics modes.

- The matrix keyboard polled via port 0xFE uses active-low row selection and active-low column values, with the row selected from the high port byte. ASCII translation handles modifiers and latched CAPS LOCK.

- Serial operates at 4800 baud, bitbang. TX is decoded from port 0x01 bit 6; RX is injected at cycle-accurate timing.

- The DS1302 RTC and SPI SD card provide hardware stubs sufficient for programs that use them in basic block/byte mode. SD SPI preserves active frames across MON-3 idle gaps and supports the monitor's current SDHC initialization/status/CID/CSD/read/write command set.

- `Tec1gUpdateController` coordinates timed updates across all subsystems and assembles a single `Tec1gUpdatePayload` snapshot on each tick, sent as a `debug80/tec1gUpdate` event for the webview.

---

[← The TEC-1 Platform](10-the-tec-1-platform.md) | [Part IV](index.md)
