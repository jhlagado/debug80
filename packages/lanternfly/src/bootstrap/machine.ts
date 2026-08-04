/**
 * The bootstrap machine: a flat 64K Z80 with five stream operations and
 * nothing else. No interrupts, no timer, no devices.
 *
 * Ports carry the operations of the bootstrap profile. Every handler masks
 * with 0xff, because the CPU presents `(A << 8) | n` on both `IN A,(n)` and
 * `OUT (n),A` — a handler written against the bare port number never fires.
 */

import { createZ80Runtime } from "@jhlagado/debug80-runtime";
import type { HexProgram } from "@jhlagado/debug80-runtime";
import type { Cpu } from "@jhlagado/debug80-runtime/z80/types";

export const PORT_SOURCE = 0x00;
export const PORT_CODE = 0x01;
export const PORT_STATUS = 0x02;
export const PORT_DIAGNOSTIC = 0x03;
export const PORT_REWIND = 0x05;

/** End of source. Framing, never delivered as data. */
export const SOURCE_END = 0xff;

export interface MachineOptions {
  /** 64K image with the program already placed. */
  readonly program: HexProgram;
  /** Entry address. Defaults to the program's start address. */
  readonly entry?: number;
  /** Stack pointer. The CPU leaves this at 0xdff0 otherwise, mid-store. */
  readonly stackPointer?: number;
  /** Source text delivered through the source port. */
  readonly source?: Uint8Array | string;
  /** Ranges the program may not write, for the read-only self-check. */
  readonly romRanges?: ReadonlyArray<{ start: number; end: number }>;
}

export interface RunBudget {
  readonly maxInstructions: number;
}

export interface RunOutcome {
  readonly halted: boolean;
  /** Address of the HALT itself. The CPU reports one past it. */
  readonly haltAddress: number;
  readonly instructions: number;
  readonly cycles: number;
  readonly exhausted: boolean;
  /** Lowest stack pointer observed, sampled. Names a runaway recursion. */
  readonly stackLow: number;
}

export class BootstrapMachine {
  readonly #runtime: ReturnType<typeof createZ80Runtime>;
  readonly #source: Uint8Array;
  #sourceIndex = 0;
  readonly #code: number[] = [];
  readonly #diagnostic: number[] = [];
  #status: number | undefined;

  constructor(options: MachineOptions) {
    const source =
      typeof options.source === "string"
        ? new TextEncoder().encode(options.source)
        : (options.source ?? new Uint8Array(0));
    this.#source = source;

    this.#runtime = createZ80Runtime(
      options.program,
      options.entry ?? options.program.startAddress,
      {
        read: (port) => this.#read(port & 0xff),
        write: (port, value) => this.#write(port & 0xff, value & 0xff),
      },
      { romRanges: options.romRanges ? [...options.romRanges] : [] },
    );

    this.#runtime.cpu.sp = options.stackPointer ?? 0x0000;
  }

  #read(port: number): number {
    if (port !== PORT_SOURCE) return 0;
    if (this.#sourceIndex >= this.#source.length) return SOURCE_END;
    const byte = this.#source[this.#sourceIndex];
    this.#sourceIndex += 1;
    return byte;
  }

  #write(port: number, value: number): void {
    switch (port) {
      case PORT_CODE:
        this.#code.push(value);
        return;
      case PORT_DIAGNOSTIC:
        this.#diagnostic.push(value);
        return;
      case PORT_STATUS:
        this.#status = value;
        return;
      case PORT_REWIND:
        this.#sourceIndex = 0;
        return;
      default:
        return;
    }
  }

  get cpu(): Cpu {
    return this.#runtime.cpu;
  }

  get memory(): Uint8Array {
    return this.#runtime.hardware.memory;
  }

  /** Bytes written to the code port, in order. */
  code(): Uint8Array {
    return Uint8Array.from(this.#code);
  }

  /** Text written to the diagnostic port. */
  diagnostics(): string {
    return new TextDecoder().decode(Uint8Array.from(this.#diagnostic));
  }

  /** Undefined until the program sets it. Zero means success. */
  status(): number | undefined {
    return this.#status;
  }

  /** How much of the source the program consumed. */
  sourceConsumed(): number {
    return this.#sourceIndex;
  }

  /** One instruction. The lockstep differ drives two machines through this. */
  step(): { halted: boolean; cycles: number } {
    const result = this.#runtime.step();
    return {
      halted: result.halted || this.#runtime.cpu.halted,
      cycles: result.cycles ?? 0,
    };
  }

  /**
   * Steps until the CPU halts or the budget runs out. A compiler's success
   * condition is halting, so this is deliberately not the TEC-1G session's
   * `runUntil`, which throws when a program halts.
   */
  runToHalt(budget: RunBudget): RunOutcome {
    let instructions = 0;
    let cycles = 0;
    let stackFloor = this.#runtime.cpu.sp;

    while (instructions < budget.maxInstructions) {
      const result = this.#runtime.step();
      instructions += 1;
      cycles += result.cycles ?? 0;

      // Cheap stack-depth watch: turns runaway recursion from mystifying
      // wrong output into a named failure.
      if ((instructions & 0xfff) === 0) {
        const sp = this.#runtime.cpu.sp;
        if (sp !== 0 && sp < stackFloor) stackFloor = sp;
      }

      if (result.halted || this.#runtime.cpu.halted) {
        return {
          halted: true,
          haltAddress: (this.#runtime.cpu.pc - 1) & 0xffff,
          instructions,
          cycles,
          exhausted: false,
          stackLow: stackFloor,
        };
      }
    }

    return {
      halted: false,
      haltAddress: this.#runtime.cpu.pc,
      instructions,
      cycles,
      exhausted: true,
      stackLow: stackFloor,
    };
  }
}

/**
 * Builds a 64K image with `bytes` placed at `origin`. The store is zeroed
 * first, which the determinism contract requires: a table slot read beyond
 * its used count must not differ between runs.
 */
export function imageOf(bytes: Uint8Array, origin = 0x0000): HexProgram {
  const memory = new Uint8Array(0x10000);
  memory.set(bytes, origin);
  return { memory, startAddress: origin };
}
