import { Callbacks, Cpu, Flags } from './z80-types';

export const setFlagsFromByte = (flags: Flags, operand: number): void => {
  flags.S = (operand & 0x80) >>> 7;
  flags.Z = (operand & 0x40) >>> 6;
  flags.Y = (operand & 0x20) >>> 5;
  flags.H = (operand & 0x10) >>> 4;
  flags.X = (operand & 0x08) >>> 3;
  flags.P = (operand & 0x04) >>> 2;
  flags.N = (operand & 0x02) >>> 1;
  flags.C = operand & 0x01;
};

export const setFlagsRegister = (cpu: Cpu, operand: number): void => {
  setFlagsFromByte(cpu.flags, operand);
};

export const flagsToByte = (flags: Flags): number =>
  (flags.S << 7) |
  (flags.Z << 6) |
  (flags.Y << 5) |
  (flags.H << 4) |
  (flags.X << 3) |
  (flags.P << 2) |
  (flags.N << 1) |
  flags.C;

export const setSZXYFlags = (cpu: Cpu, value: number): void => {
  const next = value & 0xff;
  cpu.flags.S = (next & 0x80) >>> 7;
  cpu.flags.Z = next === 0 ? 1 : 0;
  cpu.flags.Y = (next & 0x20) >>> 5;
  cpu.flags.X = (next & 0x08) >>> 3;
};

export const updateXYFlags = (flags: Flags, result: number): void => {
  flags.Y = (result & 0x20) >>> 5;
  flags.X = (result & 0x08) >>> 3;
};

export const pushWord = (cpu: Cpu, cb: Callbacks, operand: number): void => {
  // Given a 16-bit value, push it onto the stack (high byte first).
  cpu.sp = (cpu.sp - 1) & 0xffff;
  cb.mem_write(cpu.sp, (operand & 0xff00) >>> 8);
  cpu.sp = (cpu.sp - 1) & 0xffff;
  cb.mem_write(cpu.sp, operand & 0x00ff);
};
