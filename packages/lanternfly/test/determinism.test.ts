import { describe, expect, it } from "vitest";

import {
  BootstrapMachine,
  assembleSource,
  imageOf,
  lockstep,
  twinMachines,
} from "../src/bootstrap/index.js";

/**
 * The determinism contract. Byte-identical output across runs is what the
 * fixpoint depends on, and an uninitialised table slot read beyond its used
 * count is the classic way to lose it.
 */
describe("determinism", () => {
  const readsUninitialisedStore = `
    .org $0000
    Start:
        LD   HL,$9000       ; never written by this program
        LD   A,(HL)
        OUT  ($01),A        ; whatever the store held reaches the output
        LD   HL,$C123
        LD   A,(HL)
        OUT  ($01),A
        XOR  A
        OUT  ($02),A
        HALT
  `;

  it("gives the same output on two runs of the same image", () => {
    const assembled = assembleSource(readsUninitialisedStore);
    const spec = {
      program: imageOf(assembled.bytes, assembled.origin),
      source: "",
    };

    const first = new BootstrapMachine(spec);
    first.runToHalt({ maxInstructions: 200 });

    const second = new BootstrapMachine(spec);
    second.runToHalt({ maxInstructions: 200 });

    expect(Array.from(second.code())).toEqual(Array.from(first.code()));
    expect(second.status()).toBe(first.status());
  });

  it("zeroes the store, so an unwritten slot reads as zero rather than as debris", () => {
    const assembled = assembleSource(readsUninitialisedStore);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
    });

    machine.runToHalt({ maxInstructions: 200 });

    expect(Array.from(machine.code())).toEqual([0x00, 0x00]);
  });

  it("runs two identical images in lockstep with no divergence", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          LD   B,8
          LD   HL,$8000
      _loop:
          LD   (HL),B
          INC  HL
          DJNZ _loop
          HALT
    `);
    const [left, right] = twinMachines({
      program: imageOf(assembled.bytes, assembled.origin),
    });

    expect(lockstep(left, right, { maxInstructions: 500 })).toBeUndefined();
  });

  it("names the first divergent write when two images differ", () => {
    const spec = (fill: number) => {
      const assembled = assembleSource(`
        .org $0000
        Start:
            LD   A,$11
            LD   ($8000),A
            LD   A,$${fill.toString(16).padStart(2, "0")}
            LD   ($8001),A
            HALT
      `);
      return { program: imageOf(assembled.bytes, assembled.origin) };
    };

    const divergence = lockstep(
      new BootstrapMachine(spec(0x22)),
      new BootstrapMachine(spec(0x33)),
      { maxInstructions: 500, watch: { start: 0x8000, end: 0x8010 } },
    );

    expect(divergence?.kind).toBe("memory");
    expect(divergence?.detail).toContain("0x8001");
    expect(divergence?.detail).toContain("left wrote 0x22");
    expect(divergence?.detail).toContain("right holds 0x33");
  });
});

describe("the diagnostic stream", () => {
  it("carries text without touching the code stream", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          LD   A,$45          ; 'E'
          OUT  ($03),A
          LD   A,$72          ; 'r'
          OUT  ($03),A
          LD   A,$AB          ; a code byte, to prove the streams are separate
          OUT  ($01),A
          LD   A,$07
          OUT  ($02),A        ; a failing status
          HALT
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
    });

    machine.runToHalt({ maxInstructions: 200 });

    expect(machine.diagnostics()).toBe("Er");
    expect(Array.from(machine.code())).toEqual([0xab]);
    expect(machine.status()).toBe(7);
  });
});

describe("throughput", () => {
  it("runs fast enough for the fixpoint to sit in the edit loop", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          LD   HL,$8000
          LD   DE,$0001
          LD   B,0
      _inner:
          ADD  HL,DE
          LD   A,(HL)
          INC  A
          LD   (HL),A
          DJNZ _inner
          JP   Start
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
    });

    const budget = 2_000_000;
    const started = process.hrtime.bigint();
    const outcome = machine.runToHalt({ maxInstructions: budget });
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;

    const instructionsPerSecond = outcome.instructions / seconds;
    const realtimeMultiple = outcome.cycles / seconds / 4_000_000;

    // Measured at about 30M instructions a second and 63x realtime. This
    // floor is deliberately far below that: it fails only if something has
    // gone badly wrong, such as tracing being left on.
    expect(instructionsPerSecond).toBeGreaterThan(2_000_000);
    expect(realtimeMultiple).toBeGreaterThan(4);
  });
});
