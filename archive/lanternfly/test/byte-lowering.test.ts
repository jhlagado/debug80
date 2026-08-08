import { describe, expect, it } from "vitest";

import { BootstrapMachine, assembleSource, imageOf } from "../src/bootstrap/index.js";

/**
 * The round-trip byte lowering, executed on the machine.
 *
 * `byte-arithmetic.test.ts` compares two models written in TypeScript. It says
 * nothing about whether the emitted Z80 computes what those models say, which
 * is the claim that actually licenses the lowering. This file assembles the
 * real sequence and runs it.
 *
 * Writing it found that the sequence quoted in `docs/nucleus/review-actions.md` did
 * not exist: `SUB (nn)` is not a Z80 instruction, so `LD A,(a) / SUB (b)` — the
 * "two instructions, no widening" the byte lowering was justified by — does not
 * assemble. The real sequence is below and it is seven bytes.
 */

const RESULT = 0x9000;

/** `dest = a - b` in byte arithmetic, over every byte pair, as a checksum. */
const exhaustiveSubtract = `
  .org $0100
  Start:
      LD   B,0            ; a
      LD   HL,0           ; checksum
  _outer:
      LD   C,0            ; b
  _inner:
      LD   A,B
      SUB  C              ; the byte subtraction under test
      PUSH BC
      LD   C,A
      LD   B,0
      ADD  HL,HL
      ADD  HL,BC          ; checksum = checksum * 2 + result
      POP  BC
      INC  C
      JR   NZ,_inner
      INC  B
      JR   NZ,_outer
      LD   ($9000),HL
      HALT
`;

describe("the byte-subtract lowering", () => {
  it("is seven bytes, and the sequence that was quoted does not assemble", () => {
    expect(() =>
      assembleSource(".org $0100\nStart:\n    LD A,($9000)\n    SUB ($9001)\n"),
    ).toThrow(/invalid SUB operand/);

    const real = assembleSource(
      ".org $0100\nStart:\n    LD HL,$9001\n    LD A,($9000)\n    SUB (HL)\n",
    );
    expect(real.bytes.length).toBe(7);
  });

  it("agrees with wrapping arithmetic over every byte pair, on the machine", () => {
    const assembled = assembleSource(exhaustiveSubtract);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
      entry: 0x0100,
    });

    const outcome = machine.runToHalt({ maxInstructions: 3_000_000 });
    expect(outcome.halted).toBe(true);

    const measured = machine.memory[RESULT] | (machine.memory[RESULT + 1] << 8);

    // The same fold, over the same 65,536 pairs, in the model.
    let expected = 0;
    for (let a = 0; a <= 0xff; a += 1) {
      for (let b = 0; b <= 0xff; b += 1) {
        expected = (expected * 2 + ((a - b) & 0xff)) & 0xffff;
      }
    }

    expect(measured).toBe(expected);
    console.log(
      `byte subtract: 65,536 pairs executed, checksum 0x${measured.toString(16).padStart(4, "0")}`,
    );
  });

  it("costs 7 bytes against 18 for the widened path", () => {
    const widened = assembleSource(`
      .org $0100
      Start:
          LD   A,($9000)
          LD   L,A
          LD   H,0
          PUSH HL
          LD   A,($9001)
          LD   L,A
          LD   H,0
          POP  DE
          EX   DE,HL
          OR   A
          SBC  HL,DE
    `);
    expect(widened.bytes.length).toBe(18);
  });
});
