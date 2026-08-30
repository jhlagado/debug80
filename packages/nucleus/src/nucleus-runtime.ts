import { existsSync } from "node:fs";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseIntelHex } from "@jhlagado/debug80-runtime";
import {
  Z80_WORD_MAX,
  isUnsignedIntegerUpTo,
  selectConcreteZ80AssemblerFlavour,
  type ConcreteZ80AssemblerFlavour,
  z80AddressEnd,
} from "@jhlagado/z80-tool-services";

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
const runtimeAtomSourceDirectoryCandidates = [
  path.resolve(moduleDirectory, "../atom-asm/vertical-slice"),
  path.resolve(moduleDirectory, "../../atom-asm/vertical-slice"),
];
const runtimeAtomSourceDirectory =
  runtimeAtomSourceDirectoryCandidates.find((candidate) =>
    existsSync(candidate),
  ) ?? runtimeAtomSourceDirectoryCandidates[0]!;

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
export type NucleusRuntimeAssemblerFlavour = ConcreteZ80AssemblerFlavour;

export const NUCLEUS_DEFAULT_RUNTIME_ASSEMBLER =
  "atom" satisfies NucleusRuntimeAssemblerFlavour;

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
  if (!isUnsignedIntegerUpTo(value, Z80_WORD_MAX)) {
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
  if (z80AddressEnd(base, capacity) === undefined) {
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

const contentBase = (generation: {
  readonly images: readonly { readonly address: number }[];
}): number =>
  generation.images.reduce(
    (minimum, image) => Math.min(minimum, image.address),
    Z80_WORD_MAX,
  );

const atomContextAssembly = (context: RuntimeLinkContext): string => `
; Generated context-specific Atom runtime link context.
RNTMLNKB             EQU ${hexWord(context.runtimeBase)} ;@NUC-GLOBAL RuntimeLinkBase PERMANENT RNTMLNKB
RNTMWRTB    EQU ${hexWord(context.writableStateBase)} ;@NUC-GLOBAL RuntimeWritableStateBase PERMANENT RNTMWRTB
RNTMPRGR      EQU ${hexWord(context.programDataBase)} ;@NUC-GLOBAL RuntimeProgramDataBase PERMANENT RNTMPRGR
RNTMPRG0  EQU ${hexWord(context.programDataCapacity)} ;@NUC-GLOBAL RuntimeProgramDataCapacity PERMANENT RNTMPRG0
RNTMRDON         EQU ${hexWord(context.readOnlyBase)} ;@NUC-GLOBAL RuntimeReadOnlyBase PERMANENT RNTMRDON
RNTMRDO0     EQU ${hexWord(context.readOnlyCapacity)} ;@NUC-GLOBAL RuntimeReadOnlyCapacity PERMANENT RNTMRDO0

STTBS          EQU RNTMWRTB ;@NUC-GLOBAL StateBase PERMANENT STTBS
RunState           EQU STTBS+$00
TRPNMBR         EQU STTBS+$01 ;@NUC-GLOBAL TrapNumber PERMANENT TRPNMBR
TRPRTN        EQU STTBS+$02 ;@NUC-GLOBAL TrapRoutine PERMANENT TRPRTN
TRPOFFST         EQU STTBS+$03 ;@NUC-GLOBAL TrapOffset PERMANENT TRPOFFST
TRPERRR          EQU STTBS+$05 ;@NUC-GLOBAL TrapError PERMANENT TRPERRR
ACTVTNDP    EQU STTBS+$06 ;@NUC-GLOBAL ActivationDepth PERMANENT ACTVTNDP
ACTVTNLM    EQU STTBS+$07 ;@NUC-GLOBAL ActivationLimit PERMANENT ACTVTNLM
SCLRSLT         EQU STTBS+$08 ;@NUC-GLOBAL ScalarSlot PERMANENT SCLRSLT
CRRNTBNK        EQU SCLRSLT ;@NUC-GLOBAL CurrentBank PERMANENT CRRNTBNK
ACTVTNAR    EQU STTBS+$09 ;@NUC-GLOBAL ActivationArena PERMANENT ACTVTNAR
ACTVTNCP EQU 8 ;@NUC-GLOBAL ActivationCapacity PERMANENT ACTVTNCP
RootSP             EQU ACTVTNAR+ACTVTNCP
RootIX             EQU RootSP+2
FRRTRNAR     EQU RootIX+2 ;@NUC-GLOBAL FarReturnArena PERMANENT FRRTRNAR
FRRTRNCP  EQU ACTVTNCP*2 ;@NUC-GLOBAL FarReturnCapacity PERMANENT FRRTRNCP
StateEnd           EQU FRRTRNAR+FRRTRNCP

RunReady           EQU 1
RNSCCDD       EQU 2 ;@NUC-GLOBAL RunSucceeded PERMANENT RNSCCDD
RNTRPPD         EQU 3 ;@NUC-GLOBAL RunTrapped PERMANENT RNTRPPD

PRGRMDTB           EQU RNTMPRGR ;@NUC-GLOBAL ProgramDataBase PERMANENT PRGRMDTB
PRGRMDT0 EQU RNTMPRG0 ;@NUC-GLOBAL ProgramDataRegionCapacity PERMANENT PRGRMDT0
GNRTDRO0       EQU RNTMRDON ;@NUC-GLOBAL GeneratedRoDataBase PERMANENT GNRTDRO0
GNRTDRO2   EQU RNTMRDO0 ;@NUC-GLOBAL GeneratedRoDataCapacity PERMANENT GNRTDRO2

CMPRSNEQ        EQU 0 ;@NUC-GLOBAL ComparisonEqual PERMANENT CMPRSNEQ
CMPRSNNT     EQU 1 ;@NUC-GLOBAL ComparisonNotEqual PERMANENT CMPRSNNT
CMPRSNLS         EQU 2 ;@NUC-GLOBAL ComparisonLess PERMANENT CMPRSNLS
CMPRSNL0    EQU 3 ;@NUC-GLOBAL ComparisonLessEqual PERMANENT CMPRSNL0
CMPRSNGR      EQU 4 ;@NUC-GLOBAL ComparisonGreater PERMANENT CMPRSNGR
CMPRSNG0 EQU 5 ;@NUC-GLOBAL ComparisonGreaterEqual PERMANENT CMPRSNG0
`;

const atomSymbolAliasesFromText = (
  text: string,
): ReadonlyMap<string, string> => {
  const aliases = new Map<string, string>();
  for (const line of text.split(/\n/)) {
    const match = /;@NUC-GLOBAL\s+(\S+)\s+PERMANENT\s+(\S+)/.exec(line);
    if (match !== null) aliases.set(match[1]!.toLowerCase(), match[2]!);
  }
  return aliases;
};

const atomSymbolAliases = async (
  root: string,
  generatedContext: string,
): Promise<ReadonlyMap<string, string>> => {
  const aliases = new Map(atomSymbolAliasesFromText(generatedContext));
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        for (const [original, permanent] of atomSymbolAliasesFromText(
          await readFile(child, "utf8"),
        )) {
          aliases.set(original, permanent);
        }
      }
    }
  };
  await visit(root);
  return aliases;
};

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

export function loadCanonicalRuntimeImage(): Promise<RuntimeImage>;
export function loadCanonicalRuntimeImage(
  context: RuntimeLinkContext,
): Promise<RuntimeImage>;
export function loadCanonicalRuntimeImage(
  context: RuntimeLinkContext,
  options: { readonly assembler?: string },
): Promise<RuntimeImage>;
export async function loadCanonicalRuntimeImage(
  context: RuntimeLinkContext = defaultRuntimeLinkContext,
  options: { readonly assembler?: string } | number = {},
): Promise<RuntimeImage> {
  validateRuntimeLinkContext(context);
  const requestedAssembler =
    typeof options === "object" && options !== null
      ? options.assembler
      : undefined;
  const assembler = selectConcreteZ80AssemblerFlavour({
    requested: requestedAssembler,
    defaultFlavour: NUCLEUS_DEFAULT_RUNTIME_ASSEMBLER,
    sourcePath: "Nucleus canonical runtime image",
  });
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "nucleus-runtime-link-"),
  );
  try {
    let hexText: string;
    let rawSymbols: Readonly<Record<string, number>>;
    let atomAliases: ReadonlyMap<string, string> = new Map();
    if (assembler === "atom") {
      const { assembleAtomProject, materializeAtomGeneration, writeIntelHex } =
        await import("atom-z80");
      await cp(runtimeAtomSourceDirectory, temporaryDirectory, {
        recursive: true,
      });
      const contextText = atomContextAssembly(context);
      await writeFile(
        path.join(temporaryDirectory, "nucleus-runtime-link-context.asmi"),
        contextText,
        "utf8",
      );
      atomAliases = await atomSymbolAliases(temporaryDirectory, contextText);
      const assembled = await assembleAtomProject({
        root: temporaryDirectory,
        entry: "nucleus-target-runtime-link.asm",
        target: { start: 0, capacity: Z80_WORD_MAX },
        maxInstructions: 700_000_000,
        maxCycles: 7_000_000_000,
      });
      const materialized = materializeAtomGeneration(assembled.generation, {
        base: contentBase(assembled.generation),
      });
      hexText = writeIntelHex(materialized);
      rawSymbols = Object.fromEntries(
        (assembled.generation.symbols ?? []).map(
          (entry: { readonly name: string; readonly value: number }) =>
            [entry.name, entry.value] as const,
        ),
      );
    } else {
      const { assembleLegacyAzmRuntimeImage } = await import(
        "./legacy-runtime-assembler.js"
      );
      ({ hexText, rawSymbols } = await assembleLegacyAzmRuntimeImage({
        temporaryDirectory,
        runtimeSourceDirectory,
        context,
        failure: (message) => new NobjError(message),
      }));
    }
    const symbol = (name: string): number => {
      const wanted = name.toLowerCase();
      const atomAlias = atomAliases.get(wanted)?.toLowerCase();
      for (const [candidate, value] of Object.entries(rawSymbols)) {
        const lower = candidate.toLowerCase();
        if (lower === wanted || lower === atomAlias) return value;
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
    if (z80AddressEnd(start, expectedLength) === undefined) {
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
      bytes: parseIntelHex(hexText).memory.slice(start, end),
      initialBytes: Uint8Array.from([...linkedVectors, ...linkedState]),
      vectorBytes: linkedVectors,
      helperOffsets,
      currentBankOffset,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export const loadCanonicalRuntimeProvider = async (
  contexts: readonly RuntimeLinkContext[] = [defaultRuntimeLinkContext],
  options: { readonly assembler?: string } = {},
): Promise<CanonicalRuntimeImageProvider> =>
  new CanonicalRuntimeImageProvider(
    await Promise.all(
      contexts.map(async (context) => ({
        context,
        image: await loadCanonicalRuntimeImage(context, options),
      })),
    ),
  );
