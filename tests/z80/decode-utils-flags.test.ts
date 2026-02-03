/**
 * @file Tests for flag and signed-offset helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers';
import {
  getSignedOffsetByte,
  getFlagsRegister,
  getFlagsPrime,
  setFlagsPrime,
  updateXYFlags,
} from '../../src/z80/decode-utils';

describe('decode-utils flags/signed offset', () => {
  it('getSignedOffsetByte returns positive values unchanged', () => {
    expect(getSignedOffsetByte(0)).toBe(0);
    expect(getSignedOffsetByte(1)).toBe(1);
    expect(getSignedOffsetByte(127)).toBe(127);
  });

  it('getSignedOffsetByte converts negative values', () => {
    expect(getSignedOffsetByte(255)).toBe(-1);
    expect(getSignedOffsetByte(254)).toBe(-2);
    expect(getSignedOffsetByte(128)).toBe(-128);
  });

  it('getSignedOffsetByte masks to a byte', () => {
    expect(getSignedOffsetByte(256)).toBe(0);
    expect(getSignedOffsetByte(257)).toBe(1);
  });

  it('getFlagsRegister returns flags as a byte', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.flags.S = 1;
    cpu.flags.Z = 1;
    cpu.flags.C = 1;
    const result = getFlagsRegister(ctx);
    expect(result & 0x80).toBe(0x80);
    expect(result & 0x40).toBe(0x40);
    expect(result & 0x01).toBe(0x01);
  });

  it('getFlagsPrime and setFlagsPrime handle alternate flags', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.flags_prime.S = 1;
    cpu.flags_prime.Z = 1;
    const result = getFlagsPrime(ctx);
    expect(result & 0xc0).toBe(0xc0);

    setFlagsPrime(ctx, 0x00);
    expect(cpu.flags_prime.S).toBe(0);
    expect(cpu.flags_prime.Z).toBe(0);
  });

  it('updateXYFlags sets X and Y from result bits', () => {
    const { cpu, ctx } = initDecodeTestContext();
    updateXYFlags(ctx, 0x28);
    expect(cpu.flags.X).toBe(1);
    expect(cpu.flags.Y).toBe(1);
  });
});
