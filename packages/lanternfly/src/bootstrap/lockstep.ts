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
}

/**
 * Steps two machines together, stopping at the first observable difference.
 * Returns undefined when both ran to the same end with the same output.
 *
 * Comparison is proportional to the number of store writes, not to the
 * address space: each machine records what it wrote and the two lists are
 * matched. Rescanning memory every instruction would make this unusable at
 * the tens of millions of instructions a fixpoint takes.
 */
export function lockstep(
  left: BootstrapMachine,
  right: BootstrapMachine,
  options: LockstepOptions,
): Divergence | undefined {
  for (let step = 0; step < options.maxInstructions; step += 1) {
    const leftPc = left.cpu.pc;
    const rightPc = right.cpu.pc;

    const leftOutcome = left.step();
    const rightOutcome = right.step();

    const leftWrites = left.takeWrites();
    const rightWrites = right.takeWrites();

    if (leftWrites.length !== rightWrites.length) {
      return {
        step,
        kind: "memory",
        detail:
          `left made ${leftWrites.length} store writes, right made ` +
          `${rightWrites.length}`,
        leftPc,
        rightPc,
      };
    }

    for (let index = 0; index < leftWrites.length; index += 1) {
      const a = leftWrites[index];
      const b = rightWrites[index];
      if (a.address === b.address && a.value === b.value) continue;
      return {
        step,
        kind: "memory",
        detail:
          `left wrote 0x${a.value.toString(16).padStart(2, "0")} to ` +
          `0x${a.address.toString(16).padStart(4, "0")}, right wrote ` +
          `0x${b.value.toString(16).padStart(2, "0")} to ` +
          `0x${b.address.toString(16).padStart(4, "0")}`,
        leftPc,
        rightPc,
      };
    }

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
