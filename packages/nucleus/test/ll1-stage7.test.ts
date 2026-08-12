import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeStage7Grammar,
  generateStage7ProofActions,
  generateStage7Tables,
  readStage7Grammar,
  stage7ActionLayout,
  validateStage7PhysicalHandlers,
} from "../grammar/generate-stage7.js";
import { runProofManifest } from "../src/proof.js";

const proof = (name: string): string =>
  path.resolve(import.meta.dirname, "..", "proofs", `${name}.json`);

describe("Stage 7 packed LL(1)", () => {
  it("keeps generated grammar artifacts reproducible and conflict-free", () => {
    const analysis = analyzeStage7Grammar();
    const grammar = readStage7Grammar();
    expect(analysis.conflicts).toEqual([]);
    expect(analysis.first["compilation-unit"]).toEqual([
      "TokenAssert",
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
    expect(grammar.productions).toHaveLength(77);
    expect(generateStage7Tables()).toContain(
      "HybridLL1ProductionCount  .equ 67",
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

  it("maps every logical action to one physical handler and parameter", () => {
    const grammar = readStage7Grammar();
    const logicalActions = [
      ...new Set(
        grammar.productions.flatMap(({ rhs }) =>
          rhs.filter(
            (symbol) => symbol.startsWith("a:") || symbol.startsWith("x:"),
          ),
        ),
      ),
    ];
    const layout = stage7ActionLayout();
    expect(layout.map(({ logical }) => logical)).toEqual(logicalActions);
    expect(new Set(layout.map(({ logical }) => logical)).size).toBe(
      logicalActions.length,
    );
    expect(layout.filter(({ parameter }) => parameter !== undefined)).toEqual([
      { logical: "a:EmitExit", handler: "EmitTransferAction", parameter: 45 },
      {
        logical: "a:EmitContinue",
        handler: "EmitTransferAction",
        parameter: 46,
      },
      { logical: "a:ForTo", handler: "SelectForBoundAction", parameter: 1 },
      {
        logical: "a:ForUntil",
        handler: "SelectForBoundAction",
        parameter: 0,
      },
      { logical: "a:TypeU8", handler: "SetScalarTypeAction", parameter: 1 },
      {
        logical: "a:TypeU16",
        handler: "SetScalarTypeAction",
        parameter: 2,
      },
      {
        logical: "a:TypeBoolean",
        handler: "SetScalarTypeAction",
        parameter: 3,
      },
    ]);
  });

  it("rejects invalid parameterised-action metadata", () => {
    const grammar = readStage7Grammar();
    expect(() =>
      stage7ActionLayout(grammar, [
        {
          handler: "MissingLogical",
          parameterStep: 1,
          members: [{ logical: "a:NotAnAction", parameter: 0 }],
        },
      ]),
    ).toThrow("unknown logical action a:NotAnAction");
    expect(() =>
      stage7ActionLayout(grammar, [
        {
          handler: "First",
          parameterStep: 1,
          members: [{ logical: "a:TypeU8", parameter: 1 }],
        },
        {
          handler: "Second",
          parameterStep: 1,
          members: [{ logical: "a:TypeU8", parameter: 2 }],
        },
      ]),
    ).toThrow("duplicate action-family member a:TypeU8");
    expect(() =>
      stage7ActionLayout(grammar, [
        {
          handler: "",
          parameterStep: 1,
          members: [{ logical: "a:TypeU8", parameter: 1 }],
        },
      ]),
    ).toThrow("missing physical action handler");
    expect(() =>
      stage7ActionLayout(grammar, [
        {
          handler: "OutOfRange",
          parameterStep: 1,
          members: [{ logical: "a:TypeU8", parameter: 256 }],
        },
      ]),
    ).toThrow("action parameter out of range for a:TypeU8");
    expect(() =>
      validateStage7PhysicalHandlers("", [
        {
          handler: "Absent",
          parameterStep: 1,
          members: [{ logical: "a:TypeU8", parameter: 1 }],
        },
      ]),
    ).toThrow("missing physical action handler HybridLL1Absent");

    const exitProduction = grammar.productions.findIndex(({ rhs }) =>
      rhs.includes("a:EmitExit"),
    );
    const productions = grammar.productions.map((production, index) =>
      index === exitProduction
        ? { ...production, rhs: [...production.rhs, "a:Inserted"] }
        : production,
    );
    expect(() => stage7ActionLayout({ ...grammar, productions })).toThrow(
      "noncontiguous action family EmitTransferAction",
    );
    const shiftedProductions = grammar.productions.map((production, index) =>
      index === 0
        ? { ...production, rhs: [...production.rhs, "a:Inserted"] }
        : production,
    );
    expect(() =>
      stage7ActionLayout({ ...grammar, productions: shiftedProductions }),
    ).toThrow("action ordinal offset mismatch for EmitTransferAction");
    expect(() =>
      stage7ActionLayout(grammar, [
        {
          handler: "BadParameters",
          parameterStep: 1,
          members: [
            { logical: "a:TypeU8", parameter: 1 },
            { logical: "a:TypeU16", parameter: 3 },
          ],
        },
      ]),
    ).toThrow("nonlinear action parameters for BadParameters");
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
      bytes: 65,
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
    expect(outcome.instructions).toBe(2_171_629);
    expect(outcome.cycles).toBe(20_114_942);
    expect(outcome.extents).toContainEqual({ name: "parser", bytes: 8_926 });
    expect(outcome.extents).toContainEqual({
      name: "ll1-engine",
      bytes: 230,
    });
    expect(outcome.extents).toContainEqual({
      name: "ll1-tables",
      bytes: 755,
    });
    expect(outcome.extents).toContainEqual({
      name: "ll1-actions",
      bytes: 2_605,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-core",
      bytes: 14_181,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-code",
      bytes: 13_788,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-immutable",
      bytes: 393,
    });
    expect(outcome.extents).toContainEqual({
      name: "compiler-workspace",
      bytes: 3_602,
    });
    expect(outcome.extents).toContainEqual({
      name: "z80-runtime",
      bytes: 596,
    });
    expect(
      (extents.get("parser") ?? -1) -
        (extents.get("ll1-engine") ?? -1) -
        (extents.get("ll1-tables") ?? -1) -
        (extents.get("ll1-actions") ?? -1),
    ).toBe(5_336);
  }, 30_000);

  it("executes every retained Stage 7 action family", async () => {
    const outcome = await runProofManifest(
      proof("stage7-ll1-parser-coverage-proof"),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
  }, 30_000);
});
