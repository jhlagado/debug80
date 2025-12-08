export interface Callbacks {
  mem_read: (addr: number) => number;
  mem_write: (addr: number, value: number) => void;
  io_read: (port: number) => number;
  io_write: (port: number, value: number) => void;
}

export interface HardwareContext {
  memory: Uint8Array;
  ioRead: (port: number) => number;
  ioWrite: (port: number, value: number) => void;
  cpu?: Cpu;
}

export interface Cpu {
  b: number;
  a: number;
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
  hardware?: HardwareContext;
}

export type Flags = {
  S: number;
  Z: number;
  Y: number;
  H: number;
  X: number;
  P: number;
  N: number;
  C: number;
};
