import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BootstrapMachine,
  FLAT_PROFILE,
  RUNTIME_ORIGIN,
  TEC1_PROFILE,
  buildRuntimeImage,
  imageOf,
  renderRuntimeLafy,
} from "../src/bootstrap/index.js";

/**
 * The generated runtime image against the checked-in copy.
 *
 * Candlemoth plants the runtime as a placed constant byte array, and the
 * assembly source is the only place it is written. This test is the gate that
 * keeps the two identical. Run `npm run generate:runtime` after changing
 * `runtime.asm`, which rewrites the `.lafy` file this compares against.
 */

const ASSEMBLY = "candlemoth/runtime.asm";
const GENERATED = "candlemoth/runtime.lafy";

describe("the generated runtime image", () => {
  it("matches the checked-in Lanternfly source", () => {
    const rendered = renderRuntimeLafy(buildRuntimeImage(ASSEMBLY));

    if (process.env.UPDATE_RUNTIME === "1") {
      writeFileSync(GENERATED, rendered, "utf8");
      console.log(`wrote ${GENERATED}`);
      return;
    }

    const existing = readFileSync(GENERATED, "utf8");
    expect(existing).toBe(rendered);
  });

  it("gives every ordinal an address inside the placed image", () => {
    const image = buildRuntimeImage(ASSEMBLY);
    expect(image.origin).toBe(RUNTIME_ORIGIN);
    expect(image.addresses).toHaveLength(14);
    for (const address of image.addresses) {
      expect(address).toBeGreaterThanOrEqual(image.origin);
      expect(address).toBeLessThan(image.origin + image.bytes.length);
    }
    // Every routine has a distinct entry point.
    expect(new Set(image.addresses).size).toBe(image.addresses.length);
  });

  it("generates a distinct image for a target with a different origin", () => {
    // The bytes are origin-specific, so a TEC-1 image is not the flat image
    // relocated — it is assembled again. Any two routines that call each
    // other prove it: their absolute addresses differ by the origin.
    const flat = buildRuntimeImage(ASSEMBLY, FLAT_PROFILE);
    const tec1 = buildRuntimeImage(ASSEMBLY, TEC1_PROFILE);

    expect(tec1.origin).toBe(0x2000);
    expect(tec1.bytes.length).toBe(flat.bytes.length);
    expect(Array.from(tec1.bytes)).not.toEqual(Array.from(flat.bytes));
    for (const [ordinal, address] of tec1.addresses.entries()) {
      expect(address - tec1.origin).toBe(flat.addresses[ordinal] - flat.origin);
    }
  });

  it("clears page zero, entry jump and vectors alike", () => {
    // An earlier draft put the runtime at 0003, directly after the entry
    // jump, which covered every restart vector and the NMI entry. Page zero
    // belongs to the machine; code starts at 0100.
    expect(RUNTIME_ORIGIN).toBe(0x0100);
    for (const vector of [0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38, 0x66]) {
      expect(vector).toBeLessThan(RUNTIME_ORIGIN);
    }
  });
});

/**
 * The generated image running where it is declared to sit.
 *
 * The routines are not position-independent, so the bytes are only correct at
 * `RUNTIME_ORIGIN`. Assembling them and running them are separate claims:
 * `test/runtime.test.ts` proves the source is right, and this proves the
 * placed array is the same program. An earlier draft assembled the image at
 * zero and had the compiler add a base, which made every absolute jump inside
 * it point into program code.
 */
describe("the placed image", () => {
  const HALT = 0x76;

  function program(image: ReturnType<typeof buildRuntimeImage>): Uint8Array {
    const bytes = new Uint8Array(image.origin + image.bytes.length);
    bytes[0] = HALT;
    bytes.set(image.bytes, image.origin);
    return bytes;
  }

  function call(ordinal: number, left: number, right: number): number {
    const image = buildRuntimeImage(ASSEMBLY);
    const machine = new BootstrapMachine({ program: imageOf(program(image), 0) });
    const cpu = machine.cpu;

    cpu.sp = 0xfffe;
    machine.memory[0xfffe] = 0x00;
    machine.memory[0xffff] = 0x00;
    cpu.d = (left >> 8) & 0xff;
    cpu.e = left & 0xff;
    cpu.h = (right >> 8) & 0xff;
    cpu.l = right & 0xff;
    cpu.pc = image.addresses[ordinal];

    const outcome = machine.runToHalt({ maxInstructions: 5_000 });
    expect(outcome.halted).toBe(true);
    expect(machine.status()).toBeUndefined();
    return ((cpu.h << 8) | cpu.l) & 0xffff;
  }

  it("multiplies at the placed address", () => {
    expect(call(0, 300, 7)).toBe(2100);
    expect(call(0, 0xffff, 2)).toBe(0xfffe);
  });

  it("divides at the placed address", () => {
    expect(call(1, 1000, 7)).toBe(142);
    expect(call(2, (-1000) & 0xffff, 7)).toBe((-142) & 0xffff);
  });

  it("compares at the placed address, through the shared exits", () => {
    // These are the routines whose absolute jumps to ReturnTrue and
    // ReturnFalse leave the image if it is assembled anywhere else.
    expect(call(3, 5, 5)).toBe(1);
    expect(call(4, 5, 5)).toBe(0);
    expect(call(5, 4, 5)).toBe(1);
    expect(call(8, 5, 4)).toBe(1);
    expect(call(9, 0x8000, 1)).toBe(1);
    expect(call(12, 0x8000, 1)).toBe(0);
  });

  it("bounds-checks at the placed address", () => {
    expect(call(13, 10, 9)).toBe(9);
  });
});
