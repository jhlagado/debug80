import { describe, expect, it } from 'vitest';

import { getZ80InstructionEffect } from '../../../src/z80/effects.js';
import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';

function effect(text: string) {
  const parsed = parseZ80Instruction(text);
  if (!parsed?.instruction)
    throw new Error(`failed to parse ${text}: ${parsed?.error ?? 'unknown'}`);
  return getZ80InstructionEffect(parsed.instruction);
}

describe('Z80 register-contracts effects', () => {
  it('models LD HL,nn as writing H and L', () => {
    expect(effect('ld hl,$1234')).toMatchObject({ reads: [], writes: ['H', 'L'] });
  });

  it('models LD A,(DE) as reading D,E and writing A', () => {
    expect(effect('ld a,(de)')).toMatchObject({ reads: ['D', 'E'], writes: ['A'] });
  });

  it('models INC B as reading and writing B plus flags except carry', () => {
    expect(effect('inc b')).toMatchObject({
      reads: ['B'],
      writes: ['B', 'sign', 'zero', 'halfCarry', 'parity'],
    });
  });

  it('models ADC A,B as reading incoming carry', () => {
    expect(effect('adc a,b')).toMatchObject({
      reads: ['A', 'B', 'carry'],
    });
  });

  it('models SBC A,B as reading incoming carry', () => {
    expect(effect('sbc a,b')).toMatchObject({
      reads: ['A', 'B', 'carry'],
    });
  });

  it('models ADD HL,DE as preserving sign, zero, and parity', () => {
    expect(effect('add hl,de')).toMatchObject({
      reads: ['H', 'L', 'D', 'E'],
      writes: ['H', 'L', 'halfCarry', 'carry'],
    });
  });

  it('models ADC and SBC HL,DE as writing the complete public flag set', () => {
    expect(effect('adc hl,de')).toMatchObject({
      reads: ['H', 'L', 'D', 'E', 'carry'],
      writes: ['H', 'L', 'sign', 'zero', 'halfCarry', 'parity', 'carry'],
    });
    expect(effect('sbc hl,de')).toMatchObject({
      reads: ['H', 'L', 'D', 'E', 'carry'],
      writes: ['H', 'L', 'sign', 'zero', 'halfCarry', 'parity', 'carry'],
    });
  });

  it('models PUSH DE as reading D,E and pushing two stack bytes', () => {
    expect(effect('push de')).toMatchObject({
      reads: ['D', 'E'],
      writes: ['SPH', 'SPL'],
      stack: { kind: 'push', units: ['D', 'E'] },
    });
  });

  it('models POP HL as writing H,L and popping two stack bytes', () => {
    expect(effect('pop hl')).toMatchObject({
      writes: ['H', 'L', 'SPH', 'SPL'],
      stack: { kind: 'pop', units: ['H', 'L'] },
    });
  });

  it('models CALL target as a call boundary', () => {
    expect(effect('call HELPER')).toMatchObject({
      writes: ['SPH', 'SPL'],
      stack: { kind: 'unknown' },
      control: { kind: 'call', target: 'HELPER', conditional: false },
    });
  });

  it('models conditional CALL target as a call boundary', () => {
    expect(effect('call z,HELPER')).toMatchObject({
      reads: ['zero'],
      writes: ['SPH', 'SPL'],
      stack: { kind: 'unknown' },
      control: { kind: 'call', target: 'HELPER', conditional: true },
    });
  });

  it('models JR C,target as reading carry and conditionally jumping', () => {
    expect(effect('jr c,LABEL')).toMatchObject({
      reads: ['carry'],
      control: { kind: 'jump', target: 'LABEL', conditional: true },
    });
  });

  it('models JP PE,target as reading parity', () => {
    expect(effect('jp pe,LABEL')).toMatchObject({
      reads: ['parity'],
      control: { kind: 'jump', target: 'LABEL', conditional: true },
    });
  });

  it('models DJNZ as reading and writing B with a conditional jump', () => {
    expect(effect('djnz LABEL')).toMatchObject({
      reads: ['B'],
      writes: ['B'],
      control: { kind: 'jump', target: 'LABEL', conditional: true },
    });
  });

  it('models SRL A as reading and writing A plus public flags', () => {
    expect(effect('srl a')).toMatchObject({
      reads: ['A'],
      writes: ['A', 'sign', 'zero', 'halfCarry', 'parity', 'carry'],
    });
  });

  it('models BIT 7,L as reading L and writing test flags without carry', () => {
    expect(effect('bit 7,l')).toMatchObject({
      reads: ['L'],
      writes: ['sign', 'zero', 'halfCarry', 'parity'],
    });
  });

  it('models memory bit changes without inventing register or stack writes', () => {
    expect(effect('set 7,(hl)')).toMatchObject({
      reads: ['H', 'L'],
      writes: [],
      stack: { kind: 'none' },
    });
    expect(effect('res 2,(ix+3),b')).toMatchObject({
      reads: ['IXH', 'IXL'],
      writes: ['B'],
      stack: { kind: 'none' },
    });
  });

  it('models memory shifts and their optional register destination', () => {
    expect(effect('srl (hl)')).toMatchObject({
      reads: ['H', 'L'],
      writes: ['sign', 'zero', 'halfCarry', 'parity', 'carry'],
      stack: { kind: 'none' },
    });
    expect(effect('srl (iy+4),c')).toMatchObject({
      reads: ['IYH', 'IYL'],
      writes: ['C', 'sign', 'zero', 'halfCarry', 'parity', 'carry'],
      stack: { kind: 'none' },
    });
  });

  it('models SCF as setting carry without reading general registers', () => {
    expect(effect('scf')).toMatchObject({
      reads: [],
      writes: ['carry', 'halfCarry'],
    });
  });

  it('models XOR A as zeroing A without reading A first', () => {
    expect(effect('xor a')).toMatchObject({
      reads: [],
      writes: ['A', 'sign', 'zero', 'halfCarry', 'parity', 'carry'],
    });
  });

  it('models LD (HL),A as reading H,L,A and not writing registers', () => {
    expect(effect('ld (hl),a')).toMatchObject({ reads: ['H', 'L', 'A'], writes: [] });
  });

  it('models LDIR as a block transfer over BC, DE, and HL', () => {
    expect(effect('ldir')).toMatchObject({
      reads: ['H', 'L', 'D', 'E', 'B', 'C'],
      writes: ['H', 'L', 'D', 'E', 'B', 'C', 'halfCarry', 'parity'],
    });
  });

  it('models EX DE,HL as exchanging the two register pairs', () => {
    expect(effect('ex de,hl')).toMatchObject({
      reads: ['D', 'E', 'H', 'L'],
      writes: ['D', 'E', 'H', 'L'],
    });
  });

  it('models INC DE as a flag-free 16-bit increment', () => {
    expect(effect('inc de')).toMatchObject({ reads: ['D', 'E'], writes: ['D', 'E'] });
    expect(effect('inc de').writes).not.toContain('zero');
  });

  it('models conditional RET as reading the condition flag and returning', () => {
    expect(effect('ret nz')).toMatchObject({
      reads: ['zero'],
      writes: ['SPH', 'SPL'],
      stack: { kind: 'unknown' },
      control: { kind: 'return', conditional: true },
    });
  });

  it('models RET as a return boundary', () => {
    expect(effect('ret')).toMatchObject({
      writes: ['SPH', 'SPL'],
      stack: { kind: 'unknown' },
      control: { kind: 'return', conditional: false },
    });
  });

  it('models RST as writing SP and recording rst control', () => {
    expect(effect('rst $10')).toMatchObject({
      writes: ['SPH', 'SPL'],
      stack: { kind: 'unknown' },
      control: { kind: 'rst', vector: 16 },
    });
  });

  it('returns a conservative unknown effect for unsupported instructions', () => {
    const result = effect('exx');
    expect(result.reads.length).toBeGreaterThan(10);
    expect(result.writes.length).toBeGreaterThan(10);
    expect(result.stack).toEqual({ kind: 'unknown' });
    expect(result.control).toEqual({ kind: 'unknown' });
  });
});
