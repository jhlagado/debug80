import { realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  publishOutputFiles,
  readCliOptionValue,
  selectConcreteZ80AssemblerFlavour,
  splitPositiveOutputArguments,
  validatePositiveOutputSelections,
  type OutputFormatSuffix,
  type PublishOutputFilesOptions,
} from "@jhlagado/z80-tool-services";

import {
  materializedNucleusFlatBytes,
  materializedNucleusCpmCom,
  publishNucleusPreparedSourceTarget,
  publishNucleusProofTarget,
  writeNucleusIntelHex,
} from "../publication.js";
import { renderNucleusD8 } from "../source-provenance.js";

export type NucleusPublicationOutputFormat = "nobj" | "bin" | "com" | "hex" | "d8";

export interface NucleusPublicationOutputSelection {
  readonly format: NucleusPublicationOutputFormat;
  readonly path: string;
}

const NUCLEUS_OUTPUT_FORMATS: readonly OutputFormatSuffix<NucleusPublicationOutputFormat>[] =
  Object.freeze([
    { format: "d8", suffix: ".d8.json" },
    { format: "nobj", suffix: ".nobj" },
    { format: "bin", suffix: ".bin" },
    { format: "hex", suffix: ".hex" },
    { format: "com", suffix: ".com" },
    {
      format: "nobj",
      suffix: ".lst",
      message: "Nucleus listing output is not implemented",
    },
  ]);

export interface NucleusPublicationCliOptions {
  readonly input?: string;
  readonly output?: string;
  readonly outputPaths: readonly string[];
  readonly assembler?: "azm" | "atom";
  readonly root?: string;
  readonly targetFile?: string;
  readonly compilerProof?: string;
  readonly sourceBase?: number;
  readonly sourceCapacity?: number;
  readonly json: boolean;
  readonly help: boolean;
}

export type NucleusPublication =
  | Awaited<ReturnType<typeof publishNucleusProofTarget>>
  | Awaited<ReturnType<typeof publishNucleusPreparedSourceTarget>>;

export type NucleusPreparedSourcePublication = Awaited<
  ReturnType<typeof publishNucleusPreparedSourceTarget>
>;

export { writeNucleusIntelHex } from "../publication.js";

export const writeNucleusD8 = renderNucleusD8;

const parseNumber = (value: string, name: string): number => {
  const parsed = /^0x[0-9a-f]+$/i.test(value)
    ? Number.parseInt(value.slice(2), 16)
    : /^[0-9]+$/.test(value)
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
};

const parseAssembler = (value: string): "azm" | "atom" => {
  try {
    return selectConcreteZ80AssemblerFlavour({
      requested: value,
      sourcePath: "Nucleus compiler proof image",
    });
  } catch {
    throw new Error("--assembler must select Atom or AZM");
  }
};

export function parseNucleusPublicationOptions(
  arguments_: readonly string[],
  options: {
    readonly positionalName: string;
  },
): NucleusPublicationCliOptions {
  const optionOutputs: string[] = [];
  let assembler: "azm" | "atom" | undefined;
  let root: string | undefined;
  let targetFile: string | undefined;
  let compilerProof: string | undefined;
  let sourceBase: number | undefined;
  let sourceCapacity: number | undefined;
  let json = false;
  let help = false;
  const positional: string[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "-h" || argument === "--help") {
      help = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "-o" || argument === "--output") {
      optionOutputs.push(readCliOptionValue(arguments_, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--assembler") {
      assembler = parseAssembler(readCliOptionValue(arguments_, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--root") {
      root = readCliOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--target") {
      targetFile = readCliOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--compiler-proof") {
      compilerProof = readCliOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--source-base") {
      sourceBase = parseNumber(
        readCliOptionValue(arguments_, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === "--source-capacity") {
      sourceCapacity = parseNumber(
        readCliOptionValue(arguments_, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument.startsWith("-"))
      throw new Error(`unknown option: ${argument}`);
    positional.push(argument);
  }

  const outputs = splitPositiveOutputArguments({
    positionals: positional,
    optionOutputs,
  });
  return Object.freeze({
    input: outputs.input,
    output: outputs.output,
    outputPaths: outputs.outputPaths,
    assembler,
    root,
    targetFile,
    compilerProof,
    sourceBase,
    sourceCapacity,
    json,
    help,
  });
}

export function preparedSourcePublicationOptions(
  options: NucleusPublicationCliOptions,
): Parameters<typeof publishNucleusPreparedSourceTarget>[0] {
  if (options.input === undefined) throw new Error("entry source is required");
  return {
    root: options.root,
    entry: options.input,
    targetFile: options.targetFile,
    compilerManifest: options.compilerProof,
    assembler: options.assembler,
    source:
      options.sourceBase === undefined && options.sourceCapacity === undefined
        ? undefined
        : {
            sourceBase: options.sourceBase ?? 0x5000,
            sourceCapacity: options.sourceCapacity,
          },
  };
}

export function validateNucleusPublicationOutputs(
  filenames: readonly string[],
): readonly NucleusPublicationOutputSelection[] {
  return validatePositiveOutputSelections({
    filenames,
    formats: NUCLEUS_OUTPUT_FORMATS,
  });
}

const selectedOutputBytes = (
  publication: NucleusPublication,
  selection: NucleusPublicationOutputSelection,
): Uint8Array | string => {
  switch (selection.format) {
    case "nobj":
      return publication.nobj.serialized;
    case "bin":
      return materializedNucleusFlatBytes(publication);
    case "com":
      return materializedNucleusCpmCom(publication);
    case "hex":
      return writeNucleusIntelHex(
        publication.nobj.parsed.begin.imageBase,
        materializedNucleusFlatBytes(publication),
      );
    case "d8":
      return writeNucleusD8(publication);
  }
};

export async function writeNucleusPublicationOutputs(
  publication: NucleusPublication,
  selections: readonly NucleusPublicationOutputSelection[],
  options: PublishOutputFilesOptions = {},
): Promise<readonly string[]> {
  if (selections.length === 0) return Object.freeze([]);
  return publishOutputFiles(
    selections.map((selection) => ({
      path: selection.path,
      bytes: selectedOutputBytes(publication, selection),
    })),
    { ...options, tagPrefix: options.tagPrefix ?? "nucleus" },
  );
}

export function publicationJsonSummary(
  publication: NucleusPublication,
  committedOutputs: readonly string[] = publication.output === undefined
    ? []
    : [publication.output],
): string {
  return `${JSON.stringify(
    {
      ...("manifest" in publication
        ? { manifest: publication.manifest, assembler: publication.assembler }
        : {
            root: publication.root,
            entry: publication.entry,
            assembler: publication.assembler,
            compilerManifest: publication.compilerManifest,
            targetFile: publication.targetFile,
            sourceParts: publication.sourceParts,
            sourceBytes: publication.sourceBytes,
          }),
      output:
        committedOutputs.length === 1
          ? committedOutputs[0]
          : publication.output,
      ...(committedOutputs.length > 0 ? { outputs: committedOutputs } : {}),
      bytes: publication.nobj.serialized.length,
      records: publication.nobj.parsed.commit.recordCount,
      imageFill: publication.nobj.parsed.begin.imageFill,
      entryBank: publication.nobj.parsed.map.entryBank,
      entryAddress: publication.nobj.parsed.map.entryAddress,
      selectedBank: publication.nobj.selectedBank,
      runtimeStreams: publication.nobj.runtimeStreams,
    },
    null,
    2,
  )}\n`;
}

export function publicationTextSummary(
  publication: NucleusPublication,
  committedOutputs: readonly string[] = publication.output === undefined
    ? []
    : [publication.output],
): string {
  return (
    [
      `Nucleus published ${publication.nobj.serialized.length} NOBJ byte(s).`,
      ...("entry" in publication
        ? [
            `source=${publication.entry}`,
            `parts=${publication.sourceParts}`,
            `sourceBytes=${publication.sourceBytes}`,
          ]
        : []),
      `assembler=${publication.assembler}`,
      `records=${publication.nobj.parsed.commit.recordCount}`,
      `entry=${publication.nobj.parsed.map.entryBank}:${publication.nobj.parsed.map.entryAddress}`,
      ...committedOutputs.map((output) => `output=${output}`),
    ].join("\n") + "\n"
  );
}

export function invokedDirectly(moduleUrl: string): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}
