import { describe, expect, it } from 'vitest';
import { evaluateWatchExpression } from '../../src/debug/requests/watch-expression';
import { createZ80Runtime } from '../../src/z80/runtime';
import type { SourceMapDebugSymbol } from '../../src/debug/session/session-state';

function createContext() {
  const runtime = createZ80Runtime({ memory: new Uint8Array(0x10000), startAddress: 0 });
  runtime.cpu.a = 0x20;
  runtime.cpu.b = 0x12;
  runtime.cpu.c = 0x34;
  runtime.cpu.h = 0x40;
  runtime.cpu.l = 0x00;
  runtime.cpu.ix = 0x5000;
  runtime.cpu.sp = 0x7ffe;
  runtime.cpu.pc = 0x1234;
  runtime.cpu.a_prime = 0xaa;
  runtime.cpu.b_prime = 0xbb;
  runtime.cpu.c_prime = 0xcc;
  runtime.cpu.flags.Z = 1;
  runtime.cpu.flags.C = 0;
  runtime.cpu.flags.P = 1;
  runtime.cpu.flags.H = 1;
  runtime.hardware.memory[0x4000] = 0xff;
  runtime.hardware.memory[0x4010] = 0x03;
  runtime.hardware.memory[0x5004] = 0x07;
  const symbols: SourceMapDebugSymbol[] = [
    { name: 'PACMO_LIVES', file: 'pacmo.z80', address: 0x4010 },
    { name: 'MainLoop', file: 'pacmo.z80', address: 0x1234 },
    { name: 'SCREEN_MASK', file: 'pacmo.z80', value: 0x0f },
  ];
  return { runtime, symbols };
}

describe('Debug80 watch expressions', () => {
  it('evaluates comprehensive registers and symbols', () => {
    const context = createContext();

    expect(evaluateWatchExpression('A', context).result).toBe('0x20 / 32');
    expect(evaluateWatchExpression('BC', context).result).toBe('0x1234 / 4660');
    expect(evaluateWatchExpression("BC'", context).result).toBe('0xbbcc / 48076');
    expect(evaluateWatchExpression('PC eq MainLoop', context).result).toBe('true');
    expect(evaluateWatchExpression('SCREEN_MASK', context).result).toBe('0x0f / 15');
  });

  it('uses AZM-style spelled-out flag names as booleans', () => {
    const context = createContext();

    expect(evaluateWatchExpression('zero', context).result).toBe('true');
    expect(evaluateWatchExpression('carry', context).result).toBe('false');
    expect(evaluateWatchExpression('not carry', context).result).toBe('true');
    expect(evaluateWatchExpression('zero and A eq $20', context).result).toBe('true');
  });

  it('accepts single equals as an equality alias for breakpoint conditions', () => {
    const context = createContext();

    expect(evaluateWatchExpression('BC = $1234', context).result).toBe('true');
    expect(evaluateWatchExpression('BC = $1001', context).result).toBe('false');
  });

  it('uses square brackets for byte memory reads and parentheses for grouping', () => {
    const context = createContext();

    expect(evaluateWatchExpression('[HL]', context).result).toBe('0xff / 255');
    expect(evaluateWatchExpression('[PACMO_LIVES] eq 3', context).result).toBe('true');
    expect(evaluateWatchExpression('[IX + 4] eq 7', context).result).toBe('true');
    expect(evaluateWatchExpression('(A + 1) eq $21', context).result).toBe('true');
  });

  it('separates logical words from symbolic bitwise operators', () => {
    const context = createContext();

    expect(evaluateWatchExpression('A and $80', context).result).toBe('true');
    expect(evaluateWatchExpression('A & $80', context).result).toBe('0x00 / 0');
    expect(evaluateWatchExpression('(A ^ $ff) eq $df', context).result).toBe('true');
    expect(evaluateWatchExpression('~$ff', context).result).toBe('0xff00 / 65280');
  });

  it('rejects logical xor so caret remains the bitwise xor operator', () => {
    const context = createContext();

    expect(() => evaluateWatchExpression('zero xor carry', context)).toThrow(/Unexpected token/);
  });
});
