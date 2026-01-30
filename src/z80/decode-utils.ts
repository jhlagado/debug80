/**
 * @file Z80 Decode Utility Functions
 * @description Shared utility functions for instruction decoding.
 * All functions take a DecodeContext as the first parameter,
 * eliminating closure dependencies.
 *
 * @module z80/decode-utils
 */

import { parity_bits } from './constants';
import {
  flagsToByte,
  pushWord as pushWordCore,
  setFlagsFromByte,
  updateXYFlags as updateXYFlagsCore,
} from './core-helpers';
import {
  do_rl as doRlBase,
  do_rlc as doRlcBase,
  do_rr as doRrBase,
  do_rrc as doRrcBase,
  do_sla as doSlaBase,
  do_sll as doSllBase,
  do_sra as doSraBase,
  do_srl as doSrlBase,
} from './rotate';
import { DecodeContext, DecodeUtils } from './decode-types';

// ============================================================================
// SIGNED OFFSET CONVERSION
// ============================================================================

/**
 * Converts an unsigned byte to a signed offset (-128 to 127).
 * Used for relative jumps and indexed addressing.
 */
export function getSignedOffsetByte(value: number): number {
  value &= 0xff;
  if (value & 0x80) {
    value = -((0xff & ~value) + 1);
  }
  return value;
}

// ============================================================================
// FLAG OPERATIONS
// ============================================================================

/**
 * Gets the flags register as a byte value.
 */
export function getFlagsRegister(ctx: DecodeContext): number {
  return flagsToByte(ctx.cpu.flags);
}

/**
 * Gets the alternate flags register as a byte value.
 */
export function getFlagsPrime(ctx: DecodeContext): number {
  return flagsToByte(ctx.cpu.flags_prime);
}

/**
 * Sets the alternate flags register from a byte value.
 */
export function setFlagsPrime(ctx: DecodeContext, value: number): void {
  setFlagsFromByte(ctx.cpu.flags_prime, value);
}

/**
 * Updates the undocumented X and Y flags based on result bits.
 */
export function updateXYFlags(ctx: DecodeContext, result: number): void {
  updateXYFlagsCore(ctx.cpu.flags, result);
}

// ============================================================================
// STACK OPERATIONS
// ============================================================================

/**
 * Pops a 16-bit word from the stack.
 */
export function popWord(ctx: DecodeContext): number {
  let retval = ctx.cb.mem_read(ctx.cpu.sp) & 0xff;
  ctx.cpu.sp = (ctx.cpu.sp + 1) & 0xffff;
  retval |= ctx.cb.mem_read(ctx.cpu.sp) << 8;
  ctx.cpu.sp = (ctx.cpu.sp + 1) & 0xffff;
  return retval;
}

/**
 * Pushes a 16-bit word onto the stack.
 */
export function pushWord(ctx: DecodeContext, value: number): void {
  pushWordCore(ctx.cpu, ctx.cb, value);
}

// ============================================================================
// JUMP/CALL OPERATIONS
// ============================================================================

/**
 * Conditional absolute jump (JP cc,nn).
 */
export function doConditionalAbsoluteJump(ctx: DecodeContext, condition: boolean): void {
  if (condition) {
    ctx.cpu.pc =
      ctx.cb.mem_read((ctx.cpu.pc + 1) & 0xffff) |
      (ctx.cb.mem_read((ctx.cpu.pc + 2) & 0xffff) << 8);
    ctx.cpu.pc = (ctx.cpu.pc - 1) & 0xffff;
  } else {
    ctx.cpu.pc = (ctx.cpu.pc + 2) & 0xffff;
  }
}

/**
 * Conditional relative jump (JR cc,e).
 */
export function doConditionalRelativeJump(ctx: DecodeContext, condition: boolean): void {
  if (condition) {
    ctx.cpu.cycle_counter += 5;
    const offset = getSignedOffsetByte(ctx.cb.mem_read((ctx.cpu.pc + 1) & 0xffff));
    ctx.cpu.pc = (ctx.cpu.pc + offset + 1) & 0xffff;
  } else {
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
}

/**
 * Conditional call (CALL cc,nn).
 */
export function doConditionalCall(ctx: DecodeContext, condition: boolean): void {
  if (condition) {
    ctx.cpu.cycle_counter += 7;
    pushWord(ctx, (ctx.cpu.pc + 3) & 0xffff);
    ctx.cpu.pc =
      ctx.cb.mem_read((ctx.cpu.pc + 1) & 0xffff) |
      (ctx.cb.mem_read((ctx.cpu.pc + 2) & 0xffff) << 8);
    ctx.cpu.pc = (ctx.cpu.pc - 1) & 0xffff;
  } else {
    ctx.cpu.pc = (ctx.cpu.pc + 2) & 0xffff;
  }
}

/**
 * Conditional return (RET cc).
 */
export function doConditionalReturn(ctx: DecodeContext, condition: boolean): void {
  if (condition) {
    ctx.cpu.cycle_counter += 6;
    ctx.cpu.pc = (popWord(ctx) - 1) & 0xffff;
  }
}

/**
 * RST instruction - pushes PC and jumps to fixed address.
 */
export function doReset(ctx: DecodeContext, address: number): void {
  pushWord(ctx, (ctx.cpu.pc + 1) & 0xffff);
  ctx.cpu.pc = (address - 1) & 0xffff;
}

// ============================================================================
// 8-BIT ALU OPERATIONS
// ============================================================================

/**
 * ADD A,n - Add to accumulator.
 */
export function doAdd(ctx: DecodeContext, operand: number): void {
  const result = ctx.cpu.a + operand;

  ctx.cpu.flags.S = result & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !(result & 0xff) ? 1 : 0;
  ctx.cpu.flags.H = ((operand & 0x0f) + (ctx.cpu.a & 0x0f)) & 0x10 ? 1 : 0;
  ctx.cpu.flags.P =
    (ctx.cpu.a & 0x80) === (operand & 0x80) && (ctx.cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.C = result & 0x100 ? 1 : 0;

  ctx.cpu.a = result & 0xff;
  updateXYFlags(ctx, ctx.cpu.a);
}

/**
 * ADC A,n - Add with carry to accumulator.
 */
export function doAdc(ctx: DecodeContext, operand: number): void {
  const result = ctx.cpu.a + operand + ctx.cpu.flags.C;

  ctx.cpu.flags.S = result & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !(result & 0xff) ? 1 : 0;
  ctx.cpu.flags.H = ((operand & 0x0f) + (ctx.cpu.a & 0x0f) + ctx.cpu.flags.C) & 0x10 ? 1 : 0;
  ctx.cpu.flags.P =
    (ctx.cpu.a & 0x80) === (operand & 0x80) && (ctx.cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.C = result & 0x100 ? 1 : 0;

  ctx.cpu.a = result & 0xff;
  updateXYFlags(ctx, ctx.cpu.a);
}

/**
 * SUB n - Subtract from accumulator.
 */
export function doSub(ctx: DecodeContext, operand: number): void {
  const result = ctx.cpu.a - operand;

  ctx.cpu.flags.S = result & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !(result & 0xff) ? 1 : 0;
  ctx.cpu.flags.H = ((ctx.cpu.a & 0x0f) - (operand & 0x0f)) & 0x10 ? 1 : 0;
  ctx.cpu.flags.P =
    (ctx.cpu.a & 0x80) !== (operand & 0x80) && (ctx.cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
  ctx.cpu.flags.N = 1;
  ctx.cpu.flags.C = result & 0x100 ? 1 : 0;

  ctx.cpu.a = result & 0xff;
  updateXYFlags(ctx, ctx.cpu.a);
}

/**
 * SBC A,n - Subtract with carry from accumulator.
 */
export function doSbc(ctx: DecodeContext, operand: number): void {
  const result = ctx.cpu.a - operand - ctx.cpu.flags.C;

  ctx.cpu.flags.S = result & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !(result & 0xff) ? 1 : 0;
  ctx.cpu.flags.H = ((ctx.cpu.a & 0x0f) - (operand & 0x0f) - ctx.cpu.flags.C) & 0x10 ? 1 : 0;
  ctx.cpu.flags.P =
    (ctx.cpu.a & 0x80) !== (operand & 0x80) && (ctx.cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
  ctx.cpu.flags.N = 1;
  ctx.cpu.flags.C = result & 0x100 ? 1 : 0;

  ctx.cpu.a = result & 0xff;
  updateXYFlags(ctx, ctx.cpu.a);
}

/**
 * CP n - Compare with accumulator.
 */
export function doCp(ctx: DecodeContext, operand: number): void {
  const temp = ctx.cpu.a;
  doSub(ctx, operand);
  ctx.cpu.a = temp;
  updateXYFlags(ctx, operand);
}

/**
 * AND n - Logical AND with accumulator.
 */
export function doAnd(ctx: DecodeContext, operand: number): void {
  ctx.cpu.a &= operand & 0xff;
  ctx.cpu.flags.S = ctx.cpu.a & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !ctx.cpu.a ? 1 : 0;
  ctx.cpu.flags.H = 1;
  ctx.cpu.flags.P = parity_bits[ctx.cpu.a] ?? 0;
  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.C = 0;
  updateXYFlags(ctx, ctx.cpu.a);
}

/**
 * OR n - Logical OR with accumulator.
 */
export function doOr(ctx: DecodeContext, operand: number): void {
  ctx.cpu.a = (operand | ctx.cpu.a) & 0xff;
  ctx.cpu.flags.S = ctx.cpu.a & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !ctx.cpu.a ? 1 : 0;
  ctx.cpu.flags.H = 0;
  ctx.cpu.flags.P = parity_bits[ctx.cpu.a] ?? 0;
  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.C = 0;
  updateXYFlags(ctx, ctx.cpu.a);
}

/**
 * XOR n - Logical XOR with accumulator.
 */
export function doXor(ctx: DecodeContext, operand: number): void {
  ctx.cpu.a = (operand ^ ctx.cpu.a) & 0xff;
  ctx.cpu.flags.S = ctx.cpu.a & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !ctx.cpu.a ? 1 : 0;
  ctx.cpu.flags.H = 0;
  ctx.cpu.flags.P = parity_bits[ctx.cpu.a] ?? 0;
  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.C = 0;
  updateXYFlags(ctx, ctx.cpu.a);
}

/**
 * INC n - Increment.
 */
export function doInc(ctx: DecodeContext, operand: number): number {
  let result = operand + 1;

  ctx.cpu.flags.S = result & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !(result & 0xff) ? 1 : 0;
  ctx.cpu.flags.H = (operand & 0x0f) === 0x0f ? 1 : 0;
  ctx.cpu.flags.P = operand === 0x7f ? 1 : 0;
  ctx.cpu.flags.N = 0;

  result &= 0xff;
  updateXYFlags(ctx, result);

  return result;
}

/**
 * DEC n - Decrement.
 */
export function doDec(ctx: DecodeContext, operand: number): number {
  let result = operand - 1;

  ctx.cpu.flags.S = result & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !(result & 0xff) ? 1 : 0;
  ctx.cpu.flags.H = (operand & 0x0f) === 0x00 ? 1 : 0;
  ctx.cpu.flags.P = operand === 0x80 ? 1 : 0;
  ctx.cpu.flags.N = 1;

  result &= 0xff;
  updateXYFlags(ctx, result);

  return result;
}

// ============================================================================
// 16-BIT ARITHMETIC OPERATIONS
// ============================================================================

/**
 * ADD HL,rr - Add to HL.
 */
export function doHlAdd(ctx: DecodeContext, operand: number): void {
  const hl = ctx.cpu.l | (ctx.cpu.h << 8);
  const result = hl + operand;

  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.C = result & 0x10000 ? 1 : 0;
  ctx.cpu.flags.H = ((hl & 0x0fff) + (operand & 0x0fff)) & 0x1000 ? 1 : 0;

  ctx.cpu.l = result & 0xff;
  ctx.cpu.h = (result & 0xff00) >>> 8;

  updateXYFlags(ctx, ctx.cpu.h);
}

/**
 * ADC HL,rr - Add with carry to HL.
 */
export function doHlAdc(ctx: DecodeContext, operand: number): void {
  operand += ctx.cpu.flags.C;
  const hl = ctx.cpu.l | (ctx.cpu.h << 8);
  const result = hl + operand;

  ctx.cpu.flags.S = result & 0x8000 ? 1 : 0;
  ctx.cpu.flags.Z = !(result & 0xffff) ? 1 : 0;
  ctx.cpu.flags.H = ((hl & 0x0fff) + (operand & 0x0fff)) & 0x1000 ? 1 : 0;
  ctx.cpu.flags.P =
    (hl & 0x8000) === (operand & 0x8000) && (result & 0x8000) !== (hl & 0x8000) ? 1 : 0;
  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.C = result & 0x10000 ? 1 : 0;

  ctx.cpu.l = result & 0xff;
  ctx.cpu.h = (result & 0xff00) >>> 8;

  updateXYFlags(ctx, ctx.cpu.h);
}

/**
 * SBC HL,rr - Subtract with carry from HL.
 */
export function doHlSbc(ctx: DecodeContext, operand: number): void {
  operand += ctx.cpu.flags.C;
  const hl = ctx.cpu.l | (ctx.cpu.h << 8);
  const result = hl - operand;

  ctx.cpu.flags.S = result & 0x8000 ? 1 : 0;
  ctx.cpu.flags.Z = !(result & 0xffff) ? 1 : 0;
  ctx.cpu.flags.H = ((hl & 0x0fff) - (operand & 0x0fff)) & 0x1000 ? 1 : 0;
  ctx.cpu.flags.P =
    (hl & 0x8000) !== (operand & 0x8000) && (result & 0x8000) !== (hl & 0x8000) ? 1 : 0;
  ctx.cpu.flags.N = 1;
  ctx.cpu.flags.C = result & 0x10000 ? 1 : 0;

  ctx.cpu.l = result & 0xff;
  ctx.cpu.h = (result & 0xff00) >>> 8;

  updateXYFlags(ctx, ctx.cpu.h);
}

/**
 * ADD IX,rr - Add to IX.
 */
export function doIxAdd(ctx: DecodeContext, operand: number): void {
  const result = ctx.cpu.ix + operand;

  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.C = result & 0x10000 ? 1 : 0;
  ctx.cpu.flags.H = ((ctx.cpu.ix & 0x0fff) + (operand & 0x0fff)) & 0x1000 ? 1 : 0;

  ctx.cpu.ix = result & 0xffff;

  updateXYFlags(ctx, (ctx.cpu.ix & 0xff00) >>> 8);
}

// ============================================================================
// ROTATE/SHIFT OPERATIONS (wrappers around rotate.ts)
// ============================================================================

export function doRlc(ctx: DecodeContext, operand: number): number {
  return doRlcBase(ctx.cpu, operand);
}

export function doRrc(ctx: DecodeContext, operand: number): number {
  return doRrcBase(ctx.cpu, operand);
}

export function doRl(ctx: DecodeContext, operand: number): number {
  return doRlBase(ctx.cpu, operand);
}

export function doRr(ctx: DecodeContext, operand: number): number {
  return doRrBase(ctx.cpu, operand);
}

export function doSla(ctx: DecodeContext, operand: number): number {
  return doSlaBase(ctx.cpu, operand);
}

export function doSra(ctx: DecodeContext, operand: number): number {
  return doSraBase(ctx.cpu, operand);
}

export function doSll(ctx: DecodeContext, operand: number): number {
  return doSllBase(ctx.cpu, operand);
}

export function doSrl(ctx: DecodeContext, operand: number): number {
  return doSrlBase(ctx.cpu, operand);
}

// ============================================================================
// INDEXED ADDRESSING HELPER
// ============================================================================

/**
 * Gets the IX+d offset from the instruction stream.
 */
export function getIxOffset(ctx: DecodeContext): number {
  ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  const offset = getSignedOffsetByte(ctx.cb.mem_read(ctx.cpu.pc));
  return (ctx.cpu.ix + offset) & 0xffff;
}

// ============================================================================
// SPECIAL INSTRUCTIONS
// ============================================================================

/**
 * DAA - Decimal Adjust Accumulator.
 */
export function doDaa(ctx: DecodeContext): void {
  let temp = ctx.cpu.a;

  if (!ctx.cpu.flags.N) {
    if (ctx.cpu.flags.H || (ctx.cpu.a & 0x0f) > 9) {
      temp += 0x06;
    }
    if (ctx.cpu.flags.C || ctx.cpu.a > 0x99) {
      temp += 0x60;
    }
  } else {
    if (ctx.cpu.flags.H || (ctx.cpu.a & 0x0f) > 9) {
      temp -= 0x06;
    }
    if (ctx.cpu.flags.C || ctx.cpu.a > 0x99) {
      temp -= 0x60;
    }
  }

  ctx.cpu.flags.S = temp & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !(temp & 0xff) ? 1 : 0;
  ctx.cpu.flags.H = (ctx.cpu.a & 0x10) !== (temp & 0x10) ? 1 : 0;
  ctx.cpu.flags.P = parity_bits[temp & 0xff] ?? 0;
  ctx.cpu.flags.C = ctx.cpu.flags.C || ctx.cpu.a > 0x99 ? 1 : 0;

  ctx.cpu.a = temp & 0xff;
  updateXYFlags(ctx, ctx.cpu.a);
}

/**
 * NEG - Negate accumulator.
 */
export function doNeg(ctx: DecodeContext): void {
  const temp = ctx.cpu.a;
  ctx.cpu.a = 0;
  doSub(ctx, temp);
}

/**
 * IN r,(C) - Input with flags.
 */
export function doIn(ctx: DecodeContext, port: number): number {
  const result = ctx.cb.io_read(port);

  ctx.cpu.flags.S = result & 0x80 ? 1 : 0;
  ctx.cpu.flags.Z = !result ? 1 : 0;
  ctx.cpu.flags.H = 0;
  ctx.cpu.flags.P = parity_bits[result] ?? 0;
  ctx.cpu.flags.N = 0;

  updateXYFlags(ctx, result);

  return result;
}

// ============================================================================
// UTILITY BUNDLE
// ============================================================================

/**
 * Creates the DecodeUtils bundle for passing to instruction factories.
 */
export function createDecodeUtils(): DecodeUtils {
  return {
    getSignedOffsetByte,
    getFlagsRegister,
    getFlagsPrime,
    setFlagsPrime,
    updateXYFlags,
    popWord,
    pushWord,
    doConditionalAbsoluteJump,
    doConditionalRelativeJump,
    doConditionalCall,
    doConditionalReturn,
    doReset,
    doAdd,
    doAdc,
    doSub,
    doSbc,
    doCp,
    doAnd,
    doOr,
    doXor,
    doInc,
    doDec,
    doHlAdd,
    doHlAdc,
    doHlSbc,
    doIxAdd,
    doRlc,
    doRrc,
    doRl,
    doRr,
    doSla,
    doSra,
    doSll,
    doSrl,
    getIxOffset,
    doDaa,
    doNeg,
    doIn,
  };
}
