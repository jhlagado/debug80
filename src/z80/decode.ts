/**
 * @fileoverview Z80 Instruction Decoder
 *
 * This module implements the complete Z80 instruction set decoder. The architecture
 * uses a single function with nested handlers to share closure state (cpu, callbacks).
 *
 * ## Structure
 * The file is organized into these logical sections:
 * - **Utility Functions** (lines ~45-550): Signed bytes, flags, stack, ALU operations
 * - **DD Prefix Table**: Extracted to `decode-dd.ts`
 * - **DDCB Prefix Handler**: Extracted to `decode-ddcb.ts`
 * - **ED Prefix Table**: Extracted to `decode-ed.ts`
 * - **Primary Instruction Table**: Extracted to `decode-primary.ts`
 * - **CB Prefix Handler**: Extracted to `decode-cb.ts`
 * - **FD Prefix Handler**: Extracted to `decode-fd.ts`
 * - **Register/ALU Decoder**: Extracted to `decode-primary.ts`
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

import { parity_bits } from './constants';
import {
  flagsToByte,
  pushWord,
  setFlagsFromByte,
  setFlagsRegister,
  updateXYFlags,
} from './core-helpers';
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
import { buildCbHandler } from './decode-cb';
import { buildDdHandler, buildDdInstructions } from './decode-dd';
import { buildEdHandler, buildEdInstructions } from './decode-ed';
import { buildFdHandler } from './decode-fd';
import { buildPrimaryInstructions, executePrimaryOpcode } from './decode-primary';

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
  const ddInstructions = buildDdInstructions({
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
  const edInstructions = buildEdInstructions({
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



  const cb_handler = buildCbHandler({
    cpu,
    cb,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    do_sla,
    do_sra,
    do_sll,
    do_srl,
  });
  const dd_handler = buildDdHandler({
    cpu,
    cb,
    ddInstructions,
  });
  const ed_handler = buildEdHandler({
    cpu,
    cb,
    edInstructions,
  });
  const fd_handler = buildFdHandler({
    cpu,
    cb,
    ddInstructions,
  });

  const primaryContext = {
    cpu,
    cb,
    pushWord,
    setFlagsRegister,
    get_flags_register,
    get_flags_prime,
    set_flags_prime,
    update_xy_flags,
    get_signed_offset_byte,
    pop_word,
    do_conditional_absolute_jump,
    do_conditional_relative_jump,
    do_conditional_call,
    do_conditional_return,
    do_reset,
    do_add,
    do_adc,
    do_sub,
    do_sbc,
    do_and,
    do_xor,
    do_or,
    do_cp,
    do_inc,
    do_dec,
    do_hl_add,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    cbHandler: cb_handler,
    ddHandler: dd_handler,
    edHandler: ed_handler,
    fdHandler: fd_handler,
  };

  const instructions = buildPrimaryInstructions(primaryContext);
  executePrimaryOpcode(primaryContext, opcode, instructions);
};
