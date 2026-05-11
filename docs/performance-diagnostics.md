# Performance Diagnostics

Debug80 treats emulator speed and extension-host responsiveness as regression surfaces. The most
common failure mode is not one expensive operation; it is a high-frequency loop that rebuilds or
posts more data than the UI can consume.

## Enable Diagnostics

Set `DEBUG80_PERF=1` before launching the Extension Development Host. Runtime and webview
performance summaries are written to the `Debug80` output channel.

For local extension development, add the environment variable to the VS Code launch configuration or
start VS Code from a shell that already has it set.

Accepted truthy values are `1`, `true`, and `yes`.

## Runtime Signals

Runtime logs come from the debug adapter execution loop. They report:

- `instr/s`: effective Z80 instruction throughput.
- `cycles/s`: emulated Z80 cycles per second.
- `effective`: percentage of the configured platform clock rate being achieved.
- `yields/s`: how often the emulator loop yields to the extension host.
- `maxChunk`: longest execution chunk before yielding.
- `maxYieldLag`: how late the extension host resumed after a requested yield.

Warnings for long chunks or late yields point to starvation. The likely causes are excessive
instruction work before yielding, expensive runtime callbacks, or extension-host/UI work blocking the
event loop.

## Webview Signals

Webview logs come from the platform panel message boundary. They report:

- `messages/s`: all messages posted to the webview.
- `updates/s`: platform display update messages.
- `snapshots/s`: CPU/register/memory snapshot messages.
- `serial/s`: terminal or serial text messages.
- `avgPayload` and `maxPayload`: approximate JSON payload sizes.

Large payload warnings usually mean a memory/register snapshot or display update is carrying more
state than expected. High message rates usually mean refresh cadence or panel visibility state is
wrong.

## Investigation Checklist

When the emulator feels slow or `Code Helper (Plugin)` consumes unusually high CPU:

1. Enable `DEBUG80_PERF=1` and reproduce with the same project and visible panels.
2. Check whether runtime `maxYieldLag` is high. If yes, the extension host is not getting time back
   promptly.
3. Check whether `updates/s` or `snapshots/s` is unexpectedly high. If yes, inspect panel refresh
   state and webview message generation.
4. Collapse Registers and Memory, then compare webview `snapshots/s`. Snapshot traffic should drop
   when those panels are closed.
5. Compare TEC-1G display-heavy programs with simpler targets. If only display-heavy programs slow
   down, audit display update callbacks and renderer invalidation before changing CPU timing.

Do not optimize hardware display scan semantics casually. TEC-1G 8x8 and 7-segment displays rely on
intentional persistence-of-vision behavior in the emulator/UI boundary.
