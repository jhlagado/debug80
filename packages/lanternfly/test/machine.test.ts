import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BootstrapMachine,
  SOURCE_END,
  assembleFile,
  assembleSource,
  firstDifference,
  formatSizeReport,
  imageOf,
  sizeReport,
  symbolAt,
} from "../src/bootstrap/index.js";

const fixture = (name: string) =>
  path.resolve(import.meta.dirname, "fixtures", name);

describe("the bootstrap machine", () => {
  it("runs the Phase 0 gate: source in, doubled bytes out, status, halt", async () => {
    const assembled = await assembleFile(fixture("echo-doubled.asm"));
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
      entry: symbolAt(assembled, "Start"),
      source: "AB",
    });

    const outcome = machine.runToHalt({ maxInstructions: 1_000 });

    expect(outcome.halted).toBe(true);
    expect(outcome.exhausted).toBe(false);
    expect(Array.from(machine.code())).toEqual([0x41, 0x41, 0x42, 0x42]);
    expect(machine.status()).toBe(0);
    expect(machine.sourceConsumed()).toBe(2);

    // The reported halt address is the HALT itself, not one past it.
    expect(machine.memory[outcome.haltAddress]).toBe(0x76);

    console.log(formatSizeReport(sizeReport("echo-doubled", assembled.bytes)));
  });

  it("delivers the framing terminator and never a source byte of 0xFF", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          IN   A,($00)
          LD   ($8000),A
          IN   A,($00)
          LD   ($8001),A
          HALT
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
      source: "Z",
    });

    machine.runToHalt({ maxInstructions: 100 });

    expect(machine.memory[0x8000]).toBe(0x5a);
    expect(machine.memory[0x8001]).toBe(SOURCE_END);
  });

  it("masks the port, which the CPU presents as (A << 8) | n", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          LD   A,$41
          OUT  ($01),A
          HALT
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
    });

    machine.runToHalt({ maxInstructions: 100 });

    // Reaches the code stream despite the CPU presenting port 0x4101.
    expect(Array.from(machine.code())).toEqual([0x41]);
  });

  it("rewinds the source, which the three-pass design needs", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          IN   A,($00)
          LD   ($8000),A
          OUT  ($05),A        ; rewindSource
          IN   A,($00)
          LD   ($8001),A
          HALT
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
      source: "XY",
    });

    machine.runToHalt({ maxInstructions: 100 });

    expect(machine.memory[0x8000]).toBe(0x58);
    expect(machine.memory[0x8001]).toBe(0x58);
  });

  it("reports budget exhaustion rather than hanging", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          JR   Start
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
    });

    const outcome = machine.runToHalt({ maxInstructions: 500 });

    expect(outcome.halted).toBe(false);
    expect(outcome.exhausted).toBe(true);
    expect(outcome.instructions).toBe(500);
  });

  it("keeps a program out of a read-only range", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          LD   A,$99
          LD   ($0010),A      ; inside its own code space
          LD   ($8000),A      ; inside the store
          HALT
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
      romRanges: [{ start: 0x0000, end: 0x3fff }],
    });

    machine.runToHalt({ maxInstructions: 100 });

    expect(machine.memory[0x0010]).not.toBe(0x99);
    expect(machine.memory[0x8000]).toBe(0x99);
  });
});

describe("image comparison", () => {
  it("finds the first difference with a readable window", () => {
    const left = Uint8Array.from([1, 2, 3, 4, 5]);
    const right = Uint8Array.from([1, 2, 9, 4, 5]);

    const difference = firstDifference(left, right);

    expect(difference?.offset).toBe(2);
    expect(difference?.left).toBe(3);
    expect(difference?.right).toBe(9);
  });

  it("reports nothing for identical images, which is the fixpoint test", () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    expect(firstDifference(bytes, Uint8Array.from(bytes))).toBeUndefined();
  });
});
