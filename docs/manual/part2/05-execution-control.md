[← The Launch Pipeline](04-the-launch-pipeline.md) | [Part II](README.md)

# Chapter 5 — Execution Control

Once the launch pipeline finishes and the session state is populated, the debug adapter enters its steady-state loop: run the Z80 until something stops it, stop, wait for the client to ask questions, then run again. This chapter covers every piece of that loop — the execution functions, the breakpoint system, stepping commands, variable and stack trace resolution, and live memory and register writes.

---

## The execution loop

The main execution function is `runUntilStopAsync()` in `src/debug/runtime-control.ts`. It runs the Z80 emulator one instruction at a time until one of five conditions stops it:

1. A breakpoint is hit.
2. A pause is requested.
3. An extra breakpoint (step target) is reached.
4. A `halt` instruction executes.
5. An instruction limit is exceeded.

The function is `async` because it must yield to the Node.js event loop between batches of instructions — the adapter runs inline with the extension host, so a tight synchronous loop would freeze VS Code. Between each batch of 1000 instructions, `runUntilStopAsync()` awaits a minimal delay and then continues.

### The instruction chunk

Each batch processes up to 1000 instructions in a tight synchronous loop:

```typescript
const CHUNK = 1000;
while (true) {
  for (let i = 0; i < CHUNK; i++) {
    captureEntryCpuStateIfNeeded(context);
    if (context.getPauseRequested()) { ... stop ... }
    if (skipBreakpointOnce === pc) { skip, step }
    if (context.isBreakpointAddress(pc)) { ... stop ... }
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
  await new Promise(resolve => setTimeout(resolve, waitMs));
}
```

This reproduces the real timing of the TEC-1's 4 MHz Z80. Without it, the platform state updates (display refreshes, speaker output) would fire at CPU speed rather than hardware speed, producing incorrect behaviour.

For platforms without a configured clock speed, the loop yields between chunks via `setImmediate()` — enough to keep VS Code responsive without adding unnecessary latency.

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

| `lastStopReason` | `StoppedEvent` reason | VS Code shows |
|------------------|-----------------------|---------------|
| `'breakpoint'`   | `'breakpoint'`        | "Paused on Breakpoint" |
| `'step'`         | `'step'`              | "Paused" |
| `'halt'`         | `'halt'`              | "Paused" |
| `'entry'`        | `'entry'`             | "Paused on Entry" |
| `'pause'`        | `'pause'`             | "Paused" |

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

---

## Breakpoints

### Storage

`BreakpointManager` in `src/debug/breakpoint-manager.ts` maintains two data structures:

- **`pendingBySource`** — a `Map<string, SourceBreakpoint[]>` keyed by source file path. This holds what the user has set, before verification against the source map.
- **`active`** — a `Set<number>` of verified Z80 addresses. This is what the execution loop checks.

The two-tier structure lets breakpoints persist across multiple sessions. When the user sets a breakpoint before launching, it goes into `pendingBySource`. After launch, the source maps are available and `applyAll()` can verify it.

### Verification

When breakpoints are set or when a new session launches, the manager verifies pending breakpoints against the source map. The address resolution has three paths:

1. **Listing file** — if the source file is the listing file itself, `resolveListingLineAddress()` searches the listing's `lineToAddress` table. It tries the requested line, then the next line, then scans forward for the first line at or after the target. This handles blank lines and comments that have no assembly output.

2. **Source map** — if the source file is a mapped source, `resolveSourceBreakpoint()` looks up the (file, line) pair in the `SourceMapIndex`.

3. **Alternate path** — if the source map lookup fails, the manager tries an alternate path form. The zax assembler generates two files: `program.zax` (the source) and `program.source.zax` (a preprocessed copy). The user may have either one open. The manager tries both.

```typescript
private resolveAlternateSourcePath(sourcePath: string): string | undefined {
  if (sourcePath.endsWith('.source.asm')) {
    return sourcePath.replace('.source.asm', '.asm');
  }
  if (sourcePath.endsWith('.asm')) {
    return sourcePath.replace('.asm', '.source.asm');
  }
  // similar for .zax
}
```

After verification, `rebuild()` populates the `active` address set from all verified breakpoints. This set is what the execution loop checks — one `Set.has()` call per instruction per iteration.

### Breakpoint skip logic

When the execution loop stops at a breakpoint, pressing Continue immediately re-hits the same breakpoint. To prevent this, `updateBreakpointSkip()` is called before each Continue or Step Out:

```typescript
if (lastStopReason === 'breakpoint'
    && runtime.getPC() === lastBreakpointAddress
    && isBreakpointAddress(lastBreakpointAddress)) {
  runState.skipBreakpointOnce = lastBreakpointAddress;
}
```

The execution loop checks this before the normal breakpoint test:

```typescript
if (context.getSkipBreakpointOnce() !== null
    && pc === context.getSkipBreakpointOnce()) {
  context.setSkipBreakpointOnce(null);
  // step past the instruction normally
  continue;
}
```

The address is skipped exactly once — after that step, `skipBreakpointOnce` is cleared, and the breakpoint is active again.

### Shadow RAM aliasing

The TEC-1G has shadow RAM: a copy of the low 32KB (0x0000–0x7FFF) also visible at 0x8000–0xFFFF when shadow mode is enabled. A breakpoint set in user code at address 0x1000 should also fire if the CPU executes the same code via its shadow alias at 0x9000.

`isBreakpointAddress()` in `src/debug/debug-addressing.ts` handles this:

```typescript
function isBreakpointAddress(address, options) {
  if (address === null) return false;
  if (options.hasBreakpoint(address)) return true;
  const shadow = getShadowAlias(address, options);
  if (shadow !== null && options.hasBreakpoint(shadow)) return true;
  return false;
}
```

`getShadowAlias()` maps 0x0000–0x7FFF to 0x8000–0xFFFF (when shadow is enabled), and maps 0x8000–0xFFFF back to 0x0000–0x7FFF. This is computed by `(TEC1G_SHADOW_START + address) & ADDR_MASK`.

---

## Stepping commands

### Step Over (`nextRequest`)

Step Over executes one instruction. If that instruction is a call (`CALL`, `RST`) and the call is taken, Step Over runs until the return address — it does not step into the called function.

The Z80 runtime's `step()` method returns a `StepInfo` trace object with `kind` (`'call'`, `'ret'`, `'rst'`), `taken` (whether the instruction executed), and `returnAddress` (the address after the instruction). If a taken call is detected:

```typescript
if (trace.kind && trace.taken && trace.returnAddress !== undefined) {
  runUntilStop(new Set([trace.returnAddress]), stepOverMaxInstructions, 'step over');
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

`getUnmappedCallReturnAddress()` in `src/debug/step-call-resolver.ts` decodes the opcode at the current PC. It handles all 16 CALL and RST variants, evaluating the condition flags to determine if the call would be taken, and reading the target address from the instruction encoding:

```
CALL nn (0xCD):  target = mem16(pc+1), return = pc+3
RST p   (0xC7…): target = opcode & 0x38, return = pc+1
CALL cc,nn:      same as CALL, but conditioned on flags
```

If the target has a source map entry (the function is in user code), the function returns `null` and the single step proceeds normally — stepping into the function. If the target is unmapped (a ROM routine, a library call, a BIOS entry), the function returns the return address, and Step Into behaves like Step Over for that call:

```typescript
if (unmappedReturn !== null && trace.kind && trace.taken) {
  runUntilStop(new Set([returnAddress]), stepOverMaxInstructions, 'step over');
  return;
}
```

This is the mechanic that makes Step Into feel right: you step into your own code, you skip past ROM calls.

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

When the program is stopped, VS Code requests a stack trace. The `stackTraceRequest()` handler calls `buildStackFrames()` in `src/debug/stack-service.ts` with the current PC.

The Z80 is a single-context machine — there is no reconstructed call chain. Debug80 returns a single stack frame named "main". The interesting part is resolving the source location.

`resolveSourceForAddress()` tries three paths:

1. **Source map** — `findSegmentForAddress()` looks up the address in the `SourceMapIndex`. Each segment has a file and line. If found, the file is resolved to an absolute path via `resolveMappedPath()`.

2. **Address aliases** — if the direct address fails, each shadow alias is tried. A PC of 0x9042 might map to the same source line as 0x1042 if shadow RAM is active.

3. **Fallback** — the listing file's `addressToLine` table provides a coarser mapping. If neither source map nor alias resolves, the listing gives a line number in the listing file itself.

The resolved source path is canonicalised before being returned — platform-specific separators and case are normalised so VS Code can match the path to an open editor.

The diagnostics mode controlled by `setDiagnosticsEnabled()` logs every resolution step — which segment was found, which path was resolved, which alias was tried — to the Debug Console. This is invaluable for debugging source map problems.

### Variables

VS Code's Variables pane is populated through two DAP requests:

**`scopesRequest`** returns the list of variable groups. Debug80 returns one scope: "Registers". The scope has a `variablesReference` handle — an integer that VS Code sends back in the next request to identify which scope's variables it wants.

**`variablesRequest`** returns the actual variable list. `VariableService.resolveVariables()` reads the CPU state and formats it:

```typescript
const regs = runtime.getRegisters();
const flagsByte = flagsToByte(regs.flags);
const flagsStr = flagsToString(regs.flags);

return [
  { name: 'Flags', value: flagsStr, ... },
  { name: 'PC',    value: format16(regs.pc), ... },
  { name: 'SP',    value: format16(regs.sp), ... },
  { name: 'AF',    value: format16((regs.a << 8) | flagsByte), ... },
  { name: 'BC',    value: format16((regs.b << 8) | regs.c), ... },
  // ... DE, HL, AF', BC', DE', HL', IX, IY, I, R
];
```

Register pairs are assembled from their 8-bit components. The flags are presented two ways: as the packed byte value (in the AF register) and as a human-readable string in the Flags row, with uppercase letters for set flags and lowercase for clear: `SzHpnC` means Sign set, Zero clear, Half-carry set, Parity clear, Subtract clear, Carry set.

### Register editing (`setVariableRequest`)

VS Code lets users edit variable values directly in the Variables pane. The `setVariableRequest` handler validates that the edit target is the registers scope, maps the variable name to a register key, then calls `tryWriteRegisterByKey()`.

The writable registers are a fixed whitelist: `bc`, `de`, `hl`, `bc'`, `de'`, `hl'`, `ix`, `iy`, `pc`, `sp`. Individual 8-bit registers and the flags are not writable through this interface. The value is parsed as a hex string (without `0x` prefix) and decomposed into 8-bit components before writing to the CPU.

---

## Runtime memory and register writes

Two custom DAP requests modify the live CPU state during a paused session:

### `debug80/registerWrite`

`handleRegisterWriteRequest()` in `src/debug/register-request.ts` validates the request and writes to a register:

1. Check runtime exists.
2. Check session is not running (register writes are only valid when paused).
3. Validate the register name against the whitelist.
4. Parse the value as a hex string.
5. Decompose into 8-bit components and write to the CPU.

The whitelist and decomposition logic mirror the `setVariableRequest` path. The two entry points — in-line Variables panel edit and custom DAP request — converge on the same CPU write primitives.

### `debug80/memoryWrite`

`handleMemoryWriteRequest()` in `src/debug/memory-write.ts` writes a single byte to memory:

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

- The execution loop (`runUntilStopAsync`) runs the Z80 in chunks of 1000 instructions, yielding between chunks. It stops on breakpoints, pause requests, extra breakpoints (step targets), halts, and instruction limits.

- Platform throttling applies cycle-accurate timing on TEC-1 and TEC-1G platforms, sleeping between chunks to match the configured clock speed.

- `RuntimeControlContext` is a set of accessor functions over `SessionStateShape`. The execution functions receive it instead of the full session, keeping their dependencies minimal.

- `BreakpointManager` maintains pending breakpoints by source file and active breakpoints by address. Verification resolves source lines to Z80 addresses through the listing file or source map. Shadow aliasing on TEC-1G ensures breakpoints fire at both the primary and aliased addresses.

- The breakpoint-skip mechanism prevents a stopped-at-breakpoint Continue from immediately re-hitting the same address. The skip is consumed after exactly one step.

- Step Over uses the runtime's trace output to detect taken calls, then runs to the return address as an extra breakpoint. Step Into uses opcode decoding to distinguish calls to mapped user code (step into) from calls to unmapped ROM (step over).

- Step Out runs `runUntilReturnAsync()`, which stops when a `ret` instruction brings the call depth below the baseline.

- The Variables pane is populated from the CPU state. Register pairs are assembled from 8-bit components; flags are shown as both a packed byte and a character string. Registers can be edited in-line.

- Stack trace resolution tries three paths: source map segment lookup, shadow alias lookup, and listing fallback. Diagnostics mode logs each resolution step to the Debug Console.

- Memory and register write requests are validated for runtime existence and session-paused state before modifying CPU or memory. Memory writes use the hardware `memWrite` hook, which enforces ROM protection on platforms that define it.

- `captureEntryCpuStateIfNeeded()` snapshots the CPU at the application entry point on first arrival, enabling warm rebuilds later.

---

[← The Launch Pipeline](04-the-launch-pipeline.md) | [Part II](README.md)
