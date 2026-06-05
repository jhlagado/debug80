---
layout: default
title: 'Appendix C — Session State Reference'
parent: 'Appendices'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 3
---

[Appendices](index.md)

# Appendix C — Session State Reference

`SessionStateShape` in `src/debug/session/session-state.ts` is the central mutable store for a debug session. One instance is created per session and reset on each launch. All adapter logic that needs to share state reads and writes it directly.

The module defines two ways to access the same data: **flat fields** and **domain views**. The flat fields (`runtime`, `mapping`, `loadedProgram`, etc.) are the original surface and remain fully accessible for compatibility inside the adapter. The five domain-view interfaces (`source`, `launch`, `runtimeState`, `platform`, `ui`) are get/set proxies built by `createSessionState()` that close over the same underlying slots. Writing to `state.source.mapping` and writing to `state.mapping` affect the same value. New code should prefer the domain views to reduce coupling to the full flat shape.

---

## Domain views

`createSessionState()` builds the five proxy objects before the final `Object.assign` that merges them with the flat backing store. The returned state object is a single reference where both the flat fields and the domain views are present simultaneously — no unsafe casts, no two-phase initialisation.

| View           | Interface              | Fields exposed                                                                                    | Flat fields aliased           |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| `source`       | `SessionSourceState`   | `mapping`, `mappingIndex`, `symbolAnchors`, `symbolList`, `sourceMapSymbols`, `sourceRoots`       | Same names on the flat object |
| `launch`       | `SessionLaunchState`   | `baseDir`, `loadedProgram`, `loadedEntry`, `restartCaptureAddress`, `entryCpuState`, `launchArgs` | Same names on the flat object |
| `runtimeState` | `SessionRuntimeState`  | `execution`                                                                                       | `runtime`                     |
| `platform`     | `SessionPlatformState` | `tec1Runtime`, `tec1gRuntime`, `platformRuntime`, `tec1gConfig`                                   | Same names on the flat object |
| `ui`           | `SessionUiState`       | `terminalState`                                                                                   | Same name on the flat object  |

Note that `runtimeState.execution` aliases the flat field `runtime` under a different name — it is the only view field that does not share its name with its backing slot.

---

## Flat field reference

The tables below list all flat fields on `SessionStateShape`, grouped by the domain view they belong to. Fields in each group are also accessible through the corresponding domain view.

### Program and artifacts (`launch` view)

| Field                   | Type                                  | Description                                                          |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `loadedProgram`         | `HexProgram \| undefined`             | Parsed Intel HEX with write ranges                                   |
| `loadedEntry`           | `number \| undefined`                 | Entry point address written by the program loader                    |
| `baseDir`               | `string`                              | Base directory for all relative path resolution                      |
| `launchArgs`            | `LaunchRequestArguments \| undefined` | Merged launch configuration as received at session start             |
| `restartCaptureAddress` | `number \| undefined`                 | If set, the run loop captures CPU state when it reaches this address |
| `entryCpuState`         | `CpuStateSnapshot \| undefined`       | Snapshot of CPU registers at program entry; used for warm restart    |

### Source and symbols (`source` view)

| Field              | Type                                       | Description                                                                                                    |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `mapping`          | `MappingParseResult \| undefined`          | Raw D8-derived source map state                                                                                |
| `mappingIndex`     | `SourceMapIndex \| undefined`              | Indexed source map used for all address↔location queries                                                       |
| `symbolAnchors`    | `SourceMapAnchor[]`                        | File-tracking anchors from the source map                                                                      |
| `symbolList`       | `Array<{ name: string; address: number }>` | Flat address-symbol table used for nearest-symbol lookups and compatibility display                            |
| `sourceMapSymbols` | `SourceMapDebugSymbol[]`                   | Active D8-backed symbols and constants used by editor features, Variables, Watches and conditional breakpoints |
| `sourceRoots`      | `string[]`                                 | Directories searched when resolving D8 source paths                                                            |

### Runtime (`runtimeState` view)

| Field     | Type                      | Description                                                             |
| --------- | ------------------------- | ----------------------------------------------------------------------- |
| `runtime` | `Z80Runtime \| undefined` | Z80 CPU emulator instance (also accessible as `runtimeState.execution`) |

### Platform-specific state (`platform` view)

| Field             | Type                                         | Description                                               |
| ----------------- | -------------------------------------------- | --------------------------------------------------------- |
| `tec1Runtime`     | `Tec1Runtime \| undefined`                   | TEC-1 hardware emulation state; set during TEC-1 launch   |
| `tec1gRuntime`    | `Tec1gRuntime \| undefined`                  | TEC-1G hardware emulation state; set during TEC-1G launch |
| `platformRuntime` | `ActivePlatformRuntime \| undefined`         | Generic handle to whichever platform is active            |
| `tec1gConfig`     | `Tec1gPlatformConfigNormalized \| undefined` | Normalised TEC-1G config snapshot                         |

### UI state (`ui` view)

| Field           | Type                         | Description                                           |
| --------------- | ---------------------------- | ----------------------------------------------------- |
| `terminalState` | `TerminalState \| undefined` | Terminal emulator state when `terminal` is configured |

---

## Execution control (`runState`)

`runState` is a nested `RunState` object reset on every launch. It is not covered by a domain view; all access is through `state.runState.*` directly.

| Field                     | Type                                                                  | Description                                                                                 |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `isRunning`               | `boolean`                                                             | `true` while the CPU is executing                                                           |
| `launchComplete`          | `boolean`                                                             | `true` after the launch pipeline finishes                                                   |
| `configurationDone`       | `boolean`                                                             | `true` after the DAP configuration phase completes                                          |
| `stopOnEntry`             | `boolean`                                                             | When `true`, halt at the entry point instead of running                                     |
| `haltNotified`            | `boolean`                                                             | `true` after the HALT StoppedEvent has been sent (prevents duplicates)                      |
| `pauseRequested`          | `boolean`                                                             | `true` when the user has clicked Pause and the run loop has not yet yielded                 |
| `lastStopReason`          | `'breakpoint' \| 'step' \| 'halt' \| 'entry' \| 'pause' \| undefined` | Reason sent with the most recent StoppedEvent                                               |
| `lastBreakpointAddress`   | `number \| null`                                                      | Address of the breakpoint that caused the last stop; `null` otherwise                       |
| `skipBreakpointOnce`      | `number \| null`                                                      | If set, the run loop skips the breakpoint at this address once (re-entry guard on Continue) |
| `callDepth`               | `number`                                                              | CALL/RET tracking counter used by step-over and step-out                                    |
| `stepOverMaxInstructions` | `number`                                                              | Instruction limit for step-over; `0` = unlimited                                            |
| `stepOutMaxInstructions`  | `number`                                                              | Instruction limit for step-out; `0` = unlimited                                             |

---

## Reset behaviour

`resetSessionState(target)` resets all flat fields by creating a fresh state object via `createSessionState()` and copying each field individually onto the existing target. The domain views are **not** reassigned — they are get/set proxies that close over the same backing slots as the flat fields, so they automatically reflect every reset value without being touched. After `resetSessionState()` returns, reading `target.source.mapping` and reading `target.mapping` both return `undefined`, because both paths read the same underlying slot.

---

[Appendices](index.md)
