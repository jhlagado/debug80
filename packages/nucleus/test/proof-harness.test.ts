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
    expect(outcome.instructions).toBe(8_825);
    expect(outcome.cycles).toBe(90_816);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 941 },
      { name: "compiler-immutable", bytes: 36 },
      { name: "compiler-core", bytes: 977 },
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

    expect(outcome.instructions).toBe(6_298);
    expect(outcome.cycles).toBe(63_632);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 941 },
      { name: "nvm-output-sink", bytes: 25 },
      { name: "compiler-code", bytes: 966 },
      { name: "compiler-immutable", bytes: 94 },
      { name: "compiler-core", bytes: 1_060 },
      { name: "compiler-workspace", bytes: 55 },
      { name: "generated-nvm", bytes: 58 },
      { name: "nvm-runtime-code", bytes: 487 },
      { name: "nvm-runtime-immutable", bytes: 57 },
      { name: "nvm-runtime", bytes: 544 },
      { name: "nvm-state", bytes: 22 },
      { name: "service-state", bytes: 3 },
      { name: "proof-code-and-data", bytes: 233 },
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

  it("rejects a malformed NVM image without changing runnable state", async () => {
    const outcome = await runProofManifest(proof("nvm-loader-rejection-proof"));

    expect(outcome.instructions).toBe(447);
    expect(outcome.cycles).toBe(4_909);
    expect(outcome.extents).toEqual([
      { name: "nvm-runtime-code", bytes: 487 },
      { name: "nvm-runtime-immutable", bytes: 57 },
      { name: "rejection-proof", bytes: 103 },
    ]);
    expect(outcome.memory[outcome.symbols.NvmRunState ?? -1]).toBe(3);
    expect(outcome.memory[outcome.symbols.NvmTrapError ?? -1]).toBe(
      ServiceError.outputFailure,
    );
  });

  it("executes the same checked operations as a direct-Z80 program", async () => {
    const outcome = await runProofManifest(proof("native-slice-proof"));
    const generatedBase = outcome.symbols.GeneratedBase ?? -1;
    const generatedSize = outcome.symbols.NativeProgramSize ?? -1;
    const generated = outcome.memory.slice(
      generatedBase,
      generatedBase + generatedSize,
    );

    expect(outcome.instructions).toBe(4_754);
    expect(outcome.cycles).toBe(49_562);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 941 },
      { name: "native-output-sink", bytes: 25 },
      { name: "compiler-code", bytes: 966 },
      { name: "compiler-immutable", bytes: 73 },
      { name: "compiler-core", bytes: 1_039 },
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

    expect(outcome.instructions).toBe(39_450);
    expect(outcome.cycles).toBe(395_913);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 1_715 },
      { name: "compiler-immutable", bytes: 139 },
      { name: "compiler-core", bytes: 1_854 },
      { name: "compiler-workspace", bytes: 51 },
      { name: "proof-code-and-data", bytes: 241 },
    ]);
    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(outcome.memory[outcome.symbols.DiagnosticCode ?? -1]).toBe(
      outcome.symbols.DiagnosticExpectedEnd,
    );
  }, 20_000);

  it("executes the counted loop through NVM and the host oracle", async () => {
    const outcome = await runProofManifest(proof("loop-nvm-slice-proof"));
    const imageBase = outcome.symbols.GeneratedBase ?? -1;
    const imageSize = outcome.symbols.NvmImageSize ?? -1;
    const image = outcome.memory.slice(imageBase, imageBase + imageSize);
    const validated = validateImage(image);
    const services = new BufferSystemServices();

    expect(outcome.instructions).toBe(43_801);
    expect(outcome.cycles).toBe(428_656);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 1_715 },
      { name: "nvm-output-sink", bytes: 801 },
      { name: "compiler-code", bytes: 2_516 },
      { name: "compiler-immutable", bytes: 181 },
      { name: "compiler-core", bytes: 2_697 },
      { name: "compiler-workspace", bytes: 51 },
      { name: "generated-nvm", bytes: 96 },
      { name: "nvm-runtime-code", bytes: 797 },
      { name: "nvm-runtime-immutable", bytes: 96 },
      { name: "nvm-runtime", bytes: 893 },
      { name: "nvm-state", bytes: 32 },
      { name: "service-state", bytes: 7 },
      { name: "proof-code-and-data", bytes: 339 },
    ]);
    expect(new ReferenceVm(validated, { services }).run().kind).toBe("success");
    expect(services.standardOutput).toEqual([0x41, 0x41, 0x41]);
  }, 20_000);

  it("executes the counted loop as direct Z80", async () => {
    const outcome = await runProofManifest(proof("loop-native-slice-proof"));
    const generatedBase = outcome.symbols.GeneratedBase ?? -1;
    const generatedSize = outcome.symbols.NativeProgramSize ?? -1;
    const generated = outcome.memory.slice(
      generatedBase,
      generatedBase + generatedSize,
    );

    expect(outcome.instructions).toBe(35_896);
    expect(outcome.cycles).toBe(358_253);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 1_715 },
      { name: "native-output-sink", bytes: 1_008 },
      { name: "compiler-code", bytes: 2_723 },
      { name: "compiler-immutable", bytes: 139 },
      { name: "compiler-core", bytes: 2_862 },
      { name: "compiler-workspace", bytes: 51 },
      { name: "generated-native", bytes: 54 },
      { name: "native-runtime", bytes: 196 },
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

    expect(outcome.instructions).toBe(50_032);
    expect(outcome.cycles).toBe(494_033);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 1_715 },
      { name: "source-adapter", bytes: 100 },
      { name: "tokenizer", bytes: 495 },
      { name: "semantic-sink", bytes: 59 },
      { name: "parser", bytes: 1_061 },
      { name: "native-output-sink", bytes: 1_008 },
      { name: "compiler-code", bytes: 2_723 },
      { name: "compiler-immutable", bytes: 139 },
      { name: "compiler-core", bytes: 2_862 },
      { name: "compiler-workspace", bytes: 51 },
      { name: "generated-native", bytes: 74 },
      { name: "native-runtime", bytes: 196 },
      { name: "native-state", bytes: 17 },
      { name: "service-state", bytes: 14 },
      { name: "proof-code-and-data", bytes: 643 },
    ]);

    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
  }, 20_000);

  it("checks the initialized-array NVM image with the host oracle", async () => {
    const outcome = await runProofManifest(proof("array-nvm-oracle-proof"));
    const imageBase = outcome.symbols.GeneratedBase ?? -1;
    const imageSize = outcome.symbols.ArrayNvmImageSize ?? -1;
    const image = outcome.memory.slice(imageBase, imageBase + imageSize);
    const validated = validateImage(image);
    const successServices = new BufferSystemServices([1]);

    expect(outcome.instructions).toBe(15_108);
    expect(outcome.cycles).toBe(149_307);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 1_715 },
      { name: "nvm-oracle-sink", bytes: 801 },
      { name: "compiler-code", bytes: 2_516 },
      { name: "compiler-immutable", bytes: 179 },
      { name: "compiler-core", bytes: 2_695 },
      { name: "compiler-workspace", bytes: 51 },
      { name: "generated-nvm", bytes: 89 },
      { name: "proof-code-and-data", bytes: 103 },
    ]);

    expect(Array.from(validated.initialData)).toEqual([65, 66, 67, 68]);
    expect(
      new ReferenceVm(validated, { services: successServices }).run().kind,
    ).toBe("success");
    expect(successServices.standardOutput).toEqual([66]);

    const bounds = new ReferenceVm(validated, {
      services: new BufferSystemServices([4]),
    }).run();
    expect(bounds.kind).toBe("trap");
    if (bounds.kind === "trap") {
      expect(bounds.record).toEqual({
        trap: Trap.bounds,
        routine: 0,
        offset: 11,
      });
    }

    const inputFailure = new ReferenceVm(validated, {
      services: new BufferSystemServices(),
    }).run();
    expect(inputFailure.kind).toBe("trap");
    if (inputFailure.kind === "trap") {
      expect(inputFailure.record).toEqual({
        trap: Trap.unhandledError,
        routine: 0,
        offset: 33,
        errorCode: ServiceError.endOfInput,
      });
    }
  }, 20_000);

  it("executes a forward-declared recursive scalar value call", async () => {
    const outcome = await runProofManifest(proof("call-native-slice-proof"));

    expect(outcome.instructions).toBe(61_921);
    expect(outcome.cycles).toBe(611_019);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 1_715 },
      { name: "source-adapter", bytes: 100 },
      { name: "tokenizer", bytes: 495 },
      { name: "semantic-sink", bytes: 59 },
      { name: "parser", bytes: 1_061 },
      { name: "call-parser-path", bytes: 341 },
      { name: "native-output-sink", bytes: 1_008 },
      { name: "native-call-backend", bytes: 332 },
      { name: "compiler-code", bytes: 2_723 },
      { name: "compiler-immutable", bytes: 139 },
      { name: "compiler-core", bytes: 2_862 },
      { name: "compiler-workspace", bytes: 51 },
      { name: "generated-native", bytes: 99 },
      { name: "native-runtime", bytes: 196 },
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
        ].map((name) => (outcome.symbols[name] ?? -1) >>> 8),
      ).size,
    ).toBeGreaterThan(1);
  }, 20_000);

  it("checks the recursive scalar call against the NVM host oracle", async () => {
    const outcome = await runProofManifest(proof("call-nvm-oracle-proof"));
    const base = outcome.symbols.GeneratedBase ?? -1;
    const size = outcome.symbols.CallNvmImageSize ?? -1;
    const image = validateImage(outcome.memory.slice(base, base + size));
    const services = new BufferSystemServices();

    expect(outcome.instructions).toBe(21_342);
    expect(outcome.cycles).toBe(213_740);
    expect(outcome.extents).toEqual([
      { name: "common-front-end", bytes: 1_715 },
      { name: "nvm-oracle-sink", bytes: 139 },
      { name: "compiler-code", bytes: 1_854 },
      { name: "compiler-immutable", bytes: 139 },
      { name: "compiler-core", bytes: 1_993 },
      { name: "compiler-workspace", bytes: 51 },
      { name: "generated-nvm", bytes: 102 },
      { name: "proof-code-and-data", bytes: 66 },
    ]);
    expect(new ReferenceVm(image, { services }).run().kind).toBe("success");
    expect(services.standardOutput).toEqual([0]);

    const exhausted = new ReferenceVm(image, {
      services: new BufferSystemServices(),
      maximumActivationBytes: 4096,
      maximumActivationDepth: 3,
    }).run();
    expect(exhausted.kind).toBe("trap");
    if (exhausted.kind === "trap") {
      expect(exhausted.record).toEqual({
        trap: Trap.activationCapacity,
        routine: 1,
        offset: 46,
      });
    }
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
