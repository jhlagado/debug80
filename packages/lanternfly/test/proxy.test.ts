import { describe, expect, it } from "vitest";

import {
  BootstrapMachine,
  SourceFramingError,
  assembleSource,
  imageOf,
} from "../src/bootstrap/index.js";

/**
 * A representative proxy for compiler throughput.
 *
 * The first measurement was a bare CPU loop with no port callbacks and one
 * pass over nothing, which made a three-second self-compile look settled
 * when it was a projection. This proxy reads the whole source three times
 * through the source port — a JavaScript callback per byte — and writes an
 * output byte for every four source bytes, which is roughly the density of
 * a compiler's emission. It is still a proxy, not a compiler, and the
 * numbers below remain projections until Candlemoth exists.
 */
const threePassProxy = `
  .org $0000
  Start:
      LD   C,3                ; three passes
  _pass:
      LD   HL,0               ; byte counter within the pass
  _next:
      IN   A,($00)
      CP   $FF
      JR   Z,_endOfPass
      INC  HL
      LD   A,L
      AND  $03                ; emit one byte in four
      JR   NZ,_next
      LD   A,L
      OUT  ($01),A
      JR   _next
  _endOfPass:
      DEC  C
      JR   Z,_done
      XOR  A
      OUT  ($05),A            ; rewindSource
      JR   _pass
  _done:
      XOR  A
      OUT  ($02),A
      HALT
`;

describe("throughput against a representative proxy", () => {
  it("measures three passes with a port callback per source byte", () => {
    const assembled = assembleSource(threePassProxy);

    // 24K of source, which is the order of one Candlemoth module rather than
    // the whole compiler. Scaling to 100K is stated as a projection.
    const sourceBytes = 24 * 1024;
    const source = "x".repeat(sourceBytes);

    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
      source,
    });

    const started = process.hrtime.bigint();
    const outcome = machine.runToHalt({ maxInstructions: 20_000_000 });
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;

    expect(outcome.halted).toBe(true);
    expect(machine.status()).toBe(0);
    expect(machine.sourceConsumed()).toBe(sourceBytes);

    const instructionsPerSecond = outcome.instructions / seconds;
    const instructionsPerSourceByte = outcome.instructions / (sourceBytes * 3);

    // The only measured quantity here is the instruction rate with a port
    // callback in the loop. Everything below it is arithmetic over an
    // assumed instruction density, which Phase 3 replaces with a measurement
    // from Candlemoth's own tokenizer.
    const project = (perSourceByte: number) => {
      const instructions = 100 * 1024 * 3 * perSourceByte;
      return instructions / instructionsPerSecond;
    };

    console.log(
      [
        `three-pass proxy over ${sourceBytes} source bytes`,
        `  MEASURED`,
        `    instructions          ${outcome.instructions.toLocaleString()}`,
        `    wall seconds          ${seconds.toFixed(3)}`,
        `    instructions/sec      ${Math.round(instructionsPerSecond).toLocaleString()}`,
        `    proxy instr/source byte ${instructionsPerSourceByte.toFixed(1)}`,
        `  PROJECTED, by assumed compiler density over 100K of source`,
        `    at  50 instr/byte  compile ${project(50).toFixed(1)}s   fixpoint ${(project(50) * 2).toFixed(1)}s`,
        `    at 200 instr/byte  compile ${project(200).toFixed(1)}s   fixpoint ${(project(200) * 2).toFixed(1)}s`,
        `    at 500 instr/byte  compile ${project(500).toFixed(1)}s   fixpoint ${(project(500) * 2).toFixed(1)}s`,
      ].join("\n"),
    );

    // A floor on the measured rate only. The projections are not asserted,
    // because the density that drives them is not yet known.
    expect(instructionsPerSecond).toBeGreaterThan(1_000_000);
  });
});

describe("source framing is the producer's responsibility", () => {
  it("refuses to deliver a byte that collides with the terminator", () => {
    const assembled = assembleSource(".org $0000\nStart:\n    HALT\n");
    expect(
      () =>
        new BootstrapMachine({
          program: imageOf(assembled.bytes, assembled.origin),
          source: Uint8Array.from([0x41, 0xff, 0x42]),
        }),
    ).toThrow(SourceFramingError);
  });

  it("refuses non-ASCII rather than letting the compiler diagnose it", () => {
    const assembled = assembleSource(".org $0000\nStart:\n    HALT\n");
    expect(
      () =>
        new BootstrapMachine({
          program: imageOf(assembled.bytes, assembled.origin),
          source: "café",
        }),
    ).toThrow(SourceFramingError);
  });

  it("accepts printable ASCII with tabs and newlines", () => {
    const assembled = assembleSource(".org $0000\nStart:\n    HALT\n");
    expect(
      () =>
        new BootstrapMachine({
          program: imageOf(assembled.bytes, assembled.origin),
          source: "sub main()\n\treturn\nend\n",
        }),
    ).not.toThrow();
  });
});

describe("code space is protected by default", () => {
  it("drops a write into the program's own extent without being asked", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          LD   A,$99
          LD   ($0002),A      ; inside its own code
          LD   ($8000),A      ; inside the store
          HALT
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
    });

    machine.runToHalt({ maxInstructions: 100 });

    expect(machine.memory[0x0002]).not.toBe(0x99);
    expect(machine.memory[0x8000]).toBe(0x99);
  });

  it("allows a deliberate opt-out for a compiler that runs from RAM", () => {
    const assembled = assembleSource(`
      .org $0000
      Start:
          LD   A,$99
          LD   ($0002),A
          HALT
    `);
    const machine = new BootstrapMachine({
      program: imageOf(assembled.bytes, assembled.origin),
      romRanges: [],
    });

    machine.runToHalt({ maxInstructions: 100 });

    expect(machine.memory[0x0002]).toBe(0x99);
  });
});
