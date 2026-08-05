import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import {
  BootstrapMachine,
  assembleSource,
  imageOf,
  symbolAt,
} from "../src/bootstrap/index.js";

/**
 * Proofs for the fourteen level-0 runtime routines.
 *
 * `docs/level0-lowering.md` states each routine's contract; `runtime.asm`
 * implements it; this file is what says the two agree. The comparison
 * routines are exercised over every pair drawn from a set of edge values,
 * because the risky cases — the signed orderings across the sign boundary,
 * where the subtraction overflows — are exactly the ones a sampled test
 * misses.
 *
 * A routine is driven by setting the registers and running to HALT rather
 * than by assembling a driver per case: address zero holds a HALT, and it is
 * pushed as the return address, so a routine that returns normally lands on
 * it and a routine that traps halts inside `Trap`.
 */

const HALT_AT_ZERO = ".org $0000\n    HALT\n";

let assembled: ReturnType<typeof assembleSource>;

beforeAll(() => {
  const runtime = readFileSync("candlemoth/runtime.asm", "utf8");
  assembled = assembleSource(HALT_AT_ZERO + runtime);
});

interface Outcome {
  readonly result: number;
  readonly trapped: boolean;
  readonly diagnostic: number | undefined;
  readonly status: number | undefined;
}

/** Calls one routine with the given left and right operands. */
function call(routine: string, left: number, right: number): Outcome {
  const machine = new BootstrapMachine({
    program: imageOf(assembled.bytes, assembled.origin),
  });

  const cpu = machine.cpu;
  cpu.sp = 0x0000;
  // Push zero as the return address, where the HALT sits.
  cpu.sp = (cpu.sp - 2) & 0xffff;
  machine.memory[cpu.sp] = 0x00;
  machine.memory[(cpu.sp + 1) & 0xffff] = 0x00;

  cpu.d = (left >> 8) & 0xff;
  cpu.e = left & 0xff;
  cpu.h = (right >> 8) & 0xff;
  cpu.l = right & 0xff;
  cpu.pc = symbolAt(assembled, routine);

  const outcome = machine.runToHalt({ maxInstructions: 5_000 });
  expect(outcome.halted).toBe(true);

  const diagnostics = machine.diagnostics();
  return {
    result: ((cpu.h << 8) | cpu.l) & 0xffff,
    trapped: machine.status() !== undefined,
    diagnostic: diagnostics.length > 0 ? diagnostics.charCodeAt(0) : undefined,
    status: machine.status(),
  };
}

const FAULT_BOUNDS = 1;
const FAULT_DIVZERO = 2;
const STATUS_TRAP = 2;

/** Values that sit on every boundary a sixteen-bit routine can trip over. */
const EDGES = [
  0x0000, 0x0001, 0x0002, 0x007f, 0x0080, 0x00ff, 0x0100, 0x7ffe, 0x7fff,
  0x8000, 0x8001, 0xfffe, 0xffff,
] as const;

const signed = (v: number) => (v >= 0x8000 ? v - 0x10000 : v);

describe("multiply", () => {
  it("agrees with the low sixteen bits of the product, over every edge pair", () => {
    for (const left of EDGES) {
      for (const right of EDGES) {
        const outcome = call("Multiply", left, right);
        expect(outcome.trapped).toBe(false);
        expect(outcome.result).toBe((left * right) & 0xffff);
      }
    }
  });

  it("agrees over a spread of ordinary values", () => {
    for (let left = 0; left < 4096; left += 37) {
      for (let right = 0; right < 4096; right += 53) {
        expect(call("Multiply", left, right).result).toBe((left * right) & 0xffff);
      }
    }
  });
});

describe("divide, unsigned", () => {
  it("agrees with truncating division over every edge pair", () => {
    for (const left of EDGES) {
      for (const right of EDGES) {
        if (right === 0) continue;
        const outcome = call("Divide", left, right);
        expect(outcome.trapped).toBe(false);
        expect(outcome.result).toBe(Math.floor(left / right));
      }
    }
  });

  it("agrees over a spread of ordinary values", () => {
    for (let left = 0; left < 65535; left += 617) {
      for (let right = 1; right < 4096; right += 101) {
        expect(call("Divide", left, right).result).toBe(Math.floor(left / right));
      }
    }
  });

  it("traps on division by zero", () => {
    const outcome = call("Divide", 1234, 0);
    expect(outcome.trapped).toBe(true);
    expect(outcome.status).toBe(STATUS_TRAP);
    expect(outcome.diagnostic).toBe(FAULT_DIVZERO);
  });
});

describe("divide, signed", () => {
  it("truncates towards zero over every edge pair", () => {
    for (const left of EDGES) {
      for (const right of EDGES) {
        if (right === 0) continue;
        const a = signed(left);
        const b = signed(right);
        if (a === -32768 && b === -1) {
          // 32768 is not an i16, and the routine wraps to -32768 rather than
          // trapping. That is defined behaviour rather than an omission: the
          // negation of -32768 is -32768 in two's complement, so the sign
          // handling produces it without a special case. The lowering table
          // records it.
          expect(call("SignedDivide", left, right).result).toBe(0x8000);
          continue;
        }
        const outcome = call("SignedDivide", left, right);
        expect(outcome.trapped).toBe(false);
        // `+ 0` normalises JavaScript's negative zero, which `Math.trunc`
        // produces for a quotient that truncates to zero from below.
        expect(signed(outcome.result)).toBe(Math.trunc(a / b) + 0);
      }
    }
  });

  it("agrees over a spread of signed values", () => {
    for (let a = -20000; a < 20000; a += 977) {
      for (let b = -300; b < 300; b += 37) {
        if (b === 0) continue;
        const outcome = call("SignedDivide", a & 0xffff, b & 0xffff);
        expect(signed(outcome.result)).toBe(Math.trunc(a / b) + 0);
      }
    }
  });

  it("traps on division by zero", () => {
    const outcome = call("SignedDivide", 0xfff0, 0);
    expect(outcome.trapped).toBe(true);
    expect(outcome.diagnostic).toBe(FAULT_DIVZERO);
  });
});

interface Ordering {
  readonly routine: string;
  readonly holds: (left: number, right: number) => boolean;
}

const unsignedOrderings: readonly Ordering[] = [
  { routine: "CompareEqual", holds: (a, b) => a === b },
  { routine: "CompareNotEqual", holds: (a, b) => a !== b },
  { routine: "CompareLess", holds: (a, b) => a < b },
  { routine: "CompareLessEqual", holds: (a, b) => a <= b },
  { routine: "CompareGreater", holds: (a, b) => a > b },
  { routine: "CompareGreaterEqual", holds: (a, b) => a >= b },
];

const signedOrderings: readonly Ordering[] = [
  { routine: "CompareSignedLess", holds: (a, b) => signed(a) < signed(b) },
  { routine: "CompareSignedLessEqual", holds: (a, b) => signed(a) <= signed(b) },
  { routine: "CompareSignedGreater", holds: (a, b) => signed(a) > signed(b) },
  {
    routine: "CompareSignedGreaterEqual",
    holds: (a, b) => signed(a) >= signed(b),
  },
];

describe("comparisons", () => {
  for (const ordering of [...unsignedOrderings, ...signedOrderings]) {
    it(`${ordering.routine} holds for every edge pair`, () => {
      for (const left of EDGES) {
        for (const right of EDGES) {
          const outcome = call(ordering.routine, left, right);
          expect(outcome.trapped).toBe(false);
          const expected = ordering.holds(left, right) ? 1 : 0;
          expect(
            outcome.result,
            `${ordering.routine}(${left}, ${right})`,
          ).toBe(expected);
        }
      }
    });
  }

  it("the signed and unsigned orderings disagree where they must", () => {
    // 0x8000 is the largest unsigned value in this pair and the smallest
    // signed one, which is the case a single routine could not serve.
    expect(call("CompareGreater", 0x8000, 0x0001).result).toBe(1);
    expect(call("CompareSignedGreater", 0x8000, 0x0001).result).toBe(0);
    expect(call("CompareLess", 0x8000, 0x0001).result).toBe(0);
    expect(call("CompareSignedLess", 0x8000, 0x0001).result).toBe(1);
  });
});

describe("bounds check", () => {
  it("returns the subscript unchanged when it is in range", () => {
    for (const length of [1, 2, 255, 256, 4096, 0xffff]) {
      // Every subscript a length of one admits is zero, so the middle case
      // is dropped rather than asserted out of range.
      const indices = length > 1 ? [0, 1, length - 1] : [0];
      for (const index of indices) {
        const outcome = call("BoundsCheck", length, index);
        expect(outcome.trapped).toBe(false);
        expect(outcome.result).toBe(index);
      }
    }
  });

  it("traps when the subscript reaches the length", () => {
    for (const length of [1, 2, 255, 4096]) {
      for (const index of [length, length + 1, 0xffff]) {
        const outcome = call("BoundsCheck", length, index);
        expect(outcome.trapped, `length ${length}, index ${index}`).toBe(true);
        expect(outcome.status).toBe(STATUS_TRAP);
        expect(outcome.diagnostic).toBe(FAULT_BOUNDS);
      }
    }
  });

  it("traps on every subscript of a zero-length array", () => {
    for (const index of [0, 1, 0xffff]) {
      expect(call("BoundsCheck", 0, index).trapped).toBe(true);
    }
  });
});

describe("the whole runtime", () => {
  it("fits in the budget the findings ledger estimated", () => {
    // The estimate was "perhaps three hundred bytes". The one byte of HALT
    // at address zero belongs to this test's driver, not to the runtime.
    const bytes = assembled.bytes.length - 1;
    console.log(`runtime: ${bytes} bytes for fourteen routines`);
    expect(bytes).toBeLessThan(320);
  });
});
