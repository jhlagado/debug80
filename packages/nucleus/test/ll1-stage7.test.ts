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
      bytes: 229,
    });
    expect(outcome.extents).toContainEqual({
      name: "ll1-workspace",
      bytes: 78,
    });
  });

  it("locks the committed recursive-descent Stage 7 baseline", async () => {
    const outcome = await runProofManifest(
      proof("aggregate-call-z80-slice-proof"),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.extents).toContainEqual({ name: "parser", bytes: 8_064 });
    expect(outcome.extents).toContainEqual({
      name: "compiler-core",
      bytes: 12_312,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-workspace",
      bytes: 1_198,
    });
  }, 30_000);

  it("runs the Stage 7 parser through the complete packed grammar", async () => {
    const outcome = await runProofManifest(
      proof("stage7-ll1-aggregate-call-z80-slice-proof"),
    );
    const extents = new Map(
      outcome.extents.map(({ name, bytes }) => [name, bytes]),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.extents).toContainEqual({ name: "parser", bytes: 7_755 });
    expect(outcome.extents).toContainEqual({
      name: "ll1-engine",
      bytes: 229,
    });
    expect(outcome.extents).toContainEqual({
      name: "ll1-tables",
      bytes: 654,
    });
    expect(outcome.extents).toContainEqual({
      name: "ll1-actions",
      bytes: 1_904,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-core",
      bytes: 12_003,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-code",
      bytes: 11_784,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-immutable",
      bytes: 219,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-workspace",
      bytes: 1_276,
    });
    expect(outcome.extents).toContainEqual({
      name: "z80-runtime",
      bytes: 419,
    });
    expect(
      (extents.get("parser") ?? -1) -
        (extents.get("ll1-engine") ?? -1) -
        (extents.get("ll1-tables") ?? -1) -
        (extents.get("ll1-actions") ?? -1),
    ).toBe(4_968);
  }, 30_000);

  it("differentially matches the recursive-descent Stage 7 oracle", async () => {
    const [oracle, candidate] = await Promise.all([
      runProofManifest(proof("aggregate-call-z80-slice-proof")),
      runProofManifest(proof("stage7-ll1-aggregate-call-z80-slice-proof")),
    ]);
    const region = (
      outcome: typeof oracle,
      from: string,
      to: string,
    ): number[] => {
      const start = outcome.symbols[from];
      const end = outcome.symbols[to];
      expect(start, `missing ${from}`).toBeTypeOf("number");
      expect(end, `missing ${to}`).toBeTypeOf("number");
      return Array.from(outcome.memory.slice(start, end));
    };
    for (const [from, to] of [
      ["SemanticBufferBase", "SemanticBufferLimit"],
      ["GeneratedBase", "GeneratedLimit"],
      ["StateBase", "StateEnd"],
      ["ProofExpectedSP", "ProofEnd"],
    ] as const) {
      expect(region(candidate, from, to)).toEqual(region(oracle, from, to));
    }
    const extent = (outcome: typeof oracle, name: string): number =>
      outcome.extents.find((entry) => entry.name === name)?.bytes ?? -1;
    expect(
      extent(candidate, "compiler-core") - extent(oracle, "compiler-core"),
    ).toBe(-309);
    expect(
      extent(candidate, "compiler-workspace") -
        extent(oracle, "compiler-workspace"),
    ).toBe(78);
  }, 30_000);

  it("matches every retained Stage 7 action family against recursive descent", async () => {
    const [oracle, candidate] = await Promise.all([
      runProofManifest(proof("stage7-rd-parser-coverage-proof")),
      runProofManifest(proof("stage7-ll1-parser-coverage-proof")),
    ]);
    const region = (
      outcome: typeof oracle,
      from: string,
      to: string,
    ): number[] => {
      const start = outcome.symbols[from];
      const end = outcome.symbols[to];
      expect(start, `missing ${from}`).toBeTypeOf("number");
      expect(end, `missing ${to}`).toBeTypeOf("number");
      return Array.from(outcome.memory.slice(start, end));
    };
    for (const [from, to] of [
      ["SemanticBufferBase", "SemanticBufferLimit"],
      ["GeneratedBase", "GeneratedLimit"],
      ["StateBase", "StateEnd"],
      ["ProofGeneratedSize", "ProofEnd"],
    ] as const) {
      expect(region(candidate, from, to)).toEqual(region(oracle, from, to));
    }
  }, 30_000);
});
