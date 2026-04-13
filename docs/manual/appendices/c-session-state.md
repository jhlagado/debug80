[Appendices](README.md)

# Appendix C — Session State Reference

`SessionStateShape` in `src/debug/session-state.ts` is the central mutable store for a debug session. One instance is created per session and reset on each launch. All adapter logic that needs to share state reads and writes it directly.

---

## Program and artifacts

| Field | Type | Description |
|-------|------|-------------|
| `runtime` | `Z80Runtime \| undefined` | Z80 CPU emulator instance |
| `loadedProgram` | `HexProgram \| undefined` | Parsed Intel HEX with write ranges |
| `loadedEntry` | `number \| undefined` | Entry point address written by the program loader |
| `listing` | `ListingInfo \| undefined` | Parsed assembly listing with bidirectional line↔address maps |
| `listingPath` | `string \| undefined` | Absolute path to the listing file |
| `mapping` | `MappingParseResult \| undefined` | Raw output of the source mapper parser |
| `mappingIndex` | `SourceMapIndex \| undefined` | Indexed source map used for all address↔location queries |
| `extraListingPaths` | `string[]` | Paths of additional listings loaded alongside the main one |

---

## Symbol information

| Field | Type | Description |
|-------|------|-------------|
| `symbolAnchors` | `SourceMapAnchor[]` | File-tracking anchors from the source map |
| `symbolList` | `Array<{ name: string; address: number }>` | Flat symbol table used for variable watches and the memory inspector |
| `sourceRoots` | `string[]` | Directories searched when resolving source file paths from listing |

---

## Configuration and context

| Field | Type | Description |
|-------|------|-------------|
| `baseDir` | `string` | Base directory for all relative path resolution |
| `launchArgs` | `LaunchRequestArguments \| undefined` | Merged launch configuration as received at session start |

---

## Platform-specific state

| Field | Type | Description |
|-------|------|-------------|
| `tec1Runtime` | `Tec1Runtime \| undefined` | TEC-1 hardware emulation state; set during TEC-1 launch |
| `tec1gRuntime` | `Tec1gRuntime \| undefined` | TEC-1G hardware emulation state; set during TEC-1G launch |
| `platformRuntime` | `ActivePlatformRuntime \| undefined` | Generic handle to whichever platform is active |
| `tec1gConfig` | `Tec1gPlatformConfigNormalized \| undefined` | Normalised TEC-1G config snapshot |
| `terminalState` | `TerminalState \| undefined` | Terminal emulator state when `terminal` is configured |

---

## Execution control (`runState`)

`runState` is a nested `RunState` object reset on every launch.

| Field | Type | Description |
|-------|------|-------------|
| `isRunning` | `boolean` | `true` while the CPU is executing |
| `launchComplete` | `boolean` | `true` after the launch pipeline finishes |
| `configurationDone` | `boolean` | `true` after the DAP configuration phase completes |
| `stopOnEntry` | `boolean` | When `true`, halt at the entry point instead of running |
| `haltNotified` | `boolean` | `true` after the HALT StoppedEvent has been sent (prevents duplicates) |
| `pauseRequested` | `boolean` | `true` when the user has clicked Pause and the run loop has not yet yielded |
| `lastStopReason` | `'breakpoint' \| 'step' \| 'halt' \| 'entry' \| 'pause' \| undefined` | Reason sent with the most recent StoppedEvent |
| `lastBreakpointAddress` | `number \| null` | Address of the breakpoint that caused the last stop; `null` otherwise |
| `skipBreakpointOnce` | `number \| null` | If set, the run loop skips the breakpoint at this address once (re-entry guard on Continue) |
| `callDepth` | `number` | CALL/RET tracking counter used by step-over and step-out |
| `stepOverMaxInstructions` | `number` | Instruction limit for step-over; `0` = unlimited |
| `stepOutMaxInstructions` | `number` | Instruction limit for step-out; `0` = unlimited |

---

## CPU state capture

| Field | Type | Description |
|-------|------|-------------|
| `entryCpuState` | `CpuStateSnapshot \| undefined` | Snapshot of CPU registers at program entry; used for warm restart |
| `restartCaptureAddress` | `number \| undefined` | If set, the run loop captures CPU state when it reaches this address |

---

[Appendices](README.md)
