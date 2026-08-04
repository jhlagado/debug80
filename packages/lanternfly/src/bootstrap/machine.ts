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
  /**
   * Ranges the program may not write. Defaults to the program's own extent,
   * so a compiler that writes its own code space fails loudly rather than
   * producing a wrong image. Pass an empty array to opt out deliberately.
   */
  readonly romRanges?: ReadonlyArray<{ start: number; end: number }>;
}

export class SourceFramingError extends Error {
  constructor(offset: number, byte: number) {
    super(
      `source byte 0x${byte.toString(16)} at offset ${offset} is outside ` +
        `printable ASCII; framing and validation belong to the producer`,
    );
    this.name = "SourceFramingError";
  }
}

/** One captured store write, for the lockstep differ. */
export interface StoreWrite {
  readonly address: number;
  readonly value: number;
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
  /** Greatest stack depth reached, in bytes below the initial pointer. */
  readonly stackDepth: number;
  /** Stack pointer at that depth. */
  readonly stackLow: number;
}

export class BootstrapMachine {
  readonly #runtime: ReturnType<typeof createZ80Runtime>;
  readonly #source: Uint8Array;
  #sourceIndex = 0;
  readonly #code: number[] = [];
  readonly #diagnostic: number[] = [];
  #status: number | undefined;
  #writes: StoreWrite[] = [];
  readonly #stackTop: number;
  #stackDepth = 0;

  constructor(options: MachineOptions) {
    const source =
      typeof options.source === "string"
        ? new TextEncoder().encode(options.source)
        : (options.source ?? new Uint8Array(0));
    assertDeliverableSource(source);
    this.#source = source;

    this.#runtime = createZ80Runtime(
      options.program,
      options.entry ?? options.program.startAddress,
      {
        read: (port) => this.#read(port & 0xff),
        write: (port, value) => this.#write(port & 0xff, value & 0xff),
      },
      { romRanges: [...(options.romRanges ?? defaultRomRanges(options.program))] },
    );

    this.#runtime.cpu.sp = options.stackPointer ?? 0x0000;
    this.#stackTop = this.#runtime.cpu.sp;

    // Capture store writes so the lockstep differ compares what changed
    // rather than rescanning the address space every instruction.
    const inner = this.#runtime.hardware.memWrite;
    this.#runtime.hardware.memWrite = (address: number, value: number) => {
      const before = this.#runtime.hardware.memory[address & 0xffff];
      inner?.(address, value);
      const after = this.#runtime.hardware.memory[address & 0xffff];
      if (after !== before) {
        this.#writes.push({ address: address & 0xffff, value: after });
      }
    };
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
    // Depth is the modular distance below the initial pointer, because a
    // stack starting at 0x0000 wraps to the top on its first push and no
    // unsigned comparison can see that as deeper.
    const depth = (this.#stackTop - this.#runtime.cpu.sp) & 0xffff;
    if (depth > this.#stackDepth) this.#stackDepth = depth;
    return {
      halted: result.halted || this.#runtime.cpu.halted,
      cycles: result.cycles ?? 0,
    };
  }

  /** Store writes since the last call, then clears them. */
  takeWrites(): StoreWrite[] {
    const writes = this.#writes;
    this.#writes = [];
    return writes;
  }

  /** Greatest depth reached, in bytes below the initial stack pointer. */
  stackDepth(): number {
    return this.#stackDepth;
  }

  /** Stack pointer at that greatest depth. */
  stackLow(): number {
    return (this.#stackTop - this.#stackDepth) & 0xffff;
  }

  /**
   * Steps until the CPU halts or the budget runs out. A compiler's success
   * condition is halting, so this is deliberately not the TEC-1G session's
   * `runUntil`, which throws when a program halts.
   */
  runToHalt(budget: RunBudget): RunOutcome {
    let instructions = 0;
    let cycles = 0;

    while (instructions < budget.maxInstructions) {
      const result = this.step();
      instructions += 1;
      cycles += result.cycles;

      if (result.halted) {
        return {
          halted: true,
          haltAddress: (this.#runtime.cpu.pc - 1) & 0xffff,
          instructions,
          cycles,
          exhausted: false,
          stackDepth: this.#stackDepth,
          stackLow: this.stackLow(),
        };
      }
    }

    return {
      halted: false,
      haltAddress: this.#runtime.cpu.pc,
      instructions,
      cycles,
      exhausted: true,
      stackDepth: this.#stackDepth,
      stackLow: this.stackLow(),
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
  return {
    memory,
    startAddress: origin,
    writeRanges: [{ start: origin, end: origin + bytes.length }],
  };
}

/** Printable ASCII, tab, newline and carriage return. Nothing else. */
function assertDeliverableSource(source: Uint8Array): void {
  for (let offset = 0; offset < source.length; offset += 1) {
    const byte = source[offset];
    const printable = byte >= 0x20 && byte <= 0x7e;
    const whitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    if (!printable && !whitespace) throw new SourceFramingError(offset, byte);
  }
}

function defaultRomRanges(
  program: HexProgram,
): ReadonlyArray<{ start: number; end: number }> {
  if (program.writeRanges && program.writeRanges.length > 0) {
    return program.writeRanges.map((range) => ({
      start: range.start,
      end: range.end - 1,
    }));
  }
  return [];
}
