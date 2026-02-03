/**
 * @file Tests for misc helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers';
import { getIxOffset, doDaa, doNeg, doIn, createDecodeUtils } from '../../src/z80/decode-utils';

describe('decode-utils special helpers', () => {
  it('getIxOffset reads and sign-extends offset', () => {
    const { cpu, memory, ctx } = initDecodeTestContext();
    cpu.pc = 0x0000;
    cpu.ix = 0x1000;
    memory[0x0001] = 0x10;
    const result = getIxOffset(ctx);
    expect(result).toBe(0x1010);
    expect(cpu.pc).toBe(0x0001);
  });

  it('doDaa leaves valid BCD unchanged after addition', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0x15;
    cpu.flags.N = 0;
    doDaa(ctx);
    expect(cpu.a).toBe(0x15);
  });

  it('doNeg negates accumulator', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0x01;
    doNeg(ctx);
    expect(cpu.a).toBe(0xff);
  });

  it('doIn reads port and sets flags', () => {
    const { cpu, ctx, cb } = initDecodeTestContext();
    cb.io_read = () => 0x80;
    const result = doIn(ctx, 0x00);
    expect(result).toBe(0x80);
    expect(cpu.flags.S).toBe(1);
  });

  it('createDecodeUtils returns expected helpers', () => {
    const utils = createDecodeUtils();
    expect(utils.doAdd).toBeDefined();
    expect(utils.doSub).toBeDefined();
    expect(utils.doRlc).toBeDefined();
    expect(utils.pushWord).toBeDefined();
    expect(utils.popWord).toBeDefined();
  });
});
