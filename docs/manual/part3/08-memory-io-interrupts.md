[← Instruction Decoding](07-instruction-decoding.md) | [Part III](README.md)

# Chapter 8 — Memory, I/O, and Interrupts

The Z80 has three address spaces: 64KB of memory, 256 I/O ports (or 65536 when full 16-bit port addressing is used), and an interrupt vector table. This chapter covers how debug80 models all three, how platform I/O handlers connect to the emulator, and how interrupts are processed.

---

## The memory model

The Z80 address space is 16 bits — 65536 bytes. The emulator allocates a single `Uint8Array` of exactly this size:

```typescript
const memory = new Uint8Array(0x10000);
```

This is the authoritative memory image for the entire session. The platform memory builders (Chapter 4) load the ROM and program into this array before the runtime starts. During execution, the instruction decoder reads and writes it directly through the `mem_read` and `mem_write` callbacks.

### Address masking

All memory addresses are masked to 16 bits before access: `addr & 0xffff`. This is done at every entry point — in the callback wrappers, in the instruction decoder, and in any code that computes addresses from registers. Masking prevents out-of-bounds access and silently implements Z80 address wrap-around (accessing address 0xFFFF + 1 reads address 0x0000, as on real hardware).

### The access path

The instruction decoder uses the `Callbacks` interface to read and write memory:

```typescript
interface Callbacks {
  mem_read: (addr: number) => number;
  mem_write: (addr: number, value: number) => void;
  io_read: (port: number) => number;
  io_write: (port: number, value: number) => void;
}
```

These callbacks are constructed in the factory. The default `mem_read` is:

```typescript
mem_read: (addr) => memory[addr & 0xffff]
```

If `hardware.memRead` is overridden (for example, to provide banked memory or memory-mapped I/O), the callback calls that override instead of reading the array directly.

The default `mem_write` enforces ROM protection:

```typescript
mem_write: (addr, value) => {
  const masked = addr & 0xffff;
  for (const range of romRanges) {
    if (masked >= range.start && masked <= range.end) return;
  }
  memory[masked] = value & 0xff;
}
```

Writes to ROM ranges are silently ignored — no exception, no error message, no effect. This matches real hardware behaviour where writes to ROM have no effect. Values are masked to 8 bits before storage.

### ROM ranges

ROM ranges are specified at runtime creation through `RuntimeOptions.romRanges`:

```typescript
interface RuntimeOptions {
  romRanges?: Array<{ start: number; end: number }>;
}
```

The TEC-1 platform typically defines a ROM range covering the monitor (0x0000–0x07FF for MON-1B, for example). The TEC-1G extends this with larger ROM regions. The platform provider builds the appropriate ranges from its configuration and passes them to `createZ80Runtime()`.

ROM protection is checked on every write. With a typical configuration of two to four ROM ranges, the linear scan is fast enough to have no measurable impact on emulation speed.

### Direct memory access

The adapter's memory write request handler (`debug80/memoryWrite`) bypasses the normal write path and accesses the array directly when no `memWrite` override is defined:

```typescript
if (typeof runtime.hardware.memWrite === 'function') {
  runtime.hardware.memWrite(address, value);
} else {
  runtime.hardware.memory[address] = value & 0xff;
}
```

If a `memWrite` override exists, the write goes through it — and that override enforces ROM protection. If no override exists, the write goes directly to the array. For platforms with ROM protection, `createZ80Runtime()` always installs the ROM-checking `memWrite` override, so the protection applies even to explicit memory write requests.

---

## The I/O model

The Z80 uses separate I/O instructions (`IN A,(n)`, `OUT (n),A` and the block variants) rather than memory-mapped I/O. Each port is a hardware address in an 8-bit or 16-bit port space.

### Port addressing

The Z80 `IN` and `OUT` instructions come in two forms:
- `IN A,(n)` / `OUT (n),A` — the port number is an immediate byte from the instruction
- `IN r,(C)` / `OUT (C),r` — the port number is in register C (full 16-bit port address on some hardware)

The emulator uses 16-bit port addresses internally, masking to `port & 0xffff`. Platforms that only use 8-bit port decoding are unaffected — they simply ignore the upper 8 bits.

Port values are masked to 8 bits on both read and write: `value & 0xff`. This matches the physical 8-bit data bus.

### The IoHandlers interface

Platform code connects to the emulator through `IoHandlers`:

```typescript
interface IoHandlers {
  read?: (port: number) => number;
  write?: (port: number, value: number) => void;
  tick?: () => TickResult | void;
}
```

This is the external interface — what the platform provides to the factory. Inside the decoder, I/O is accessed through the `Callbacks` interface (`io_read`, `io_write`). The factory bridges them:

```typescript
const cb: Callbacks = {
  io_read: (port) => ioHandlers?.read?.(port & 0xffff) ?? 0xff,
  io_write: (port, value) => ioHandlers?.write?.(port & 0xffff, value & 0xff),
  ...
};
```

If no I/O handler is installed, reads return 0xFF (the floating bus value) and writes are no-ops.

### Platform I/O implementation

Each platform implements its I/O handlers in its runtime module. The handlers decode the port address and dispatch to the appropriate hardware component:

**TEC-1 I/O ports (example):**
- Port 0x00 read: return key matrix scan result
- Port 0x01 write: select display digit and segment data
- Port 0x02 write: drive speaker

**TEC-1G I/O ports (example):**
- Port 0x00–0x0F: keyboard matrix rows/columns
- Port 0x10–0x1F: LCD controller
- Port 0x20–0x2F: GLCD controller
- Port 0x80: speaker

The platform's `buildIoHandlers()` factory (called during the launch pipeline) constructs these handlers and wires them to the platform's hardware state. The state objects (display digits, key inputs, speaker state) are held in the `Tec1Runtime` or `Tec1gRuntime` instances and updated as I/O operations occur.

### The tick function

The `tick` function is called after every instruction execution. This is the mechanism by which platform hardware gets CPU time:

```typescript
interface TickResult {
  nonMaskable?: boolean;
  data?: number;
  stop?: boolean;
}
```

The tick function can:
1. Update hardware timers (display refresh, speaker pulse width, UART bit timing).
2. Return an interrupt request if hardware wants to interrupt the CPU.
3. Return `stop: true` to halt the execution loop immediately (used internally by some platform tests).

For the TEC-1, the tick drives the display scan circuit — rotating through the seven-segment display digits at a rate that matches the original hardware. For the TEC-1G, it drives a more complex set of timers covering the LCD controller, GLCD, and keyboard matrix scanner.

The tick function runs synchronously on the instruction path — it must be fast. Heavy operations (like rendering display output to the webview) are deferred. The tick updates internal state, and a separate timer fires periodically to emit the `debug80/tec1gUpdate` DAP event with a state snapshot.

---

## Interrupts

The Z80 supports two interrupt types: non-maskable (NMI) and maskable (INT). Both are triggered via the `interrupt()` function in `src/z80/cpu.ts`.

### Non-maskable interrupts

NMIs fire regardless of the interrupt enable flags. They:
1. Increment R.
2. Save IFF1 to IFF2 (so RETN can restore it).
3. Clear IFF1 (disable further maskable interrupts).
4. Push PC onto the stack.
5. Jump to address 0x0066.
6. Cost 11 T-cycles.

The TEC-1 uses NMI to detect the reset button press.

### Maskable interrupts — three modes

Maskable interrupts only fire if IFF1 is set (enabled by EI, disabled by DI). The response depends on the interrupt mode:

**Mode 0 (reset default):**
The data bus supplies an opcode byte, which the CPU executes directly. The most common usage is placing 0xFF (RST 38H) on the data bus, making mode 0 equivalent to mode 1 for simple hardware. Costs 2 extra cycles (plus the instruction cost).

**Mode 1:**
The CPU ignores the data bus and calls 0x0038 unconditionally. Simple to implement in hardware — no vector table needed. Costs 13 T-cycles.

**Mode 2:**
The most powerful mode. The CPU reads a vector from `(I << 8) | data_bus`, where I is the interrupt register (set by `LD I,A`). This 16-bit address points to an entry in an interrupt vector table, and the CPU reads a 16-bit address from that location and jumps to it. Costs 19 T-cycles.

```typescript
// Mode 2 interrupt dispatch
const vectorAddr = ((cpu.i << 8) | data) & 0xffff;
const lo = cb.mem_read(vectorAddr);
const hi = cb.mem_read((vectorAddr + 1) & 0xffff);
cpu.pc = lo | (hi << 8);
```

The TEC-1G uses mode 2 for its interrupt-driven I/O subsystems.

### EI/DI timing

Enabling and disabling interrupts is deferred by one instruction. `EI` does not enable interrupts immediately — it sets `do_delayed_ei`, which is processed at the end of the next `execute()` call:

```typescript
// At end of execute():
if (cpu.do_delayed_di) {
  cpu.iff1 = cpu.iff2 = 0;
  cpu.do_delayed_di = false;
}
if (cpu.do_delayed_ei) {
  cpu.iff1 = cpu.iff2 = 1;
  cpu.do_delayed_ei = false;
}
```

This one-instruction delay is a Z80 hardware feature. It ensures that the instruction following EI executes without the possibility of an interrupt — typically used for safe critical-section exit:

```z80
EI
RET    ; returns atomically, no interrupt can fire between EI and RET
```

### Stack operations during interrupts

All interrupt modes push the return address (PC) onto the stack before jumping to the handler. They also clear `cpu.halted` — a halted CPU is woken by any interrupt.

RETI (return from interrupt) restores IFF1 from IFF2, re-enabling maskable interrupts. RETN (return from non-maskable interrupt) does the same.

---

## Block instructions

The ED-prefix block instructions deserve special attention because they interact with memory, I/O, and the program counter in unusual ways.

### Block memory transfers (LDI, LDIR, LDD, LDDR)

`LDI` copies one byte from (HL) to (DE), increments HL and DE, decrements BC. If BC reaches zero, the copy stops.

`LDIR` repeats `LDI` until BC = 0. In the emulator, this is a loop inside the instruction handler — not a re-execution of the same PC. The cycle count accumulates for each iteration: 21 T-cycles per byte copied, minus 5 for the final iteration (when BC = 0).

```typescript
// LDI implementation
const value = cb.mem_read((cpu.h << 8) | cpu.l);
cb.mem_write((cpu.d << 8) | cpu.e, value);
// increment HL, DE; decrement BC
// set flags
```

`LDD`/`LDDR` are identical but decrement HL and DE instead of incrementing them.

### Block search (CPI, CPIR, CPD, CPDR)

`CPI` compares A with (HL), increments HL, decrements BC. Sets flags as if it were `CP (HL)` but does not modify A. `CPIR` repeats until A = (HL) or BC = 0.

These are used for searching memory blocks and are emulated the same way as the transfer instructions — a loop in the handler rather than PC repetition.

### Block I/O (INI, INIR, IND, INDR, OUTI, OTIR, OUTD, OTDR)

Block I/O transfers data between I/O ports and memory. `INI` reads from port (C) and writes to (HL), then increments HL and decrements B. `INIR` repeats until B = 0.

`OUTI` reads from (HL) and writes to port (C), increments HL, decrements B. `OTIR` repeats.

The IN and OUT variants are used by hardware that requires burst transfers — for example, writing a block of pixels to a GLCD controller.

---

## Summary

- Memory is a single 64KB `Uint8Array`. All addresses are masked to 16 bits. The instruction decoder accesses it through `mem_read`/`mem_write` callbacks.

- ROM protection is enforced in the `mem_write` callback by checking against a list of `{start, end}` ranges. Writes to ROM ranges are silently ignored. ROM ranges are specified when the runtime is created.

- The adapter's `debug80/memoryWrite` request uses `hardware.memWrite()` if available, falling through to direct array access otherwise. Platforms with ROM protection always install `memWrite`, so the protection applies in all paths.

- Port I/O is handled through `io_read`/`io_write` callbacks. Ports and values are masked to 16 and 8 bits respectively. If no I/O handler is installed, reads return 0xFF.

- The `tick` function runs after every instruction and drives platform hardware timing. It can trigger interrupts and can signal an execution stop.

- The Z80 has three maskable interrupt modes: mode 0 executes a data-bus opcode, mode 1 calls 0x0038, mode 2 uses a vector table addressed by the I register.

- NMI ignores interrupt flags and always calls 0x0066. Maskable interrupts check IFF1. All interrupt modes push PC and clear `halted`.

- EI and DI take effect one instruction late via deferred flags. This prevents interrupt windows at critical section boundaries.

- Block instructions (LDIR, LDDR, INIR, OTIR, etc.) loop inside the handler rather than re-executing the PC. Cycle counts accumulate across iterations.

---

[← Instruction Decoding](07-instruction-decoding.md) | [Part III](README.md)
