import { HexProgram } from './loaders';
import { Cpu, execute, initCpu, resetCpu, interrupt as triggerInterrupt } from './cpu';
import { HardwareContext, StepInfo } from './types';
import {
  OP_CALL_C,
  OP_CALL_M,
  OP_CALL_NC,
  OP_CALL_NN,
  OP_CALL_NZ,
  OP_CALL_P,
  OP_CALL_PE,
  OP_CALL_PO,
  OP_CALL_Z,
  OP_PREFIX_ED,
  OP_RET,
  OP_RET_C,
  OP_RET_M,
  OP_RET_NC,
  OP_RET_NZ,
  OP_RET_P,
  OP_RET_PE,
  OP_RET_PO,
  OP_RET_Z,
  ED_RET_OPCODES,
  RST_OPCODES,
} from './opcodes';

export interface Z80Runtime {
  readonly cpu: Cpu;
  readonly hardware: HardwareContext;
  step: (options?: { trace?: StepInfo }) => RunResult;
  runUntilStop: (breakpoints: Set<number>) => RunResult;
  getRegisters: () => Cpu;
  isHalted: () => boolean;
  getPC: () => number;
  reset: (program?: HexProgram, entry?: number) => void;
}

export interface RuntimeOptions {
  romRanges?: Array<{ start: number; end: number }>;
}

export interface RunResult {
  halted: boolean;
  pc: number;
  reason: 'halt' | 'breakpoint';
}

export interface IoHandlers {
  read?: (port: number) => number;
  write?: (port: number, value: number) => void;
  tick?: () => TickResult | void;
}

type Z80RuntimeImpl = Z80Runtime & { cpu: Cpu; hardware: HardwareContext };

interface TickResult {
  interrupt?: {
    nonMaskable?: boolean;
    data?: number;
  };
  stop?: boolean;
}

export function createZ80Runtime(
  program: HexProgram,
  entry?: number,
  ioHandlers?: IoHandlers,
  options?: RuntimeOptions
): Z80Runtime {
  const cpu = initCpu();
  const memory = new Uint8Array(0x10000);
  const romRanges = options?.romRanges ?? [];
  const isRomAddress = (addr: number): boolean => {
    for (const range of romRanges) {
      if (addr >= range.start && addr <= range.end) {
        return true;
      }
    }
    return false;
  };
  const io: Required<IoHandlers> = {
    read: ioHandlers?.read ?? ((_port: number): number => 0),
    write:
      ioHandlers?.write ??
      ((_port: number, _value: number): void => {
        /* noop */
      }),
    tick: ioHandlers?.tick ?? (() => undefined),
  };

  const hardware: HardwareContext = {
    memory,
    ioRead: (port: number): number => io.read(port & 0xffff) & 0xff,
    ioWrite: (port: number, value: number): void => {
      io.write(port & 0xffff, value & 0xff);
    },
    ioTick: (): TickResult | void => io.tick(),
  };
  hardware.memRead = (addr: number): number => memory[addr & 0xffff] ?? 0;
  hardware.memWrite = (addr: number, value: number): void => {
    const masked = addr & 0xffff;
    if (isRomAddress(masked)) {
      return;
    }
    memory[masked] = value & 0xff;
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

function classifyStepOver(cpu: Cpu, memRead: (addr: number) => number): StepInfo | null {
  const pc = cpu.pc & 0xffff;
  const opcode = memRead(pc) ?? 0;
  const returnAddressCall = (pc + 3) & 0xffff;
  const returnAddressRst = (pc + 1) & 0xffff;

  switch (opcode) {
    case OP_CALL_NN:
      return { kind: 'call', taken: true, returnAddress: returnAddressCall };
    case OP_CALL_NZ:
      return { kind: 'call', taken: !cpu.flags.Z, returnAddress: returnAddressCall };
    case OP_CALL_Z:
      return { kind: 'call', taken: !!cpu.flags.Z, returnAddress: returnAddressCall };
    case OP_CALL_NC:
      return { kind: 'call', taken: !cpu.flags.C, returnAddress: returnAddressCall };
    case OP_CALL_C:
      return { kind: 'call', taken: !!cpu.flags.C, returnAddress: returnAddressCall };
    case OP_CALL_PO:
      return { kind: 'call', taken: !cpu.flags.P, returnAddress: returnAddressCall };
    case OP_CALL_PE:
      return { kind: 'call', taken: !!cpu.flags.P, returnAddress: returnAddressCall };
    case OP_CALL_P:
      return { kind: 'call', taken: !cpu.flags.S, returnAddress: returnAddressCall };
    case OP_CALL_M:
      return { kind: 'call', taken: !!cpu.flags.S, returnAddress: returnAddressCall };
    default:
      break;
  }

  if (RST_OPCODES.has(opcode)) {
    return { kind: 'rst', taken: true, returnAddress: returnAddressRst };
  }

  switch (opcode) {
    case OP_RET:
      return { kind: 'ret', taken: true };
    case OP_RET_NZ:
      return { kind: 'ret', taken: !cpu.flags.Z };
    case OP_RET_Z:
      return { kind: 'ret', taken: !!cpu.flags.Z };
    case OP_RET_NC:
      return { kind: 'ret', taken: !cpu.flags.C };
    case OP_RET_C:
      return { kind: 'ret', taken: !!cpu.flags.C };
    case OP_RET_PO:
      return { kind: 'ret', taken: !cpu.flags.P };
    case OP_RET_PE:
      return { kind: 'ret', taken: !!cpu.flags.P };
    case OP_RET_P:
      return { kind: 'ret', taken: !cpu.flags.S };
    case OP_RET_M:
      return { kind: 'ret', taken: !!cpu.flags.S };
    default:
      break;
  }

  if (opcode === OP_PREFIX_ED) {
    const opcode2 = memRead((pc + 1) & 0xffff) ?? 0;
    if (ED_RET_OPCODES.has(opcode2)) {
      return { kind: 'ret', taken: true };
    }
  }

  return null;
}

function stepRuntime(this: Z80RuntimeImpl, options?: { trace?: StepInfo }): RunResult {
  const cpu = this.cpu;
  const hardware = this.hardware;
  const memRead = hardware.memRead ?? ((addr: number) => hardware.memory[addr & 0xffff] ?? 0);
  const memWrite =
    hardware.memWrite ??
    ((addr: number, value: number) => {
      hardware.memory[addr & 0xffff] = value & 0xff;
    });
  if (cpu.halted) {
    return { halted: true, pc: cpu.pc, reason: 'halt' };
  }
  if (options?.trace) {
    delete options.trace.kind;
    options.trace.taken = false;
    delete options.trace.returnAddress;
    const stepInfo = classifyStepOver(cpu, memRead);
    if (stepInfo) {
      Object.assign(options.trace, stepInfo);
    }
  }

  execute(cpu, {
    mem_read: memRead,
    mem_write: memWrite,
    io_read: (port: number) => hardware.ioRead(port & 0xffff),
    io_write: (port: number, value: number) => {
      hardware.ioWrite(port & 0xffff, value & 0xff);
    },
  });

  const tickResult = (hardware.ioTick ? (hardware.ioTick() as TickResult | void) : undefined) as
    | TickResult
    | undefined;
  if (tickResult?.interrupt !== undefined) {
    const irq = tickResult.interrupt;
    triggerInterrupt(cpu, {
      mem_read: memRead,
      mem_write: memWrite,
      io_read: (port: number) => hardware.ioRead(port & 0xffff),
      io_write: (port: number, value: number) => {
        hardware.ioWrite(port & 0xffff, value & 0xff);
      },
    }, irq.nonMaskable === true, irq.data ?? 0);
  }
  if (tickResult?.stop) {
    return { halted: false, pc: cpu.pc, reason: 'breakpoint' };
  }

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
