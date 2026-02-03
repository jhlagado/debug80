/**
 * @file Tests for 16-bit ALU helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers';
import { doHlAdd, doHlAdc, doHlSbc, doIxAdd } from '../../src/z80/decode-utils';

describe('decode-utils ALU 16-bit', () => {
  it('doHlAdd adds to HL', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.h = 0x10;
    cpu.l = 0x00;
    doHlAdd(ctx, 0x0100);
    expect(cpu.h).toBe(0x11);
    expect(cpu.l).toBe(0x00);
  });

  it('doHlAdc adds with carry to HL', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.h = 0x10;
    cpu.l = 0x00;
    cpu.flags.C = 1;
    doHlAdc(ctx, 0x0100);
    expect(cpu.h).toBe(0x11);
    expect(cpu.l).toBe(0x01);
  });

  it('doHlSbc subtracts with carry from HL', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.h = 0x10;
    cpu.l = 0x00;
    cpu.flags.C = 1;
    doHlSbc(ctx, 0x0100);
    expect(cpu.h).toBe(0x0e);
    expect(cpu.l).toBe(0xff);
  });

  it('doIxAdd adds to IX', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.ix = 0x1000;
    doIxAdd(ctx, 0x0100);
    expect(cpu.ix).toBe(0x1100);
  });
});
