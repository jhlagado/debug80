# Debugger Controls and Runtime Behavior

This document describes how the Debug80 debug adapter behaves at runtime: stepping, breakpoints, pause/stop, and instruction limits.

## 1. Sources and Runtime Inputs

The debugger runs a Z80 runtime from a HEX image and uses an LST listing (plus optional `.asm` sources) to map addresses back to source files.

## 2. Breakpoints

### 2.1 Source breakpoints

Breakpoints set in `.asm` files are resolved via the source map:

1. Exact file/line matches take priority.
2. If no exact match exists, the debugger falls back to the nearest anchor at or before the requested line.

### 2.2 Listing breakpoints

Breakpoints set in `.lst` files use the existing `lineToAddress` lookup and remain supported as a fallback.

## 3. Continue, Pause, Stop

* **Continue** runs until a breakpoint, HALT, or user pause.
* **Pause** interrupts execution even in tight loops and stops at the current PC.
* **Stop** (disconnect) terminates the session.

## 4. Step In / Step Over / Step Out

### 4.1 Step In

Executes a single instruction and stops at the next PC.

### 4.2 Step Over (CALL/RST-aware)

Step Over executes one instruction. If the instruction is a taken `CALL` or `RST`, the debugger runs until the return address is reached.

Return address rules:

* `CALL nn` or conditional `CALL cc,nn`: `pc + 3`
* `RST n`: `pc + 1`

Step Over does not alter program semantics and uses opcode/flag inspection before execution to determine when a `CALL` or `RST` is taken.

### 4.3 Step Out (RET-aware)

Step Out runs until the current subroutine returns. The debugger tracks a logical call depth based on executed control-flow:

* Increment on taken `CALL` / `RST`
* Decrement on taken `RET`, `RETI`, or `RETN`

On Step Out request, the debugger captures the current depth and runs until a taken return causes the depth to drop below that baseline (or the first taken return if the baseline is zero).

This avoids guessing return addresses from raw stack memory and remains valid when routines manipulate the stack.

## 5. Step Limits

Two optional caps are supported:

* `stepOverMaxInstructions`
* `stepOutMaxInstructions`

`0` disables the cap. When a cap is reached, the debugger stops at the current PC and logs a message to the Debug Console; the session remains active for continued stepping.

## 6. Recovery and Long Loops

If a Step Over/Out does not reach its target, you can:

* Pause execution and continue manually, or
* Issue Step Over/Out again (the debugger resumes from the current PC).
