/**
 * The first measurement Nucleus makes: how a slot index becomes an address.
 *
 * A three-address instruction does it three times, so it multiplies through
 * every arithmetic opcode. `docs/nucleus.md` estimated the two subroutine
 * variants at 64 and 25 T-states per operand and could not price the rest of
 * a handler at all. This replaces both estimates.
 */

import { describe, expect, it } from "vitest";

import {
  assemble,
  extent,
  run,
  symbol,
  variantSource,
  word,
  type Assembled,
} from "../src/measure.js";

const VARIANTS = ["variant-a", "variant-b", "variant-c"] as const;

const HALT = 0;
const LDI = 1;
const MOV = 2;
const ADD = 3;
const SUB = 4;
const JLT = 5;
const NOP = 6;

const built = new Map<string, Assembled>(
  VARIANTS.map((name) => [name, assemble(variantSource(name))]),
);

const vm = (name: string): Assembled => {
  const image = built.get(name);
  if (!image) throw new Error(`no variant ${name}`);
  return image;
};

/** Cycles for a bytecode program, from entry to HALT. */
const cyclesOf = (image: Assembled, program: number[]): number => {
  const outcome = run(image, {
    entry: symbol(image, "Start"),
    program,
    maxInstructions: 500_000,
  });
  expect(outcome.halted).toBe(true);
  return outcome.cycles;
};

/**
 * Cost of one bytecode instruction, isolated by difference: the same program
 * with and without it. Start-up and the trailing HALT cancel.
 */
const costOf = (image: Assembled, instruction: number[]): number =>
  cyclesOf(image, [...instruction, HALT]) - cyclesOf(image, [HALT]);

const region = (image: Assembled, name: string): number => {
  try {
    return extent(image, name, `${name}End`);
  } catch {
    return 0;
  }
};

describe("frame addressing", () => {
  it("runs the same counted loop on every variant and agrees on the answer", () => {
    // i = 0 : total = 0 : limit = 100 : one = 1
    // loop: total = total + i : i = i + one : if i < limit goto loop
    const program = [
      LDI,
      0,
      0,
      0,
      LDI,
      1,
      0,
      0,
      LDI,
      2,
      100,
      0,
      LDI,
      3,
      1,
      0,
      ADD,
      1,
      0,
      1,
      ADD,
      0,
      3,
      0,
      JLT,
      0,
      2,
      0x10,
      0x03,
      HALT,
    ];

    const report: string[] = [];
    for (const name of VARIANTS) {
      const image = vm(name);
      const outcome = run(image, {
        entry: symbol(image, "Start"),
        program,
        maxInstructions: 500_000,
      });

      expect(outcome.halted).toBe(true);
      // Slot 1 is the running total: 0 + 1 + ... + 99.
      expect(word(outcome.memory, 0x0402)).toBe(4950);
      // Slot 0 is the counter, which stops on reaching the limit.
      expect(word(outcome.memory, 0x0400)).toBe(100);

      report.push(`${name}  ${outcome.cycles.toString().padStart(7)} T`);
    }

    console.log(["", "sum 0..99, 100 iterations", ...report].join("\n  "));
  });

  it("reports counted bytes and T-states per opcode", () => {
    const rows: string[] = [];
    for (const name of VARIANTS) {
      const image = vm(name);

      const sizes = {
        dispatch: region(image, "Next"),
        slot: region(image, "Slot"),
        ldi: region(image, "OpLdi"),
        mov: region(image, "OpMov"),
        add: region(image, "OpAdd"),
        sub: region(image, "OpSub"),
        jlt: region(image, "OpJlt"),
      };
      const core = symbol(image, "VmEnd") - symbol(image, "Start");

      const costs = {
        nop: costOf(image, [NOP]),
        ldi: costOf(image, [LDI, 0, 0x34, 0x12]),
        mov: costOf(image, [MOV, 0, 1]),
        add: costOf(image, [ADD, 0, 1, 2]),
        sub: costOf(image, [SUB, 0, 1, 2]),
        // Not taken: slot 0 and slot 1 are both zero, so 0 < 0 is false.
        jlt: costOf(image, [JLT, 0, 1, 0x00, 0x00]),
      };

      // Every handler must do something, and no opcode may be free.
      for (const [op, cost] of Object.entries(costs)) {
        expect(cost, `${name} ${op}`).toBeGreaterThan(0);
      }
      expect(sizes.add).toBeGreaterThan(0);

      rows.push(
        [
          `${name}   core ${core} bytes`,
          `  dispatch ${sizes.dispatch}b ${costs.nop}T   slot ${sizes.slot}b`,
          `  arithmetic above dispatch: ADD ${costs.add - costs.nop}T`,
          `  LDI ${sizes.ldi}b ${costs.ldi}T` +
            `   MOV ${sizes.mov}b ${costs.mov}T` +
            `   ADD ${sizes.add}b ${costs.add}T`,
          `  SUB ${sizes.sub}b ${costs.sub}T` +
            `   JLT ${sizes.jlt}b ${costs.jlt}T (not taken)`,
        ].join("\n  "),
      );
    }

    console.log(["", ...rows].join("\n  "));
  });

  it("prices one operand fetch, which is the decision", () => {
    // MOV reads one operand and writes one; ADD reads two and writes one. The
    // difference is one operand fetch plus one load, and the load is the same
    // sequence in every variant, so the spread across variants is addressing.
    const rows: string[] = [];
    for (const name of VARIANTS) {
      const image = vm(name);
      const mov = costOf(image, [MOV, 0, 1]);
      const add = costOf(image, [ADD, 0, 1, 2]);
      rows.push(
        `${name}  MOV ${mov}T   ADD ${add}T   difference ${add - mov}T`,
      );
    }
    console.log(["", "one extra operand", ...rows].join("\n  "));

    // Variant A forms the address through BC and a PUSH/POP of IX; B and C
    // form it from a page byte. A must be the slowest of the three.
    const a = costOf(vm("variant-a"), [ADD, 0, 1, 2]);
    const b = costOf(vm("variant-b"), [ADD, 0, 1, 2]);
    const c = costOf(vm("variant-c"), [ADD, 0, 1, 2]);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});
