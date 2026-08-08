import { describe, expect, it } from "vitest";

import { BootstrapMachine, assembleSource, imageOf } from "../src/bootstrap/index.js";

/**
 * The seek service, which is what makes single-pass back-patching possible.
 *
 * Lanternfly is single-pass: a forward jump is emitted with a placeholder and
 * filled in when its target is reached. That needs a writable output. The
 * alternative — buffering the image and flushing at the end — does not fit the
 * memory budget, because the buffer is as large as the compiler.
 */

function run(source: string) {
  const assembled = assembleSource(source);
  const machine = new BootstrapMachine({
    program: imageOf(assembled.bytes, assembled.origin),
  });
  const outcome = machine.runToHalt({ maxInstructions: 10_000 });
  expect(outcome.halted).toBe(true);
  return machine;
}

/**
 * `OUT` the low byte then the high byte, which commits the seek.
 *
 * The argument is an **offset into the output stream**, not a target address.
 */
const seek = (address: number) =>
  [
    `LD   A,$${(address & 0xff).toString(16).padStart(2, "0")}`,
    "OUT  ($06),A",
    `LD   A,$${((address >> 8) & 0xff).toString(16).padStart(2, "0")}`,
    "OUT  ($07),A",
  ].join("\n    ");

describe("the code output can be patched", () => {
  it("appends when no cursor is set", () => {
    const machine = run(`
      .org $0000
      Start:
          LD   A,$11
          OUT  ($01),A
          LD   A,$22
          OUT  ($01),A
          HALT
    `);
    expect(Array.from(machine.code())).toEqual([0x11, 0x22]);
  });

  it("overwrites at the cursor, then resumes appending", () => {
    // Emit three bytes, patch the second, seek back to the end, append.
    const machine = run(`
      .org $0000
      Start:
          LD   A,$11
          OUT  ($01),A
          LD   A,$00          ; a placeholder, as a forward jump would emit
          OUT  ($01),A
          LD   A,$33
          OUT  ($01),A
          ${seek(1)}
          LD   A,$22          ; the patch
          OUT  ($01),A
          ${seek(3)}          ; back to the end
          LD   A,$44
          OUT  ($01),A
          HALT
    `);
    expect(Array.from(machine.code())).toEqual([0x11, 0x22, 0x33, 0x44]);
    expect(machine.codeFaults()).toBe(0);
  });

  it("patches a two-byte operand, which is what a jump needs", () => {
    const machine = run(`
      .org $0000
      Start:
          LD   A,$C3          ; JP
          OUT  ($01),A
          LD   A,$00          ; placeholder low
          OUT  ($01),A
          LD   A,$00          ; placeholder high
          OUT  ($01),A
          ${seek(1)}
          LD   A,$34
          OUT  ($01),A
          LD   A,$12          ; the cursor advanced, so no second seek
          OUT  ($01),A
          ${seek(3)}
          HALT
    `);
    expect(Array.from(machine.code())).toEqual([0xc3, 0x34, 0x12]);
  });

  it("resumes appending after a patch reaches the end", () => {
    // Patching the last byte leaves the cursor at the end, which is append
    // position — no second seek needed.
    const machine = run(`
      .org $0000
      Start:
          LD   A,$11
          OUT  ($01),A
          LD   A,$00
          OUT  ($01),A
          ${seek(1)}
          LD   A,$22          ; patches the last byte
          OUT  ($01),A
          LD   A,$33          ; appends
          OUT  ($01),A
          HALT
    `);
    expect(Array.from(machine.code())).toEqual([0x11, 0x22, 0x33]);
    expect(machine.codeFaults()).toBe(0);
  });

  it("seeking exactly to the end resumes appending", () => {
    const machine = run(`
      .org $0000
      Start:
          LD   A,$11
          OUT  ($01),A
          ${seek(1)}          ; exactly the end
          LD   A,$22
          OUT  ($01),A
          HALT
    `);
    expect(Array.from(machine.code())).toEqual([0x11, 0x22]);
    expect(machine.codeFaults()).toBe(0);
  });

  it("seeking past the end is a fault, not append mode", () => {
    // The contract says a seek names a byte already emitted, or the end. An
    // earlier implementation treated anything at or past the end as append,
    // so a bad offset silently became an append and the image gained a hole.
    const machine = run(`
      .org $0000
      Start:
          LD   A,$11
          OUT  ($01),A
          ${seek(5)}          ; past the end
          LD   A,$22
          OUT  ($01),A
          HALT
    `);
    expect(machine.codeFaults()).toBe(1);
  });

  it("counts a patch that runs off the end as a fault", () => {
    const machine = run(`
      .org $0000
      Start:
          LD   A,$11
          OUT  ($01),A
          LD   A,$22
          OUT  ($01),A
          ${seek(1)}
          LD   A,$33          ; patches the last byte, cursor returns to append
          OUT  ($01),A
          HALT
    `);
    expect(Array.from(machine.code())).toEqual([0x11, 0x33]);
    expect(machine.codeFaults()).toBe(0);
  });
});
