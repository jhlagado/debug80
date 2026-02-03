/**
 * @file Tests for rotate/shift helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers';
import { doRlc, doRrc, doRl, doRr, doSla, doSra, doSll, doSrl } from '../../src/z80/decode-utils';

describe('decode-utils rotate/shift', () => {
  it('doRlc rotates left', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doRlc(ctx, 0x80);
    expect(result).toBe(0x01);
    expect(cpu.flags.C).toBe(1);
  });

  it('doRrc rotates right', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doRrc(ctx, 0x01);
    expect(result).toBe(0x80);
    expect(cpu.flags.C).toBe(1);
  });

  it('doRl rotates left through carry', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.flags.C = 1;
    const result = doRl(ctx, 0x00);
    expect(result).toBe(0x01);
  });

  it('doRr rotates right through carry', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.flags.C = 1;
    const result = doRr(ctx, 0x00);
    expect(result).toBe(0x80);
  });

  it('doSla shifts left arithmetic', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doSla(ctx, 0x80);
    expect(result).toBe(0x00);
    expect(cpu.flags.C).toBe(1);
  });

  it('doSra shifts right arithmetic', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doSra(ctx, 0x81);
    expect(result).toBe(0xc0);
    expect(cpu.flags.C).toBe(1);
  });

  it('doSll shifts left logical', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doSll(ctx, 0x80);
    expect(result).toBe(0x01);
    expect(cpu.flags.C).toBe(1);
  });

  it('doSrl shifts right logical', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doSrl(ctx, 0x81);
    expect(result).toBe(0x40);
    expect(cpu.flags.C).toBe(1);
  });
});
