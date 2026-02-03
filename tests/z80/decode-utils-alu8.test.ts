/**
 * @file Tests for 8-bit ALU helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers';
import {
  doAdd,
  doAdc,
  doSub,
  doSbc,
  doAnd,
  doOr,
  doXor,
  doInc,
  doDec,
  doCp,
} from '../../src/z80/decode-utils';

describe('decode-utils ALU 8-bit', () => {
  it('doAdd adds to accumulator and clears N', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0x10;
    doAdd(ctx, 0x05);
    expect(cpu.a).toBe(0x15);
    expect(cpu.flags.N).toBe(0);
  });

  it('doAdd sets zero and carry flags when appropriate', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0xff;
    doAdd(ctx, 0x01);
    expect(cpu.a).toBe(0x00);
    expect(cpu.flags.Z).toBe(1);
    expect(cpu.flags.C).toBe(1);
  });

  it('doAdc adds with carry', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0x10;
    cpu.flags.C = 1;
    doAdc(ctx, 0x05);
    expect(cpu.a).toBe(0x16);
  });

  it('doSub subtracts from accumulator and sets N', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0x10;
    doSub(ctx, 0x05);
    expect(cpu.a).toBe(0x0b);
    expect(cpu.flags.N).toBe(1);
  });

  it('doSbc subtracts with carry', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0x10;
    cpu.flags.C = 1;
    doSbc(ctx, 0x05);
    expect(cpu.a).toBe(0x0a);
  });

  it('doAnd ANDs accumulator and sets H', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0xf0;
    doAnd(ctx, 0x0f);
    expect(cpu.a).toBe(0x00);
    expect(cpu.flags.Z).toBe(1);
    expect(cpu.flags.H).toBe(1);
  });

  it('doOr ORs accumulator', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0xf0;
    doOr(ctx, 0x0f);
    expect(cpu.a).toBe(0xff);
  });

  it('doXor XORs accumulator', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0xff;
    doXor(ctx, 0xff);
    expect(cpu.a).toBe(0x00);
    expect(cpu.flags.Z).toBe(1);
  });

  it('doInc increments value and clears N', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doInc(ctx, 0x10);
    expect(result).toBe(0x11);
    expect(cpu.flags.N).toBe(0);
  });

  it('doInc sets overflow on 0x7f', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doInc(ctx, 0x7f);
    expect(result).toBe(0x80);
    expect(cpu.flags.P).toBe(1);
  });

  it('doDec decrements value and sets N', () => {
    const { cpu, ctx } = initDecodeTestContext();
    const result = doDec(ctx, 0x10);
    expect(result).toBe(0x0f);
    expect(cpu.flags.N).toBe(1);
  });

  it('doCp compares without modifying A', () => {
    const { cpu, ctx } = initDecodeTestContext();
    cpu.a = 0x10;
    doCp(ctx, 0x10);
    expect(cpu.a).toBe(0x10);
    expect(cpu.flags.Z).toBe(1);
  });
});
