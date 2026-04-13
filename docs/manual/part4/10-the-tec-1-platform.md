[← The Simple Platform](09-the-simple-platform.md) | [Part IV](README.md) | [The TEC-1G Platform →](11-the-tec-1g-platform.md)

# Chapter 10 — The TEC-1 Platform

The TEC-1 is a single-board Z80 computer designed in Australia in 1983. It has a six-digit seven-segment display, a 23-key hexadecimal keypad, a single-bit speaker, a small RAM expansion, and a bitbang serial port. The TEC-1 platform in debug80 simulates all of this hardware in sufficient detail to run TEC-1 programs at timing-accurate speed.

The platform lives in `src/platforms/tec1/`.

---

## Memory layout

```
0x0000–0x07FF    ROM (2KB) — MON-1B monitor firmware
0x0800–0x0FFF    RAM (2KB) — user code and data
```

The ROM range is protected against writes. The default entry point is 0x0000 (the monitor reset vector). The application start address (for warm restarts) is 0x0800.

### The ROM

The MON-1B ROM is the original TEC-1 monitor firmware. It provides a hex entry interface, a memory scanner, simple I/O routines, and an interrupt handler. When the program counter is at the ROM entry and the user presses a key, the monitor processes it and drives the display accordingly.

The ROM source is resolved at launch: `tec1Config.romHex` points to a custom ROM file, or the bundled MON-1B HEX is used. The bundled ROM is at `extension.extensionPath/roms/tec1/mon-1b/mon-1b.hex`. The loader tries a `.bin` companion first (faster to load), falling back to Intel HEX parsing.

---

## Platform state

`Tec1State` in `src/platforms/tec1/runtime.ts` holds all hardware state for a running TEC-1 session:

```typescript
interface Tec1State {
  digits: number[];           // Current 7-segment values for 6 digits
  matrix: number[];           // LED matrix row values
  digitLatch: number;         // Port 0x01 write latch
  segmentLatch: number;       // Port 0x02 write latch
  matrixLatch: number;        // Port 0x06 write latch
  speaker: boolean;           // Speaker on/off state
  speakerHz: number;          // Last calculated speaker frequency
  lcd: number[];              // 32-byte HD44780 buffer (16×2)
  lcdAddr: number;            // Current DDRAM address
  cycleClock: CycleClock;     // Cycle-accurate event scheduler
  lastEdgeCycle: number | null;
  silenceEventId: number | null;
  keyValue: number;           // Current key (0x7F = no key)
  keyReleaseEventId: number | null;
  nmiPending: boolean;
  lastUpdateMs: number;
  pendingUpdate: boolean;
  clockHz: number;
  speedMode: Tec1SpeedMode;
  updateMs: number;
  yieldMs: number;
}
```

This object is created fresh on each session launch and reset by `Tec1Runtime.resetState()`. It is also directly referenced by the custom DAP command handlers, which need to read key state and queue serial bytes.

---

## I/O ports

The TEC-1's Z80 uses eight I/O port addresses:

| Port | Dir | Purpose |
|------|-----|---------|
| 0x00 | IN  | Keyboard scan; bit 7 = serial RX level |
| 0x01 | OUT | Digit select (bits 0–5), speaker (bit 7), serial TX (bit 6) |
| 0x02 | OUT | Segment pattern (bits 0–7, DP+ABCDEFG) |
| 0x03 | IN  | Status: bit 6 = no key pressed (1 = idle), bit 7 = serial RX |
| 0x04 | OUT | HD44780 LCD command register |
| 0x05 | OUT | LED matrix strobe (triggers row update from latch) |
| 0x06 | OUT | LED matrix row data latch |
| 0x84 | OUT | HD44780 LCD data register |

Ports 0x04, 0x05, 0x06, and 0x84 are extensions added to the TEC-1 hardware for the LED matrix and LCD. Core TEC-1 programs only use ports 0x00–0x03.

---

## The seven-segment display

The TEC-1 has six seven-segment digits. The monitor firmware drives them by multiplexing — rapidly cycling through each digit, asserting its segment pattern for a few microseconds before moving to the next.

The emulator captures this without attempting to simulate the phosphor persistence. Instead, it records each digit latch write and uses the latest value for display:

**Port 0x01 write (digit latch):**
Bits 0–5 each select one of the six digits. The currently written segment pattern (from port 0x02) is applied to each selected digit:

```
digitLatch = value
for i in 0..5:
  if digitLatch & (1 << i):
    digits[i] = segmentLatch
```

**Port 0x02 write (segment latch):**
```
segmentLatch = value
```

The segment byte encodes the seven segments and decimal point: bits 0–6 correspond to segments A–G, bit 7 is the decimal point. A 1 bit illuminates the segment.

After any digit update, a UI refresh is queued via `queueUpdate()`. The update throttle (default 16ms / 60fps) prevents sending a DAP event on every single port write.

---

## The keyboard

The TEC-1's keyboard matrix returns a key code on port 0x00. No key returns 0x7F. The monitor polls port 0x03, bit 6 to detect a keypress (bit 6 = 0 means a key is down), then reads the key code from port 0x00.

Key input in the debugger comes through the `debug80/tec1Key` custom DAP request. `applyKey(code)` in the runtime:

1. Sets `keyValue` to the key code.
2. Sets `nmiPending` to true — the TEC-1 generates an NMI on keypress, which the monitor handles.
3. Schedules a key release after `TEC_KEY_HOLD_MS` (30ms) via the cycle clock.

On release, `keyValue` returns to 0x7F.

The NMI vector is 0x0066. The tick function returns `{ nonMaskable: true }` when `nmiPending` is set, causing the Z80 runtime to trigger an NMI at the end of the current instruction.

---

## The speaker

The speaker is driven by bit 7 of port 0x01. When the program toggles this bit, the speaker toggles state. Sound is produced by square waves — the program writes 1, waits some cycles, writes 0, waits the same, repeating at the desired frequency.

The emulator does not produce audio. Instead, it measures the frequency of the square wave and reports it to the webview, which can display the frequency or render a visual representation.

When bit 7 transitions:

```
delta = currentCycle - lastEdgeCycle
speakerHz = clockHz / 2 / delta
lastEdgeCycle = currentCycle
```

The division by 2 accounts for a full cycle being two edges (one rising, one falling). After `TEC_SILENCE_CYCLES` (10,000) cycles with no edge transition, the speaker is silenced — `speakerHz` is set to 0 and the speaker state is cleared.

`silenceSpeaker()` is called on session disconnect to prevent leftover audio state.

---

## Serial communication

The TEC-1's serial interface is bit-banged on the same port as the display: bit 6 of port 0x01 is the TX line; bit 7 of port 0x00 is the RX line.

### Transmit decoding

On every write to port 0x01, the emulator extracts bit 6 and passes it to a `BitbangUartDecoder`. The decoder watches for start bits and reconstructs bytes from the bit stream at 9600 baud.

Decoded bytes are delivered via the `onSerialByte` callback registered during runtime construction. The callback routes them to the extension host as `debug80/tec1Serial` events, which the webview can display in a terminal panel.

### Receive injection

The `debug80/tec1SerialInput` custom DAP request and `Tec1Runtime.queueSerial(bytes)` schedule incoming bytes for delivery over the RX line. Bytes are queued and delivered bit-by-bit at cycle-accurate timing. The first queued byte is preceded by a dummy 0x00 byte — this primes the decoder on the program side, which often needs to read and discard a byte before the real data arrives.

The cycle timing for RX is calculated from the current clock speed:

```
cyclesPerBit = clockHz / 9600
leadCycles = 2 × cyclesPerBit  // Initial offset before first bit
```

Each bit is scheduled independently via the cycle clock. Start bit, 8 data bits, 2 stop bits — each one fires at the appropriate cycle.

---

## Speed modes

The TEC-1 platform runs in two speeds:

| Mode | Clock | Purpose |
|------|-------|---------|
| `'fast'` | 4 MHz | Original TEC-1 hardware speed |
| `'slow'` | 400 kHz | Slow motion for observing display and keyboard |

The `debug80/tec1Speed` custom DAP request triggers `runtime.setSpeed(mode)`, which updates `clockHz`, recalculates the serial bit timing, and immediately sends a UI update. The execution loop reads `clockHz` via the runtime capabilities for throttling calculations.

---

## The LCD

Some TEC-1 variants have a 16×2 HD44780-compatible LCD. The emulator models this with a 32-byte buffer and a standard HD44780 address map:

- Row 0: DDRAM addresses 0x80–0x8F → buffer bytes 0–15
- Row 1: DDRAM addresses 0xC0–0xCF → buffer bytes 16–31

Port 0x04 handles commands: clear display (0x01), return home (0x02), and DDRAM address set (0x80 | addr). Port 0x84 handles data writes — writing a character code to the current DDRAM address, then auto-incrementing.

LCD state is included in the `Tec1UpdatePayload` sent to the webview.

---

## Custom DAP commands

The TEC-1 platform registers four commands in the `PlatformRegistry` during `buildLaunchSession()`:

| Command | Action |
|---------|--------|
| `debug80/tec1Key` | Queue a key press (code in args) |
| `debug80/tec1Reset` | Reset CPU and platform state |
| `debug80/tec1Speed` | Switch between fast and slow clock |
| `debug80/tec1SerialInput` | Queue bytes for RX delivery |

These are registered by `platformProvider.registerCommands()` during the launch pipeline, after the platform provider is resolved but before the runtime is created. The handlers close over the platform runtime's methods.

---

## The update payload

After any significant hardware state change, the platform queues a UI update. The `sendUpdate()` function assembles a `Tec1UpdatePayload` and emits it as a `debug80/tec1Update` DAP event:

```typescript
interface Tec1UpdatePayload {
  digits: number[];       // 6 values, one per display digit
  matrix: number[];       // 8 row values for the LED matrix
  speaker: number;        // 0 or 1
  speedMode: 'fast' | 'slow';
  lcd: number[];          // 32 character codes
  speakerHz?: number;
}
```

The extension host receives this event and forwards it to the webview via `postMessage`. The webview renders the display, matrix, and speaker state from this snapshot. Because updates are throttled to ~60fps, even programs that write to the display every instruction produce smooth rendering.

---

## The CycleClock

`CycleClock` is the timing engine shared by both TEC-1 and TEC-1G. It maintains a monotonic cycle counter and a priority queue of scheduled callbacks. `advance(cycles)` increments the counter and fires any callbacks whose target cycle has been reached.

The runtime calls `cycleClock.advance(result.cycles)` after each instruction step. This drives:

- **Key release** — the key hold timer fires after enough cycles have elapsed for `TEC_KEY_HOLD_MS`
- **Speaker silence** — the silence event fires after `TEC_SILENCE_CYCLES` cycles without a speaker edge
- **Serial bit timing** — each RX bit is scheduled at an exact cycle offset

`scheduleAt(cycle, callback)` fires once at the target cycle. `scheduleIn(delta, callback)` fires after `delta` cycles from now. `cancel(id)` removes a pending event. The IDs are stored in state fields (`keyReleaseEventId`, `silenceEventId`) so they can be cancelled when superseded — for example, a new keypress cancels any pending key release.

---

## Shared utilities (tec-common)

The TEC-1 and TEC-1G platforms share a set of utilities in `src/platforms/tec-common/`:

- `updateDisplayDigits()` — applies the digit and segment latches to the digits array
- `calculateSpeakerFrequency()` — computes Hz from cycle delta and clock speed
- `calculateKeyHoldCycles()` — converts millisecond hold time to cycle count
- `shouldUpdate()` — checks whether the update throttle has elapsed
- `createTecSerialDecoder()` — constructs the bitbang UART decoder
- `microsecondsToClocks()` / `millisecondsToClocks()` — unit conversion helpers
- `TEC_SLOW_HZ`, `TEC_FAST_HZ`, `TEC_SILENCE_CYCLES`, `TEC_KEY_HOLD_MS` — shared constants

These are used by both platforms, keeping the implementations consistent and reducing duplication.

---

## Summary

- The TEC-1 platform emulates the original 1983 hardware: 2KB ROM (MON-1B), 2KB RAM, six 7-segment digits, 23-key hexadecimal keypad, bitbang serial, and speaker.

- I/O is port-mapped. Ports 0x00–0x03 are the core TEC-1 interface; ports 0x04–0x06 and 0x84 extend it with LCD and LED matrix support.

- The display is multiplexed — the emulator records latch writes and applies them to the digits array without simulating phosphor timing.

- Keyboard input arrives via `debug80/tec1Key`. Each key sets `nmiPending`, which triggers an NMI through the `tick()` function, causing the monitor to process the keypress.

- The speaker is frequency-measured rather than audio-produced. The emulator calculates Hz from edge timing and silences after 10,000 cycles of inactivity.

- Serial is bitbang at 9600 baud. TX is decoded from port 0x01 bit 6. RX is injected at cycle-accurate timing via the cycle clock.

- The CycleClock drives all hardware timing: key release, speaker silence, serial bit delivery.

- Updates are throttled to ~60fps. The `Tec1UpdatePayload` snapshot is forwarded by the extension host to the webview on each tick.

---

[← The Simple Platform](09-the-simple-platform.md) | [Part IV](README.md) | [The TEC-1G Platform →](11-the-tec-1g-platform.md)
