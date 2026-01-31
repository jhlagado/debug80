/**
 * @fileoverview Z80 Instruction Decoder
 *
 * This module implements the complete Z80 instruction set decoder. The architecture
 * uses a single function with nested handlers to share closure state (cpu, callbacks).
 *
 * ## Structure
 * The file is organized into these logical sections:
 * - **Utility Functions** (lines ~45-550): Signed bytes, flags, stack, ALU operations
 * - **DD Prefix Table** (lines ~570-960): IX register instructions
 * - **DDCB Prefix Handler** (lines ~964-1200): IX bit operations
 * - **ED Prefix Table** (lines ~1200-1490): Extended instructions
 * - **Main Instruction Table** (lines ~1492-2165): Primary opcode dispatch
 * - **CB Prefix Handler** (lines ~1938-2163): Bit operations (inline)
 * - **FD Prefix Handler** (line ~2337): IY instructions (reuses DD table)
 * - **Register/ALU Decoder** (lines ~2368-2448): Uniform register operations
 *
 * ## Instruction Prefixes
 * - **CB**: Bit manipulation, rotate, shift instructions
 * - **DD**: IX index register variants
 * - **ED**: Extended instructions (I/O, block transfers, etc.)
 * - **FD**: IY index register variants (uses DD table with IX/IY swap)
 * - **DDCB/FDCB**: Indexed bit operations
 *
 * @module z80/decode
 */

import {
  cycle_counts_cb,
  cycle_counts_dd,
  cycle_counts,
  cycle_counts_ed,
  parity_bits,
} from './constants';
import {
  flagsToByte,
  pushWord,
  setFlagsFromByte,
  setFlagsRegister,
  updateXYFlags,
} from './core-helpers';
import { noop, OpcodeHandler, OpcodeTable } from './opcode-types';
import {
  do_rl as do_rl_base,
  do_rlc as do_rlc_base,
  do_rr as do_rr_base,
  do_rrc as do_rrc_base,
  do_sla as do_sla_base,
  do_sll as do_sll_base,
  do_sra as do_sra_base,
  do_srl as do_srl_base,
} from './rotate';
import { Callbacks, Cpu } from './types';
import { buildDdInstructions, buildEdInstructions } from './decode-tables';

/** Handler that transforms a byte value and returns the result */
type ByteOpHandler = (value: number) => number;

/** Handler that operates on a byte value without returning */
type ByteOpVoid = (value: number) => void;

/** No-op byte handler that returns the input unchanged */
const noopByteOp: ByteOpHandler = (value: number): number => value;

/** No-op void handler that does nothing */
const noopVoidOp: ByteOpVoid = (_value: number): void => {
  // intentionally empty
};

/**
 * Safely retrieves a byte operation handler from an array.
 * @param ops - Array of byte operation handlers
 * @param index - Index to retrieve
 * @returns Handler at index or no-op if out of bounds
 */
const getByteOp = (ops: ByteOpHandler[], index: number): ByteOpHandler => ops[index] ?? noopByteOp;

/**
 * Safely retrieves a void operation handler from an array.
 * @param ops - Array of void operation handlers
 * @param index - Index to retrieve
 * @returns Handler at index or no-op if out of bounds
 */
const getVoidOp = (ops: ByteOpVoid[], index: number): ByteOpVoid => ops[index] ?? noopVoidOp;

// ============================================================================
// INSTRUCTION DECODER ENTRY POINT
// ============================================================================

/**
 * Decodes and executes a single Z80 instruction.
 *
 * This function handles the complete Z80 instruction set including:
 * - All standard opcodes (0x00-0xFF)
 * - CB prefix (bit operations)
 * - DD prefix (IX index register)
 * - ED prefix (extended instructions)
 * - FD prefix (IY index register)
 * - DDCB/FDCB prefixes (indexed bit operations)
 *
 * @param cpu - CPU state object to modify
 * @param cb - Callbacks for memory and I/O access
 * @param opcode - The opcode byte to decode and execute
 *
 * @example
 * ```typescript
 * const opcode = callbacks.mem_read(cpu.pc);
 * decodeInstruction(cpu, callbacks, opcode);
 * ```
 */
export const decodeInstruction = (cpu: Cpu, cb: Callbacks, opcode: number): void => {
  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================

  /**
   * Converts an unsigned byte to a signed offset (-128 to 127).
   * Used for relative jumps and indexed addressing.
   */
  const get_signed_offset_byte = (value: number): number => {
    // This function requires some explanation.
    // We just use JavaScript Number variables for our registers,
    //  not like a typed array or anything.
    // That means that, when we have a byte value that's supposed
    //  to represent a signed offset, the value we actually see
    //  isn't signed at all, it's just a small integer.
    // So, this function converts that byte into something JavaScript
    //  will recognize as signed, so we can easily do arithmetic with it.
    // First, we clamp the value to a single byte, just in case.
    value &= 0xff;
    // We don't have to do anything if the value is positive.
    if (value & 0x80) {
      // But if the value is negative, we need to manually un-two's-compliment it.
      // I'm going to assume you can figure out what I meant by that,
      //  because I don't know how else to explain it.
      // We could also just do value |= 0xffffff00, but I prefer
      //  not caring how many bits are in the integer representation
      //  of a JavaScript number in the currently running browser.
      value = -((0xff & ~value) + 1);
    }
    return value;
  };

  const get_flags_register = (): number => flagsToByte(cpu.flags);

  const get_flags_prime = (): number => flagsToByte(cpu.flags_prime);

  const set_flags_prime = (operand: number): void => {
    setFlagsFromByte(cpu.flags_prime, operand);
  };

  const update_xy_flags = (result: number): void => {
    // Most of the time, the undocumented flags
    //  (sometimes called X and Y, or 3 and 5),
    //  take their values from the corresponding bits
    //  of the result of the instruction,
    //  or from some other related value.
    // This is a utility function to set those flags based on those bits.
    updateXYFlags(cpu.flags, result);
  };

  const pop_word = (): number => {
    // Again, not complicated; read a byte off the top of the stack,
    //  increment the stack pointer, rinse and repeat.
    let retval = cb.mem_read(cpu.sp) & 0xff;
    cpu.sp = (cpu.sp + 1) & 0xffff;
    retval |= cb.mem_read(cpu.sp) << 8;
    cpu.sp = (cpu.sp + 1) & 0xffff;
    return retval;
  };

  // ////////////////////////////////////////////////////////////////////////////
  // Now, the way most instructions work in this emulator is that they set up
  //  their operands according to their addressing mode, and then they call a
  //  utility function that handles all variations of that instruction.
  // Those utility functions begin here.
  // ////////////////////////////////////////////////////////////////////////////
  const do_conditional_absolute_jump = (condition: boolean): void => {
    // This function implements the JP [condition],nn instructions.
    if (condition) {
      // We're taking this jump, so write the new PC,
      //  and then decrement the thing we just wrote,
      //  because the instruction decoder increments the PC
      //  unconditionally at the end of every instruction
      //  and we need to counteract that so we end up at the jump target.
      cpu.pc = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
      cpu.pc = (cpu.pc - 1) & 0xffff;
    } else {
      // We're not taking this jump, just move the PC past the operand.
      cpu.pc = (cpu.pc + 2) & 0xffff;
    }
  };

  const do_conditional_relative_jump = (condition: boolean): void => {
    // This function implements the JR [condition],n instructions.
    if (condition) {
      // We need a few more cycles to actually take the jump.
      cpu.cycle_counter += 5;
      // Calculate the offset specified by our operand.
      const offset = get_signed_offset_byte(cb.mem_read((cpu.pc + 1) & 0xffff));
      // Add the offset to the PC, also skipping past this instruction.
      cpu.pc = (cpu.pc + offset + 1) & 0xffff;
    } else {
      // No jump happening, just skip the operand.
      cpu.pc = (cpu.pc + 1) & 0xffff;
    }
  };

  const do_conditional_call = (condition: boolean): void => {
    // This function is the CALL [condition],nn instructions.
    // If you've seen the previous functions, you know this drill.
    if (condition) {
      cpu.cycle_counter += 7;
      pushWord(cpu, cb, (cpu.pc + 3) & 0xffff);
      cpu.pc = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
      cpu.pc = (cpu.pc - 1) & 0xffff;
    } else {
      cpu.pc = (cpu.pc + 2) & 0xffff;
    }
  };

  const do_conditional_return = (condition: boolean): void => {
    if (condition) {
      cpu.cycle_counter += 6;
      cpu.pc = (pop_word() - 1) & 0xffff;
    }
  };

  const do_reset = (address: number): void => {
    // The RST [address] instructions go through here.
    pushWord(cpu, cb, (cpu.pc + 1) & 0xffff);
    cpu.pc = (address - 1) & 0xffff;
  };

  const do_add = (operand: number): void => {
    // This is the ADD A, [operand] instructions.
    // We'll do the literal addition, which includes any overflow,
    //  so that we can more easily figure out whether we had
    //  an overflow or a carry and set the flags accordingly.
    const result = cpu.a + operand;

    // The great majority of the work for the arithmetic instructions
    //  turns out to be setting the flags rather than the actual operation.
    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = ((operand & 0x0f) + (cpu.a & 0x0f)) & 0x10 ? 1 : 0;
    // An overflow has happened if the sign bits of the accumulator and the operand
    //  don't match the sign bit of the result value.
    cpu.flags.P = (cpu.a & 0x80) === (operand & 0x80) && (cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
    cpu.flags.N = 0;
    cpu.flags.C = result & 0x100 ? 1 : 0;

    cpu.a = result & 0xff;
    update_xy_flags(cpu.a);
  };

  const do_adc = (operand: number): void => {
    const result = cpu.a + operand + cpu.flags.C;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = ((operand & 0x0f) + (cpu.a & 0x0f) + cpu.flags.C) & 0x10 ? 1 : 0;
    cpu.flags.P = (cpu.a & 0x80) === (operand & 0x80) && (cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
    cpu.flags.N = 0;
    cpu.flags.C = result & 0x100 ? 1 : 0;

    cpu.a = result & 0xff;
    update_xy_flags(cpu.a);
  };

  const do_sub = (operand: number): void => {
    const result = cpu.a - operand;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = ((cpu.a & 0x0f) - (operand & 0x0f)) & 0x10 ? 1 : 0;
    cpu.flags.P = (cpu.a & 0x80) !== (operand & 0x80) && (cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
    cpu.flags.N = 1;
    cpu.flags.C = result & 0x100 ? 1 : 0;

    cpu.a = result & 0xff;
    update_xy_flags(cpu.a);
  };

  const do_sbc = (operand: number): void => {
    const result = cpu.a - operand - cpu.flags.C;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = ((cpu.a & 0x0f) - (operand & 0x0f) - cpu.flags.C) & 0x10 ? 1 : 0;
    cpu.flags.P = (cpu.a & 0x80) !== (operand & 0x80) && (cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
    cpu.flags.N = 1;
    cpu.flags.C = result & 0x100 ? 1 : 0;

    cpu.a = result & 0xff;
    update_xy_flags(cpu.a);
  };

  const do_cp = (operand: number): void => {
    // A compare instruction is just a subtraction that doesn't save the value,
    //  so we implement it as... a subtraction that doesn't save the value.
    const temp = cpu.a;
    do_sub(operand);
    cpu.a = temp;
    // Since this instruction has no "result" value, the undocumented flags
    //  are set based on the operand instead.
    update_xy_flags(operand);
  };

  const do_and = (operand: number): void => {
    // The logic instructions are all pretty straightforward.
    cpu.a &= operand & 0xff;
    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = !cpu.a ? 1 : 0;
    cpu.flags.H = 1;
    cpu.flags.P = parity_bits[cpu.a] ?? 0;
    cpu.flags.N = 0;
    cpu.flags.C = 0;
    update_xy_flags(cpu.a);
  };

  const do_or = (operand: number): void => {
    cpu.a = (operand | cpu.a) & 0xff;
    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = !cpu.a ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = parity_bits[cpu.a] ?? 0;
    cpu.flags.N = 0;
    cpu.flags.C = 0;
    update_xy_flags(cpu.a);
  };

  const do_xor = (operand: number): void => {
    cpu.a = (operand ^ cpu.a) & 0xff;
    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = !cpu.a ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = parity_bits[cpu.a] ?? 0;
    cpu.flags.N = 0;
    cpu.flags.C = 0;
    update_xy_flags(cpu.a);
  };

  const do_inc = (operand: number): number => {
    let result = operand + 1;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = (operand & 0x0f) === 0x0f ? 1 : 0;
    // It's a good deal easier to detect overflow for an increment/decrement.
    cpu.flags.P = operand === 0x7f ? 1 : 0;
    cpu.flags.N = 0;

    result &= 0xff;
    update_xy_flags(result);

    return result;
  };

  const do_dec = (operand: number): number => {
    let result = operand - 1;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = (operand & 0x0f) === 0x00 ? 1 : 0;
    cpu.flags.P = operand === 0x80 ? 1 : 0;
    cpu.flags.N = 1;

    result &= 0xff;
    update_xy_flags(result);

    return result;
  };

  const do_hl_add = (operand: number): void => {
    // The HL arithmetic instructions are the same as the A ones,
    //  just with twice as many bits happening.
    const hl = cpu.l | (cpu.h << 8);
    const result = hl + operand;

    cpu.flags.N = 0;
    cpu.flags.C = result & 0x10000 ? 1 : 0;
    cpu.flags.H = ((hl & 0x0fff) + (operand & 0x0fff)) & 0x1000 ? 1 : 0;

    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    update_xy_flags(cpu.h);
  };

  const do_hl_adc = (operand: number): void => {
    operand += cpu.flags.C;
    const hl = cpu.l | (cpu.h << 8);
    const result = hl + operand;

    cpu.flags.S = result & 0x8000 ? 1 : 0;
    cpu.flags.Z = !(result & 0xffff) ? 1 : 0;
    cpu.flags.H = ((hl & 0x0fff) + (operand & 0x0fff)) & 0x1000 ? 1 : 0;
    cpu.flags.P =
      (hl & 0x8000) === (operand & 0x8000) && (result & 0x8000) !== (hl & 0x8000) ? 1 : 0;
    cpu.flags.N = 0;
    cpu.flags.C = result & 0x10000 ? 1 : 0;

    cpu.l = result & 0xff;
    cpu.h = (result >>> 8) & 0xff;

    update_xy_flags(cpu.h);
  };

  const do_hl_sbc = (operand: number): void => {
    operand += cpu.flags.C;
    const hl = cpu.l | (cpu.h << 8);
    const result = hl - operand;

    cpu.flags.S = result & 0x8000 ? 1 : 0;
    cpu.flags.Z = !(result & 0xffff) ? 1 : 0;
    cpu.flags.H = ((hl & 0x0fff) - (operand & 0x0fff)) & 0x1000 ? 1 : 0;
    cpu.flags.P =
      (hl & 0x8000) !== (operand & 0x8000) && (result & 0x8000) !== (hl & 0x8000) ? 1 : 0;
    cpu.flags.N = 1;
    cpu.flags.C = result & 0x10000 ? 1 : 0;

    cpu.l = result & 0xff;
    cpu.h = (result >>> 8) & 0xff;

    update_xy_flags(cpu.h);
  };

  const do_in = (port: number): number => {
    const result = cb.io_read(port) & 0xff;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = result === 0 ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = (parity_bits[result] ?? 0) === 1 ? 1 : 0;
    cpu.flags.N = 0;
    update_xy_flags(result);

    return result;
  };

  const do_neg = (): void => {
    // This instruction is defined to not alter the register if it === 0x80.
    if (cpu.a !== 0x80) {
      // This is a signed operation, so convert A to a signed value.
      cpu.a = get_signed_offset_byte(cpu.a);

      cpu.a = -cpu.a & 0xff;
    }

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = !cpu.a ? 1 : 0;
    cpu.flags.H = (-cpu.a & 0x0f) > 0 ? 1 : 0;
    cpu.flags.P = cpu.a === 0x80 ? 1 : 0;
    cpu.flags.N = 1;
    cpu.flags.C = cpu.a ? 1 : 0;
    update_xy_flags(cpu.a);
  };

  const do_ldi = (): void => {
    // Copy the value that we're supposed to copy.
    const read_value = cb.mem_read(cpu.l | (cpu.h << 8));
    cb.mem_write(cpu.e | (cpu.d << 8), read_value);

    // Increment DE and HL, and decrement BC.
    let result = (cpu.e | (cpu.d << 8)) + 1;
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
    result = (cpu.l | (cpu.h << 8)) + 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
    result = (cpu.c | (cpu.b << 8)) - 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;

    cpu.flags.H = 0;
    cpu.flags.P = cpu.c || cpu.b ? 1 : 0;
    cpu.flags.N = 0;
    cpu.flags.Y = ((cpu.a + read_value) & 0x02) >>> 1;
    cpu.flags.X = ((cpu.a + read_value) & 0x08) >>> 3;
  };

  const do_cpi = (): void => {
    const temp_carry = cpu.flags.C;
    const read_value = cb.mem_read(cpu.l | (cpu.h << 8));
    do_cp(read_value);
    cpu.flags.C = temp_carry;
    cpu.flags.Y = ((cpu.a - read_value - cpu.flags.H) & 0x02) >>> 1;
    cpu.flags.X = ((cpu.a - read_value - cpu.flags.H) & 0x08) >>> 3;

    let result = (cpu.l | (cpu.h << 8)) + 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
    result = (cpu.c | (cpu.b << 8)) - 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;

    cpu.flags.P = result ? 1 : 0;
  };

  const do_ini = (): void => {
    cpu.b = do_dec(cpu.b);

    cb.mem_write(cpu.l | (cpu.h << 8), cb.io_read((cpu.b << 8) | cpu.c));

    const result = (cpu.l | (cpu.h << 8)) + 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    cpu.flags.N = 1;
  };

  const do_outi = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cb.mem_read(cpu.l | (cpu.h << 8)));

    const result = (cpu.l | (cpu.h << 8)) + 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    cpu.b = do_dec(cpu.b);
    cpu.flags.N = 1;
  };

  const do_ldd = (): void => {
    cpu.flags.N = 0;
    cpu.flags.H = 0;

    const read_value = cb.mem_read(cpu.l | (cpu.h << 8));
    cb.mem_write(cpu.e | (cpu.d << 8), read_value);

    let result = (cpu.e | (cpu.d << 8)) - 1;
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
    result = (cpu.l | (cpu.h << 8)) - 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
    result = (cpu.c | (cpu.b << 8)) - 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;

    cpu.flags.P = cpu.c || cpu.b ? 1 : 0;
    cpu.flags.Y = ((cpu.a + read_value) & 0x02) >>> 1;
    cpu.flags.X = ((cpu.a + read_value) & 0x08) >>> 3;
  };

  const do_cpd = (): void => {
    const temp_carry = cpu.flags.C;
    const read_value = cb.mem_read(cpu.l | (cpu.h << 8));
    do_cp(read_value);
    cpu.flags.C = temp_carry;
    cpu.flags.Y = ((cpu.a - read_value - cpu.flags.H) & 0x02) >>> 1;
    cpu.flags.X = ((cpu.a - read_value - cpu.flags.H) & 0x08) >>> 3;

    let result = (cpu.l | (cpu.h << 8)) - 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
    result = (cpu.c | (cpu.b << 8)) - 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;

    cpu.flags.P = result ? 1 : 0;
  };

  const do_ind = (): void => {
    cpu.b = do_dec(cpu.b);

    cb.mem_write(cpu.l | (cpu.h << 8), cb.io_read((cpu.b << 8) | cpu.c));

    const result = (cpu.l | (cpu.h << 8)) - 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    cpu.flags.N = 1;
  };

  const do_outd = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cb.mem_read(cpu.l | (cpu.h << 8)));

    const result = (cpu.l | (cpu.h << 8)) - 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    cpu.b = do_dec(cpu.b);
    cpu.flags.N = 1;
  };

  const do_rlc = (operand: number): number => do_rlc_base(cpu, operand);

  const do_rrc = (operand: number): number => do_rrc_base(cpu, operand);

  const do_rl = (operand: number): number => do_rl_base(cpu, operand);

  const do_rr = (operand: number): number => do_rr_base(cpu, operand);

  const do_sla = (operand: number): number => do_sla_base(cpu, operand);

  const do_sra = (operand: number): number => do_sra_base(cpu, operand);

  const do_sll = (operand: number): number => do_sll_base(cpu, operand);

  const do_srl = (operand: number): number => do_srl_base(cpu, operand);

  /** ADD IX, operand - 16-bit addition to IX register */
  const do_ix_add = (operand: number): void => {
    cpu.flags.N = 0;

    const result = cpu.ix + operand;

    cpu.flags.C = result & 0x10000 ? 1 : 0;
    cpu.flags.H = ((cpu.ix & 0xfff) + (operand & 0xfff)) & 0x1000 ? 1 : 0;
    update_xy_flags((result & 0xff00) >>> 8);

    cpu.ix = result;
  };

  // ==========================================================================
  // DD/ED PREFIX TABLES (EXTRACTED)
  // ==========================================================================
  const dd_instructions = buildDdInstructions({
    cpu,
    cb,
    getSignedOffsetByte: get_signed_offset_byte,
    do_ix_add,
    do_inc,
    do_dec,
    do_add,
    do_adc,
    do_sub,
    do_sbc,
    do_and,
    do_xor,
    do_or,
    do_cp,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    do_sla,
    do_sra,
    do_sll,
    do_srl,
    pop_word,
  });
  const ed_instructions = buildEdInstructions({
    cpu,
    cb,
    do_in,
    do_hl_sbc,
    do_hl_adc,
    do_neg,
    pop_word,
    update_xy_flags,
    do_ldi,
    do_cpi,
    do_ini,
    do_outi,
    do_ldd,
    do_cpd,
    do_ind,
    do_outd,
  });


  // ==========================================================================
  // MAIN INSTRUCTION TABLE (PRIMARY OPCODES 0x00-0xFF)
  // ==========================================================================
  // This table contains implementations for instructions that aren't decoded
  // directly (8-bit register loads 0x40-0x7F and ALU 0x80-0xBF are handled
  // by the register/ALU decoder at the end of this function).
  // ==========================================================================
  const instructions: OpcodeTable = new Array<OpcodeHandler>(256).fill(noop);

  // 0x00 : NOP
  instructions[0x00] = (): void => {
    // do nothing
  };
  // 0x01 : LD BC, nn
  instructions[0x01] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.c = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.b = cb.mem_read(cpu.pc);
  };
  // 0x02 : LD (BC), A
  instructions[0x02] = (): void => {
    cb.mem_write(cpu.c | (cpu.b << 8), cpu.a);
  };
  // 0x03 : INC BC
  instructions[0x03] = (): void => {
    let result = cpu.c | (cpu.b << 8);
    result += 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;
  };
  // 0x04 : INC B
  instructions[0x04] = (): void => {
    cpu.b = do_inc(cpu.b);
  };
  // 0x05 : DEC B
  instructions[0x05] = (): void => {
    cpu.b = do_dec(cpu.b);
  };
  // 0x06 : LD B, n
  instructions[0x06] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.b = cb.mem_read(cpu.pc);
  };
  // 0x07 : RLCA
  instructions[0x07] = (): void => {
    // This instruction is implemented as a special case of the
    //  more general Z80-specific RLC instruction.
    // Specifially, RLCA is a version of RLC A that affects fewer flags.
    // The same applies to RRCA, RLA, and RRA.
    const temp_s = cpu.flags.S;
    const temp_z = cpu.flags.Z;
    const temp_p = cpu.flags.P;
    cpu.a = do_rlc(cpu.a);
    cpu.flags.S = temp_s;
    cpu.flags.Z = temp_z;
    cpu.flags.P = temp_p;
  };
  // 0x08 : EX AF, AF'
  instructions[0x08] = (): void => {
    let temp = cpu.a;
    cpu.a = cpu.a_prime;
    cpu.a_prime = temp;

    temp = get_flags_register();
    setFlagsRegister(cpu, get_flags_prime());
    set_flags_prime(temp);
  };
  // 0x09 : ADD HL, BC
  instructions[0x09] = (): void => {
    do_hl_add(cpu.c | (cpu.b << 8));
  };
  // 0x0a : LD A, (BC)
  instructions[0x0a] = (): void => {
    cpu.a = cb.mem_read(cpu.c | (cpu.b << 8));
  };
  // 0x0b : DEC BC
  instructions[0x0b] = (): void => {
    let result = cpu.c | (cpu.b << 8);
    result -= 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;
  };
  // 0x0c : INC C
  instructions[0x0c] = (): void => {
    cpu.c = do_inc(cpu.c);
  };
  // 0x0d : DEC C
  instructions[0x0d] = (): void => {
    cpu.c = do_dec(cpu.c);
  };
  // 0x0e : LD C, n
  instructions[0x0e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.c = cb.mem_read(cpu.pc);
  };
  // 0x0f : RRCA
  instructions[0x0f] = (): void => {
    const temp_s = cpu.flags.S;
    const temp_z = cpu.flags.Z;
    const temp_p = cpu.flags.P;
    cpu.a = do_rrc(cpu.a);
    cpu.flags.S = temp_s;
    cpu.flags.Z = temp_z;
    cpu.flags.P = temp_p;
  };
  // 0x10 : DJNZ nn
  instructions[0x10] = (): void => {
    cpu.b = (cpu.b - 1) & 0xff;
    do_conditional_relative_jump(cpu.b !== 0);
  };
  // 0x11 : LD DE, nn
  instructions[0x11] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.e = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.d = cb.mem_read(cpu.pc);
  };
  // 0x12 : LD (DE), A
  instructions[0x12] = (): void => {
    cb.mem_write(cpu.e | (cpu.d << 8), cpu.a);
  };
  // 0x13 : INC DE
  instructions[0x13] = (): void => {
    let result = cpu.e | (cpu.d << 8);
    result += 1;
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
  };
  // 0x14 : INC D
  instructions[0x14] = (): void => {
    cpu.d = do_inc(cpu.d);
  };
  // 0x15 : DEC D
  instructions[0x15] = (): void => {
    cpu.d = do_dec(cpu.d);
  };
  // 0x16 : LD D, n
  instructions[0x16] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.d = cb.mem_read(cpu.pc);
  };
  // 0x17 : RLA
  instructions[0x17] = (): void => {
    const temp_s = cpu.flags.S;
    const temp_z = cpu.flags.Z;
    const temp_p = cpu.flags.P;
    cpu.a = do_rl(cpu.a);
    cpu.flags.S = temp_s;
    cpu.flags.Z = temp_z;
    cpu.flags.P = temp_p;
  };
  // 0x18 : JR n
  instructions[0x18] = (): void => {
    const offset = get_signed_offset_byte(cb.mem_read((cpu.pc + 1) & 0xffff));
    cpu.pc = (cpu.pc + offset + 1) & 0xffff;
  };
  // 0x19 : ADD HL, DE
  instructions[0x19] = (): void => {
    do_hl_add(cpu.e | (cpu.d << 8));
  };
  // 0x1a : LD A, (DE)
  instructions[0x1a] = (): void => {
    cpu.a = cb.mem_read(cpu.e | (cpu.d << 8));
  };
  // 0x1b : DEC DE
  instructions[0x1b] = (): void => {
    let result = cpu.e | (cpu.d << 8);
    result -= 1;
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
  };
  // 0x1c : INC E
  instructions[0x1c] = (): void => {
    cpu.e = do_inc(cpu.e);
  };
  // 0x1d : DEC E
  instructions[0x1d] = (): void => {
    cpu.e = do_dec(cpu.e);
  };
  // 0x1e : LD E, n
  instructions[0x1e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.e = cb.mem_read(cpu.pc);
  };
  // 0x1f : RRA
  instructions[0x1f] = (): void => {
    const temp_s = cpu.flags.S;
    const temp_z = cpu.flags.Z;
    const temp_p = cpu.flags.P;
    cpu.a = do_rr(cpu.a);
    cpu.flags.S = temp_s;
    cpu.flags.Z = temp_z;
    cpu.flags.P = temp_p;
  };
  // 0x20 : JR NZ, n
  instructions[0x20] = (): void => {
    do_conditional_relative_jump(!cpu.flags.Z);
  };
  // 0x21 : LD HL, nn
  instructions[0x21] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.l = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.h = cb.mem_read(cpu.pc);
  };
  // 0x22 : LD (nn), HL
  instructions[0x22] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.l);
    cb.mem_write((address + 1) & 0xffff, cpu.h);
  };
  // 0x23 : INC HL
  instructions[0x23] = (): void => {
    let result = cpu.l | (cpu.h << 8);
    result += 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
  };
  // 0x24 : INC H
  instructions[0x24] = (): void => {
    cpu.h = do_inc(cpu.h);
  };
  // 0x25 : DEC H
  instructions[0x25] = (): void => {
    cpu.h = do_dec(cpu.h);
  };
  // 0x26 : LD H, n
  instructions[0x26] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.h = cb.mem_read(cpu.pc);
  };
  // 0x27 : DAA
  instructions[0x27] = (): void => {
    let temp = cpu.a;
    if (!cpu.flags.N) {
      if (cpu.flags.H || (cpu.a & 0x0f) > 9) {
        temp += 0x06;
      }
      if (cpu.flags.C || cpu.a > 0x99) {
        temp += 0x60;
      }
    } else {
      if (cpu.flags.H || (cpu.a & 0x0f) > 9) {
        temp -= 0x06;
      }
      if (cpu.flags.C || cpu.a > 0x99) {
        temp -= 0x60;
      }
    }

    cpu.flags.S = temp & 0x80 ? 1 : 0;
    cpu.flags.Z = !(temp & 0xff) ? 1 : 0;
    cpu.flags.H = (cpu.a & 0x10) ^ (temp & 0x10) ? 1 : 0;
    cpu.flags.P = parity_bits[temp & 0xff] ?? 0;
    // DAA never clears the carry flag if it was already set,
    //  but it is able to set the carry flag if it was clear.
    // Don't ask me, I don't know.
    // Note also that we check for a BCD carry, instead of the usual.
    cpu.flags.C = cpu.flags.C || cpu.a > 0x99 ? 1 : 0;

    cpu.a = temp & 0xff;

    update_xy_flags(cpu.a);
  };
  // 0x28 : JR Z, n
  instructions[0x28] = (): void => {
    do_conditional_relative_jump(!!cpu.flags.Z);
  };
  // 0x29 : ADD HL, HL
  instructions[0x29] = (): void => {
    do_hl_add(cpu.l | (cpu.h << 8));
  };
  // 0x2a : LD HL, (nn)
  instructions[0x2a] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.l = cb.mem_read(address);
    cpu.h = cb.mem_read((address + 1) & 0xffff);
  };
  // 0x2b : DEC HL
  instructions[0x2b] = (): void => {
    let result = cpu.l | (cpu.h << 8);
    result -= 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
  };
  // 0x2c : INC L
  instructions[0x2c] = (): void => {
    cpu.l = do_inc(cpu.l);
  };
  // 0x2d : DEC L
  instructions[0x2d] = (): void => {
    cpu.l = do_dec(cpu.l);
  };
  // 0x2e : LD L, n
  instructions[0x2e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.l = cb.mem_read(cpu.pc);
  };
  // 0x2f : CPL
  instructions[0x2f] = (): void => {
    cpu.a = ~cpu.a & 0xff;
    cpu.flags.N = 1;
    cpu.flags.H = 1;
    update_xy_flags(cpu.a);
  };
  // 0x30 : JR NC, n
  instructions[0x30] = (): void => {
    do_conditional_relative_jump(!cpu.flags.C);
  };
  // 0x31 : LD SP, nn
  instructions[0x31] = (): void => {
    cpu.sp = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
    cpu.pc = (cpu.pc + 2) & 0xffff;
  };
  // 0x32 : LD (nn), A
  instructions[0x32] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.a);
  };
  // 0x33 : INC SP
  instructions[0x33] = (): void => {
    cpu.sp = (cpu.sp + 1) & 0xffff;
  };
  // 0x34 : INC (HL)
  instructions[0x34] = (): void => {
    const address = cpu.l | (cpu.h << 8);
    cb.mem_write(address, do_inc(cb.mem_read(address)));
  };
  // 0x35 : DEC (HL)
  instructions[0x35] = (): void => {
    const address = cpu.l | (cpu.h << 8);
    cb.mem_write(address, do_dec(cb.mem_read(address)));
  };
  // 0x36 : LD (HL), n
  instructions[0x36] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cb.mem_write(cpu.l | (cpu.h << 8), cb.mem_read(cpu.pc));
  };
  // 0x37 : SCF
  instructions[0x37] = (): void => {
    cpu.flags.N = 0;
    cpu.flags.H = 0;
    cpu.flags.C = 1;
    update_xy_flags(cpu.a);
  };
  // 0x38 : JR C, n
  instructions[0x38] = (): void => {
    do_conditional_relative_jump(!!cpu.flags.C);
  };
  // 0x39 : ADD HL, SP
  instructions[0x39] = (): void => {
    do_hl_add(cpu.sp);
  };
  // 0x3a : LD A, (nn)
  instructions[0x3a] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.a = cb.mem_read(address);
  };
  // 0x3b : DEC SP
  instructions[0x3b] = (): void => {
    cpu.sp = (cpu.sp - 1) & 0xffff;
  };
  // 0x3c : INC A
  instructions[0x3c] = (): void => {
    cpu.a = do_inc(cpu.a);
  };
  // 0x3d : DEC A
  instructions[0x3d] = (): void => {
    cpu.a = do_dec(cpu.a);
  };
  // 0x3e : LD A, n
  instructions[0x3e] = (): void => {
    cpu.a = cb.mem_read((cpu.pc + 1) & 0xffff);
    cpu.pc = (cpu.pc + 1) & 0xffff;
  };
  // 0x3f : CCF
  instructions[0x3f] = (): void => {
    cpu.flags.N = 0;
    cpu.flags.H = cpu.flags.C;
    cpu.flags.C = cpu.flags.C ? 0 : 1;
    update_xy_flags(cpu.a);
  };
  // 0xc0 : RET NZ
  instructions[0xc0] = (): void => {
    do_conditional_return(!cpu.flags.Z);
  };
  // 0xc1 : POP BC
  instructions[0xc1] = (): void => {
    const result = pop_word();
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;
  };
  // 0xc2 : JP NZ, nn
  instructions[0xc2] = (): void => {
    do_conditional_absolute_jump(!cpu.flags.Z);
  };
  // 0xc3 : JP nn
  instructions[0xc3] = (): void => {
    cpu.pc = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
    cpu.pc = (cpu.pc - 1) & 0xffff;
  };
  // 0xc4 : CALL NZ, nn
  instructions[0xc4] = (): void => {
    do_conditional_call(!cpu.flags.Z);
  };
  // 0xc5 : PUSH BC
  instructions[0xc5] = (): void => {
    pushWord(cpu, cb, cpu.c | (cpu.b << 8));
  };
  // 0xc6 : ADD A, n
  instructions[0xc6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_add(cb.mem_read(cpu.pc));
  };
  // 0xc7 : RST 00h
  instructions[0xc7] = (): void => {
    do_reset(0x00);
  };
  // 0xc8 : RET Z
  instructions[0xc8] = (): void => {
    do_conditional_return(!!cpu.flags.Z);
  };
  // 0xc9 : RET
  instructions[0xc9] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
  };
  // 0xca : JP Z, nn
  instructions[0xca] = (): void => {
    do_conditional_absolute_jump(!!cpu.flags.Z);
  };

  // ==========================================================================
  // CB PREFIX HANDLER (BIT OPERATIONS)
  // ==========================================================================
  // The CB prefix provides bit manipulation instructions:
  // - RLC, RRC, RL, RR, SLA, SRA, SLL, SRL (0x00-0x3F)
  // - BIT (0x40-0x7F)
  // - RES (0x80-0xBF)
  // - SET (0xC0-0xFF)
  // Decoded directly due to uniform structure.
  // ==========================================================================
  instructions[0xcb] = (): void => {
    // R is incremented at the start of the second instruction cycle
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    const bit_number = (opcode1 & 0x38) >>> 3;
    const reg_code = opcode1 & 0x07;

    if (opcode1 < 0x40) {
      // Shift/rotate instructions
      const op_array: ByteOpHandler[] = [
        do_rlc,
        do_rrc,
        do_rl,
        do_rr,
        do_sla,
        do_sra,
        do_sll,
        do_srl,
      ];
      const rotate = getByteOp(op_array, bit_number);

      if (reg_code === 0) {
        cpu.b = rotate(cpu.b);
      } else if (reg_code === 1) {
        cpu.c = rotate(cpu.c);
      } else if (reg_code === 2) {
        cpu.d = rotate(cpu.d);
      } else if (reg_code === 3) {
        cpu.e = rotate(cpu.e);
      } else if (reg_code === 4) {
        cpu.h = rotate(cpu.h);
      } else if (reg_code === 5) {
        cpu.l = rotate(cpu.l);
      } else if (reg_code === 6) {
        cb.mem_write(cpu.l | (cpu.h << 8), rotate(cb.mem_read(cpu.l | (cpu.h << 8))));
      } else if (reg_code === 7) {
        cpu.a = rotate(cpu.a);
      }
    } else if (opcode1 < 0x80) {
      // BIT instructions
      if (reg_code === 0) {
        cpu.flags.Z = !(cpu.b & (1 << bit_number)) ? 1 : 0;
      } else if (reg_code === 1) {
        cpu.flags.Z = !(cpu.c & (1 << bit_number)) ? 1 : 0;
      } else if (reg_code === 2) {
        cpu.flags.Z = !(cpu.d & (1 << bit_number)) ? 1 : 0;
      } else if (reg_code === 3) {
        cpu.flags.Z = !(cpu.e & (1 << bit_number)) ? 1 : 0;
      } else if (reg_code === 4) {
        cpu.flags.Z = !(cpu.h & (1 << bit_number)) ? 1 : 0;
      } else if (reg_code === 5) {
        cpu.flags.Z = !(cpu.l & (1 << bit_number)) ? 1 : 0;
      } else if (reg_code === 6) {
        cpu.flags.Z = !(cb.mem_read(cpu.l | (cpu.h << 8)) & (1 << bit_number)) ? 1 : 0;
      } else if (reg_code === 7) {
        cpu.flags.Z = !(cpu.a & (1 << bit_number)) ? 1 : 0;
      }

      cpu.flags.N = 0;
      cpu.flags.H = 1;
      cpu.flags.P = cpu.flags.Z;
      cpu.flags.S = bit_number === 7 && !cpu.flags.Z ? 1 : 0;
      // For the BIT n, (HL) instruction, the X and Y flags are obtained
      //  from what is apparently an internal temporary register used for
      //  some of the 16-bit arithmetic instructions.
      // I haven't implemented that register here,
      //  so for now we'll set X and Y the same way for every BIT opcode,
      //  which means that they will usually be wrong for BIT n, (HL).
      cpu.flags.Y = bit_number === 5 && !cpu.flags.Z ? 1 : 0;
      cpu.flags.X = bit_number === 3 && !cpu.flags.Z ? 1 : 0;
    } else if (opcode1 < 0xc0) {
      // RES instructions
      if (reg_code === 0) {
        cpu.b &= 0xff & ~(1 << bit_number);
      } else if (reg_code === 1) {
        cpu.c &= 0xff & ~(1 << bit_number);
      } else if (reg_code === 2) {
        cpu.d &= 0xff & ~(1 << bit_number);
      } else if (reg_code === 3) {
        cpu.e &= 0xff & ~(1 << bit_number);
      } else if (reg_code === 4) {
        cpu.h &= 0xff & ~(1 << bit_number);
      } else if (reg_code === 5) {
        cpu.l &= 0xff & ~(1 << bit_number);
      } else if (reg_code === 6) {
        cb.mem_write(cpu.l | (cpu.h << 8), cb.mem_read(cpu.l | (cpu.h << 8)) & ~(1 << bit_number));
      } else if (reg_code === 7) {
        cpu.a &= 0xff & ~(1 << bit_number);
      }
    } else {
      // SET instructions
      if (reg_code === 0) {
        cpu.b |= 1 << bit_number;
      } else if (reg_code === 1) {
        cpu.c |= 1 << bit_number;
      } else if (reg_code === 2) {
        cpu.d |= 1 << bit_number;
      } else if (reg_code === 3) {
        cpu.e |= 1 << bit_number;
      } else if (reg_code === 4) {
        cpu.h |= 1 << bit_number;
      } else if (reg_code === 5) {
        cpu.l |= 1 << bit_number;
      } else if (reg_code === 6) {
        cb.mem_write(cpu.l | (cpu.h << 8), cb.mem_read(cpu.l | (cpu.h << 8)) | (1 << bit_number));
      } else if (reg_code === 7) {
        cpu.a |= 1 << bit_number;
      }
    }

    cpu.cycle_counter += cycle_counts_cb[opcode1] ?? 0;
  };
  // 0xcc : CALL Z, nn
  instructions[0xcc] = (): void => {
    do_conditional_call(!!cpu.flags.Z);
  };
  // 0xcd : CALL nn
  instructions[0xcd] = (): void => {
    pushWord(cpu, cb, (cpu.pc + 3) & 0xffff);
    cpu.pc = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
    cpu.pc = (cpu.pc - 1) & 0xffff;
  };
  // 0xce : ADC A, n
  instructions[0xce] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_adc(cb.mem_read(cpu.pc));
  };
  // 0xcf : RST 08h
  instructions[0xcf] = (): void => {
    do_reset(0x08);
  };
  // 0xd0 : RET NC
  instructions[0xd0] = (): void => {
    do_conditional_return(!cpu.flags.C);
  };
  // 0xd1 : POP DE
  instructions[0xd1] = (): void => {
    const result = pop_word();
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
  };
  // 0xd2 : JP NC, nn
  instructions[0xd2] = (): void => {
    do_conditional_absolute_jump(!cpu.flags.C);
  };
  // 0xd3 : OUT (n), A
  instructions[0xd3] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cb.io_write((cpu.a << 8) | cb.mem_read(cpu.pc), cpu.a);
  };
  // 0xd4 : CALL NC, nn
  instructions[0xd4] = (): void => {
    do_conditional_call(!cpu.flags.C);
  };
  // 0xd5 : PUSH DE
  instructions[0xd5] = (): void => {
    pushWord(cpu, cb, cpu.e | (cpu.d << 8));
  };
  // 0xd6 : SUB n
  instructions[0xd6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_sub(cb.mem_read(cpu.pc));
  };
  // 0xd7 : RST 10h
  instructions[0xd7] = (): void => {
    do_reset(0x10);
  };
  // 0xd8 : RET C
  instructions[0xd8] = (): void => {
    do_conditional_return(!!cpu.flags.C);
  };
  // 0xd9 : EXX
  instructions[0xd9] = (): void => {
    let temp = cpu.b;
    cpu.b = cpu.b_prime;
    cpu.b_prime = temp;
    temp = cpu.c;
    cpu.c = cpu.c_prime;
    cpu.c_prime = temp;
    temp = cpu.d;
    cpu.d = cpu.d_prime;
    cpu.d_prime = temp;
    temp = cpu.e;
    cpu.e = cpu.e_prime;
    cpu.e_prime = temp;
    temp = cpu.h;
    cpu.h = cpu.h_prime;
    cpu.h_prime = temp;
    temp = cpu.l;
    cpu.l = cpu.l_prime;
    cpu.l_prime = temp;
  };
  // 0xda : JP C, nn
  instructions[0xda] = (): void => {
    do_conditional_absolute_jump(!!cpu.flags.C);
  };
  // 0xdb : IN A, (n)
  instructions[0xdb] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.a = cb.io_read((cpu.a << 8) | cb.mem_read(cpu.pc));
  };
  // 0xdc : CALL C, nn
  instructions[0xdc] = (): void => {
    do_conditional_call(!!cpu.flags.C);
  };
  // 0xdd : DD Prefix (IX instructions)
  instructions[0xdd] = (): void => {
    // R is incremented at the start of the second instruction cycle,
    //  before the instruction actually runs.
    // The high bit of R is not affected by this increment,
    //  it can only be changed using the LD R, A instruction.
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    const func = dd_instructions[opcode1] ?? noop;

    func();
    const ddCycles = cycle_counts_dd[opcode1] ?? cycle_counts[0] ?? 0;
    cpu.cycle_counter += ddCycles;
  };
  // 0xde : SBC n
  instructions[0xde] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_sbc(cb.mem_read(cpu.pc));
  };
  // 0xdf : RST 18h
  instructions[0xdf] = (): void => {
    do_reset(0x18);
  };
  // 0xe0 : RET PO
  instructions[0xe0] = (): void => {
    do_conditional_return(!cpu.flags.P);
  };
  // 0xe1 : POP HL
  instructions[0xe1] = (): void => {
    const result = pop_word();
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
  };
  // 0xe2 : JP PO, (nn)
  instructions[0xe2] = (): void => {
    do_conditional_absolute_jump(!cpu.flags.P);
  };
  // 0xe3 : EX (SP), HL
  instructions[0xe3] = (): void => {
    let temp = cb.mem_read(cpu.sp);
    cb.mem_write(cpu.sp, cpu.l);
    cpu.l = temp;
    temp = cb.mem_read((cpu.sp + 1) & 0xffff);
    cb.mem_write((cpu.sp + 1) & 0xffff, cpu.h);
    cpu.h = temp;
  };
  // 0xe4 : CALL PO, nn
  instructions[0xe4] = (): void => {
    do_conditional_call(!cpu.flags.P);
  };
  // 0xe5 : PUSH HL
  instructions[0xe5] = (): void => {
    pushWord(cpu, cb, cpu.l | (cpu.h << 8));
  };
  // 0xe6 : AND n
  instructions[0xe6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_and(cb.mem_read(cpu.pc));
  };
  // 0xe7 : RST 20h
  instructions[0xe7] = (): void => {
    do_reset(0x20);
  };
  // 0xe8 : RET PE
  instructions[0xe8] = (): void => {
    do_conditional_return(!!cpu.flags.P);
  };
  // 0xe9 : JP (HL)
  instructions[0xe9] = (): void => {
    cpu.pc = cpu.l | (cpu.h << 8);
    cpu.pc = (cpu.pc - 1) & 0xffff;
  };
  // 0xea : JP PE, nn
  instructions[0xea] = (): void => {
    do_conditional_absolute_jump(!!cpu.flags.P);
  };
  // 0xeb : EX DE, HL
  instructions[0xeb] = (): void => {
    let temp = cpu.d;
    cpu.d = cpu.h;
    cpu.h = temp;
    temp = cpu.e;
    cpu.e = cpu.l;
    cpu.l = temp;
  };
  // 0xec : CALL PE, nn
  instructions[0xec] = (): void => {
    do_conditional_call(!!cpu.flags.P);
  };
  // 0xed : ED Prefix
  instructions[0xed] = (): void => {
    // R is incremented at the start of the second instruction cycle,
    //  before the instruction actually runs.
    // The high bit of R is not affected by this increment,
    //  it can only be changed using the LD R, A instruction.
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    const func = ed_instructions[opcode1] ?? noop;

    func();
    const edCycles = cycle_counts_ed[opcode1] ?? cycle_counts[0] ?? 0;
    cpu.cycle_counter += edCycles;
  };
  // 0xee : XOR n
  instructions[0xee] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_xor(cb.mem_read(cpu.pc));
  };
  // 0xef : RST 28h
  instructions[0xef] = (): void => {
    do_reset(0x28);
  };
  // 0xf0 : RET P
  instructions[0xf0] = (): void => {
    do_conditional_return(!cpu.flags.S);
  };
  // 0xf1 : POP AF
  instructions[0xf1] = (): void => {
    const result = pop_word();
    setFlagsRegister(cpu, result & 0xff);
    cpu.a = (result & 0xff00) >>> 8;
  };
  // 0xf2 : JP P, nn
  instructions[0xf2] = (): void => {
    do_conditional_absolute_jump(!cpu.flags.S);
  };
  // 0xf3 : DI
  instructions[0xf3] = (): void => {
    // DI doesn't actually take effect until after the next instruction.
    cpu.do_delayed_di = true;
  };
  // 0xf4 : CALL P, nn
  instructions[0xf4] = (): void => {
    do_conditional_call(!cpu.flags.S);
  };
  // 0xf5 : PUSH AF
  instructions[0xf5] = (): void => {
    pushWord(cpu, cb, get_flags_register() | (cpu.a << 8));
  };
  // 0xf6 : OR n
  instructions[0xf6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_or(cb.mem_read(cpu.pc));
  };
  // 0xf7 : RST 30h
  instructions[0xf7] = (): void => {
    do_reset(0x30);
  };
  // 0xf8 : RET M
  instructions[0xf8] = (): void => {
    do_conditional_return(!!cpu.flags.S);
  };
  // 0xf9 : LD SP, HL
  instructions[0xf9] = (): void => {
    cpu.sp = cpu.l | (cpu.h << 8);
  };
  // 0xfa : JP M, nn
  instructions[0xfa] = (): void => {
    do_conditional_absolute_jump(!!cpu.flags.S);
  };
  // 0xfb : EI
  instructions[0xfb] = (): void => {
    // EI doesn't actually take effect until after the next instruction.
    cpu.do_delayed_ei = true;
  };
  // 0xfc : CALL M, nn
  instructions[0xfc] = (): void => {
    do_conditional_call(!!cpu.flags.S);
  };

  // ==========================================================================
  // FD PREFIX HANDLER (IY INSTRUCTIONS)
  // ==========================================================================
  // The FD prefix provides access to the IY index register.
  // Implementation: Swap IX↔IY, execute DD instruction, swap back.
  // This elegant trick reuses the entire DD table for IY operations.
  // ==========================================================================
  instructions[0xfd] = (): void => {
    // R is incremented at the start of the second instruction cycle
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    const func = dd_instructions[opcode1] ?? noop;

    // Swap IX and IY, execute the DD instruction, then swap back
    const temp = cpu.ix;
    cpu.ix = cpu.iy;
    func();
    cpu.iy = cpu.ix;
    cpu.ix = temp;

    const fdCycles = cycle_counts_dd[opcode1] ?? cycle_counts[0] ?? 0;
    cpu.cycle_counter += fdCycles;
  };
  // 0xfe : CP n
  instructions[0xfe] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_cp(cb.mem_read(cpu.pc));
  };
  // 0xff : RST 38h
  instructions[0xff] = (): void => {
    do_reset(0x38);
  };

  // ==========================================================================
  // REGISTER/ALU DECODER (0x40-0xBF)
  // ==========================================================================
  // The 8-bit register loads (0x40-0x7F) and ALU operations (0x80-0xBF)
  // are so uniform that they're decoded directly rather than using the table.
  // ==========================================================================

  /**
   * Gets the operand value for register-based instructions.
   * Bits 0-2 of the opcode select the source register:
   * 0=B, 1=C, 2=D, 3=E, 4=H, 5=L, 6=(HL), 7=A
   */
  // eslint-disable-next-line no-shadow
  const get_operand = (opcode: number): number => {
    return (opcode & 0x07) === 0
      ? cpu.b
      : (opcode & 0x07) === 1
        ? cpu.c
        : (opcode & 0x07) === 2
          ? cpu.d
          : (opcode & 0x07) === 3
            ? cpu.e
            : (opcode & 0x07) === 4
              ? cpu.h
              : (opcode & 0x07) === 5
                ? cpu.l
                : (opcode & 0x07) === 6
                  ? cb.mem_read(cpu.l | (cpu.h << 8))
                  : cpu.a;
  };

  // Handle HALT right up front, because it fouls up our LD decoding
  //  by falling where LD (HL), (HL) ought to be.
  if (opcode === 0x76) {
    cpu.halted = true;
  } else if (opcode >= 0x40 && opcode < 0x80) {
    // This entire range is all 8-bit register loads.
    // Get the operand and assign it to the correct destination.
    const operand = get_operand(opcode);

    if ((opcode & 0x38) >>> 3 === 0) {
      cpu.b = operand;
    } else if ((opcode & 0x38) >>> 3 === 1) {
      cpu.c = operand;
    } else if ((opcode & 0x38) >>> 3 === 2) {
      cpu.d = operand;
    } else if ((opcode & 0x38) >>> 3 === 3) {
      cpu.e = operand;
    } else if ((opcode & 0x38) >>> 3 === 4) {
      cpu.h = operand;
    } else if ((opcode & 0x38) >>> 3 === 5) {
      cpu.l = operand;
    } else if ((opcode & 0x38) >>> 3 === 6) {
      cb.mem_write(cpu.l | (cpu.h << 8), operand);
    } else if ((opcode & 0x38) >>> 3 === 7) {
      cpu.a = operand;
    }
  } else if (opcode >= 0x80 && opcode < 0xc0) {
    // These are the 8-bit register ALU instructions.
    // We'll get the operand and then use this "jump table"
    //  to call the correct utility function for the instruction.
    const operand = get_operand(opcode);
    const op_array: ByteOpVoid[] = [do_add, do_adc, do_sub, do_sbc, do_and, do_xor, do_or, do_cp];

    const alu = getVoidOp(op_array, (opcode & 0x38) >>> 3);
    alu(operand);
  } else {
    // This is one of the less formulaic instructions;
    //  we'll get the specific function for it from our array.
    const func = instructions[opcode] ?? noop;
    func();
  }

  // Update the cycle counter with however many cycles
  //  the base instruction took.
  // If this was a prefixed instruction, then
  //  the prefix handler has added its extra cycles already.
  cpu.cycle_counter += cycle_counts[opcode] ?? 0;
};
