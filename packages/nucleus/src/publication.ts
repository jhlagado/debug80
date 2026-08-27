import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  prepareNucleusCompilation,
  type NucleusResidentSourcePreparationOptions,
} from "./application.js";
import { runProofManifest, type NobjExecutionOutcome } from "./proof.js";
import type { NucleusResidentCompilerEntrySymbols } from "./resident-compiler-entry.js";
import {
  defineNucleusTargetPublicationDescriptor,
  loadNucleusTargetPublicationDescriptor,
  type NucleusTargetPublicationDescriptor,
} from "./target-publication.js";

const defaultFlatCompilerProofManifest = fileURLToPath(
  new URL("../proofs/flat-target-z80-slice-proof.json", import.meta.url),
);
const NUCLEUS_DEFAULT_RESIDENT_SOURCE_BASE = 0x5000;
const NUCLEUS_DEFAULT_RESIDENT_SOURCE_CAPACITY = 0x0800;

export const NUCLEUS_FLAT_TARGET_COMPILER_ENTRY = Object.freeze({
  executionEntry: "ProofStart",
  sourceDescriptorBase: "FlatTargetParts",
  sourceBase: "SourceBase",
  sourceCapacity: 0x0800,
  targetDescriptor: "FlatTargetDescriptor",
  partBankTable: "FlatTargetPartBanks",
  outputLogBase: "AdapterSuccessLogBase",
  outputLogLength: "AdapterLogLength",
  outputLogLimit: "AdapterLogLimit",
} satisfies NucleusResidentCompilerEntrySymbols);

export const NUCLEUS_FLAT_TARGET_PUBLICATION_DESCRIPTOR =
  defineNucleusTargetPublicationDescriptor({
    begin: {
      banked: false,
      runtimeIdentity: 4,
      bankCount: 1,
      imageFill: 0xff,
      imageBase: 0x8000,
      imageCapacity: 0x1000,
    },
    map: {
      romMode: true,
      establishedStack: true,
      entryBank: 0,
      entryAddress: 0x8000,
      writableBase: 0x4000,
      writableCapacity: 0x1000,
      vectorBase: 0x4000,
      vectorLength: 33,
      initializedRunBase: 0x4000,
      initializedRunLength: 72,
      bssBase: 0x4048,
      bssLength: 1,
      stackRequirement: 0x0f00,
      dataLoadBank: 0,
      dataLoadAddress: 0x81aa,
      dataLoadLength: 72,
      partBanks: [0],
      banks: [
        {
          usedLength: 556,
          readOnlyBase: 0x81aa,
          readOnlyLength: 72,
          aggregateConstantBase: 0,
          aggregateConstantLength: 0,
        },
      ],
    },
    runtimeLinkContext: {
      runtimeBase: 0x8003,
      writableBase: 0x4000,
      writableCapacity: 0x1000,
      writableStateBase: 0x4021,
      vectorBase: 0x4000,
      programDataBase: 0x4046,
      programDataCapacity: 3,
      readOnlyBase: 0x81f2,
      readOnlyCapacity: 0,
      services: {
        readInputByte: 0x7000,
        writeOutputByte: 0x7003,
        readStorageByte: 0x7006,
        rewindStorageInput: 0x7009,
        writeStorageByte: 0x700c,
        seekStorageOutput: 0x700f,
        success: 0x7012,
        unhandledFailure: 0x7015,
        trap: 0x7018,
        farCall: 0x701b,
        farJump: 0x701e,
      },
    },
  });

export interface NucleusProofTargetPublicationOptions {
  readonly manifest: string;
  readonly output?: string;
}

export interface NucleusProofTargetPublication {
  readonly manifest: string;
  readonly output?: string;
  readonly nobj: NobjExecutionOutcome;
}

export interface NucleusPreparedSourceTargetPublicationOptions {
  readonly root?: string;
  readonly entry: string;
  readonly compilerManifest?: string;
  readonly compilerEntry?: NucleusResidentCompilerEntrySymbols;
  readonly target?: NucleusTargetPublicationDescriptor;
  readonly targetFile?: string;
  readonly source?: NucleusResidentSourcePreparationOptions;
  readonly output?: string;
}

export interface NucleusPreparedSourceTargetPublication {
  readonly root: string;
  readonly entry: string;
  readonly compilerManifest: string;
  readonly targetFile?: string;
  readonly output?: string;
  readonly sourceParts: number;
  readonly sourceBytes: number;
  readonly nobj: NobjExecutionOutcome;
}

export async function publishNucleusProofTarget({
  manifest,
  output,
}: NucleusProofTargetPublicationOptions): Promise<NucleusProofTargetPublication> {
  const manifestPath = path.resolve(manifest);
  const outcome = await runProofManifest(manifestPath);
  if (outcome.nobj === undefined) {
    throw new Error("proof manifest did not publish NOBJ");
  }
  if (output !== undefined) {
    const outputPath = path.resolve(output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, outcome.nobj.serialized);
  }
  return Object.freeze({
    manifest: manifestPath,
    output: output === undefined ? undefined : path.resolve(output),
    nobj: outcome.nobj,
  });
}

export async function publishNucleusPreparedSourceTarget(
  options: NucleusPreparedSourceTargetPublicationOptions,
): Promise<NucleusPreparedSourceTargetPublication> {
  if (options.targetFile !== undefined && options.target !== undefined) {
    throw new Error("target and targetFile cannot both be supplied");
  }
  const root = options.root ?? ".";
  const entry = options.entry;
  const compilerManifest =
    options.compilerManifest ?? defaultFlatCompilerProofManifest;
  const compilerEntry =
    options.compilerEntry ?? NUCLEUS_FLAT_TARGET_COMPILER_ENTRY;
  const target = options.target ?? NUCLEUS_FLAT_TARGET_PUBLICATION_DESCRIPTOR;
  const targetFile = options.targetFile;
  const source = options.source ?? {
    sourceBase: NUCLEUS_DEFAULT_RESIDENT_SOURCE_BASE,
  };
  const output = options.output;
  const rootPath = path.resolve(root);
  const compilerManifestPath = path.resolve(compilerManifest);
  const sourceBase =
    source.sourceBase ?? NUCLEUS_DEFAULT_RESIDENT_SOURCE_BASE;
  const sourceCapacity =
    source.sourceCapacity ?? NUCLEUS_DEFAULT_RESIDENT_SOURCE_CAPACITY;
  const targetDescriptor =
    targetFile === undefined
      ? defineNucleusTargetPublicationDescriptor(target)
      : await loadNucleusTargetPublicationDescriptor(targetFile);
  const prepared = await prepareNucleusCompilation({
    root: rootPath,
    entry: path.isAbsolute(entry)
      ? path.relative(rootPath, path.resolve(entry))
      : entry,
    residentSource: {
      ...source,
      sourceBase,
      sourceCapacity,
    },
  });
  if (prepared.residentSource === undefined) {
    throw new Error("prepared source image was not created");
  }

  const outcome = await runProofManifest(compilerManifestPath, {
    source: {
      image: prepared.residentSource,
      entry: {
        ...compilerEntry,
        sourceBase,
        sourceCapacity,
      },
    },
    checkObservations: false,
    nobj: {
      publication: targetDescriptor,
      materializeOnly: true,
      checkObservations: false,
    },
  });
  if (outcome.nobj === undefined) {
    throw new Error("resident compiler did not publish NOBJ");
  }
  if (output !== undefined) {
    const outputPath = path.resolve(output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, outcome.nobj.serialized);
  }

  return Object.freeze({
    root: rootPath,
    entry: path.isAbsolute(entry)
      ? path.relative(rootPath, path.resolve(entry))
      : entry,
    compilerManifest: compilerManifestPath,
    targetFile: targetFile === undefined ? undefined : path.resolve(targetFile),
    output: output === undefined ? undefined : path.resolve(output),
    sourceParts: prepared.sourceParts.length,
    sourceBytes: prepared.totalSourceBytes,
    nobj: outcome.nobj,
  });
}
