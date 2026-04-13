[Part III](README.md) | [Instruction Decoding →](07-instruction-decoding.md)

# Chapter 6 — The Z80 Runtime

The debug adapter contains a complete Z80 emulator. It is not a library dependency — the Z80 code lives in `src/z80/` and is purpose-built for this debugger. This chapter covers the runtime interface, CPU state, the step model, the loaders, and how the emulator is wired together. Chapters 7 and 8 cover instruction decoding and the memory/I/O model in more detail.

---

## The Z80Runtime interface

The public contract of the emulator is the `Z80Runtime` interface in `src/z80/runtime.ts`:

```typescript
interface Z80Runtime {
  readonly cpu: Cpu;
  readonly hardware: HardwareContext;
  step: (options?: { trace?: StepInfo }) => RunResult;
  runUntilStop: (breakpoints: Set<number>) => RunResult;
  getRegisters: () => Cpu;
  isHalted: () => boolean;
  getPC: () => number;
  captureCpuState: () => CpuStateSnapshot;
  restoreCpuState: (snapshot: CpuStateSnapshot) => void;
  reset: (program?: HexProgram, entry?: number) => void;
}
```

Everything the rest of the adapter needs from the emulator comes through this interface. The debug adapter never reaches into the CPU internals directly — it reads registers through `getRegisters()`, drives execution through `step()`, and captures state for warm restarts through `captureCpuState()`.

The two read-only fields are public for platform code: `cpu` gives platforms direct register access for I/O handler implementations, and `hardware` gives access to the 64KB memory array and I/O dispatch.

### `step()`

The primary execution method. It executes exactly one Z80 instruction and returns a `RunResult`:

```typescript
interface RunResult {
  halted: boolean;
  pc: number;
  reason: 'halt' | 'breakpoint';
  cycles?: number;
}
```

`halted` is true if the instruction was a `halt` or if PC went out of range. `cycles` carries the T-cycle count for the instruction — the execution loop uses this for platform timing.

`step()` accepts an optional `trace` parameter:

```typescript
interface StepInfo {
  kind?: ControlFlowKind;   // 'call' | 'rst' | 'ret'
  taken: boolean;
  returnAddress?: number;
}
```

When `trace` is provided, the step function classifies the current instruction before executing it. If the instruction is a taken CALL, RST, or RET, `kind` and `returnAddress` are filled in. This information drives step-over and step-out logic in the request controller (Chapter 5).

### `captureCpuState()` and `restoreCpuState()`

These support warm restarts. `CpuStateSnapshot` contains a complete copy of all 27 CPU fields — every register, every flag, the interrupt state, and the cycle counter:

```typescript
interface CpuStateSnapshot {
  a, b, c, d, e, h, l,
  a_prime, b_prime, c_prime, d_prime, e_prime, h_prime, l_prime,
  ix, iy, i, r, sp, pc,
  flags, flags_prime,
  imode, iff1, iff2,
  halted, do_delayed_di, do_delayed_ei,
  cycle_counter
}
```

`captureCpuState()` copies all fields into a plain object. `restoreCpuState()` applies them back. The snapshot does not include memory — warm restart assumes the program is being reloaded into memory separately.

---

## The CPU state

The `Cpu` interface in `src/z80/types.ts` is the complete Z80 register set:

```typescript
interface Cpu {
  // 8-bit general registers (main bank)
  a: number;  b: number;  c: number;
  d: number;  e: number;  h: number;  l: number;

  // 8-bit general registers (shadow/alternate bank)
  a_prime: number;  b_prime: number;  c_prime: number;
  d_prime: number;  e_prime: number;  h_prime: number;  l_prime: number;

  // 16-bit index registers (stored as 16-bit values)
  ix: number;  iy: number;

  // Special registers
  i: number;       // Interrupt vector page register
  r: number;       // Memory refresh counter
  sp: number;      // Stack pointer
  pc: number;      // Program counter

  // Flags (both banks)
  flags: Flags;
  flags_prime: Flags;

  // Control state
  imode: number;        // Interrupt mode (0, 1, or 2)
  iff1: number;         // Interrupt enable flip-flop 1
  iff2: number;         // Interrupt enable flip-flop 2
  halted: boolean;      // CPU is in HALT state
  do_delayed_di: boolean;
  do_delayed_ei: boolean;
  cycle_counter: number;

  hardware?: HardwareContext;
}
```

### Register organisation

All 8-bit registers are plain JavaScript numbers. Register pairs (BC, DE, HL) are formed by combining two 8-bit fields: `(cpu.b << 8) | cpu.c` for BC, and so on. This matches how the Z80 hardware works — BC is not a separate 16-bit register, it is the concatenation of B and C.

The exceptions are the index registers: `ix` and `iy` are stored as 16-bit values rather than split into high/low bytes. They are still masked to 16 bits in all arithmetic (`& 0xffff`).

The shadow registers (`a_prime` through `l_prime` and `flags_prime`) are the alternate register bank. `EX AF,AF'` swaps A and the flags; `EXX` swaps BC, DE, and HL with their shadow counterparts. The emulator implements this by directly swapping the field values.

### The flags register

```typescript
type Flags = {
  S: number;  // Sign — bit 7 of result
  Z: number;  // Zero — result is zero
  Y: number;  // Undocumented — bit 5 of result
  H: number;  // Half-carry — carry from bit 3 to bit 4
  X: number;  // Undocumented — bit 3 of result
  P: number;  // Parity/Overflow
  N: number;  // Subtract — set after subtraction operations
  C: number;  // Carry
};
```

Each flag is a separate number field (0 or 1) rather than a packed byte. This avoids masking and shifting on every flag check. When a packed byte is needed — for the `AF` register display or for `PUSH AF` — the flags are assembled with:

```typescript
(S << 7) | (Z << 6) | (Y << 5) | (H << 4) | (X << 3) | (P << 2) | (N << 1) | C
```

The Y and X flags are "undocumented" — they copy bits 5 and 3 of the result. Most Z80 emulators ignore them; debug80 maintains them correctly because programs running on real hardware may depend on their values.

The P flag serves double duty: for logical operations (AND, OR, XOR) it holds parity (whether the number of set bits is even); for arithmetic operations (ADD, SUB, INC, DEC) it holds overflow (whether the result exceeded the signed 8-bit range).

### Control state

Three control fields manage timing and interrupt behaviour:

**`do_delayed_di` and `do_delayed_ei`**: EI and DI (enable/disable interrupts) do not take effect immediately — they take effect after the next instruction. This is a Z80 hardware detail that allows code to safely execute one instruction after enabling interrupts before the first interrupt can fire. The emulator implements this by setting these flags during the `EI`/`DI` instruction handler and applying them at the end of the next `execute()` call.

**`halted`**: Set by the `HALT` instruction. While halted, the CPU repeatedly executes NOP at the current PC. The runtime checks this flag at the start of every `step()` call and returns immediately with `halted: true` if it is set.

**`cycle_counter`**: Accumulates T-cycles during instruction execution. Each instruction adds its cycle count to this field; the emulator reads it after execution to report the cycle cost.

---

## The hardware context

`HardwareContext` in `src/z80/types.ts` binds the CPU to its memory and I/O:

```typescript
interface HardwareContext {
  memory: Uint8Array;                              // 64KB memory image
  ioRead: (port: number) => number;               // Port read
  ioWrite: (port: number, value: number) => void; // Port write
  ioTick?: () => unknown;                         // Post-instruction callback
  memRead?: (addr: number) => number;             // Optional memory read override
  memWrite?: (addr: number, value: number) => void; // Optional memory write override
}
```

The `memory` field is a `Uint8Array` of exactly 65536 bytes — the full Z80 address space. The `memRead` and `memWrite` overrides allow platforms or tests to intercept memory access without replacing the array. If `memWrite` is undefined, writes go directly to `memory[]`. If it is defined (as it is when ROM protection is active), writes go through the override.

The `ioTick` callback is called after every instruction execution. This is how platform hardware (the TEC-1's display scanning, the speaker pulse generation) gets CPU time. The tick function can return an interrupt request or a `stop` flag to halt execution.

---

## The factory

`createZ80Runtime()` is the only way to create a runtime:

```typescript
function createZ80Runtime(
  program: HexProgram,
  entry?: number,
  ioHandlers?: IoHandlers,
  options?: RuntimeOptions
): Z80Runtime
```

The `IoHandlers` type separates the platform-facing interface from the internal `Callbacks`:

```typescript
interface IoHandlers {
  read?: (port: number) => number;
  write?: (port: number, value: number) => void;
  tick?: () => TickResult | void;
}
```

`IoHandlers` is what the platform provides. `Callbacks` is the internal four-function interface used by the instruction decoder. The factory bridges them.

The `RuntimeOptions` type supports one option:

```typescript
interface RuntimeOptions {
  romRanges?: Array<{ start: number; end: number }>;
}
```

ROM ranges mark address regions as read-only. Writes to these ranges are silently ignored. Platform providers specify their ROM ranges (the monitor ROM, for example) so that user programs cannot accidentally corrupt the ROM image during debugging.

### Factory internals

The factory:

1. Allocates a 64KB `Uint8Array`.
2. Calls `loadProgram()` to copy the `HexProgram.memory` into the array, clearing everything else and setting PC to the entry address.
3. Constructs a `memWrite` function that checks ROM ranges before writing.
4. Builds a `HardwareContext` that wires memory and I/O together.
5. Constructs the `Callbacks` object that the instruction decoder uses.
6. Returns the runtime object with bound step and state methods.

---

## The loaders

Two parsers in `src/z80/loaders.ts` convert files on disk into in-memory structures.

### Intel HEX parser

`parseIntelHex()` reads an Intel HEX file and returns a `HexProgram`:

```typescript
interface HexProgram {
  memory: Uint8Array;
  startAddress: number;
  writeRanges: Array<{ start: number; end: number }>;
}
```

Intel HEX is a line-oriented format. Each line starts with `:`, followed by:
- byte count (2 hex digits)
- address (4 hex digits)
- record type (00 = data, 01 = end-of-file)
- data bytes
- checksum

The parser scans each line, decodes the fields, and writes data bytes into a 64KB memory array at the specified addresses. It tracks `startAddress` (the lowest written address) and `writeRanges` (contiguous written regions). The write ranges are used by the platform memory builders to distinguish program code from empty memory.

### Listing parser

`parseListing()` reads an assembler listing file and returns a `ListingInfo`:

```typescript
interface ListingInfo {
  entries: Array<{ line: number; address: number; length: number }>;
  lineToAddress: Map<number, number>;
  addressToLine: Map<number, number>;
}
```

The listing format has one line per assembly statement:

```
0000  3E 42        LD A,42h
0003  06 10        LD B,10h
```

The parser reads the address and byte count from each line and builds the two maps. `lineToAddress` maps source line numbers to Z80 addresses — used by the breakpoint manager to verify breakpoints. `addressToLine` maps addresses to source lines — used by the stack trace builder to resolve a PC to a source location.

The parser skips lines that do not have at least one hex byte — directives, comments, blank lines — so that the maps only contain executable addresses.

---

## CPU initialisation

`initCpu()` returns a new `Cpu` with sensible Z80 defaults. The notable initial values:

- `sp` is initialised to `0xDFF0` — a conventional Z80 stack starting point, near the top of a RAM region below 0xE000.
- All flags are 0.
- `imode` is 0 — interrupt mode 0 is the reset state.
- `iff1` and `iff2` are 0 — interrupts disabled on reset.
- `halted` is false.

`resetCpu()` applies the same defaults to an existing `Cpu` object. This is called when the runtime's `reset()` method is invoked — a full restart without deallocating the runtime.

---

## The step function in detail

`stepRuntime()` implements the `step()` method:

```
1. If cpu.halted: return { halted: true, pc, reason: 'halt' }

2. If trace provided:
   classifyStepOver(cpu, callbacks) → fill trace.kind, trace.taken, trace.returnAddress

3. execute(cpu, callbacks) → cycle count
   (see Chapter 7)

4. ioTick() → TickResult?
   If interrupt in TickResult: trigger interrupt
   If stop in TickResult: return as breakpoint

5. If cpu.halted or pc >= 0x10000:
   return { halted: true, pc, reason: 'halt' }

6. return { halted: false, pc, cycles }
```

The `classifyStepOver()` call before `execute()` is important: it reads the current instruction *before* executing it. After `execute()`, PC has advanced and the opcode is gone. The classification needs the pre-execution state.

`classifyStepOver()` decodes the current opcode to determine:
- Is it a CALL/RST instruction? → `kind = 'call'` or `'rst'`
- Is it a RET instruction? → `kind = 'ret'`
- For conditional instructions: is the condition met? → `taken = true/false`
- What is the return address? → `returnAddress = PC + instruction_length`

This is separate from the full instruction decode — it only needs to classify the control flow, not execute the instruction. The classification checks for all 9 CALL variants (unconditional + 8 conditional), 8 RST targets, and 12 RET variants (unconditional, 8 conditional, RETN, RETI, plus ED-prefix returns).

---

## `runUntilStop()`

The runtime also provides `runUntilStop(breakpoints)` — a tight synchronous loop:

```typescript
while (true) {
  const result = stepRuntime(cpu, callbacks, ioHandlers, hardware);
  if (result.halted) return result;
  if (breakpoints.has(cpu.pc)) return { ...result, reason: 'breakpoint' };
}
```

This is not the primary execution path in debug80. The adapter's `runUntilStopAsync()` handles execution, checking breakpoints in TypeScript code with the full context of shadow aliases and skip-once logic. The runtime's `runUntilStop()` is a fallback — faster for contexts that do not need the full debugger machinery.

---

## Summary

- `Z80Runtime` is the complete public interface for the emulator. The adapter interacts with the emulator only through this interface.

- The `Cpu` structure holds 26 register fields plus control state. All 8-bit registers are plain numbers. Register pairs are assembled from 8-bit components at point of use. Flags are a separate struct of 8 number fields — no packed byte in the main CPU state.

- `HardwareContext` binds the 64KB memory array to I/O handlers. The `memRead`/`memWrite` overrides allow platforms to intercept memory access without replacing the array.

- `createZ80Runtime()` initialises memory from a `HexProgram`, constructs the hardware context with ROM range enforcement, and returns the runtime. ROM ranges cause writes to be silently ignored.

- `step()` executes one instruction. With a `trace` parameter, it pre-classifies the instruction for control flow analysis before executing it. The step result includes `halted`, `pc`, and `cycles`.

- `captureCpuState()` and `restoreCpuState()` snapshot and restore all 27 CPU fields for warm restart support.

- `parseIntelHex()` builds a 64KB memory image from an Intel HEX file and records write ranges. `parseListing()` builds bidirectional line↔address maps for the breakpoint manager and stack trace builder.

---

[Part III](README.md) | [Instruction Decoding →](07-instruction-decoding.md)
