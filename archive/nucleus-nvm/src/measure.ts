/**
 * Assemble a VM variant and run one bytecode program on it, reporting counted
 * bytes and counted T-states.
 *
 * Every number this package publishes comes through here. Nothing in Nucleus
 * is allowed to claim a Z80 cost that AZM and the Debug80 runtime have not
 * produced.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { compileSource } from "@jhlagado/azm";
import { createZ80Runtime } from "@jhlagado/debug80-runtime";
import type { HexProgram } from "@jhlagado/debug80-runtime";

export interface Assembled {
  readonly bytes: Uint8Array;
  readonly origin: number;
  readonly symbols: Readonly<Record<string, number>>;
}

export class AssemblyError extends Error {
  constructor(
    readonly diagnostics: readonly { message: string; line?: number }[],
  ) {
    super(
      `assembly failed:\n${diagnostics
        .map((d) => `  ${d.line ?? "?"}: ${d.message}`)
        .join("\n")}`,
    );
    this.name = "AssemblyError";
  }
}

export function assemble(text: string): Assembled {
  const result = compileSource(text);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new AssemblyError(errors);
  return { bytes: result.bytes, origin: 0, symbols: result.symbols };
}

export function variantSource(name: string): string {
  const file = path.resolve(import.meta.dirname, "..", "asm", `${name}.asm`);
  return readFileSync(file, "utf8");
}

/** Case-folded symbol lookup; AZM's table preserves the source spelling. */
export function symbol(assembled: Assembled, name: string): number {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(assembled.symbols)) {
    if (key.toLowerCase() === wanted) return value;
  }
  throw new Error(
    `no symbol ${name}; have ${Object.keys(assembled.symbols).sort().join(", ")}`,
  );
}

function imageOf(bytes: Uint8Array, origin = 0x0000): HexProgram {
  const memory = new Uint8Array(0x10000);
  memory.set(bytes, origin);
  return { memory, startAddress: origin, writeRanges: [] };
}

export interface RunOutcome {
  readonly halted: boolean;
  readonly cycles: number;
  readonly instructions: number;
  readonly memory: Uint8Array;
}

/**
 * Runs to HALT one instruction at a time, because the aggregate cycle count is
 * the measurement and `runUntilStop` would hide it behind a breakpoint set.
 *
 * `program` is the bytecode, written at the VM's `Program` address before the
 * run so that one assembled VM serves every measurement.
 */
export function run(
  assembled: Assembled,
  options: {
    entry?: number;
    program?: readonly number[];
    maxInstructions?: number;
  } = {},
): RunOutcome {
  const entry = options.entry ?? assembled.origin;
  const limit = options.maxInstructions ?? 2_000_000;
  const image = imageOf(assembled.bytes, assembled.origin);
  if (options.program) {
    image.memory.set(
      Uint8Array.from(options.program),
      symbol(assembled, "Program"),
    );
  }
  const runtime = createZ80Runtime(image, entry);

  let cycles = 0;
  let instructions = 0;
  while (instructions < limit) {
    const step = runtime.step();
    cycles += step.cycles ?? 0;
    instructions += 1;
    if (step.halted || runtime.isHalted()) {
      return { halted: true, cycles, instructions, memory: memoryOf(runtime) };
    }
  }
  return { halted: false, cycles, instructions, memory: memoryOf(runtime) };
}

function memoryOf(runtime: ReturnType<typeof createZ80Runtime>): Uint8Array {
  const hardware = runtime.hardware as unknown as { memory: Uint8Array };
  return hardware.memory;
}

export function word(memory: Uint8Array, address: number): number {
  return memory[address] | (memory[address + 1] << 8);
}

/** Length of a labelled region, from its label to the label that follows it. */
export function extent(assembled: Assembled, from: string, to: string): number {
  return symbol(assembled, to) - symbol(assembled, from);
}
