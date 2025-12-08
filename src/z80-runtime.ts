import { HexProgram } from './z80-loaders';
import { Cpu, execute, initCpu, resetCpu } from './z80-cpu';
import { HardwareContext } from './z80-types';

export interface Z80Runtime {
  readonly cpu: Cpu;
  readonly hardware: HardwareContext;
  step: () => RunResult;
  runUntilStop: (breakpoints: Set<number>) => RunResult;
  getRegisters: () => Cpu;
  isHalted: () => boolean;
  getPC: () => number;
  reset: (program?: HexProgram, entry?: number) => void;
}

export interface RunResult {
  halted: boolean;
  pc: number;
  reason: 'halt' | 'breakpoint';
}

export interface IoHandlers {
  read?: (port: number) => number;
  write?: (port: number, value: number) => void;
}

type Z80RuntimeImpl = Z80Runtime & { cpu: Cpu; hardware: HardwareContext };

export function createZ80Runtime(
  program: HexProgram,
  entry?: number,
  ioHandlers?: IoHandlers
): Z80Runtime {
  const cpu = initCpu();
  const memory = new Uint8Array(0x10000);
  const io: Required<IoHandlers> = {
    read: ioHandlers?.read ?? ((_port: number): number => 0),
    write:
      ioHandlers?.write ??
      ((_port: number, _value: number): void => {
        /* noop */
      }),
  };

  const hardware: HardwareContext = {
    memory,
    ioRead: (port: number): number => io.read(port & 0xffff) & 0xff,
    ioWrite: (port: number, value: number): void => {
      io.write(port & 0xffff, value & 0xff);
    },
  };
  cpu.hardware = hardware;
  hardware.cpu = cpu;

  loadProgram(hardware, cpu, program, entry);

  const runtime: Z80RuntimeImpl = {
    cpu,
    hardware,
    step: stepRuntime,
    runUntilStop: runUntilStopRuntime,
    getRegisters,
    isHalted,
    getPC,
    reset: resetRuntime,
  };

  return runtime;
}

function loadProgram(
  hardware: HardwareContext,
  cpu: Cpu,
  prog: HexProgram,
  ent?: number
): void {
  hardware.memory.fill(0);
  hardware.memory.set(prog.memory);
  cpu.pc = ent !== undefined && ent >= 0 && ent < 0x10000 ? ent : prog.startAddress;
  cpu.halted = false;
}

function stepRuntime(this: Z80RuntimeImpl): RunResult {
  const cpu = this.cpu;
  const hardware = this.hardware;
  if (cpu.halted) {
    return { halted: true, pc: cpu.pc, reason: 'halt' };
  }

  execute(cpu, {
    mem_read: (addr: number) => hardware.memory[addr & 0xffff] ?? 0,
    mem_write: (addr: number, value: number) => {
      hardware.memory[addr & 0xffff] = value & 0xff;
    },
    io_read: (port: number) => hardware.ioRead(port & 0xffff),
    io_write: (port: number, value: number) => {
      hardware.ioWrite(port & 0xffff, value & 0xff);
    },
  });

  if (cpu.pc >= hardware.memory.length || cpu.halted) {
    cpu.halted = true;
    return { halted: true, pc: cpu.pc, reason: 'halt' };
  }

  return { halted: false, pc: cpu.pc, reason: 'breakpoint' };
}

function runUntilStopRuntime(this: Z80RuntimeImpl, breakpoints: Set<number>): RunResult {
  const cpu = this.cpu;
  while (!cpu.halted) {
    if (breakpoints.has(cpu.pc)) {
      return { halted: false, pc: cpu.pc, reason: 'breakpoint' };
    }

    const result = stepRuntime.call(this);
    if (result.halted) {
      return { halted: true, pc: cpu.pc, reason: 'halt' };
    }
  }

  return { halted: true, pc: cpu.pc, reason: 'halt' };
}

function getRegisters(this: Z80RuntimeImpl): Cpu {
  return this.cpu;
}

function isHalted(this: Z80RuntimeImpl): boolean {
  return this.cpu.halted;
}

function getPC(this: Z80RuntimeImpl): number {
  return this.cpu.pc;
}

function resetRuntime(this: Z80RuntimeImpl, prog?: HexProgram, ent?: number): void {
  resetCpu(this.cpu);
  if (prog) {
    loadProgram(this.hardware, this.cpu, prog, ent);
  }
}
