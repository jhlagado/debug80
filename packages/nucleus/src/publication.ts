import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  selectConcreteZ80AssemblerFlavour,
  type ConcreteZ80AssemblerFlavour,
} from "@jhlagado/z80-tool-services";

import {
  prepareNucleusCompilation,
  type NucleusResidentSourcePreparationOptions,
} from "./application.js";
import {
  runProofManifest,
  type NobjExecutionOutcome,
  type NucleusAtomProofMigrationMetadata,
} from "./proof.js";
import type { NucleusResidentCompilerEntrySymbols } from "./resident-compiler-entry.js";
import {
  defineNucleusTargetPublicationDescriptor,
  loadNucleusTargetPublicationDescriptor,
  type NucleusTargetPublicationDescriptor,
} from "./target-publication.js";
import type { NucleusGeneratedSourceSegment } from "./source-provenance.js";

const locatePackageRoot = (moduleUrl: string): string => {
  let current = path.dirname(fileURLToPath(moduleUrl));
  while (true) {
    if (existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("cannot locate Nucleus package root");
    }
    current = parent;
  }
};

const packageRoot = locatePackageRoot(import.meta.url);
const defaultFlatCompilerProofManifest = path.join(
  packageRoot,
  "proofs",
  "flat-target-z80-slice-proof.json",
);
const defaultAsmRoot = path.join(packageRoot, "asm");
const defaultPermanentAtomRoot = path.join(packageRoot, "atom-asm");
const NUCLEUS_DEFAULT_RESIDENT_SOURCE_BASE = 0x5000;
const NUCLEUS_DEFAULT_RESIDENT_SOURCE_CAPACITY = 0x0800;

export type NucleusCompilerAssemblerFlavour = ConcreteZ80AssemblerFlavour;

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

const pathInside = (root: string, target: string): string | undefined => {
  const relative = path.relative(root, target);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  return relative;
};

const listFiles = async (root: string): Promise<readonly string[]> => {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        result.push(child);
      }
    }
  };
  await visit(root);
  return result.sort();
};

const readPermanentAtomMigrationMetadata =
  async (): Promise<NucleusAtomProofMigrationMetadata> => {
    const proofSymbolMap: {
      original: string;
      permanentAtom: string;
    }[] = [];
    const proofLimitMap: {
      original: string;
      permanentAtom: string;
      value: number;
      loweredAtomValue: number;
    }[] = [];
    for (const file of await listFiles(defaultPermanentAtomRoot)) {
      const text = await readFile(file, "utf8");
      for (const line of text.split(/\n/)) {
        const global =
          /;@NUC-GLOBAL\s+(\S+)\s+PERMANENT\s+(\S+)/.exec(line);
        if (global !== null) {
          proofSymbolMap.push({
            original: global[1]!,
            permanentAtom: global[2]!,
          });
        }
        const limit =
          /;@ATOM-PROOF-LIMIT\s+(\S+)\s+([0-9]+)/.exec(line);
        if (limit !== null) {
          proofLimitMap.push({
            original: limit[1]!,
            permanentAtom: global?.[2] ?? limit[1]!,
            value: Number.parseInt(limit[2]!, 10),
            loweredAtomValue: 0,
          });
        }
      }
    }
    return Object.freeze({
      proofSymbolMap,
      proofLimitMap,
    });
  };

const proofAssemblerOptions = async (
  manifestPath: string,
  assembler: NucleusCompilerAssemblerFlavour,
): Promise<Parameters<typeof runProofManifest>[1]> => {
  if (assembler === "azm") return {};
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    readonly source?: unknown;
  };
  if (typeof manifest.source !== "string") {
    throw new Error("Atom proof assembly requires a manifest source path");
  }
  const sourcePath = path.resolve(path.dirname(manifestPath), manifest.source);
  const entry = pathInside(defaultAsmRoot, sourcePath);
  if (entry === undefined) {
    throw new Error(
      "Atom proof assembly requires a manifest source under the checked-in Nucleus asm tree",
    );
  }
  return Object.freeze({
    assembler: {
      flavour: "atom" as const,
      source: "permanent" as const,
      root: defaultPermanentAtomRoot,
      entry,
      maxInstructions: 700_000_000,
      maxCycles: 7_000_000_000,
      legacyOutputOrder: true,
    },
    atomMigration: await readPermanentAtomMigrationMetadata(),
  });
};

const selectNucleusCompilerAssembler = (
  assembler: string | undefined,
): NucleusCompilerAssemblerFlavour =>
  selectConcreteZ80AssemblerFlavour({
    requested: assembler,
    defaultFlavour: "azm",
    sourcePath: "Nucleus compiler proof image",
  });

export interface NucleusProofTargetPublicationOptions {
  readonly manifest: string;
  readonly output?: string;
  readonly assembler?: string;
}

export interface NucleusProofTargetPublication {
  readonly manifest: string;
  readonly output?: string;
  readonly assembler: NucleusCompilerAssemblerFlavour;
  readonly nobj: NobjExecutionOutcome;
  readonly sourceProvenance?: readonly NucleusGeneratedSourceSegment[];
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
  readonly assembler?: string;
}

export interface NucleusPreparedSourceTargetPublication {
  readonly root: string;
  readonly entry: string;
  readonly compilerManifest: string;
  readonly targetFile?: string;
  readonly output?: string;
  readonly assembler: NucleusCompilerAssemblerFlavour;
  readonly sourceParts: number;
  readonly sourcePartIdentities: readonly string[];
  readonly sourceBytes: number;
  readonly nobj: NobjExecutionOutcome;
  readonly sourceProvenance?: readonly NucleusGeneratedSourceSegment[];
}

export async function publishNucleusProofTarget({
  manifest,
  output,
  assembler,
}: NucleusProofTargetPublicationOptions): Promise<NucleusProofTargetPublication> {
  const selectedAssembler = selectNucleusCompilerAssembler(assembler);
  const manifestPath = path.resolve(manifest);
  const outcome = await runProofManifest(
    manifestPath,
    await proofAssemblerOptions(manifestPath, selectedAssembler),
  );
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
    assembler: selectedAssembler,
    nobj: outcome.nobj,
    ...(outcome.sourceProvenance === undefined
      ? {}
      : { sourceProvenance: outcome.sourceProvenance }),
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
  const assembler = selectNucleusCompilerAssembler(options.assembler);
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
    ...(await proofAssemblerOptions(compilerManifestPath, assembler)),
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
    assembler,
    sourceParts: prepared.sourceParts.length,
    sourcePartIdentities: prepared.project.parts.map(
      (part) => part.logicalIdentity,
    ),
    sourceBytes: prepared.totalSourceBytes,
    nobj: outcome.nobj,
    ...(outcome.sourceProvenance === undefined
      ? {}
      : { sourceProvenance: outcome.sourceProvenance }),
  });
}
