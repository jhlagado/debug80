import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BootstrapMachine,
  FLAT_PROFILE,
  OP_JP,
  TEC1_PROFILE,
  assembleSource,
  buildImage,
  buildRuntimeImage,
  codeOrigin,
  imageOf,
  originClearsVectors,
} from "../src/bootstrap/index.js";

/**
 * The emitted-image contract, checked on the bytes.
 *
 * Review finding 27: `ownsResetVector` was a field nothing read, and the
 * page-zero test compared numbers rather than inspecting an image. These
 * tests build real images and read the entry bytes out of them.
 */

const ASSEMBLY = "candlemoth/runtime.asm";

/** A stand-in for compiled program code: HALT, then filler. */
function code(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes[0] = 0x76;
  return bytes;
}

describe("an image on a profile that owns the reset vector", () => {
  const runtime = buildRuntimeImage(ASSEMBLY, FLAT_PROFILE);
  const start = codeOrigin(FLAT_PROFILE, runtime.bytes.length);
  const image = buildImage(FLAT_PROFILE, {
    runtime: runtime.bytes,
    code: code(16),
    designatedStart: start,
  });

  it("loads at zero and begins with a jump to the designated start", () => {
    expect(image.loadAddress).toBe(0x0000);
    expect(image.entryAddress).toBe(0x0000);
    expect(image.bytes[0]).toBe(OP_JP);
    expect(image.bytes[1] | (image.bytes[2] << 8)).toBe(start);
  });

  it("leaves every processor vector outside the runtime", () => {
    expect(originClearsVectors(FLAT_PROFILE)).toBe(true);
    for (const vector of [0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38, 0x66]) {
      expect(image.bytes[vector]).toBe(0x00);
    }
  });

  it("places the runtime at the origin, byte for byte", () => {
    const at = FLAT_PROFILE.origin;
    expect(Array.from(image.bytes.slice(at, at + runtime.bytes.length))).toEqual(
      Array.from(runtime.bytes),
    );
  });

  it("runs: the entry jump reaches the code and halts there", () => {
    const machine = new BootstrapMachine({ program: imageOf(image.bytes, image.loadAddress) });
    const outcome = machine.runToHalt({ maxInstructions: 100 });
    expect(outcome.halted).toBe(true);
    // One past the HALT, which is the first byte of the stand-in code.
    expect(outcome.haltAddress).toBe(start);
  });
});

describe("an image on a profile whose host owns the vectors", () => {
  // A port host that does not own page zero. `TEC1_PROFILE` uses the vector
  // lowering, and the flat-port runtime refuses to build for it — finding 26 —
  // so vector ownership is exercised through a port profile until a vector
  // runtime source exists.
  const HOSTED_PORTS = { ...TEC1_PROFILE, name: "hosted-ports", services: "ports" } as const;
  const runtime = buildRuntimeImage(ASSEMBLY, HOSTED_PORTS);
  const start = codeOrigin(HOSTED_PORTS, runtime.bytes.length);
  const image = buildImage(HOSTED_PORTS, {
    runtime: runtime.bytes,
    code: code(16),
    designatedStart: start,
  });

  it("loads at the origin and emits no entry jump", () => {
    expect(image.loadAddress).toBe(0x2000);
    expect(image.entryAddress).toBe(start);
    expect(image.bytes[0]).not.toBe(OP_JP);
    // The image begins with the runtime, not with a jump.
    expect(image.bytes[0]).toBe(runtime.bytes[0]);
  });

  it("is shorter than the owned-vector image by the whole of page zero", () => {
    const owned = buildImage(FLAT_PROFILE, {
      runtime: buildRuntimeImage(ASSEMBLY, FLAT_PROFILE).bytes,
      code: code(16),
      designatedStart: codeOrigin(FLAT_PROFILE, runtime.bytes.length),
    });
    expect(owned.bytes.length - image.bytes.length).toBe(FLAT_PROFILE.origin);
  });
});

describe("the profile carries a service lowering", () => {
  it("names one for each profile", () => {
    // Review finding 24: the field was documented and absent.
    expect(FLAT_PROFILE.services).toBe("ports");
    expect(TEC1_PROFILE.services).toBe("vector");
  });

  it("has no vector implementation to exercise yet", () => {
    // Stated rather than skipped: runtime.asm's trap epilogues write to ports
    // directly, so the generated runtime is the flat-port runtime and a
    // vector host would need its own. See finding 26.
    const runtime = readFileSync(ASSEMBLY, "utf8");
    expect(runtime).toContain("OUT     (PORT_DIAGNOSTIC),A");
    expect(assembleSource(".org $0100\n" + runtime).bytes.length).toBeGreaterThan(0);
  });
});
