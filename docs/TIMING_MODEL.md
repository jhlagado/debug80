# Timing Model (Cycle-Based)

Debug80 treats Z80 cycles as the authoritative clock for platform devices.
This keeps timing deterministic and avoids relying on wall-clock scheduling.

## Core idea

- Each instruction returns a cycle count (T-states).
- The platform receives those cycles via `recordCycles`.
- Devices schedule events in cycle time (not real time).
- UI updates are a separate presentation concern.

## Cycle clock utility

`src/platforms/cycle-clock.ts` provides a small scheduler:

```ts
const clock = new CycleClock();
clock.scheduleIn(500, () => console.log('500 cycles later'));
clock.advance(100);
clock.advance(400); // fires scheduled callback
```

Use this to drive timers, audio envelopes, and serial sampling without
`setInterval` or `setTimeout`.

## Time-series I/O pattern

Capture I/O edges with the current cycle counter:

1) CPU executes instruction and returns `cycles`.
2) Platform advances the cycle clock: `clock.advance(cycles)`.
3) Port writes update line levels (speaker, serial, GPIO).
4) Decoders consume line levels on scheduled sample points.

This approach makes timing repeatable across machines and host load.

## Bit-banged UART decoder

`src/platforms/serial/bitbang-uart.ts` provides a cycle-driven UART decoder.
It detects a start bit and samples bits in the middle of each bit period.

```ts
const clock = new CycleClock();
const uart = new BitbangUartDecoder(clock, {
  baud: 9600,
  cyclesPerSecond: 4000000,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
});

uart.setByteHandler(({ byte }) => {
  console.log('RX', byte.toString(16));
});

// Emulation loop:
clock.advance(cycles);
uart.recordLevel(lineLevel); // call whenever the line changes
```

Notes:
- The decoder is edge-triggered (start bit), then samples in cycle time.
- `cyclesPerSecond` should match the active CPU clock (slow/fast modes).
- For inverted logic, set `inverted: true`.

## UI batching

UI/webview refresh should remain throttled (e.g. 16-33 ms).
That batching is separate from cycle-accurate device timing.

## Current usage

- TEC-1 speaker timing is now driven by the cycle clock (edge timestamping +
  cycle-scheduled silence).

## Next steps

- Wire the UART decoder into TEC-1 (bit 6) or future platforms.
- Add a small ring buffer to pass decoded bytes to the webview terminal.
- Extend the same cycle-clock to SPI/shift-register peripherals.
