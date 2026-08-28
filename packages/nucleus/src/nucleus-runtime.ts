import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "@jhlagado/azm/compile";
import { parseIntelHex } from "@jhlagado/debug80-runtime";

import type {
  RuntimeImage,
  RuntimeImageProvider,
  RuntimeLinkContext,
  RuntimeServiceAddresses,
} from "./nobj.js";
import { NobjError } from "./nobj.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtimeSourceDirectoryCandidates = [
  path.resolve(moduleDirectory, "../asm/vertical-slice"),
  path.resolve(moduleDirectory, "../../asm/vertical-slice"),
];
const runtimeSourceDirectory =
  runtimeSourceDirectoryCandidates.find((candidate) => existsSync(candidate)) ??
  runtimeSourceDirectoryCandidates[0]!;

const helperIdentitySymbols = {
  ActivationPush: "NucleusRuntimeActivationPushOffset",
  ActivationPop: "NucleusRuntimeActivationPopOffset",
  ActivationClaim: "NucleusRuntimeActivationClaimOffset",
  ActivationRelease: "NucleusRuntimeActivationReleaseOffset",
  CheckArrayIndex: "NucleusRuntimeCheckArrayIndexOffset",
  CheckStringLength: "NucleusRuntimeCheckStringLengthOffset",
  CheckStringIndex: "NucleusRuntimeCheckStringIndexOffset",
  CheckAggregateRegion: "NucleusRuntimeCheckAggregateRegionOffset",
  InitializeBss: "NucleusRuntimeInitializeBssOffset",
  MultiplyU8: "NucleusRuntimeMultiplyU8Offset",
  MultiplyU16: "NucleusRuntimeMultiplyU16Offset",
  DivideU16: "NucleusRuntimeDivideU16Offset",
  ModuloU16: "NucleusRuntimeModuloU16Offset",
  CompareU16: "NucleusRuntimeCompareU16Offset",
} as const;

export const NUCLEUS_RUNTIME_SERVICE_VECTOR_ENTRY_BYTES = 3;

export const nucleusRuntimeServiceOrder = [
  "readInputByte",
  "writeOutputByte",
  "readStorageByte",
  "rewindStorageInput",
  "writeStorageByte",
  "seekStorageOutput",
  "success",
  "unhandledFailure",
  "trap",
  "farCall",
  "farJump",
] as const satisfies readonly (keyof RuntimeServiceAddresses)[];

export const defaultRuntimeLinkContext: RuntimeLinkContext = {
  runtimeBase: 0x6800,
  writableBase: 0x7800,
  writableCapacity: 0x1000,
  writableStateBase: 0x7821,
  vectorBase: 0x7800,
  programDataBase: 0x7846,
  programDataCapacity: 0x0800,
  readOnlyBase: 0x696c,
  readOnlyCapacity: 0x0800,
  services: {
    readInputByte: 0x9000,
    writeOutputByte: 0x9003,
    readStorageByte: 0x9006,
    rewindStorageInput: 0x9009,
    writeStorageByte: 0x900c,
    seekStorageOutput: 0x900f,
    success: 0x9012,
    unhandledFailure: 0x9015,
    trap: 0x9018,
    farCall: 0x901b,
    farJump: 0x901e,
  },
};

const checkedWord = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new NobjError(`${name} is outside 0..65535`);
  }
};

const checkedRegion = (
  name: string,
  base: number,
  capacity: number,
  allowEmpty = false,
): void => {
  checkedWord(`${name} base`, base);
  checkedWord(`${name} capacity`, capacity);
  if (!allowEmpty && capacity === 0)
    throw new NobjError(`${name} capacity is zero`);
  if (base + capacity > 0x10000) {
    throw new NobjError(`${name} crosses the Z80 address space`);
  }
};

export const validateRuntimeLinkContext = (
  context: RuntimeLinkContext,
): void => {
  checkedWord("runtime base", context.runtimeBase);
  checkedRegion("writable", context.writableBase, context.writableCapacity);
  checkedWord("writable state base", context.writableStateBase);
  checkedWord("vector base", context.vectorBase);
  checkedRegion(
    "program data",
    context.programDataBase,
    context.programDataCapacity,
    true,
  );
  checkedRegion(
    "read-only data",
    context.readOnlyBase,
    context.readOnlyCapacity,
    true,
  );
  const writableEnd = context.writableBase + context.writableCapacity;
  if (
    context.writableStateBase < context.writableBase ||
    context.writableStateBase >= writableEnd
  ) {
    throw new NobjError("writable state base is outside writable storage");
  }
  if (
    context.vectorBase < context.writableBase ||
    context.vectorBase >= writableEnd
  ) {
    throw new NobjError("vector base is outside writable storage");
  }
  for (const service of nucleusRuntimeServiceOrder) {
    checkedWord(`${service} service address`, context.services[service]);
  }
};

const hexWord = (value: number): string =>
  `$${value.toString(16).padStart(4, "0")}`;

const contextAssembly = (context: RuntimeLinkContext): string => `
RuntimeLinkBase             .equ ${hexWord(context.runtimeBase)}
RuntimeWritableStateBase    .equ ${hexWord(context.writableStateBase)}
RuntimeProgramDataBase      .equ ${hexWord(context.programDataBase)}
RuntimeProgramDataCapacity  .equ ${hexWord(context.programDataCapacity)}
RuntimeReadOnlyBase         .equ ${hexWord(context.readOnlyBase)}
RuntimeReadOnlyCapacity     .equ ${hexWord(context.readOnlyCapacity)}

StateBase          .equ RuntimeWritableStateBase
RunState           .equ StateBase+$00
TrapNumber         .equ StateBase+$01
TrapRoutine        .equ StateBase+$02
TrapOffset         .equ StateBase+$03
TrapError          .equ StateBase+$05
ActivationDepth    .equ StateBase+$06
ActivationLimit    .equ StateBase+$07
ScalarSlot         .equ StateBase+$08
CurrentBank        .equ ScalarSlot
ActivationArena    .equ StateBase+$09
ActivationCapacity .equ 8
RootSP             .equ ActivationArena+ActivationCapacity
RootIX             .equ RootSP+2
FarReturnArena     .equ RootIX+2
FarReturnCapacity  .equ ActivationCapacity*2
StateEnd           .equ FarReturnArena+FarReturnCapacity

RunReady           .equ 1
RunSucceeded       .equ 2
RunTrapped         .equ 3

ProgramDataBase           .equ RuntimeProgramDataBase
ProgramDataRegionCapacity .equ RuntimeProgramDataCapacity
GeneratedRoDataBase       .equ RuntimeReadOnlyBase
GeneratedRoDataCapacity   .equ RuntimeReadOnlyCapacity

AggregateCallSlices .equ 1
ComparisonEqual        .equ 0
ComparisonNotEqual     .equ 1
ComparisonLess         .equ 2
ComparisonLessEqual    .equ 3
ComparisonGreater      .equ 4
ComparisonGreaterEqual .equ 5
`;

export const nucleusRuntimeServiceVectorBytes = (
  services: RuntimeServiceAddresses,
): Uint8Array => {
  const bytes = new Uint8Array(
    nucleusRuntimeServiceOrder.length *
      NUCLEUS_RUNTIME_SERVICE_VECTOR_ENTRY_BYTES,
  );
  nucleusRuntimeServiceOrder.forEach((name, index) => {
    const address = services[name];
    bytes[index * 3] = 0xc3;
    bytes[index * 3 + 1] = address & 0xff;
    bytes[index * 3 + 2] = address >>> 8;
  });
  return bytes;
};

const runtimeStateBytes = (
  stateLength: number,
  runStateOffset: number,
  activationLimitOffset: number,
  runReady: number,
  activationCapacity: number,
): Uint8Array => {
  const bytes = new Uint8Array(stateLength);
  bytes[runStateOffset] = runReady;
  bytes[activationLimitOffset] = activationCapacity;
  return bytes;
};

const contextKey = (identity: number, context: RuntimeLinkContext): string =>
  JSON.stringify([
    identity,
    context.runtimeBase,
    context.writableBase,
    context.writableCapacity,
    context.writableStateBase,
    context.vectorBase,
    context.programDataBase,
    context.programDataCapacity,
    context.readOnlyBase,
    context.readOnlyCapacity,
    ...nucleusRuntimeServiceOrder.map((service) => context.services[service]),
  ]);

export class CanonicalRuntimeImageProvider implements RuntimeImageProvider {
  readonly #images = new Map<string, RuntimeImage>();

  constructor(
    images: readonly {
      readonly context: RuntimeLinkContext;
      readonly image: RuntimeImage;
    }[],
  ) {
    for (const { context, image } of images) {
      this.#images.set(contextKey(image.identity, context), {
        ...image,
        bytes: image.bytes.slice(),
        initialBytes: image.initialBytes.slice(),
        vectorBytes: image.vectorBytes.slice(),
        helperOffsets:
          image.helperOffsets === undefined
            ? undefined
            : { ...image.helperOffsets },
        currentBankOffset: image.currentBankOffset,
      });
    }
  }

  get(identity: number, context: RuntimeLinkContext): RuntimeImage | undefined {
    const image = this.#images.get(contextKey(identity, context));
    if (image === undefined) return undefined;
    return {
      ...image,
      bytes: image.bytes.slice(),
      initialBytes: image.initialBytes.slice(),
      vectorBytes: image.vectorBytes.slice(),
      helperOffsets:
        image.helperOffsets === undefined
          ? undefined
          : { ...image.helperOffsets },
      currentBankOffset: image.currentBankOffset,
    };
  }
}

export const loadCanonicalRuntimeImage = async (
  context: RuntimeLinkContext = defaultRuntimeLinkContext,
): Promise<RuntimeImage> => {
  validateRuntimeLinkContext(context);
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "nucleus-runtime-link-"),
  );
  try {
    const contextPath = path.join(
      temporaryDirectory,
      "nucleus-runtime-link-context.asmi",
    );
    const entryPath = path.join(temporaryDirectory, "runtime-link.asm");
    await writeFile(contextPath, contextAssembly(context), "utf8");
    await writeFile(
      entryPath,
      `.include "nucleus-runtime-link-context.asmi"\n` +
        `.org RuntimeLinkBase\nRuntimeCodeStart:\n` +
        `.include "target-z80-runtime.asm"\nRuntimeCodeEnd:\n`,
      "utf8",
    );
    const assembled = await compile(entryPath, {
      includeDirs: [temporaryDirectory, runtimeSourceDirectory],
      emitBin: false,
      emitHex: true,
      emitD8m: true,
      registerContracts: "strict",
    });
    const errors = assembled.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    if (errors.length > 0) {
      throw new NobjError(
        `canonical runtime link failed: ${errors
          .map((diagnostic) => diagnostic.message)
          .join("; ")}`,
      );
    }
    const hex = assembled.artifacts.find((artifact) => artifact.kind === "hex");
    const debugMap = assembled.artifacts.find(
      (artifact) => artifact.kind === "d8m",
    );
    if (hex?.kind !== "hex" || debugMap?.kind !== "d8m") {
      throw new NobjError("canonical runtime link omitted HEX or D8M output");
    }
    const symbol = (name: string): number => {
      const wanted = name.toLowerCase();
      for (const entry of debugMap.json.symbols) {
        if (entry.name.toLowerCase() !== wanted) continue;
        const value = entry.address ?? entry.value;
        if (value !== undefined) return value;
      }
      throw new NobjError(`canonical runtime link omitted ${name}`);
    };
    const start = symbol("RuntimeCodeStart");
    const end = symbol("RuntimeCodeEnd");
    const expectedLength = symbol("NucleusRuntimeExpectedLength");
    if (start !== context.runtimeBase || end - start !== expectedLength) {
      throw new NobjError(
        `canonical runtime linked length mismatch: ${end - start}, expected ${expectedLength}`,
      );
    }
    const vectorLength = symbol("NucleusRuntimeVectorLength");
    const stateLength = symbol("NucleusRuntimeStateLength");
    const runStateOffset = symbol("RunState") - symbol("StateBase");
    const activationLimitOffset =
      symbol("ActivationLimit") - symbol("StateBase");
    const currentBankOffset = symbol("CurrentBank") - symbol("StateBase");
    if (
      runStateOffset !== symbol("NucleusRuntimeRunStateOffset") ||
      activationLimitOffset !== symbol("NucleusRuntimeActivationLimitOffset") ||
      currentBankOffset !== symbol("NucleusRuntimeCurrentBankOffset")
    ) {
      throw new NobjError("canonical runtime writable-state offset mismatch");
    }
    const writableEnd = context.writableBase + context.writableCapacity;
    if (end > 0x10000) {
      throw new NobjError("canonical runtime crosses the Z80 address space");
    }
    if (context.vectorBase !== context.writableBase) {
      throw new NobjError("runtime vector base differs from writable base");
    }
    if (context.writableStateBase !== context.vectorBase + vectorLength) {
      throw new NobjError("runtime state does not follow the vector table");
    }
    if (context.programDataBase !== context.writableStateBase + stateLength) {
      throw new NobjError("program data does not follow runtime state");
    }
    if (context.programDataBase + context.programDataCapacity > writableEnd) {
      throw new NobjError("program data exceeds writable storage");
    }
    if (context.readOnlyCapacity > 0 && context.readOnlyBase < end) {
      throw new NobjError("read-only data overlaps the linked runtime");
    }
    const helperOffsets: Record<string, number> = {};
    for (const [helper, identitySymbol] of Object.entries(
      helperIdentitySymbols,
    )) {
      const offset = symbol(helper) - start;
      if (offset !== symbol(identitySymbol)) {
        throw new NobjError(
          `canonical runtime helper offset mismatch: ${helper}`,
        );
      }
      helperOffsets[helper] = offset;
    }
    const linkedVectors = nucleusRuntimeServiceVectorBytes(context.services);
    if (linkedVectors.length !== vectorLength) {
      throw new NobjError("canonical runtime vector-layout mismatch");
    }
    const linkedState = runtimeStateBytes(
      stateLength,
      runStateOffset,
      activationLimitOffset,
      symbol("RunReady"),
      symbol("ActivationCapacity"),
    );
    if (linkedState.length !== stateLength) {
      throw new NobjError("canonical runtime initial-state length mismatch");
    }
    if (symbol("StateEnd") - symbol("StateBase") !== stateLength) {
      throw new NobjError("canonical runtime writable-state layout mismatch");
    }
    return {
      identity: symbol("NucleusRuntimeIdentity"),
      bytes: parseIntelHex(hex.text).memory.slice(start, end),
      initialBytes: Uint8Array.from([...linkedVectors, ...linkedState]),
      vectorBytes: linkedVectors,
      helperOffsets,
      currentBankOffset,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

export const loadCanonicalRuntimeProvider = async (
  contexts: readonly RuntimeLinkContext[] = [defaultRuntimeLinkContext],
): Promise<CanonicalRuntimeImageProvider> =>
  new CanonicalRuntimeImageProvider(
    await Promise.all(
      contexts.map(async (context) => ({
        context,
        image: await loadCanonicalRuntimeImage(context),
      })),
    ),
  );
