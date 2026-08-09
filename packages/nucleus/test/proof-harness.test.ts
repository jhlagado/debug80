import path from "node:path";

import { describe, expect, it } from "vitest";

import { runProofManifest } from "../src/proof.js";
import { ServiceError, Trap } from "../src/runtime-contract.js";

const proof = (name: string): string =>
  path.resolve(import.meta.dirname, "..", "proofs", `${name}.json`);

describe("manifest-driven AZM and Debug80 proofs", () => {
  it("executes aggregate aliases and exact-type copying as direct Z80", async () => {
    const outcome = await runProofManifest(
      proof("aggregate-call-z80-slice-proof"),
    );

    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(outcome.instructions).toBe(650_903);
    expect(outcome.cycles).toBe(6_185_165);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 9_084 },
      { name: "parser", bytes: 8_064 },
      { name: "typed-aggregate-z80-sink", bytes: 2_673 },
      { name: "compiler-code", bytes: 12_093 },
      { name: "compiler-immutable", bytes: 219 },
      { name: "compiler-core", bytes: 12_312 },
      { name: "compiler-workspace", bytes: 1_198 },
      { name: "static-image", bytes: 255 },
      { name: "z80-runtime", bytes: 419 },
      { name: "proof-code-and-data", bytes: 1_666 },
    ]);
    expect(outcome.extents[5]?.bytes).toBeLessThanOrEqual(16_384);
  }, 20_000);

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
    expect(outcome.instructions).toBe(8_589);
    expect(outcome.cycles).toBe(88_456);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 940 },
      { name: "compiler-immutable", bytes: 36 },
      { name: "compiler-core", bytes: 976 },
      { name: "compiler-workspace", bytes: 55 },
      { name: "proof-code-and-data", bytes: 191 },
    ]);
    expect(outcome.extents[0]?.bytes).toBeLessThan(
      outcome.extents[2]?.bytes ?? 0,
    );
    expect(outcome.extents[2]?.bytes).toBeLessThanOrEqual(16_384);
  });

  it("executes the same checked operations as a direct-Z80 program", async () => {
    const outcome = await runProofManifest(proof("z80-slice-proof"));
    const generatedBase = outcome.symbols.GeneratedBase ?? -1;
    const generatedSize = outcome.symbols.ProgramSize ?? -1;
    const generated = outcome.memory.slice(
      generatedBase,
      generatedBase + generatedSize,
    );

    expect(outcome.instructions).toBe(4_631);
    expect(outcome.cycles).toBe(48_332);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 940 },
      { name: "z80-output-sink", bytes: 25 },
      { name: "compiler-code", bytes: 965 },
      { name: "compiler-immutable", bytes: 73 },
      { name: "compiler-core", bytes: 1_038 },
      { name: "compiler-workspace", bytes: 55 },
      { name: "generated-z80", bytes: 37 },
      { name: "z80-runtime", bytes: 51 },
      { name: "z80-state", bytes: 6 },
      { name: "service-state", bytes: 3 },
      { name: "proof-code-and-data", bytes: 207 },
    ]);
    expect(Array.from(generated.slice(0, 3))).toEqual([0x3e, 0x41, 0xcd]);
    expect(generated[3] | ((generated[4] ?? 0) << 8)).toBe(
      outcome.symbols.WriteOutputByte,
    );
    expect(Array.from(generated.slice(5, 8))).toEqual([0x38, 0x06, 0x3e]);
    expect(outcome.memory[outcome.symbols.ProofSuccessOutput ?? -1]).toBe(0x41);
    expect(outcome.memory[outcome.symbols.TrapNumber ?? -1]).toBe(
      Trap.unhandledError,
    );
    expect(outcome.memory[outcome.symbols.TrapError ?? -1]).toBe(
      ServiceError.outputFailure,
    );
  });

  it("checks the scalar-local and counted-loop source slice", async () => {
    const outcome = await runProofManifest(proof("loop-compiler-slice-proof"));

    expect(outcome.instructions).toBe(47_755);
    expect(outcome.cycles).toBe(466_699);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 8_349 },
      { name: "compiler-immutable", bytes: 240 },
      { name: "compiler-core", bytes: 8_589 },
      { name: "compiler-workspace", bytes: 1_085 },
      { name: "proof-code-and-data", bytes: 241 },
    ]);
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(outcome.memory[outcome.symbols.DiagnosticCode ?? -1]).toBe(
      outcome.symbols.DiagnosticExpectedEnd,
    );
  }, 20_000);

  it("executes the counted loop as direct Z80", async () => {
    const outcome = await runProofManifest(proof("loop-z80-slice-proof"));
    const generatedBase = outcome.symbols.GeneratedBase ?? -1;
    const generatedSize = outcome.symbols.ProgramSize ?? -1;
    const generated = outcome.memory.slice(
      generatedBase,
      generatedBase + generatedSize,
    );

    expect(outcome.instructions).toBe(42_463);
    expect(outcome.cycles).toBe(416_323);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_349 },
      { name: "z80-output-sink", bytes: 1_457 },
      { name: "compiler-code", bytes: 9_806 },
      { name: "compiler-immutable", bytes: 240 },
      { name: "compiler-core", bytes: 10_046 },
      { name: "compiler-workspace", bytes: 1_085 },
      { name: "generated-z80", bytes: 54 },
      { name: "z80-runtime", bytes: 358 },
      { name: "z80-state", bytes: 21 },
      { name: "service-state", bytes: 14 },
      { name: "proof-code-and-data", bytes: 298 },
    ]);
    expect(Array.from(generated.slice(0, 7))).toEqual([
      0x16, 0x00, 0x16, 0x00, 0x7a, 0xfe, 0x03,
    ]);
  }, 20_000);

  it("executes checked initialized-array selection as direct Z80", async () => {
    const outcome = await runProofManifest(proof("array-z80-slice-proof"));

    expect(outcome.instructions).toBe(60_494);
    expect(outcome.cycles).toBe(590_152);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_349 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 734 },
      { name: "semantic-sink", bytes: 58 },
      { name: "parser", bytes: 7_326 },
      { name: "z80-output-sink", bytes: 1_457 },
      { name: "compiler-code", bytes: 9_806 },
      { name: "compiler-immutable", bytes: 240 },
      { name: "compiler-core", bytes: 10_046 },
      { name: "compiler-workspace", bytes: 1_085 },
      { name: "generated-z80", bytes: 74 },
      { name: "z80-runtime", bytes: 358 },
      { name: "z80-state", bytes: 21 },
      { name: "service-state", bytes: 14 },
      { name: "proof-code-and-data", bytes: 661 },
    ]);

    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
  }, 20_000);

  it("executes a forward-declared recursive scalar value call", async () => {
    const outcome = await runProofManifest(proof("call-z80-slice-proof"));

    expect(outcome.instructions).toBe(74_425);
    expect(outcome.cycles).toBe(717_580);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_349 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 734 },
      { name: "semantic-sink", bytes: 58 },
      { name: "parser", bytes: 7_326 },
      { name: "call-parser-path", bytes: 338 },
      { name: "z80-output-sink", bytes: 1_457 },
      { name: "z80-call-backend", bytes: 332 },
      { name: "compiler-code", bytes: 9_806 },
      { name: "compiler-immutable", bytes: 240 },
      { name: "compiler-core", bytes: 10_046 },
      { name: "compiler-workspace", bytes: 1_085 },
      { name: "generated-z80", bytes: 99 },
      { name: "z80-runtime", bytes: 358 },
      { name: "z80-state", bytes: 21 },
      { name: "service-state", bytes: 14 },
      { name: "proof-code-and-data", bytes: 414 },
    ]);
    const generatedSizeAddress = outcome.symbols.GeneratedSize ?? -1;
    expect(
      (outcome.memory[generatedSizeAddress] ?? 0) |
        ((outcome.memory[generatedSizeAddress + 1] ?? 0) << 8),
    ).toBe(99);
    const semanticBase = outcome.symbols.SemanticBufferBase ?? -1;
    expect(
      Array.from(outcome.memory.slice(semanticBase, semanticBase + 16)),
    ).toEqual([9, 12, 1, 3, 13, 19, 14, 1, 15, 0, 16, 17, 18, 1, 1, 19]);
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    const emitUpdateExitFixup = outcome.symbols.EmitUpdateExitFixup ?? -1;
    const tokenStartOffset = outcome.symbols.TokenStartOffset ?? -1;
    const tokenStartEnd = (outcome.symbols.TokenStartColumn ?? -1) + 2;
    expect(
      emitUpdateExitFixup + 2 <= tokenStartOffset ||
        emitUpdateExitFixup >= tokenStartEnd,
    ).toBe(true);
    expect(
      (outcome.symbols.CallProofRecursiveCall ?? -1) -
        (outcome.symbols.CallProofSource ?? -1),
    ).toBe(outcome.symbols.CallCapacityOffset);
    expect(
      (outcome.symbols.CallProofOutputCall ?? -1) -
        (outcome.symbols.CallProofSource ?? -1),
    ).toBe(outcome.symbols.CallFailureOffset);
    expect(
      new Set(
        [
          "CallLiteral",
          "CallWriteLocal",
          "CallBeginForward",
          "CallIfParameterZero",
          "CallReturnParameter",
          "CallEndIf",
          "CallReturnSelfMinus",
          "CallEndRoutine",
        ].map((name) => outcome.symbols[name] ?? -1),
      ).size,
    ).toBe(8);
  }, 20_000);

  it("executes general scalar symbols and precedence as direct Z80", async () => {
    const outcome = await runProofManifest(
      proof("expression-z80-slice-proof"),
    );
    const generatedSizeAddress = outcome.symbols.GeneratedSize ?? -1;
    const generatedSize =
      (outcome.memory[generatedSizeAddress] ?? 0) |
      ((outcome.memory[generatedSizeAddress + 1] ?? 0) << 8);

    expect(outcome.instructions).toBe(101_320);
    expect(outcome.cycles).toBe(996_838);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_349 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 734 },
      { name: "semantic-sink", bytes: 58 },
      { name: "symbol-table", bytes: 132 },
      { name: "parser", bytes: 7_326 },
      { name: "z80-output-sink", bytes: 3_434 },
      { name: "z80-expression-backend", bytes: 356 },
      { name: "compiler-code", bytes: 11_783 },
      { name: "compiler-immutable", bytes: 240 },
      { name: "compiler-core", bytes: 12_023 },
      { name: "compiler-workspace", bytes: 1_085 },
      { name: "generated-z80", bytes: 116 },
      { name: "z80-runtime", bytes: 358 },
      { name: "z80-state", bytes: 21 },
      { name: "service-state", bytes: 14 },
      { name: "proof-code-and-data", bytes: 496 },
    ]);
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(generatedSize).toBeGreaterThan(0);
    expect(outcome.memory[(outcome.symbols.GeneratedBase ?? -1) + 3]).toBe(0);
  }, 20_000);

  it("executes typed scalar expressions and traps atomically as direct Z80", async () => {
    const outcome = await runProofManifest(
      proof("typed-expression-z80-slice-proof"),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    const sizeAddress = outcome.symbols.TypedGeneratedSize ?? -1;
    const generatedSize =
      (outcome.memory[sizeAddress] ?? 0) |
      ((outcome.memory[sizeAddress + 1] ?? 0) << 8);
    expect(outcome.instructions).toBe(995_529);
    expect(outcome.cycles).toBe(9_257_110);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_349 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 734 },
      { name: "semantic-sink", bytes: 58 },
      { name: "symbol-table", bytes: 132 },
      { name: "parser", bytes: 7_326 },
      { name: "typed-z80-sink", bytes: 1_977 },
      { name: "compiler-code", bytes: 10_662 },
      { name: "compiler-immutable", bytes: 240 },
      { name: "compiler-core", bytes: 10_902 },
      { name: "compiler-workspace", bytes: 1_085 },
      { name: "generated-z80-bound", bytes: 857 },
      { name: "z80-runtime", bytes: 358 },
      { name: "proof-code-and-data", bytes: 1_336 },
    ]);
    expect(generatedSize).toBe(857);
  }, 30_000);

  it("executes typed structured control as direct Z80", async () => {
    const outcome = await runProofManifest(
      proof("structured-control-z80-slice-proof"),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    const structuredSizeAddress = outcome.symbols.StructuredGeneratedSize ?? -1;
    const structuredSize =
      (outcome.memory[structuredSizeAddress] ?? 0) |
      ((outcome.memory[structuredSizeAddress + 1] ?? 0) << 8);
    expect(structuredSize).toBe(715);
    expect(outcome.memory[outcome.symbols.AcceptedObservedOutput ?? -1]).toBe(
      9,
    );
    expect(outcome.memory[outcome.symbols.AcceptedObservedStore ?? -1]).toBe(9);
    expect(outcome.memory[outcome.symbols.AcceptedObservedCounter ?? -1]).toBe(
      3,
    );
    const descending = outcome.symbols.AcceptedObservedDescending ?? -1;
    expect(
      (outcome.memory[descending] ?? 0) |
        ((outcome.memory[descending + 1] ?? 0) << 8),
    ).toBe(0);
    expect(outcome.memory[outcome.symbols.RangeObservedEffect ?? -1]).toBe(1);
    expect(outcome.memory[outcome.symbols.RangeObservedAtomic ?? -1]).toBe(250);
    const readWord = (name: string): number => {
      const address = outcome.symbols[name] ?? -1;
      return (
        (outcome.memory[address] ?? 0) |
        ((outcome.memory[address + 1] ?? 0) << 8)
      );
    };
    expect(outcome.memory[outcome.symbols.ActiveObservedDiagnostic ?? -1]).toBe(
      36,
    );
    expect(readWord("ActiveObservedOffset")).toBe(
      (outcome.symbols.StructuredActiveCounterName ?? 0) -
        (outcome.symbols.StructuredActiveCounterSource ?? 0),
    );
    expect(outcome.memory[outcome.symbols.ExitObservedDiagnostic ?? -1]).toBe(
      72,
    );
    expect(readWord("ExitObservedOffset")).toBe(
      (outcome.symbols.StructuredExitOutsidePoint ?? 0) -
        (outcome.symbols.StructuredExitOutsideSource ?? 0),
    );
    expect(outcome.memory[outcome.symbols.StepObservedDiagnostic ?? -1]).toBe(
      74,
    );
    expect(readWord("StepObservedOffset")).toBe(
      (outcome.symbols.StructuredZeroStepPoint ?? 0) -
        (outcome.symbols.StructuredZeroStepSource ?? 0),
    );
    expect(
      outcome.extents.find(({ name }) => name === "compiler-core")?.bytes,
    ).toBeLessThanOrEqual(16_384);
    expect(outcome.instructions).toBe(301_119);
    expect(outcome.cycles).toBe(2_942_456);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_349 },
      { name: "parser", bytes: 7_326 },
      { name: "structured-z80-sink", bytes: 1_977 },
      { name: "compiler-code", bytes: 10_662 },
      { name: "compiler-immutable", bytes: 240 },
      { name: "compiler-core", bytes: 10_902 },
      { name: "compiler-workspace", bytes: 1_085 },
      { name: "generated-z80-bound", bytes: 715 },
      { name: "z80-runtime", bytes: 358 },
      { name: "proof-code-and-data", bytes: 905 },
    ]);
  }, 30_000);

  it("emits packed aggregate layouts and publishes one atomic static image", async () => {
    const outcome = await runProofManifest(
      proof("aggregate-z80-slice-proof"),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(outcome.instructions).toBe(338_210);
    expect(outcome.cycles).toBe(3_195_934);
    expect(
      outcome.extents.find(({ name }) => name === "compiler-core")?.bytes,
    ).toBeLessThanOrEqual(16_384);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 7_024 },
      { name: "parser", bytes: 6_004 },
      { name: "typed-z80-sink", bytes: 2_018 },
      { name: "compiler-code", bytes: 9_378 },
      { name: "compiler-immutable", bytes: 211 },
      { name: "compiler-core", bytes: 9_589 },
      { name: "compiler-workspace", bytes: 1_085 },
      { name: "static-image", bytes: 255 },
      { name: "z80-runtime", bytes: 358 },
      { name: "proof-code-and-data", bytes: 1_075 },
    ]);
  }, 30_000);

  it("measures dense semantic dispatch against a comparison chain", async () => {
    const outcome = await runProofManifest(proof("dispatcher-measurement"));
    const direct = await runProofManifest(
      proof("dispatcher-offset-direct-measurement"),
    );
    const trampoline = await runProofManifest(
      proof("dispatcher-offset-trampoline-measurement"),
    );
    expect(outcome.extents.slice(0, 2)).toEqual([
      { name: "table-dispatch-selection", bytes: 37 },
      { name: "comparison-chain-selection", bytes: 42 },
    ]);
    expect(direct.extents).toEqual([
      { name: "page-offset-direct-selection", bytes: 23 },
    ]);
    expect(trampoline.extents).toEqual([
      { name: "page-offset-trampoline-selection", bytes: 47 },
    ]);
  }, 20_000);
});
