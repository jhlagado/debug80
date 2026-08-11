import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runProofManifest } from "../src/proof.js";
import { ServiceError, Trap } from "../src/runtime-contract.js";
import { buildSourceParts } from "../src/source-manifest.js";

const proof = (name: string): string =>
  path.resolve(import.meta.dirname, "..", "proofs", `${name}.json`);

const wordAt = (memory: Uint8Array, address: number): number =>
  (memory[address] ?? 0) | ((memory[address + 1] ?? 0) << 8);

describe("manifest-driven AZM and Debug80 proofs", () => {
  it("compiles and executes the Chapter 21 corpus as direct Z80", async () => {
    const outcome = await runProofManifest(
      proof("stage9-conformance-z80-slice-proof"),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(
      outcome.extents.find(({ name }) => name === "compiler-core")?.bytes,
    ).toBeLessThanOrEqual(16_384);
    expect(outcome.instructions).toBe(1_515_279);
    expect(outcome.cycles).toBe(14_266_289);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 14_311 },
      { name: "compiler-immutable", bytes: 390 },
      { name: "compiler-core", bytes: 14_701 },
      { name: "compiler-workspace", bytes: 3_623 },
      { name: "generated-z80-bound", bytes: 4_096 },
      { name: "z80-runtime", bytes: 655 },
      { name: "corpus-source-and-descriptors", bytes: 7_056 },
      { name: "proof-code-and-data", bytes: 1_883 },
    ]);

    const symbol = (name: string): number => {
      const address = outcome.symbols[name];
      expect(address, `${name} must be retained`).toBeDefined();
      return address ?? -1;
    };
    expect(wordAt(outcome.memory, symbol("ProofMaxGenerated"))).toBe(1_040);
    const source = (start: string, end: string): string =>
      new TextDecoder().decode(
        outcome.memory.slice(symbol(start), symbol(end)),
      );
    const specification = readFileSync(
      path.resolve(import.meta.dirname, "..", "docs", "specification.md"),
      "utf8",
    );
    const chapter21 = specification.slice(specification.indexOf("## 21."));
    const specificationPrograms = Array.from(
      chapter21.matchAll(/```nucleus\n([\s\S]*?)```/g),
      (match) => match[1] ?? "",
    );
    const proofPrograms = [
      source("Chapter21_1Part1", "Chapter21_1Part1End") +
        source("Chapter21_1Part2", "Chapter21_1Part2End"),
      ...[
        "Chapter21_2",
        "Chapter21_3",
        "Chapter21_4",
        "Chapter21_5",
        "Chapter21_6",
        "Chapter21_7",
        "Chapter21_8",
        "Chapter21_9Bounds",
        "Chapter21_9Divide",
        "Chapter21_9Modulo",
        "Chapter21_10Unconsumed",
        "Chapter21_10Nominal",
        "Chapter21_10Initializer",
        "Chapter21_10AggregateLocal",
        "Chapter21_10RoutineFlow",
        "Chapter21_10Later",
        "Chapter21_10MainSignature",
        "Chapter21_10ActiveCounter",
        "Chapter21_10ExactUse",
        "Chapter21_10Hex",
        "Chapter21_10Binary",
        "Chapter21_12",
        "Chapter21_13",
        "Chapter21_14",
        "Chapter21_15",
        "Chapter21_16",
        "Chapter21_17",
        "Chapter21_17Boolean",
        "Chapter21_18",
        "Chapter21_18Zero",
        "Chapter21_19",
        "Chapter21_19False",
        "Chapter21_19Type",
      ].map((name) => source(`${name}Source`, `${name}SourceEnd`)),
    ];
    expect(specificationPrograms).toHaveLength(34);
    expect(proofPrograms).toEqual(specificationPrograms);

    const manifestParts = buildSourceParts("model.nu\n\nmain.nu\n", (name) =>
      name === "model.nu"
        ? outcome.memory.slice(
            symbol("Chapter21_1Part1"),
            symbol("Chapter21_1Part1End"),
          )
        : outcome.memory.slice(
            symbol("Chapter21_1Part2"),
            symbol("Chapter21_1Part2End"),
          ),
    );
    expect(
      manifestParts.map(({ ordinal, diagnosticName, stableIdentity }) => ({
        ordinal,
        diagnosticName,
        stableIdentity,
      })),
    ).toEqual([
      {
        ordinal: 1,
        diagnosticName: "model.nu",
        stableIdentity: "1:model.nu",
      },
      {
        ordinal: 2,
        diagnosticName: "main.nu",
        stableIdentity: "2:main.nu",
      },
    ]);
    expect(
      new TextDecoder().decode(manifestParts[0]?.bytes ?? new Uint8Array()) +
        new TextDecoder().decode(manifestParts[1]?.bytes ?? new Uint8Array()),
    ).toBe(specificationPrograms[0]);
    expect(manifestParts[1]?.diagnosticName).toBe("main.nu");
  }, 30_000);

  it("executes failable signatures and explicit failure as direct Z80", async () => {
    const outcome = await runProofManifest(
      proof("stage8-failure-z80-slice-proof"),
    );
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(
      outcome.extents.find(({ name }) => name === "compiler-core")?.bytes,
    ).toBeLessThanOrEqual(16_384);
    expect(outcome.instructions).toBe(1_624_567);
    expect(outcome.cycles).toBe(15_136_536);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 14_311 },
      { name: "compiler-immutable", bytes: 390 },
      { name: "compiler-core", bytes: 14_701 },
      { name: "compiler-workspace", bytes: 3_623 },
      { name: "generated-z80-bound", bytes: 4_096 },
      { name: "z80-runtime", bytes: 655 },
      { name: "proof-code-and-data", bytes: 3_060 },
    ]);

    const symbol = (name: string): number => {
      const address = outcome.symbols[name];
      expect(
        address,
        `${name} must be retained by the assembled proof`,
      ).toBeDefined();
      return address ?? -1;
    };
    const generatedBase = symbol("GeneratedBase");
    const generatedLimit = symbol("GeneratedLimit");
    const generatedSize = wordAt(outcome.memory, symbol("GeneratedSize"));
    expect(generatedBase + generatedSize).toBeLessThanOrEqual(generatedLimit);

    const runtimeStart = symbol("RuntimeCodeStart");
    const runtimeEnd = symbol("RuntimeCodeEnd");
    for (const entry of [
      "ReadInputByte",
      "WriteOutputByte",
      "ReadStorageByte",
      "RewindStorageInput",
      "WriteStorageByte",
      "SeekStorageOutput",
      "ActivationClaim",
      "ActivationRelease",
    ]) {
      expect(
        symbol(entry),
        `${entry} must lie in the selected runtime`,
      ).toBeGreaterThanOrEqual(runtimeStart);
      expect(
        symbol(entry),
        `${entry} must lie in the selected runtime`,
      ).toBeLessThan(runtimeEnd);
    }
    expect(generatedLimit).toBeLessThanOrEqual(runtimeStart);
    expect(runtimeEnd).toBeLessThanOrEqual(symbol("TargetRuntimeLimit"));
  }, 30_000);

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
    expect(outcome.instructions).toBe(50_385);
    expect(outcome.cycles).toBe(488_125);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 8_469 },
      { name: "compiler-immutable", bytes: 273 },
      { name: "compiler-core", bytes: 8_742 },
      { name: "compiler-workspace", bytes: 1_550 },
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

    expect(outcome.instructions).toBe(44_677);
    expect(outcome.cycles).toBe(435_079);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_469 },
      { name: "z80-output-sink", bytes: 1_465 },
      { name: "compiler-code", bytes: 9_934 },
      { name: "compiler-immutable", bytes: 273 },
      { name: "compiler-core", bytes: 10_207 },
      { name: "compiler-workspace", bytes: 1_550 },
      { name: "generated-z80", bytes: 54 },
      { name: "z80-runtime", bytes: 562 },
      { name: "z80-state", bytes: 21 },
      { name: "service-state", bytes: 28 },
      { name: "proof-code-and-data", bytes: 298 },
    ]);
    expect(Array.from(generated.slice(0, 7))).toEqual([
      0x16, 0x00, 0x16, 0x00, 0x7a, 0xfe, 0x03,
    ]);
  }, 20_000);

  it("executes checked initialized-array selection as direct Z80", async () => {
    const outcome = await runProofManifest(proof("array-z80-slice-proof"));
    expect(outcome.instructions).toBe(63_397);
    expect(outcome.cycles).toBe(614_515);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_469 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 815 },
      { name: "semantic-sink", bytes: 67 },
      { name: "parser", bytes: 7_362 },
      { name: "z80-output-sink", bytes: 1_465 },
      { name: "compiler-code", bytes: 9_934 },
      { name: "compiler-immutable", bytes: 273 },
      { name: "compiler-core", bytes: 10_207 },
      { name: "compiler-workspace", bytes: 1_550 },
      { name: "generated-z80", bytes: 74 },
      { name: "z80-runtime", bytes: 562 },
      { name: "z80-state", bytes: 21 },
      { name: "service-state", bytes: 28 },
      { name: "proof-code-and-data", bytes: 661 },
    ]);

    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
  }, 20_000);

  it("executes a forward-declared recursive scalar value call", async () => {
    const outcome = await runProofManifest(proof("call-z80-slice-proof"));
    expect(outcome.instructions).toBe(78_540);
    expect(outcome.cycles).toBe(751_873);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_469 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 815 },
      { name: "semantic-sink", bytes: 67 },
      { name: "parser", bytes: 7_362 },
      { name: "call-parser-path", bytes: 338 },
      { name: "z80-output-sink", bytes: 1_465 },
      { name: "z80-call-backend", bytes: 341 },
      { name: "compiler-code", bytes: 9_934 },
      { name: "compiler-immutable", bytes: 273 },
      { name: "compiler-core", bytes: 10_207 },
      { name: "compiler-workspace", bytes: 1_550 },
      { name: "generated-z80", bytes: 99 },
      { name: "z80-runtime", bytes: 562 },
      { name: "z80-state", bytes: 21 },
      { name: "service-state", bytes: 28 },
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
    const outcome = await runProofManifest(proof("expression-z80-slice-proof"));
    const generatedSizeAddress = outcome.symbols.GeneratedSize ?? -1;
    const generatedSize =
      (outcome.memory[generatedSizeAddress] ?? 0) |
      ((outcome.memory[generatedSizeAddress + 1] ?? 0) << 8);

    expect(outcome.instructions).toBe(135_417);
    expect(outcome.cycles).toBe(1_324_430);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_469 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 815 },
      { name: "semantic-sink", bytes: 67 },
      { name: "symbol-table", bytes: 126 },
      { name: "parser", bytes: 7_362 },
      { name: "z80-output-sink", bytes: 3_399 },
      { name: "z80-expression-backend", bytes: 359 },
      { name: "compiler-code", bytes: 11_868 },
      { name: "compiler-immutable", bytes: 273 },
      { name: "compiler-core", bytes: 12_141 },
      { name: "compiler-workspace", bytes: 1_550 },
      { name: "generated-z80", bytes: 116 },
      { name: "z80-runtime", bytes: 562 },
      { name: "z80-state", bytes: 21 },
      { name: "service-state", bytes: 28 },
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
    expect(outcome.instructions).toBe(813_987);
    expect(outcome.cycles).toBe(7_703_576);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_469 },
      { name: "source-adapter", bytes: 99 },
      { name: "tokenizer", bytes: 815 },
      { name: "semantic-sink", bytes: 67 },
      { name: "symbol-table", bytes: 126 },
      { name: "parser", bytes: 7_362 },
      { name: "typed-z80-sink", bytes: 1_934 },
      { name: "compiler-code", bytes: 10_747 },
      { name: "compiler-immutable", bytes: 273 },
      { name: "compiler-core", bytes: 11_020 },
      { name: "compiler-workspace", bytes: 1_550 },
      { name: "generated-z80-bound", bytes: 857 },
      { name: "z80-runtime", bytes: 562 },
      { name: "proof-code-and-data", bytes: 1_627 },
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
    expect(outcome.instructions).toBe(316_255);
    expect(outcome.cycles).toBe(3_080_468);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 8_469 },
      { name: "parser", bytes: 7_362 },
      { name: "structured-z80-sink", bytes: 1_934 },
      { name: "compiler-code", bytes: 10_747 },
      { name: "compiler-immutable", bytes: 273 },
      { name: "compiler-core", bytes: 11_020 },
      { name: "compiler-workspace", bytes: 1_550 },
      { name: "generated-z80-bound", bytes: 715 },
      { name: "z80-runtime", bytes: 562 },
      { name: "proof-code-and-data", bytes: 905 },
    ]);
  }, 30_000);

  it("emits packed aggregate layouts and publishes one atomic static image", async () => {
    const outcome = await runProofManifest(proof("aggregate-z80-slice-proof"));
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(outcome.instructions).toBe(378_076);
    expect(outcome.cycles).toBe(3_544_958);
    expect(
      outcome.extents.find(({ name }) => name === "compiler-core")?.bytes,
    ).toBeLessThanOrEqual(16_384);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 7_144 },
      { name: "parser", bytes: 6_040 },
      { name: "typed-z80-sink", bytes: 1_980 },
      { name: "compiler-code", bytes: 9_468 },
      { name: "compiler-immutable", bytes: 257 },
      { name: "compiler-core", bytes: 9_725 },
      { name: "compiler-workspace", bytes: 1_550 },
      { name: "static-image", bytes: 255 },
      { name: "z80-runtime", bytes: 562 },
      { name: "proof-code-and-data", bytes: 1_222 },
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
