import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeStage7Grammar,
  generateStage7ProofActions,
  generateStage7Tables,
} from "../grammar/generate-stage7.js";
import { runProofManifest } from "../src/proof.js";

const proof = (name: string): string =>
  path.resolve(import.meta.dirname, "..", "proofs", `${name}.json`);

describe("Stage 7 packed LL(1)", () => {
  it("keeps generated grammar artifacts reproducible and conflict-free", () => {
    const analysis = analyzeStage7Grammar();
    expect(analysis.conflicts).toEqual([]);
    expect(analysis.first["compilation-unit"]).toEqual([
      "TokenConst",
      "TokenEof",
      "TokenForward",
      "TokenRecord",
      "TokenSub",
      "TokenVar",
    ]);
    expect(generateStage7Tables()).toBe(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          "..",
          "grammar",
          "stage7-tables.asmi",
        ),
        "utf8",
      ),
    );
    expect(generateStage7ProofActions()).toBe(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          "..",
          "grammar",
          "stage7-proof-actions.asmi",
        ),
        "utf8",
      ),
    );
  });

  it("executes the packed engine at its exact stack boundary", async () => {
    const outcome = await runProofManifest(proof("stage7-ll1-engine-proof"));
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.extents).toContainEqual({
      name: "ll1-engine",
      bytes: 230,
    });
    expect(outcome.extents).toContainEqual({
      name: "ll1-workspace",
      bytes: 78,
    });
  });

  it("runs the Stage 7 parser through the complete packed grammar", async () => {
    const outcome = await runProofManifest(
      proof("stage7-ll1-aggregate-call-z80-slice-proof"),
    );
    const extents = new Map(
      outcome.extents.map(({ name, bytes }) => [name, bytes]),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.instructions).toBe(919_482);
    expect(outcome.cycles).toBe(8_477_938);
    expect(outcome.extents).toContainEqual({ name: "parser", bytes: 8_972 });
    expect(outcome.extents).toContainEqual({
      name: "ll1-engine",
      bytes: 230,
    });
    expect(outcome.extents).toContainEqual({
      name: "ll1-tables",
      bytes: 744,
    });
    expect(outcome.extents).toContainEqual({
      name: "ll1-actions",
      bytes: 2_677,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-core",
      bytes: 13_807,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-code",
      bytes: 13_439,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-immutable",
      bytes: 368,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-workspace",
      bytes: 1_398,
    });
    expect(outcome.extents).toContainEqual({
      name: "z80-runtime",
      bytes: 561,
    });
    expect(
      (extents.get("parser") ?? -1) -
        (extents.get("ll1-engine") ?? -1) -
        (extents.get("ll1-tables") ?? -1) -
        (extents.get("ll1-actions") ?? -1),
    ).toBe(5_321);
  }, 30_000);

  it("executes every retained Stage 7 action family", async () => {
    const outcome = await runProofManifest(
      proof("stage7-ll1-parser-coverage-proof"),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
  }, 30_000);
});
