[← The Z80 Runtime](06-the-z80-runtime.md) | [Part III](README.md) | [Memory, I/O, and Interrupts →](08-memory-io-interrupts.md)

# Chapter 7 — Instruction Decoding

The Z80 has a rich and irregular instruction set. Instructions range from one to four bytes, with five prefix bytes that switch to extended opcode tables. The emulator decodes and executes each instruction in a single pass. This chapter explains the decoder architecture, how the instruction tables are built and cached, and how each opcode group is handled.

---

## The decode pipeline

Each call to `execute()` in `src/z80/cpu.ts` performs these steps:

1. Increment the low 7 bits of the R register (the memory refresh counter).
2. Fetch the opcode at the current PC — `mem_read(cpu.pc++)`.
3. Call `decodeInstruction(cpu, callbacks, opcode)`.
4. Process delayed EI/DI state.
5. Return the accumulated cycle count.

`decodeInstruction()` in `src/z80/decode.ts` is the entry point to the decoder. It retrieves a cached decoder object for the current CPU+callbacks pair and calls its `decode()` function with the opcode byte.

---

## Decoder caching

Each `(Cpu, Callbacks)` pair gets its own decoder, stored in a `WeakMap`:

```typescript
const decoderCache = new WeakMap<Cpu, { cb: Callbacks; decoder: Decoder }>();

function decodeInstruction(cpu: Cpu, cb: Callbacks, opcode: number): void {
  let entry = decoderCache.get(cpu);
  if (!entry || entry.cb !== cb) {
    entry = { cb, decoder: createDecoder(cpu, cb) };
    decoderCache.set(cpu, entry);
  }
  entry.decoder.decode(opcode);
}
```

`createDecoder()` is expensive — it constructs instruction tables, creates helper closures, and wires up all the ALU functions. By caching this per CPU, the cost is paid once at session start rather than on every instruction. The cache invalidates if the callbacks change, which happens during warm rebuilds.

The cache key is the `Cpu` object itself (via `WeakMap`). When a session ends and the CPU is garbage-collected, the cache entry disappears automatically.

---

## The decoder structure

`createDecoder()` in `src/z80/decode.ts` builds the decoder in several layers:

1. **CPU and callbacks** are captured as closures. All helper functions close over `cpu` and `cb` directly — no parameters are passed through the instruction chain.

2. **Helper functions** from `src/z80/decode-helpers.ts` are constructed. These implement the ALU operations (ADD, SUB, AND, OR, XOR, CP, INC, DEC), the load/store operations, and the various addressing modes.

3. **Prefix handlers** are built — one for each of CB, DD, ED, FD.

4. **The primary dispatch function** is returned. It receives a single opcode byte and executes the corresponding instruction.

All of this happens once. The resulting decoder object is a single function (`decode`) backed by many closures sharing the same CPU and callbacks reference.

---

## Primary opcode dispatch

The Z80 primary opcode space (0x00–0xFF) divides into several regions with different decoding strategies.

### 0x40–0x7F: 8-bit register loads

This is a 64×1 block of `LD r, r'` instructions. The destination register is encoded in bits 5:3 of the opcode; the source register is encoded in bits 2:0. The register map is:

| Code | Register |
|------|----------|
| 0    | B |
| 1    | C |
| 2    | D |
| 3    | E |
| 4    | H |
| 5    | L |
| 6    | (HL) — memory |
| 7    | A |

For source code 6, the operand is loaded from memory at the address in HL. For destination code 6, the value is written to memory at HL. The exception is opcode 0x76 — what would be `LD (HL),(HL)` is instead the `HALT` instruction.

The primary decoder extracts destination and source from the opcode and dispatches to the appropriate load helper. No table lookup — the computation is a direct mapping.

### 0x80–0xBF: 8-bit ALU operations

This block contains all the register-to-accumulator ALU instructions. Bits 5:3 select the operation; bits 2:0 select the register (same encoding as loads):

| Bits 5:3 | Operation |
|----------|-----------|
| 000      | ADD A, r |
| 001      | ADC A, r |
| 010      | SUB r |
| 011      | SBC A, r |
| 100      | AND r |
| 101      | XOR r |
| 110      | OR r |
| 111      | CP r |

Each operation has its own flag-setting logic. The decoder extracts the operand and dispatches to the corresponding ALU function.

### 0x00–0x3F and 0xC0–0xFF: irregular instructions

The remaining opcodes are handled by a sparse dispatch table. These include:

- Immediate loads: `LD BC,nn`, `LD DE,nn`, `LD HL,nn`, `LD SP,nn`
- Memory loads: `LD A,(BC)`, `LD A,(DE)`, `LD A,(nn)`
- Stack operations: `PUSH`, `POP`
- Jumps: `JP`, `JR` and their conditional variants
- Calls and returns: `CALL`, `RET` and their conditional variants
- Restarts: `RST p` (8 variants)
- Block operations: `LDIR`, `LDDR`, `CPIR`, `CPDR`
- Exchange: `EX AF,AF'`, `EXX`, `EX (SP),HL`
- Miscellaneous: `NOP`, `DAA`, `CPL`, `SCF`, `CCF`, `RLCA`, `RRCA`, `RLA`, `RRA`, `DI`, `EI`
- Prefix bytes: `CB`, `DD`, `ED`, `FD`

---

## Prefix handlers

Four opcode values trigger prefix handling rather than instruction execution. The current byte is consumed and the next byte is fetched and decoded in a different context.

### CB prefix — bit operations

`decode-cb.ts` handles the 0xCB prefix. After incrementing R and reading the next byte, it decodes a 256-opcode space organised around 3-bit register and operation fields:

| Range | Operations |
|-------|------------|
| 0x00–0x3F | Rotate and shift: RLC, RRC, RL, RR, SLA, SRA, SLL, SRL |
| 0x40–0x7F | BIT n, r — test bit n of register |
| 0x80–0xBF | RES n, r — clear bit n of register |
| 0xC0–0xFF | SET n, r — set bit n of register |

For 0x00–0x3F, bits 5:3 select the operation and bits 2:0 select the register (same encoding as primary). For the BIT/RES/SET groups, bits 5:3 select the bit number.

Operations on register code 6 operate on memory at (HL). These are the only write operations in the CB space — all others modify registers.

Rotate and shift operations are implemented in `src/z80/rotate.ts`. Each function takes the CPU and the 8-bit operand, performs the rotation, sets the flags, and returns the result. The full set:

| Operation | Description |
|-----------|-------------|
| RLC | Rotate left circular: bit 7 → carry and bit 0 |
| RRC | Rotate right circular: bit 0 → carry and bit 7 |
| RL  | Rotate left through carry: bit 7 → carry, old carry → bit 0 |
| RR  | Rotate right through carry: bit 0 → carry, old carry → bit 7 |
| SLA | Shift left arithmetic: bit 7 → carry, 0 → bit 0 |
| SRA | Shift right arithmetic: bit 0 → carry, bit 7 preserved |
| SLL | Shift left logical (undocumented): bit 7 → carry, 1 → bit 0 |
| SRL | Shift right logical: bit 0 → carry, 0 → bit 7, sign forced to 0 |

The undocumented SLL is included — real TEC-1 programs may use it.

### DD prefix — IX instructions

`decode-dd.ts` builds a 256-entry table for IX-flavoured instructions. The DD prefix replaces HL with IX in most contexts. Where an unmodified instruction would use HL, the DD-prefixed version uses `IX + d`, where `d` is a signed displacement byte read from the instruction stream.

Indexed addressing adds a complication: IX and IY are stored as 16-bit values, but the Z80 also supports direct access to the high and low bytes of IX as undocumented registers IXH (`IX >> 8`) and IXL (`IX & 0xFF`). The DD table includes these for opcodes like `LD B, IXH` (0x44) and `LD IXH, n` (0x26).

The DDCB sub-prefix is handled by `decode-ddcb.ts`. `DD CB d opcode` reads a displacement byte and an operation byte, computes the address `IX + d`, performs the CB operation on that memory location, and optionally stores the result in a register.

### FD prefix — IY instructions

`decode-fd.ts` reuses the DD table entirely. When an FD prefix is encountered, it temporarily swaps `cpu.ix` and `cpu.iy`, runs the DD handler, then swaps back. After the swap, `iy` holds the modified value from IX's slot, and IX is restored to its original value. This is 36 lines of elegant reuse rather than a duplicate 256-entry table.

### ED prefix — extended instructions

`decode-ed.ts` implements the extended instruction set — instructions that exist only in the Z80 (not inherited from the 8080). These include:

**Block transfers and searches:**
- `LDI` / `LDIR` — copy bytes forward
- `LDD` / `LDDR` — copy bytes backward
- `CPI` / `CPIR` — compare bytes forward
- `CPD` / `CPDR` — compare bytes backward

**Block I/O:**
- `INI` / `INIR`, `IND` / `INDR` — read port into memory block
- `OUTI` / `OTIR`, `OUTD` / `OTDR` — write memory block to port

**16-bit arithmetic:**
- `ADC HL, rr`, `SBC HL, rr` — 16-bit add/subtract with carry

**Interrupt control:**
- `IM 0`, `IM 1`, `IM 2` — set interrupt mode
- `EI`/`DI` equivalents and RETI/RETN return instructions

**I register operations:**
- `LD I, A`, `LD A, I`, `LD R, A`, `LD A, R`

---

## Flag calculations

The Z80's flag behaviour is precisely specified and includes several unusual rules. The emulator implements all of them.

### Carry and half-carry

For 8-bit addition:
```typescript
const result = a + b;
flags.C = (result >> 8) & 1;
flags.H = ((a & 0x0f) + (b & 0x0f) >> 4) & 1;
```

Half-carry is the carry from bit 3 to bit 4 — useful for BCD arithmetic (DAA). The mask `& 0x0f` isolates the low nibble of each operand; the sum of two 4-bit values carries into bit 4 if the total exceeds 15.

For 16-bit addition, carry is extracted from bit 16 of the result.

### Overflow

For signed arithmetic, overflow occurs when two operands of the same sign produce a result of the opposite sign. The check uses the sign bits of the operands and result:

```typescript
flags.P = ((a ^ result) & (b ^ result) & 0x80) ? 1 : 0;
```

If `a` and `b` have the same sign, and the result has the opposite sign, overflow has occurred. XOR is used because XOR of same-sign values produces 0 in the sign bit; AND of the two conditions isolates the overflow case.

### Parity

For logical operations (AND, OR, XOR), the P flag holds the parity of the result — 1 if the number of set bits is even. Rather than computing this per-instruction, the emulator uses a pre-computed 256-entry table in `src/z80/constants.ts`:

```typescript
const parity_bits: number[] = [];
for (let i = 0; i < 256; i++) {
  let p = 0, n = i;
  while (n) { p ^= n & 1; n >>= 1; }
  parity_bits[i] = p ? 0 : 1;  // 1 = even parity
}
```

A lookup replaces the bit-counting loop: `flags.P = parity_bits[result & 0xff]`.

### Undocumented flags Y and X

The Y flag copies bit 5 of the result; the X flag copies bit 3. These are set on every flag-modifying instruction:

```typescript
flags.Y = (result >> 5) & 1;
flags.X = (result >> 3) & 1;
```

For instructions that use the result of a memory read for flags (like `BIT n, (HL)`), the undocumented flags come from a different source — the emulator tracks the specific rules for each instruction.

---

## Cycle counting

Every instruction has a T-cycle cost defined in pre-computed tables in `src/z80/constants.ts`:

- `cycle_counts[256]` — primary opcode costs
- `cycle_counts_cb[256]` — CB prefix costs
- `cycle_counts_ed[256]` — ED prefix costs
- `cycle_counts_dd[256]` — DD/FD prefix costs

The base cost is loaded at the start of instruction execution: `cpu.cycle_counter = cycle_counts[opcode]`. For instructions with variable costs (conditional jumps, calls that may or may not be taken), additional cycles are added when the taken path is followed:

```typescript
// JR cc, e — +5 cycles if taken
if (conditionMet) {
  cpu.pc += offset;
  cpu.cycle_counter += 5;
}
```

The final cycle count is returned from `execute()` for the platform to use in timing calculations.

---

## DAA

The Decimal Adjust Accumulator instruction corrects the result of BCD arithmetic. After adding or subtracting two BCD values, DAA adjusts A to contain the correct BCD result and sets the carry flag appropriately.

The implementation follows the Z80 rules:
- After addition (N=0): if the low nibble > 9 or H is set, add 0x06; if the high nibble > 9 or C is set, add 0x60.
- After subtraction (N=1): similar adjustments with subtraction.
- C is set if an adjustment of 0x60 was made.
- P is set from the parity table on the final result.

DAA is one of the most complex flag-affecting instructions in the Z80 and is often implemented with a lookup table. This emulator computes it procedurally.

---

## Summary

- The decoder is built once per `(Cpu, Callbacks)` pair by `createDecoder()` and cached via `WeakMap`. All instruction handlers close over the CPU and callbacks — no per-instruction parameter passing.

- The primary opcode space uses direct computation for the 8-bit load (0x40–0x7F) and ALU (0x80–0xBF) blocks, and a sparse table for the remaining irregular instructions.

- Four prefix bytes trigger extended decoders: CB (bit operations), DD (IX), FD (IY), ED (extended). The FD prefix reuses the DD table by temporarily swapping IX and IY.

- DDCB and FDCB combine displacement addressing with bit operations. The displacement is read first, then the operation byte.

- Flag calculations implement all Z80 rules including undocumented Y and X flags, correct overflow detection, and parity via a 256-entry lookup table.

- Cycle counts come from pre-computed tables indexed by opcode. Conditional instructions add cycles when the taken path is followed.

- The R register (memory refresh counter) increments its low 7 bits on every instruction fetch. Bit 7 is preserved across increments.

- EI and DI take effect one instruction late. The `do_delayed_ei` and `do_delayed_di` flags defer the interrupt-enable change until after the next instruction completes.

---

[← The Z80 Runtime](06-the-z80-runtime.md) | [Part III](README.md) | [Memory, I/O, and Interrupts →](08-memory-io-interrupts.md)
