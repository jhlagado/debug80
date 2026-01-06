# Simple Platform

This is the minimal ROM/RAM platform used for basic examples.

## Memory map (default)

- ROM: 0x0000–0x07ff (0–2047)
- RAM: 0x0800–0xffff (2048–65535)
- Entry: 0x0000
- User programs: 0x0900 (2304)

## I/O

The simple platform does not provide a panel UI. Optional terminal I/O can be
enabled via the `terminal` configuration:

- TX (default `0`): bytes written by the program are emitted to the Debug80 terminal output.
- RX (default `1`): bytes queued from the Debug80 terminal input.
- STATUS (default `2`): bit 0 = RX available, bit 1 = TX ready.

## Debug80 config example

```json
{
  "platform": "simple",
  "simple": {
    "regions": [
      { "start": 0, "end": 2047, "kind": "rom" },
      { "start": 2048, "end": 65535, "kind": "ram" }
    ],
    "appStart": 2304,
    "entry": 0
  }
}
```

## Where the platform lives in code

- Emulator and I/O: `src/debug/adapter.ts`
