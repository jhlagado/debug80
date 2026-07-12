---
layout: default
title: 'Chapter 5 — Execution Control'
parent: 'Part II — The Debug Adapter'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 3
---

[← The Launch Pipeline](04-the-launch-pipeline.md) | [Part II](index.md)

# Chapter 5 — Execution Control

Once the launch pipeline finishes and the session state is populated, the debug adapter enters its steady-state loop: run the Z80 until something stops it, stop, wait for the client to ask questions, then run again. This chapter covers every piece of that loop — the execution functions, the breakpoint system, stepping commands, variable and stack trace resolution, and live memory and register writes.

---

## The execution loop

The main execution function is `runUntilStopAsync()` in `src/debug/session/runtime-control.ts`. It is the shared run-loop primitive used by Continue, Step Over, Step Out, Run to Here and other temporary run-target flows. It runs the Z80 emulator one instruction at a time until one of five conditions stops it:

1. A breakpoint whose condition passes is hit.
2. A pause is requested.
3. An extra breakpoint (step target) is reached.
4. A `halt` instruction executes.
5. An instruction limit is exceeded.

The function is `async` because it must yield to the Node.js event loop between batches of instructions — the adapter runs inline with the extension host, so a tight synchronous loop would freeze VS Code. Between each batch of 1000 instructions, `runUntilStopAsync()` awaits a minimal delay and then continues.

The loop is performance-sensitive because it shares the VS Code extension-host process with webview message handling, file watching, and DAP requests. Runtime-control centralises the common instruction loop so the stop checks, cycle accounting, speaker silence handling, entry-state capture and running/stopped events stay consistent across Continue and stepping modes. Starvation instrumentation around the chunk/yield boundary can log long synchronous chunks and excessive event-loop delay, and `DEBUG80_PERF=1` enables periodic summaries while debugging the extension. This is intended as a regression guard, not as a user-facing feature.

### The instruction chunk

Each batch processes up to 1000 instructions in a tight synchronous loop:

```typescript
const CHUNK = 1000;
while (true) {
  for (let i = 0; i < CHUNK; i++) {
    captureEntryCpuStateIfNeeded(context);
    if (context.getPauseRequested()) { ... stop ... }
    if (skipBreakpointOnce === pc) { skip, step }
    if (context.isBreakpointAddress(pc)) { ... maybe stop ... }
    if (extraBreakpoints?.has(pc)) { ... stop ... }
    const result = runtime.step({ trace });
    applyStepInfo(context, trace);
    if (result.halted) { ... stop ... }
    if (maxInstructions && executed >= maxInstructions) { ... stop ... }
  }
  // yield to event loop, apply throttle if needed
}
```

The inner loop runs at native speed — no I/O, no promises, just CPU steps. The yield happens only between chunks.

### Platform throttling

For `tec1` and `tec1g` platforms, the execution loop applies cycle-accurate timing. After each chunk, it compares the wall-clock time against the expected execution time at the platform's configured clock speed, then sleeps for the difference:

```typescript
const targetMs = (cyclesSinceThrottle / clockHz) * 1000;
const elapsed = Date.now() - lastThrottleMs;
const waitMs = targetMs - elapsed;
if (waitMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
```

This reproduces the real timing of the TEC-1's 4 MHz Z80. Without it, the platform state updates (display refreshes, speaker output) would fire at CPU speed rather than hardware speed, producing incorrect behaviour.

For platforms without a configured clock speed, the loop yields between chunks via `setImmediate()` — enough to keep VS Code responsive without adding unnecessary latency.

The chunk size is deliberately a compromise. Larger chunks improve raw emulation throughput but can starve the extension host; smaller chunks improve UI responsiveness but increase scheduling overhead. Any future tuning should be checked against both emulator speed and webview responsiveness, especially when the memory and register panels are visible.

### RuntimeControlContext

The execution loop does not receive a `SessionStateShape` directly. It receives a `RuntimeControlContext` — a set of accessor functions that read and write the relevant session state fields:

```typescript
interface RuntimeControlContext {
  getRuntime: () => Z80Runtime | undefined;
  getCallDepth: () => number;
  setCallDepth: (value: number) => void;
  getPauseRequested: () => boolean;
  setPauseRequested: (value: boolean) => void;
  getRunning: () => boolean;
  setRunning: (value: boolean) => void;
  getSkipBreakpointOnce: () => number | null;
  setSkipBreakpointOnce: (value: number | null) => void;
  getHaltNotified: () => boolean;
  setHaltNotified: (value: boolean) => void;
  setLastStopReason: (reason: StopReason) => void;
  setLastBreakpointAddress: (address: number | null) => void;
  isBreakpointAddress: (address: number | null) => boolean;
  handleHaltStop: () => void;
  sendEvent: (event: unknown) => void;
  getRuntimeCapabilities: () => RuntimeControlCapabilities | undefined;
  ...
}
```

`createRuntimeControlContext()` builds this from a `SessionStateShape` and a set of callbacks. The context is recreated each time an execution function is called — it is not stored anywhere — so it always reflects the current session state.

This indirection serves two purposes: it prevents the execution functions from taking broad dependencies on the session class, and it makes the functions testable by injecting mock accessors.

---

## Stopping and signalling

When the loop hits a stop condition, it:

1. Sets `isRunning` to false.
2. Updates `lastStopReason` and `lastBreakpointAddress`.
3. Calls `emitDebugSessionStatus(sendEvent, 'paused')` to notify the extension host.
4. Sends a `StoppedEvent` to VS Code with the stop reason.

The `emitDebugSessionStatus` call sends a custom `debug80/sessionStatus` event. This is separate from the standard DAP `StoppedEvent` — it carries the status string (`'running'` or `'paused'`) to the extension host, which uses it to update the webview UI (enabling or disabling controls).

Stop reasons map to VS Code UI labels:

| `lastStopReason` | `StoppedEvent` reason | VS Code shows          |
| ---------------- | --------------------- | ---------------------- |
| `'breakpoint'`   | `'breakpoint'`        | "Paused on Breakpoint" |
| `'step'`         | `'step'`              | "Paused"               |
| `'halt'`         | `'halt'`              | "Paused"               |
| `'entry'`        | `'entry'`             | "Paused on Entry"      |
| `'pause'`        | `'pause'`             | "Paused"               |

---

## Step Out: runUntilReturnAsync

Step Out is handled by a separate function, `runUntilReturnAsync()`. It has the same structure as `runUntilStopAsync()` but watches for a different stop condition: a `ret` instruction that brings the call depth below the baseline recorded when Step Out was requested.

```typescript
if (trace.kind === 'ret' && trace.taken) {
  if (baselineDepth === 0 || context.getCallDepth() < baselineDepth) {
    // stop here
  }
}
```

`applyStepInfo()` maintains the call depth counter throughout both execution functions:

```typescript
function applyStepInfo(context, trace) {
  if (!trace.kind || !trace.taken) return;
  if (trace.kind === 'call' || trace.kind === 'rst') {
    context.setCallDepth(context.getCallDepth() + 1);
  } else if (trace.kind === 'ret') {
    context.setCallDepth(Math.max(0, context.getCallDepth() - 1));
  }
}
```

The baseline depth is captured at the moment Step Out is requested. When `callDepth` falls below that baseline after a `ret`, execution stops. If `baselineDepth` is zero (top-level code with no active calls), any taken `ret` stops execution.

Both execution functions also check for breakpoints and pause requests during Step Out — the user can interrupt a long step-out with Pause or hit a breakpoint along the way.

The Call Stack context menu also exposes **Run to Here** for mapped stack-return frames. This is implemented as a temporary run target, not as a stack mutation: Debug80 reads the selected return address from memory, verifies that it maps to source, and runs until the PC reaches that address unless another stop condition fires first.

---

## Breakpoints

### Storage

`BreakpointManager` in `src/debug/mapping/breakpoint-manager.ts` maintains three data structures:

- **`pendingBySource`** — a `Map<string, SourceBreakpoint[]>` keyed by source file path. This holds what the user has set, before verification against the source map.
- **`active`** — a `Set<string>` of verified breakpoint keys. Plain RAM breakpoints use masked Z80 addresses, while banked TEC-1G ROM breakpoints include a physical-bank address-space prefix.
- **`conditions`** — a `Map<string, string>` of non-empty conditional breakpoint expressions keyed by the same resolved breakpoint identity.

The two-tier structure lets breakpoints persist across multiple sessions. When the user sets a breakpoint before launching, it goes into `pendingBySource`. After launch, the source maps are available and `applyAll()` can verify it.

### Verification

When breakpoints are set or when a new session launches, the manager verifies pending breakpoints against the D8 source map. The address resolution has two paths:

1. **Source map** — if the source file is a mapped source, `resolveSourceBreakpoint()` looks up the (file, line) pair in the `SourceMapIndex`.

2. **Alternate path** — if the source map lookup fails, the manager tries an alternate path form. Some assembler flows generate both `program.asm` and `program.source.asm`. The user may have either one open. The manager tries both.

```typescript
private resolveAlternateSourcePath(sourcePath: string): string | undefined {
  if (sourcePath.endsWith('.source.asm')) {
    return sourcePath.replace('.source.asm', '.asm');
  }
  if (sourcePath.endsWith('.asm')) {
    return sourcePath.replace('.asm', '.source.asm');
  }
}
```

After verification, `rebuild()` populates the `active` breakpoint-key set from all verified breakpoints and records any non-empty condition strings. The execution loop asks the runtime-control context whether the current PC should stop; the adapter first checks the active TEC-1G expansion-bank address space when the PC is inside the banked `0x8000-0xBFFF` window, then falls back to address-only matching, applies any TEC-1G shadow alias, and evaluates the matching condition if one is present.

### Conditional breakpoints

Debug80 advertises `supportsConditionalBreakpoints` during initialization, so VS Code shows its normal conditional breakpoint UI. Conditions use the same expression evaluator as the Watch panel:

```text
[PACMO_LIVES] eq 0
zero and A eq $20
([FLAGS] & $80) ne 0
PC = MainLoop
BC <> $1001
A >= $20
```

The evaluator receives the current runtime and active D8 source-map symbols. Zero is false; any non-zero value is true. If the expression is false, `shouldStopAtBreakpoint()` returns false and execution continues past the address. If the expression is true, Debug80 stops with the normal breakpoint reason.

Expression failures are deliberately treated as breakpoint hits. Debug80 writes the failure to the Debug Console and stops rather than silently running through a breakpoint the user expected to catch. This is safer during source-map staleness, typo and missing-symbol cases.

The expression language is intentionally small and Z80-focused:

- Registers include 8-bit, 16-bit and alternate sets: `A`, `F`, `AF`, `B`, `C`, `BC`, `D`, `E`, `DE`, `H`, `L`, `HL`, `IX`, `IXH`, `IXL`, `IY`, `IYH`, `IYL`, `SP`, `SPH`, `SPL`, `PC`, `I`, `R`, and the prime registers such as `AF'`.
- Flags use AZM-style names: `carry`, `zero`, `sign`, `parity`, and `halfcarry`.
- Symbols come from the active D8 source map. Address symbols evaluate to their address; value-only symbols evaluate to their value.
- `[expr]` reads one byte of emulated memory.
- Arithmetic supports `+`, `-`, `*`, `/`, `%`; bitwise operators are `&`, `|`, `^`, `~`; comparisons are `eq`, `ne`, `lt`, `le`, `gt`, `ge` and their symbolic aliases `=`, `==`, `<>`, `!=`, `<`, `<=`, `>`, `>=`; logical operators are `and`, `or`, `not`.
- Parentheses group expressions. There is no logical XOR; `^` is bitwise XOR.

### Breakpoint skip logic

When the execution loop stops at a breakpoint, pressing Continue immediately re-hits the same breakpoint. To prevent this, `updateBreakpointSkip()` is called before each Continue or Step Out:

```typescript
if (
  lastStopReason === 'breakpoint' &&
  runtime.getPC() === lastBreakpointAddress &&
  isBreakpointAddress(lastBreakpointAddress)
) {
  runState.skipBreakpointOnce = lastBreakpointAddress;
  runState.skipBreakpointAddressSpace = lastBreakpointAddressSpace;
}
```

The execution loop checks this before the normal breakpoint test:

```typescript
if (
  context.getSkipBreakpointOnce() !== null &&
  pc === context.getSkipBreakpointOnce() &&
  addressSpacesEqual(context.getAddressSpace(pc), context.getSkipBreakpointAddressSpace())
) {
  context.setSkipBreakpointOnce(null);
  context.setSkipBreakpointAddressSpace(undefined);
  // step past the instruction normally
  continue;
}
```

The address is skipped exactly once — after that step, `skipBreakpointOnce` and its optional bank address space are cleared, and the breakpoint is active again.

### Shadow RAM aliasing

The TEC-1G has shadow RAM: a copy of the low 32KB (0x0000–0x7FFF) also visible at 0x8000–0xFFFF when shadow mode is enabled. A breakpoint set in user code at address 0x1000 should also fire if the CPU executes the same code via its shadow alias at 0x9000.

`isBreakpointAddress()` in `src/debug/mapping/debug-addressing.ts` handles this:

```typescript
function isBreakpointAddress(address, options) {
  if (address === null) return false;
  const expansionAddressSpace = getTec1gExpansionAddressSpace(address, options);
  if (expansionAddressSpace && options.hasBreakpoint(address, expansionAddressSpace)) return true;
  if (options.hasBreakpoint(address)) return true;
  const shadow = getShadowAlias(address, options);
  if (shadow !== null && options.hasBreakpoint(shadow)) return true;
  return false;
}
```

`getShadowAlias()` maps 0x0000–0x7FFF to 0x8000–0xFFFF when shadow is enabled. `getTec1gExpansionAddressSpace()` separately tags PCs inside the expansion-ROM window with the active physical bank. That lets Debug80 distinguish multiple source maps that all cover the same visible `0x8000–0xBFFF` range.

Conditional breakpoint matching uses the same bank-aware identity. `findMatchedBreakpointAddress()` returns both the masked address and the resolved address space so the adapter can load the correct condition string, preserve the last-hit bank for continue-skip logic, and bind temporary run targets such as Run to Here or Step Over to the active bank.

---

## Stepping commands

### Step Over (`nextRequest`)

Step Over executes one instruction. If that instruction is a call (`CALL`, `RST`) and the call is taken, Step Over runs until the return address — it does not step into the called function.

The Z80 runtime's `step()` method returns a `StepInfo` trace object with `kind` (`'call'`, `'ret'`, `'rst'`), `taken` (whether the instruction executed), and `returnAddress` (the address after the instruction). If a taken call is detected:

```typescript
if (trace.kind && trace.taken && trace.returnAddress !== undefined) {
  runUntilStop([{ address: trace.returnAddress & ADDR_MASK }], stepOverMaxInstructions, 'step over');
  return;
}
```

`runUntilStop()` calls `runUntilStopAsync()` with the return address as an extra breakpoint. The execution loop stops when the PC reaches that address, giving the appearance of a single step over the call.

The `stepOverMaxInstructions` limit prevents infinite loops — if the called function never returns within the configured limit, execution stops with a warning message.

### Step Into (`stepInRequest`)

Step Into also executes one instruction. The difference from Step Over is how it handles calls into unmapped code.

Before stepping, `resolveUnmappedCall()` checks whether the current instruction is a call to an address that has no source mapping:

```typescript
const unmappedReturn = resolveUnmappedCall();
```

`getUnmappedCallReturnAddress()` in `src/debug/session/step-call-resolver.ts` decodes the opcode at the current PC. It handles all 16 CALL and RST variants, evaluating the condition flags to determine if the call would be taken, and reading the target address from the instruction encoding:

```
CALL nn (0xCD):  target = mem16(pc+1), return = pc+3
RST p   (0xC7…): target = opcode & 0x38, return = pc+1
CALL cc,nn:      same as CALL, but conditioned on flags
```

If the target has a source map entry (the function is in user code), the function returns `null` and the single step proceeds normally — stepping into the function. If the target is unmapped (a ROM routine, a library call, a BIOS entry), the function returns the return address, and Step Into behaves like Step Over for that call:

```typescript
if (unmappedReturn !== null && trace.kind && trace.taken) {
  runUntilStop([{ address: returnAddress & ADDR_MASK }], stepOverMaxInstructions, 'step over');
  return;
}
```

This is the mechanic that makes Step Into feel right: you step into your own code, you skip past ROM calls.

### Single step vs. ED block-repeat instructions

A normal **single-instruction** `step` executes one `execute()` in the Z80 core. A small set of **ED-prefixed** block-repeat instructions (LDIR, LDDR, CPIR, CPDR, INIR, INDR, OTIR, OTDR) re-enter the _same_ instruction while internal counters run down — a naive step would keep the stopped PC on the same **source** line for thousands of micro-iterations.

`stepRuntime` in `src/z80/runtime.ts` detects when the current instruction is one of these block-repeat opcodes and loops `execute()` until the program counter **leaves** that instruction, so a single user Step advances to the _next_ op in one visible stop. The loop has an **iteration cap** to avoid pathological hangs.

**DJNZ** is **not** included: it is a conditional branch, not a bulk data move. Step advances one DJNZ at a time. (If a future “step over inner loop” behaviour is needed for DJNZ, it would use a different mechanism, such as a temporary breakpoint on the fall-through path.)

### Pause (`pauseRequest`)

Pause sets the `pauseRequested` flag in the run state. The execution loop checks this flag at the start of each iteration:

```typescript
if (context.getPauseRequested()) {
  context.setPauseRequested(false);
  context.setRunning(false);
  // send StoppedEvent('pause')
  return;
}
```

The flag is checked before anything else — before breakpoints, before stepping — so a pause request is handled within at most CHUNK (1000) instructions of the loop's current position. The response to the pause request is sent immediately (in `pauseRequest()`), before the loop actually stops. VS Code does not wait for the program to stop before returning from the pause command.

---

## Stack trace and variables

### Stack trace

When the program is stopped, VS Code requests a stack trace. The `stackTraceRequest()` handler calls `buildStackFrames()` in `src/debug/mapping/stack-service.ts` with the current PC.

The Z80 is a single-context machine, so Debug80 cannot recover a guaranteed high-level call chain in the same way a native debugger can. It now builds a best-effort assembly call stack instead:

1. Frame 0 is the current PC, labelled with the nearest source-map symbol when one is available.
2. Up to eight following frames are read as little-endian words from the current `SP`.
3. Each stack word is treated as a possible return address. If it maps to source, Debug80 returns it as a stack frame labelled with the nearest symbol plus offset, such as `MainLoop+3`.
4. Unmapped words are labelled as raw hex and marked as likely data. Trailing likely-data entries are trimmed so normal call stacks stay compact.

This is intentionally conservative. It is a view over the Z80 stack, not proof that every word is a return address. That tradeoff is still useful for typical Debug80 programs, which are mostly register-oriented and usually keep return addresses near the top of the stack.

`resolveSourceForAddress()` tries three paths:

1. **Source map** — `findSegmentForAddress()` looks up the address in the `SourceMapIndex`. Each segment has a file and line. If found, the file is resolved to an absolute path via `resolveMappedPath()`.

2. **Address aliases** — if the direct address fails, each shadow alias is tried. A PC of 0x9042 might map to the same source line as 0x1042 if shadow RAM is active.

If neither source-map nor alias lookup resolves, Debug80 returns the best symbolic label it has, but it does not fall back to a listing file.

The resolved source path is canonicalised before being returned — platform-specific separators and case are normalised so VS Code can match the path to an open editor.

The Call Stack context menu action **Run to Here** is contributed as the VS Code command `debug80.runToSelectedStackFrame`. It sends the selected frame id to the adapter through `debug80/runToStackFrame`. The adapter accepts mapped stack-return frames only, installs the selected return address as a temporary run target, and continues until PC reaches it or another stop condition fires. It does not rewrite `SP`, `PC`, or memory.

The diagnostics mode controlled by `setDiagnosticsEnabled()` logs every resolution step — which segment was found, which path was resolved, which alias was tried — to the Debug Console. This is invaluable for debugging source map problems.

### Variables

VS Code's Variables pane is populated through two DAP requests:

**`scopesRequest`** returns the list of variable groups. Debug80 now returns a "Symbols" scope and, when the active D8 map contains value-only symbols, a "Constants" scope. Each scope has a `variablesReference` handle — an integer that VS Code sends back in the next request to identify which scope's variables it wants.

**`variablesRequest`** returns the actual variable list. `VariableService.resolveVariables()` reads active source-map symbols and the runtime memory to produce memory-backed symbol previews:

```typescript
return [
  { name: 'PACMO_LIVES', value: '0x4010 = 0x03', variablesReference: ... },
  { name: 'MainLoop', value: '0x1234 = 0xcd', variablesReference: ... },
  // constants appear in the Constants scope when the D8 map has value-only symbols
];
```

Expandable memory symbols expose conservative details: address, kind, known size, first byte, a little-endian word when size suggests it, a short byte preview, printable ASCII where available, and source location. Registers are intentionally not duplicated here; the Debug80 webview has a dedicated Registers panel that is more useful for Z80 state.

### Register editing (`setVariableRequest`)

VS Code lets debug adapters support direct variable editing. Debug80 keeps `setVariableRequest` support for register-scope handles used by its existing infrastructure, but the user-facing register workflow is the dedicated Registers panel and `debug80/registerWrite` custom request.

The writable registers are a fixed whitelist: `bc`, `de`, `hl`, `af`, `bc'`, `de'`, `hl'`, `af'`, `ix`, `iy`, `pc`, `sp`. The value is parsed as a hex string or numeric literal and decomposed into 8-bit components before writing to the CPU.

---

## Runtime memory and register writes

Two custom DAP requests modify the live CPU state during a paused session:

### `debug80/registerWrite`

`handleRegisterWriteRequest()` in `src/debug/requests/register-request.ts` validates the request and writes to a register:

1. Check runtime exists.
2. Check session is not running (register writes are only valid when paused).
3. Validate the register name against the whitelist.
4. Parse the value as a hex string.
5. Decompose into 8-bit components and write to the CPU.

The whitelist and decomposition logic mirror the `setVariableRequest` path. The two entry points — in-line Variables panel edit and custom DAP request — converge on the same CPU write primitives.

### `debug80/memoryWrite`

`handleMemoryWriteRequest()` in `src/debug/requests/memory-write.ts` writes a single byte to memory:

1. Check runtime exists.
2. Check session is not running.
3. Parse the address (accepts either a number or a hex string without `0x` prefix).
4. Parse the byte value (0x00–0xFF, maximum two hex digits).
5. Write via `runtime.hardware.memWrite()` if that function exists, or directly into `runtime.hardware.memory[]` otherwise.

The hardware abstraction at step 5 matters: some platforms provide a `memWrite` hook that enforces ROM protection (preventing writes to ROM ranges). Writing directly to the array bypasses this protection. Platforms that define ROM ranges register a `memWrite` function that enforces the read-only constraint, so the adapter respects it automatically.

---

## Entry CPU state capture

During execution, `captureEntryCpuStateIfNeeded()` is called on every step. It checks whether the current PC equals the `restartCaptureAddress` (the application start address configured for the platform), and if the `entryCpuState` has not yet been captured:

```typescript
if (getEntryCpuState() !== undefined) return;
if (runtime.getPC() !== captureAddress) return;
setEntryCpuState(runtime.captureCpuState());
```

The snapshot is taken exactly once — the first time the PC reaches the application entry point. This snapshot is used by the warm rebuild feature (`debug80/rebuildWarm`): when the user reassembles while the session is live, the new binary is loaded and the CPU state is restored to this snapshot, giving the appearance of a restart without ending the debug session.

---

## Summary

- The execution loop (`runUntilStopAsync`) runs the Z80 in chunks of 1000 instructions, yielding between chunks. It is the shared loop for Continue, stepping and temporary run targets, and it stops on breakpoints whose conditions pass, pause requests, extra breakpoints, halts and instruction limits.

- Platform throttling applies cycle-accurate timing on TEC-1 and TEC-1G platforms, sleeping between chunks to match the configured clock speed.

- Runtime performance instrumentation watches for long chunks and yield starvation. `DEBUG80_PERF=1` enables periodic diagnostic summaries during extension-host debugging.

- `RuntimeControlContext` is a set of accessor functions over `SessionStateShape`. The execution functions receive it instead of the full session, keeping their dependencies minimal.

- `BreakpointManager` maintains pending breakpoints by source file, active breakpoint keys, and conditional expressions by resolved breakpoint identity. Verification resolves source lines to Z80 addresses through the D8 source map, preserving TEC-1G expansion-bank address spaces on banked ROM segments. Shadow aliasing still ensures low-RAM breakpoints fire at both the primary and aliased addresses.

- The breakpoint-skip mechanism prevents a stopped-at-breakpoint Continue from immediately re-hitting the same address. The skip is consumed after exactly one step, and on banked TEC-1G ROM it only applies when the active physical bank still matches the one that triggered the stop.

- Step Over uses the runtime's trace output to detect taken calls, then runs to the return address as an extra breakpoint. Step Into uses opcode decoding to distinguish calls to mapped user code (step into) from calls to unmapped ROM (step over).

- Step Out runs `runUntilReturnAsync()`, which stops when a `ret` instruction brings the call depth below the baseline. The Call Stack `Run to Here` action uses a selected mapped stack-return frame as a temporary run target without rewriting `SP`, `PC`, or memory.
- The Z80 runtime can complete a single **ED** block-repeat instruction in one step (not **DJNZ**), so the debugger does not appear “stuck” on the same source line while BC runs down.

- The Variables pane is populated from active D8 source-map symbols and constants. Registers are handled by Debug80's dedicated Registers panel rather than duplicating them in Variables.

- Stack trace resolution tries source map segment lookup, TEC-1G expansion-bank-aware lookup, shadow alias lookup, and symbolic stack-return candidates read from `SP`. Diagnostics mode logs each resolution step to the Debug Console.

- Memory and register write requests are validated for runtime existence and session-paused state before modifying CPU or memory. Memory writes use the hardware `memWrite` hook, which enforces ROM protection on platforms that define it.

- `captureEntryCpuStateIfNeeded()` snapshots the CPU at the application entry point on first arrival, enabling warm rebuilds later.

---

[← The Launch Pipeline](04-the-launch-pipeline.md) | [Part II](index.md)
