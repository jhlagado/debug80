import path from "node:path";

import { describe, expect, it } from "vitest";

import { ServiceError, Trap } from "../src/vm-definition.js";
import { validateImage } from "../src/vm-image.js";
import { BufferSystemServices, ReferenceVm } from "../src/vm-reference.js";
import { runProofManifest } from "../src/proof.js";

const proof = (name: string): string =>
  path.resolve(import.meta.dirname, "..", "proofs", `${name}.json`);

describe("manifest-driven AZM and Debug80 proofs", () => {
  it("locks the bounded vertical-slice memory map", async () => {
    const outcome = await runProofManifest(proof("memory-map-proof"));

    expect(outcome.instructions).toBe(4);
    expect(outcome.cycles).toBe(34);
    expect(outcome.extents).toEqual([{ name: "proof-code", bytes: 9 }]);
    expect(outcome.regions.map(({ name, bytes }) => ({ name, bytes }))).toEqual(
      [
        { name: "compiler-core", bytes: 16_384 },
        { name: "compiler-workspace", bytes: 4_096 },
        { name: "source", bytes: 2_048 },
        { name: "generated-output", bytes: 4_096 },
        { name: "target-runtime", bytes: 4_096 },
        { name: "execution-state", bytes: 4_096 },
        { name: "service-state", bytes: 2_048 },
        { name: "proof-state", bytes: 2_048 },
        { name: "unassigned", bytes: 22_528 },
        { name: "machine-stack", bytes: 3_840 },
        { name: "high-reserved", bytes: 256 },
      ],
    );
    expect(
      outcome.regions.reduce((total, region) => total + region.bytes, 0),
    ).toBe(65_536);
  });

  it("compiles the fixed source and rejects a malformed source by position", async () => {
    const outcome = await runProofManifest(proof("compiler-slice-proof"));

    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(outcome.instructions).toBe(9_063);
    expect(outcome.cycles).toBe(86_838);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 947 },
      { name: "compiler-immutable", bytes: 36 },
      { name: "compiler-core", bytes: 983 },
      { name: "compiler-workspace", bytes: 55 },
      { name: "proof-code-and-data", bytes: 191 },
    ]);
    expect(outcome.extents[0]?.bytes).toBeLessThan(
      outcome.extents[2]?.bytes ?? 0,
    );
    expect(outcome.extents[2]?.bytes).toBeLessThanOrEqual(16_384);
  });

  it("emits, validates, and executes the same NVM image on Z80 and the host oracle", async () => {
    const outcome = await runProofManifest(proof("nvm-slice-proof"));
    const imageBase = outcome.symbols.GeneratedBase ?? -1;
    const imageSize = outcome.symbols.NvmImageSize ?? -1;
    const image = outcome.memory.slice(imageBase, imageBase + imageSize);
    const validated = validateImage(image);

    expect(outcome.instructions).toBe(6_472);
    expect(outcome.cycles).toBe(62_038);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 947 },
      { name: "nvm-output-sink", bytes: 65 },
      { name: "compiler-code", bytes: 1_012 },
      { name: "compiler-immutable", bytes: 94 },
      { name: "compiler-core", bytes: 1_106 },
      { name: "compiler-workspace", bytes: 55 },
      { name: "generated-nvm", bytes: 58 },
      { name: "nvm-runtime-code", bytes: 487 },
      { name: "nvm-runtime-immutable", bytes: 57 },
      { name: "nvm-runtime", bytes: 544 },
      { name: "nvm-state", bytes: 22 },
      { name: "service-state", bytes: 3 },
      { name: "proof-code-and-data", bytes: 278 },
    ]);
    expect(validated.code).toEqual(
      Uint8Array.of(
        0x01,
        0x41,
        0x00,
        0x04,
        0x00,
        0x00,
        0x51,
        0x01,
        0x0b,
        0x0c,
        0x00,
        0x52,
        0x06,
        0x00,
        0x54,
        0x00,
      ),
    );

    const services = new BufferSystemServices();
    expect(new ReferenceVm(validated, { services }).run().kind).toBe("success");
    expect(services.standardOutput).toEqual([0x41]);

    const failed = new ReferenceVm(validated, {
      services: {
        invoke: () => ({
          ok: false as const,
          code: ServiceError.outputFailure,
        }),
      },
    }).run();
    expect(failed.kind).toBe("trap");
    if (failed.kind === "trap") {
      expect(failed.record).toEqual({
        trap: Trap.unhandledError,
        routine: 0,
        offset: 14,
        errorCode: ServiceError.outputFailure,
      });
    }
  });
});
