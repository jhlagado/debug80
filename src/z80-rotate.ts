import { parity_bits } from './z80-constants';
import { updateXYFlags } from './z80-core-helpers';
import { Cpu } from './z80-types';

const setRotateFlags = (cpu: Cpu, result: number, carry: number): void => {
  cpu.flags.N = 0;
  cpu.flags.H = 0;
  cpu.flags.C = carry;
  cpu.flags.Z = !result ? 1 : 0;
  cpu.flags.P = parity_bits[result] ?? 0;
  cpu.flags.S = result & 0x80 ? 1 : 0;
  updateXYFlags(cpu.flags, result);
};

export const do_rlc = (cpu: Cpu, operand: number): number => {
  const carry = (operand & 0x80) >>> 7;
  const result = ((operand << 1) | carry) & 0xff;
  setRotateFlags(cpu, result, carry);
  return result;
};

export const do_rrc = (cpu: Cpu, operand: number): number => {
  const carry = operand & 1;
  const result = ((operand >>> 1) & 0x7f) | (carry << 7);
  setRotateFlags(cpu, result, carry);
  return result & 0xff;
};

export const do_rl = (cpu: Cpu, operand: number): number => {
  const carry = (operand & 0x80) >>> 7;
  const result = ((operand << 1) | cpu.flags.C) & 0xff;
  setRotateFlags(cpu, result, carry);
  return result;
};

export const do_rr = (cpu: Cpu, operand: number): number => {
  const carry = operand & 1;
  const result = ((operand >>> 1) & 0x7f) | (cpu.flags.C << 7);
  setRotateFlags(cpu, result, carry);
  return result;
};

export const do_sla = (cpu: Cpu, operand: number): number => {
  const carry = (operand & 0x80) >>> 7;
  const result = (operand << 1) & 0xff;
  setRotateFlags(cpu, result, carry);
  return result;
};

export const do_sra = (cpu: Cpu, operand: number): number => {
  const carry = operand & 1;
  const result = ((operand >>> 1) & 0x7f) | (operand & 0x80);
  setRotateFlags(cpu, result, carry);
  return result;
};

export const do_sll = (cpu: Cpu, operand: number): number => {
  const carry = (operand & 0x80) >>> 7;
  const result = ((operand << 1) & 0xff) | 1;
  setRotateFlags(cpu, result, carry);
  return result;
};

export const do_srl = (cpu: Cpu, operand: number): number => {
  const carry = operand & 1;
  const result = (operand >>> 1) & 0x7f;
  // SRL forces S to 0 because bit 7 cleared by shift.
  setRotateFlags(cpu, result, carry);
  cpu.flags.S = 0;
  return result;
};
