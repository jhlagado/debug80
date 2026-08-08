import path from "node:path";

import { describe, expect, it } from "vitest";

import { runProofManifest } from "../src/proof.js";
import { ServiceError, Trap } from "../src/runtime-contract.js";

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
    const outcome = await runProofManifest(proof("native-slice-proof"));
    const generatedBase = outcome.symbols.GeneratedBase ?? -1;
    const generatedSize = outcome.symbols.NativeProgramSize ?? -1;
    const generated = outcome.memory.slice(
      generatedBase,
      generatedBase + generatedSize,
    );

    expect(outcome.instructions).toBe(4_631);
    expect(outcome.cycles).toBe(48_332);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 940 },
      { name: "native-output-sink", bytes: 25 },
      { name: "compiler-code", bytes: 965 },
      { name: "compiler-immutable", bytes: 73 },
      { name: "compiler-core", bytes: 1_038 },
      { name: "compiler-workspace", bytes: 55 },
      { name: "generated-native", bytes: 37 },
      { name: "native-runtime", bytes: 51 },
      { name: "native-state", bytes: 6 },
      { name: "service-state", bytes: 3 },
      { name: "proof-code-and-data", bytes: 207 },
    ]);
    expect(Array.from(generated.slice(0, 3))).toEqual([0x3e, 0x41, 0xcd]);
    expect(generated[3] | ((generated[4] ?? 0) << 8)).toBe(
      outcome.symbols.NativeWriteOutputByte,
    );
    expect(Array.from(generated.slice(5, 8))).toEqual([0x38, 0x06, 0x3e]);
    expect(outcome.memory[outcome.symbols.ProofSuccessOutput ?? -1]).toBe(0x41);
    expect(outcome.memory[outcome.symbols.NativeTrapNumber ?? -1]).toBe(
      Trap.unhandledError,
    );
    expect(outcome.memory[outcome.symbols.NativeTrapError ?? -1]).toBe(
      ServiceError.outputFailure,
    );
  });

  it("checks the scalar-local and counted-loop source slice", async () => {
    const outcome = await runProofManifest(proof("loop-compiler-slice-proof"));

    expect(outcome.instructions).toBe(41_233);
    expect(outcome.cycles).toBe(410_641);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 2_369 },
      { name: "compiler-immutable", bytes: 131 },
      { name: "compiler-core", bytes: 2_500 },
      { name: "compiler-workspace", bytes: 103 },
      { name: "proof-code-and-data", bytes: 241 },
    ]);
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(outcome.memory[outcome.symbols.DiagnosticCode ?? -1]).toBe(
      outcome.symbols.DiagnosticExpectedEnd,
    );
  }, 20_000);

  it("executes the counted loop as direct Z80", async () => {
    const outcome = await runProofManifest(proof("loop-native-slice-proof"));
    const generatedBase = outcome.symbols.GeneratedBase ?? -1;
    const generatedSize = outcome.symbols.NativeProgramSize ?? -1;
    const generated = outcome.memory.slice(
      generatedBase,
      generatedBase + generatedSize,
    );

    expect(outcome.instructions).toBe(37_216);
    expect(outcome.cycles).toBe(368_897);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 2_369 },
      { name: "native-output-sink", bytes: 1_383 },
      { name: "compiler-code", bytes: 3_752 },
      { name: "compiler-immutable", bytes: 131 },
      { name: "compiler-core", bytes: 3_883 },
      { name: "compiler-workspace", bytes: 103 },
      { name: "generated-native", bytes: 54 },
      { name: "native-runtime", bytes: 204 },
      { name: "native-state", bytes: 17 },
      { name: "service-state", bytes: 14 },
      { name: "proof-code-and-data", bytes: 298 },
    ]);
    expect(Array.from(generated.slice(0, 7))).toEqual([
      0x16, 0x00, 0x16, 0x00, 0x7a, 0xfe, 0x03,
    ]);
  }, 20_000);

  it("executes checked initialized-array selection as direct Z80", async () => {
    const outcome = await runProofManifest(proof("array-native-slice-proof"));

    expect(outcome.instructions).toBe(52_382);
    expect(outcome.cycles).toBe(513_681);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 2_369 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 495 },
      { name: "semantic-sink", bytes: 58 },
      { name: "parser", bytes: 1_596 },
      { name: "native-output-sink", bytes: 1_383 },
      { name: "compiler-code", bytes: 3_752 },
      { name: "compiler-immutable", bytes: 131 },
      { name: "compiler-core", bytes: 3_883 },
      { name: "compiler-workspace", bytes: 103 },
      { name: "generated-native", bytes: 74 },
      { name: "native-runtime", bytes: 204 },
      { name: "native-state", bytes: 17 },
      { name: "service-state", bytes: 14 },
      { name: "proof-code-and-data", bytes: 643 },
    ]);

    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
  }, 20_000);

  it("executes a forward-declared recursive scalar value call", async () => {
    const outcome = await runProofManifest(proof("call-native-slice-proof"));

    expect(outcome.instructions).toBe(64_122);
    expect(outcome.cycles).toBe(628_787);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 2_369 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 495 },
      { name: "semantic-sink", bytes: 58 },
      { name: "parser", bytes: 1_596 },
      { name: "call-parser-path", bytes: 338 },
      { name: "native-output-sink", bytes: 1_383 },
      { name: "native-call-backend", bytes: 332 },
      { name: "compiler-code", bytes: 3_752 },
      { name: "compiler-immutable", bytes: 131 },
      { name: "compiler-core", bytes: 3_883 },
      { name: "compiler-workspace", bytes: 103 },
      { name: "generated-native", bytes: 99 },
      { name: "native-runtime", bytes: 204 },
      { name: "native-state", bytes: 17 },
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
    ).toBe(outcome.symbols.NativeCallCapacityOffset);
    expect(
      (outcome.symbols.CallProofOutputCall ?? -1) -
        (outcome.symbols.CallProofSource ?? -1),
    ).toBe(outcome.symbols.NativeCallFailureOffset);
    expect(
      new Set(
        [
          "NativeCallLiteral",
          "NativeCallWriteLocal",
          "NativeCallBeginForward",
          "NativeCallIfParameterZero",
          "NativeCallReturnParameter",
          "NativeCallEndIf",
          "NativeCallReturnSelfMinus",
          "NativeCallEndRoutine",
        ].map((name) => outcome.symbols[name] ?? -1),
      ).size,
    ).toBe(8);
  }, 20_000);

  it("executes general scalar symbols and precedence as direct Z80", async () => {
    const outcome = await runProofManifest(
      proof("expression-native-slice-proof"),
    );
    const generatedSizeAddress = outcome.symbols.GeneratedSize ?? -1;
    const generatedSize =
      (outcome.memory[generatedSizeAddress] ?? 0) |
      ((outcome.memory[generatedSizeAddress + 1] ?? 0) << 8);

    expect(outcome.instructions).toBe(80_310);
    expect(outcome.cycles).toBe(796_538);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 2_369 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 495 },
      { name: "semantic-sink", bytes: 58 },
      { name: "symbol-table", bytes: 121 },
      { name: "parser", bytes: 1_596 },
      { name: "native-output-sink", bytes: 1_383 },
      { name: "native-expression-backend", bytes: 362 },
      { name: "compiler-code", bytes: 3_752 },
      { name: "compiler-immutable", bytes: 131 },
      { name: "compiler-core", bytes: 3_883 },
      { name: "compiler-workspace", bytes: 103 },
      { name: "generated-native", bytes: 101 },
      { name: "native-runtime", bytes: 204 },
      { name: "native-state", bytes: 17 },
      { name: "service-state", bytes: 14 },
      { name: "proof-code-and-data", bytes: 471 },
    ]);
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(generatedSize).toBeGreaterThan(0);
    expect(outcome.memory[(outcome.symbols.GeneratedBase ?? -1) + 3]).toBe(0);
  }, 20_000);

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
