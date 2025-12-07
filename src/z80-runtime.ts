import { HexProgram } from './z80-loaders';
import { Cpu, execute, initCpu, resetCpu } from './z80-cpu';

export interface Z80Runtime {
  readonly cpu: Cpu;
  readonly memory: Uint8Array;
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

  const loadProgram = (prog: HexProgram, ent?: number): void => {
    memory.fill(0);
    memory.set(prog.memory);
    cpu.pc =
      ent !== undefined && ent >= 0 && ent < 0x10000
        ? ent
        : prog.startAddress;
    cpu.halted = false;
  };

  loadProgram(program, entry);

  const getRegisters = (): Cpu => cpu;

  const step = (): RunResult => {
    if (cpu.halted) {
      return { halted: true, pc: cpu.pc, reason: 'halt' };
    }

    execute(cpu, {
      mem_read: (addr: number) => memory[addr & 0xffff] ?? 0,
      mem_write: (addr: number, value: number) => {
        memory[addr & 0xffff] = value & 0xff;
      },
      io_read: (port: number) => io.read(port & 0xffff) & 0xff,
      io_write: (port: number, value: number) => {
        io.write(port & 0xffff, value & 0xff);
      },
    });

    if (cpu.pc >= memory.length || cpu.halted) {
      cpu.halted = true;
      return { halted: true, pc: cpu.pc, reason: 'halt' };
    }

    return { halted: false, pc: cpu.pc, reason: 'breakpoint' };
  };

  const runUntilStop = (breakpoints: Set<number>): RunResult => {
    while (!cpu.halted) {
      if (breakpoints.has(cpu.pc)) {
        return { halted: false, pc: cpu.pc, reason: 'breakpoint' };
      }

      const result = step();
      if (result.halted) {
        return { halted: true, pc: cpu.pc, reason: 'halt' };
      }
    }

    return { halted: true, pc: cpu.pc, reason: 'halt' };
  };

  return {
    cpu,
    memory,
    step,
    runUntilStop,
    getRegisters,
    isHalted: () => cpu.halted,
    getPC: () => cpu.pc,
    reset: (prog?: HexProgram, ent?: number): void => {
      resetCpu(cpu);
      if (prog) {
        loadProgram(prog, ent);
      }
    },
  };
}
