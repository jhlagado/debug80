import { describe, expect, it } from "vitest";

/**
 * The round-trip byte lowering, checked rather than asserted.
 *
 * `docs/nucleus/review-actions.md` claims a byte expression assigned to a byte
 * may be computed in byte arithmetic — wrapping at every step — when every
 * operator is `+`, `-` or `*`, and may not when a division or comparison is
 * involved.
 *
 * **This is a regression witness, not a proof.** It covers one expression
 * shape, `(a - b) op c`, exhaustively. The general case rests on an algebraic
 * argument: reduction modulo 256 is a ring homomorphism, so it commutes with
 * addition, subtraction and multiplication for any expression tree built from
 * them, and division and ordering are excluded because the quotient map does
 * not carry them. What this file adds is that an implementation which drifts
 * from that argument fails a test.
 *
 * **It is also a model check, not a lowering check.** Both sides are written
 * in TypeScript. `byte-lowering.test.ts` executes the emitted Z80.
 *
 * Two models are compared:
 *
 *   exact — section 3.1's widths, so `u8 - u8` is `i16` and intermediates do
 *           not wrap; the assignment to a `u8` takes the low byte at the end.
 *   byte  — every step wraps to eight bits, which is what the lowering does.
 */

const BYTE = 0xff;
const wrap = (v: number) => ((v % 256) + 256) % 256;
/** Truncating division, the direction both the folder and the runtime take. */
const div = (a: number, b: number) => Math.trunc(a / b);

describe("byte arithmetic is congruent modulo 256 for add, subtract and multiply", () => {
  for (const [name, op] of [
    ["+", (x: number, y: number) => x + y],
    ["-", (x: number, y: number) => x - y],
    ["*", (x: number, y: number) => x * y],
  ] as const) {
    it(`(a - b) ${name} c agrees with the wrapped form`, () => {
      // The subtraction supplies a wrapping intermediate, which is the case
      // the claim is actually about. Disagreements are counted and asserted
      // once: a million `expect` calls takes five seconds and a comparison
      // takes none.
      let checked = 0;
      let disagreements = 0;
      let first = "";
      for (let a = 0; a <= BYTE; a += 1) {
        for (let b = 0; b <= BYTE; b += 1) {
          const exact = a - b;
          const wrapped = wrap(exact);
          for (let c = 0; c <= BYTE; c += 1) {
            checked += 1;
            if (wrap(op(exact, c)) !== wrap(op(wrapped, c))) {
              disagreements += 1;
              if (first === "") first = `(${a} - ${b}) ${name} ${c}`;
            }
          }
        }
      }
      expect(disagreements, `first disagreement at ${first}`).toBe(0);
      expect(checked).toBe(256 * 256 * 256);
    });
  }
});

describe("division is not congruent, which is why it disqualifies the expression", () => {
  it("the smallest counterexample is (0 - 1) / 2", () => {
    const exact = 0 - 1;
    expect(wrap(div(exact, 2))).toBe(0); // -1 / 2 truncates towards zero
    expect(wrap(div(wrap(exact), 2))).toBe(127); // 255 / 2 is 127
  });

  it("disagrees on a large fraction of triples, not a corner", () => {
    let disagreements = 0;
    let total = 0;
    for (let a = 0; a <= BYTE; a += 3) {
      for (let b = 0; b <= BYTE; b += 3) {
        for (let c = 1; c <= BYTE; c += 3) {
          const exact = a - b;
          total += 1;
          if (wrap(div(exact, c)) !== wrap(div(wrap(exact), c))) disagreements += 1;
        }
      }
    }
    console.log(
      `division: ${disagreements} of ${total} triples disagree ` +
        `(${((100 * disagreements) / total).toFixed(1)}%)`,
    );
    expect(disagreements).toBeGreaterThan(total / 10);
  });
});

describe("comparison is not congruent either", () => {
  it("(0 - 1) > 0 is false exactly and true wrapped", () => {
    expect(0 - 1 > 0).toBe(false);
    expect(wrap(0 - 1) > 0).toBe(true);
  });

  it("disagrees on every pair whose intermediate is negative", () => {
    let disagreements = 0;
    for (let a = 0; a <= BYTE; a += 1) {
      for (let b = 0; b <= BYTE; b += 1) {
        const exact = a - b;
        if (exact > 0 !== wrap(exact) > 0) disagreements += 1;
      }
    }
    // Every pair with a < b, which is 255 * 256 / 2.
    expect(disagreements).toBe((255 * 256) / 2);
  });
});
