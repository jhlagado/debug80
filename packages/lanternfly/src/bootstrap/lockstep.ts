/**
 * Lockstep execution comparison, for images that are expected to be
 * identical.
 *
 * This is the B-against-C tool. It is useless between the seed's output and
 * Candlemoth's output: two correct compilers of different architecture have
 * different layouts, temporaries and tables, so their writes diverge at once
 * and the first divergence says nothing. For those, compare emitted-stream
 * prefixes instead.
 *
 * Where the images should match, the first divergent write localises a bug
 * far better than a diff of the output does, because it names the moment
 * rather than the symptom.
 */

import { BootstrapMachine, type MachineOptions } from "./machine.js";

export interface Divergence {
  /** Instruction index at which the two runs first differed. */
  readonly step: number;
  readonly kind: "memory" | "code" | "halt" | "budget";
  readonly detail: string;
  readonly leftPc: number;
  readonly rightPc: number;
}

export interface LockstepOptions {
  readonly maxInstructions: number;
  /** Watch this range for divergent writes. Defaults to the whole space. */
  readonly watch?: { readonly start: number; readonly end: number };
}

/**
 * Steps two machines together, stopping at the first observable difference.
 * Returns undefined when both ran to the same end with the same output.
 */
export function lockstep(
  left: BootstrapMachine,
  right: BootstrapMachine,
  options: LockstepOptions,
): Divergence | undefined {
  const start = options.watch?.start ?? 0x0000;
  const end = options.watch?.end ?? 0xffff;

  const leftMemory = left.memory;
  const rightMemory = right.memory;
  const shadow = leftMemory.slice(start, end + 1);

  for (let step = 0; step < options.maxInstructions; step += 1) {
    const leftPc = left.cpu.pc;
    const rightPc = right.cpu.pc;

    const leftOutcome = left.step();
    const rightOutcome = right.step();

    if (leftOutcome.halted !== rightOutcome.halted) {
      return {
        step,
        kind: "halt",
        detail: leftOutcome.halted
          ? "left halted while right continued"
          : "right halted while left continued",
        leftPc,
        rightPc,
      };
    }

    // Compare only what changed on the left, so the scan is proportional to
    // writes rather than to the address space.
    for (let address = start; address <= end; address += 1) {
      const before = shadow[address - start];
      const after = leftMemory[address];
      if (before === after) continue;
      shadow[address - start] = after;
      if (rightMemory[address] !== after) {
        return {
          step,
          kind: "memory",
          detail:
            `at 0x${address.toString(16).padStart(4, "0")}: ` +
            `left wrote 0x${after.toString(16).padStart(2, "0")}, ` +
            `right holds 0x${rightMemory[address].toString(16).padStart(2, "0")}`,
          leftPc,
          rightPc,
        };
      }
    }

    const leftCode = left.code();
    const rightCode = right.code();
    if (leftCode.length !== rightCode.length) {
      return {
        step,
        kind: "code",
        detail: `code stream lengths diverged: ${leftCode.length} against ${rightCode.length}`,
        leftPc,
        rightPc,
      };
    }

    if (leftOutcome.halted) return undefined;
  }

  return {
    step: options.maxInstructions,
    kind: "budget",
    detail: "neither image halted within the budget",
    leftPc: left.cpu.pc,
    rightPc: right.cpu.pc,
  };
}

/** Builds two machines from one specification, for a determinism check. */
export function twinMachines(
  options: MachineOptions,
): [BootstrapMachine, BootstrapMachine] {
  return [new BootstrapMachine(options), new BootstrapMachine(options)];
}
