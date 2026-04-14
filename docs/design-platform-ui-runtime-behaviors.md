# Platform UI/Runtime Behavior Notes

This note captures cross-cutting behavior that is easy to miss when reading only one file at a time.
It focuses on the extension-host sidebar, TEC-1G runtime display updates, and serial pacing assumptions.

## Scope and intent

These behaviors are intentionally preserved as implementation details that shape perceived UI correctness:

- TEC-1G matrix updates favor stable full-frame commits over per-write redraws.
- Sidebar updates use session affinity guards to avoid stale cross-session updates.
- Webview rehydration is message-driven and expects full-state replay after HTML replacement.
- Serial send-file pacing is deliberately slow enough for monitor firmware input loops.

## TEC-1G matrix staging and idle flush

Source: `src/platforms/tec1g/runtime-matrix.ts`.

The TEC-1G matrix runtime does not commit brightness arrays on every port write. Instead it:

1. Stages RGB row data into temporary 64-cell buffers.
2. Tracks which row-select bits have been visited.
3. Commits to visible brightness arrays only when all rows were visited (`0xff` mask).

This avoids "partial frame" flicker during active row scanning.

To avoid stalls when firmware stops mid-scan, an idle fallback commits staged data after ~40 ms with no matrix activity (`TEC1G_MATRIX_IDLE_FLUSH_MS`). That gives roughly 25 fps worst-case UI progression while preserving the full-frame-first behavior.

## Sidebar session affinity rules

Source: `src/extension/platform-view-provider.ts`.

The provider accepts update/serial events only when `shouldAcceptSession(sessionId)` passes:

- if `sessionId` is omitted, accept (legacy/unspecified events),
- if no current session id is tracked, accept,
- otherwise require exact id match.

This is the main guard against late events from a prior debug session mutating the current in-memory UI state.

The provider still keeps parallel in-memory state for TEC-1 and TEC-1G, but only posts incremental messages for the currently active platform tab.

## Webview rehydration semantics

Sources: `src/extension/platform-view-provider.ts`, `webview/tec1/index.ts`, `webview/tec1g/index.ts`.

Rehydration is triggered whenever the webview HTML is replaced (platform switch, reveal lifecycle, initial resolve). After replacement, the host must replay state in order:

1. `projectStatus`
2. `sessionStatus`
3. full `update` snapshot (with `uiRevision`)
4. optional `uiVisibility` (TEC-1G)
5. optional `serialInit`
6. `selectTab`
7. memory refresh restart (if memory tab is active)

Important properties:

- `update` messages are treated as full-state snapshots from the host cache, not deltas.
- the webview applies a `uiRevision` monotonic guard so stale updates are ignored.
- non-`update` messages (`projectStatus`, `serial`, etc.) are not revision-gated.

## Serial send-file pacing assumptions

Source: `src/extension/platform-view-serial-actions.ts`.

`handlePlatformSerialSendFile()` intentionally sends one character at a time via DAP custom requests:

- 2 ms delay between characters,
- 10 ms delay between lines,
- `\r` appended per line.

The pacing mirrors historical terminal input expectations in monitor firmware (TEC-1 MON-1B and TEC-1G monitor flows), reducing dropped input and parsing errors during Intel HEX loads.

Operational detail:

- the handler awaits `vscode.window.withProgress(...)`, so the message-handler promise stays active until transfer completion or cancellation.
- this is intentionally synchronous from the provider perspective and affects lifecycle ordering versus fire-and-forget dispatch.

## Maintenance checklist

When changing any of these areas, verify all of the following:

- matrix updates still commit on full row coverage and idle timeout,
- session-id filtering remains in front of state mutation,
- rehydration still replays a full update snapshot before tab-specific behavior,
- serial pacing changes are tested against monitor load reliability.
