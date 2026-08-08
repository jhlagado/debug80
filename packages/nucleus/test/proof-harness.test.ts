import path from "node:path";

import { describe, expect, it } from "vitest";

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
});
