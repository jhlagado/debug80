import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeFullHybridGrammar,
  generateFullHybridActionStubs,
  generateFullHybridTables,
} from "../experiments/ll1-stage7/generate-full-hybrid.js";
import { runProofManifest } from "../src/proof.js";

const proof = (name: string): string =>
  path.resolve(import.meta.dirname, "..", "proofs", `${name}.json`);

describe("Stage 7 hybrid LL(1)", () => {
  it("keeps generated grammar artifacts reproducible and conflict-free", () => {
    const analysis = analyzeFullHybridGrammar();
    expect(analysis.conflicts).toEqual([]);
    expect(analysis.first["compilation-unit"]).toEqual([
      "TokenConst",
      "TokenEof",
      "TokenRecord",
      "TokenSub",
      "TokenVar",
    ]);
    expect(generateFullHybridTables()).toBe(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          "..",
          "experiments",
          "ll1-stage7",
          "full-hybrid-tables.asmi",
        ),
        "utf8",
      ),
    );
    expect(generateFullHybridActionStubs()).toBe(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          "..",
          "experiments",
          "ll1-stage7",
          "full-hybrid-action-stubs.asmi",
        ),
        "utf8",
      ),
    );
  });

  it("executes the packed engine at its exact stack boundary", async () => {
    const outcome = await runProofManifest(proof("stage7-ll1-engine-proof"));
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.extents).toContainEqual({
      name: "full-hybrid-engine",
      bytes: 226,
    });
    expect(outcome.extents).toContainEqual({
      name: "full-hybrid-workspace",
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

  it("runs the Stage 7 candidate through the complete packed grammar", async () => {
    const outcome = await runProofManifest(
      proof("stage7-ll1-aggregate-call-z80-slice-proof"),
    );
    const extents = new Map(
      outcome.extents.map(({ name, bytes }) => [name, bytes]),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.extents).toContainEqual({ name: "parser", bytes: 7_853 });
    expect(outcome.extents).toContainEqual({
      name: "full-hybrid-engine",
      bytes: 226,
    });
    expect(outcome.extents).toContainEqual({
      name: "full-hybrid-tables",
      bytes: 654,
    });
    expect(outcome.extents).toContainEqual({
      name: "full-hybrid-actions",
      bytes: 2_005,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-core",
      bytes: 12_101,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-code",
      bytes: 11_882,
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
        (extents.get("full-hybrid-engine") ?? -1) -
        (extents.get("full-hybrid-tables") ?? -1) -
        (extents.get("full-hybrid-actions") ?? -1),
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
    expect(extent(candidate, "compiler-core") - extent(oracle, "compiler-core")).toBe(-211);
    expect(extent(candidate, "compiler-workspace") - extent(oracle, "compiler-workspace")).toBe(78);
  }, 30_000);
});
