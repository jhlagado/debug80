/**
 * @file Tests for CB prefix handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { executeCbPrefix } from '../../src/z80/decode-cb';
import { createDecodeUtils } from '../../src/z80/decode-utils';
import { initDecodeTestContext } from './decode-test-helpers';
import { Cpu } from '../../src/z80/types';
import { DecodeContext } from '../../src/z80/decode-types';

describe('decode-cb', () => {
  let cpu: Cpu;
  let memory: Uint8Array;
  let ctx: DecodeContext;
  let utils: ReturnType<typeof createDecodeUtils>;

  beforeEach(() => {
    const init = initDecodeTestContext();
    cpu = init.cpu;
    memory = init.memory;
    ctx = init.ctx;
    utils = createDecodeUtils();
  });

  it('handles RLC B (CB 00)', () => {
    cpu.b = 0x80;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x00;
    executeCbPrefix(ctx, utils);
    expect(cpu.b).toBe(0x01);
    expect(cpu.flags.C).toBe(1);
  });

  it('handles RRC C (CB 09)', () => {
    cpu.c = 0x01;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x09;
    executeCbPrefix(ctx, utils);
    expect(cpu.c).toBe(0x80);
    expect(cpu.flags.C).toBe(1);
  });

  it('handles BIT 0,A (CB 47)', () => {
    cpu.a = 0x01;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x47;
    executeCbPrefix(ctx, utils);
    expect(cpu.flags.Z).toBe(0);
  });

  it('handles BIT 7,A (CB 7F) when bit not set', () => {
    cpu.a = 0x00;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x7f;
    executeCbPrefix(ctx, utils);
    expect(cpu.flags.Z).toBe(1);
  });

  it('handles RES 0,B (CB 80)', () => {
    cpu.b = 0xff;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x80;
    executeCbPrefix(ctx, utils);
    expect(cpu.b).toBe(0xfe);
  });

  it('handles SET 7,A (CB FF)', () => {
    cpu.a = 0x00;
    cpu.pc = 0x0000;
    memory[0x0001] = 0xff;
    executeCbPrefix(ctx, utils);
    expect(cpu.a).toBe(0x80);
  });

  it('handles (HL) operand for rotate', () => {
    cpu.h = 0x10;
    cpu.l = 0x00;
    memory[0x1000] = 0x80;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x06; // RLC (HL)
    executeCbPrefix(ctx, utils);
    expect(memory[0x1000]).toBe(0x01);
  });

  it('increments R register', () => {
    cpu.r = 0x00;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x00;
    executeCbPrefix(ctx, utils);
    expect(cpu.r & 0x7f).toBe(0x01);
  });
});
