/**
 * @file Z80 CB Prefix Handler (Bit Operations)
 * @description Handles CB-prefixed instructions for bit manipulation.
 *
 * CB prefix provides:
 * - 0x00-0x3F: Rotate/shift (RLC, RRC, RL, RR, SLA, SRA, SLL, SRL)
 * - 0x40-0x7F: BIT test
 * - 0x80-0xBF: RES (reset bit)
 * - 0xC0-0xFF: SET (set bit)
 *
 * @module z80/decode-cb
 */

import { cycle_counts_cb } from './constants';
import { DecodeContext, DecodeUtils } from './decode-types';

/**
 * Gets register value by code (0-7: B,C,D,E,H,L,(HL),A).
 */
function getRegValue(ctx: DecodeContext, regCode: number): number {
  switch (regCode) {
    case 0:
      return ctx.cpu.b;
    case 1:
      return ctx.cpu.c;
    case 2:
      return ctx.cpu.d;
    case 3:
      return ctx.cpu.e;
    case 4:
      return ctx.cpu.h;
    case 5:
      return ctx.cpu.l;
    case 6:
      return ctx.cb.mem_read(ctx.cpu.l | (ctx.cpu.h << 8));
    case 7:
      return ctx.cpu.a;
    default:
      return 0;
  }
}

/**
 * Sets register value by code (0-7: B,C,D,E,H,L,(HL),A).
 */
function setRegValue(ctx: DecodeContext, regCode: number, value: number): void {
  switch (regCode) {
    case 0:
      ctx.cpu.b = value;
      break;
    case 1:
      ctx.cpu.c = value;
      break;
    case 2:
      ctx.cpu.d = value;
      break;
    case 3:
      ctx.cpu.e = value;
      break;
    case 4:
      ctx.cpu.h = value;
      break;
    case 5:
      ctx.cpu.l = value;
      break;
    case 6:
      ctx.cb.mem_write(ctx.cpu.l | (ctx.cpu.h << 8), value);
      break;
    case 7:
      ctx.cpu.a = value;
      break;
  }
}

/**
 * Handles rotate/shift instructions (CB 00-3F).
 */
function handleRotateShift(ctx: DecodeContext, utils: DecodeUtils, opcode: number): void {
  const bitNumber = (opcode & 0x38) >>> 3;
  const regCode = opcode & 0x07;
  const operand = getRegValue(ctx, regCode);

  let result: number;
  switch (bitNumber) {
    case 0:
      result = utils.doRlc(ctx, operand);
      break;
    case 1:
      result = utils.doRrc(ctx, operand);
      break;
    case 2:
      result = utils.doRl(ctx, operand);
      break;
    case 3:
      result = utils.doRr(ctx, operand);
      break;
    case 4:
      result = utils.doSla(ctx, operand);
      break;
    case 5:
      result = utils.doSra(ctx, operand);
      break;
    case 6:
      result = utils.doSll(ctx, operand);
      break;
    case 7:
      result = utils.doSrl(ctx, operand);
      break;
    default:
      result = operand;
  }

  setRegValue(ctx, regCode, result);
}

/**
 * Handles BIT test instructions (CB 40-7F).
 */
function handleBit(ctx: DecodeContext, opcode: number): void {
  const bitNumber = (opcode & 0x38) >>> 3;
  const regCode = opcode & 0x07;
  const operand = getRegValue(ctx, regCode);

  ctx.cpu.flags.Z = !(operand & (1 << bitNumber)) ? 1 : 0;
  ctx.cpu.flags.N = 0;
  ctx.cpu.flags.H = 1;
  ctx.cpu.flags.P = ctx.cpu.flags.Z;
  ctx.cpu.flags.S = bitNumber === 7 && !ctx.cpu.flags.Z ? 1 : 0;
  // For BIT n, (HL), X and Y flags come from an internal temporary register.
  // This simplified implementation sets them based on bit number.
  ctx.cpu.flags.Y = bitNumber === 5 && !ctx.cpu.flags.Z ? 1 : 0;
  ctx.cpu.flags.X = bitNumber === 3 && !ctx.cpu.flags.Z ? 1 : 0;
}

/**
 * Handles RES instructions (CB 80-BF).
 */
function handleRes(ctx: DecodeContext, opcode: number): void {
  const bitNumber = (opcode & 0x38) >>> 3;
  const regCode = opcode & 0x07;
  const operand = getRegValue(ctx, regCode);

  setRegValue(ctx, regCode, operand & ~(1 << bitNumber));
}

/**
 * Handles SET instructions (CB C0-FF).
 */
function handleSet(ctx: DecodeContext, opcode: number): void {
  const bitNumber = (opcode & 0x38) >>> 3;
  const regCode = opcode & 0x07;
  const operand = getRegValue(ctx, regCode);

  setRegValue(ctx, regCode, operand | (1 << bitNumber));
}

/**
 * Executes a CB-prefixed instruction.
 *
 * @param ctx - Decode context with CPU state and callbacks
 * @param utils - Utility functions for rotate/shift operations
 */
export function executeCbPrefix(ctx: DecodeContext, utils: DecodeUtils): void {
  // R is incremented at the start of the second instruction cycle
  ctx.cpu.r = (ctx.cpu.r & 0x80) | (((ctx.cpu.r & 0x7f) + 1) & 0x7f);

  ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  const opcode = ctx.cb.mem_read(ctx.cpu.pc);

  if (opcode < 0x40) {
    // Rotate/shift instructions
    handleRotateShift(ctx, utils, opcode);
  } else if (opcode < 0x80) {
    // BIT test instructions
    handleBit(ctx, opcode);
  } else if (opcode < 0xc0) {
    // RES instructions
    handleRes(ctx, opcode);
  } else {
    // SET instructions
    handleSet(ctx, opcode);
  }

  ctx.cpu.cycle_counter += cycle_counts_cb[opcode] ?? 0;
}
