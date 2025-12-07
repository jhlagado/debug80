export interface Flags {
  S: number;
  Z: number;
  Y: number;
  H: number;
  X: number;
  P: number;
  N: number;
  C: number;
}

export interface Cpu {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;
  a_prime: number;
  b_prime: number;
  c_prime: number;
  d_prime: number;
  e_prime: number;
  h_prime: number;
  l_prime: number;
  ix: number;
  iy: number;
  i: number;
  r: number;
  sp: number;
  pc: number;
  flags: Flags;
  flags_prime: Flags;
  imode: number;
  iff1: number;
  iff2: number;
  halted: boolean;
  do_delayed_di: boolean;
  do_delayed_ei: boolean;
  cycle_counter: number;
}

export interface Callbacks {
  mem_read: (addr: number) => number;
  mem_write: (addr: number, value: number) => void;
  io_read: (port: number) => number;
  io_write: (port: number, value: number) => void;
}

const createFlags = (): Flags => ({
  S: 0,
  Z: 0,
  Y: 0,
  H: 0,
  X: 0,
  P: 0,
  N: 0,
  C: 0,
});

const resetFlags = (flags: Flags): void => {
  flags.S = 0;
  flags.Z = 0;
  flags.Y = 0;
  flags.H = 0;
  flags.X = 0;
  flags.P = 0;
  flags.N = 0;
  flags.C = 0;
};

export const setSZXYFlags = (cpu: Cpu, value: number): void => {
  const next = value & 0xff;
  cpu.flags.S = (next & 0x80) >>> 7;
  cpu.flags.Z = next === 0 ? 1 : 0;
  cpu.flags.Y = (next & 0x20) >>> 5;
  cpu.flags.X = (next & 0x08) >>> 3;
};

export const initCpu = (): Cpu => ({
  a: 0,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  h: 0,
  l: 0,
  a_prime: 0,
  b_prime: 0,
  c_prime: 0,
  d_prime: 0,
  e_prime: 0,
  h_prime: 0,
  l_prime: 0,
  ix: 0,
  iy: 0,
  i: 0,
  r: 0,
  sp: 0,
  pc: 0,
  flags: createFlags(),
  flags_prime: createFlags(),
  imode: 0,
  iff1: 0,
  iff2: 0,
  halted: false,
  do_delayed_di: false,
  do_delayed_ei: false,
  cycle_counter: 0,
});

export const resetCpu = (cpu: Cpu): void => {
  cpu.a = 0;
  cpu.b = 0;
  cpu.c = 0;
  cpu.d = 0;
  cpu.e = 0;
  cpu.h = 0;
  cpu.l = 0;
  cpu.a_prime = 0;
  cpu.b_prime = 0;
  cpu.c_prime = 0;
  cpu.d_prime = 0;
  cpu.e_prime = 0;
  cpu.h_prime = 0;
  cpu.l_prime = 0;
  cpu.ix = 0;
  cpu.iy = 0;
  cpu.i = 0;
  cpu.r = 0;
  cpu.sp = 0;
  cpu.pc = 0;
  resetFlags(cpu.flags);
  resetFlags(cpu.flags_prime);
  cpu.imode = 0;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;
  cpu.do_delayed_di = false;
  cpu.do_delayed_ei = false;
  cpu.cycle_counter = 0;
};

const addWithCarryFlags = (cpu: Cpu, addend: number): number => {
  const sum = cpu.a + addend;
  const result8 = sum & 0xff;

  cpu.flags.H = ((cpu.a & 0x0f) + (addend & 0x0f)) > 0x0f ? 1 : 0;
  cpu.flags.C = sum > 0xff ? 1 : 0;
  cpu.flags.P = ((cpu.a ^ ~addend) & (cpu.a ^ result8) & 0x80) !== 0 ? 1 : 0;
  cpu.flags.N = 0;
  setSZXYFlags(cpu, result8);

  return result8;
};

export const execute = (cpu: Cpu, cb: Callbacks): void => {
  if (cpu.halted) {
    return;
  }

  const opcode = cb.mem_read(cpu.pc) & 0xff;
  cpu.pc = (cpu.pc + 1) & 0xffff;
  cpu.r = (cpu.r + 1) & 0xff;
  cpu.cycle_counter += 4;

  switch (opcode) {
    case 0x00: {
      // NOP
      return;
    }
    case 0x76: {
      // HALT
      cpu.halted = true;
      return;
    }
    case 0x3e: {
      // LD A, n
      const value = cb.mem_read(cpu.pc) & 0xff;
      cpu.pc = (cpu.pc + 1) & 0xffff;
      cpu.a = value;
      return;
    }
    case 0xc6: {
      // ADD A, n
      const addend = cb.mem_read(cpu.pc) & 0xff;
      cpu.pc = (cpu.pc + 1) & 0xffff;
      cpu.a = addWithCarryFlags(cpu, addend);
      return;
    }
    default: {
      // Unknown opcode: halt to avoid running into unimplemented space.
      cpu.halted = true;
      return;
    }
  }
};
