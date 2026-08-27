import { realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { materializeNobj } from "../nobj.js";
import {
  publishNucleusPreparedSourceTarget,
  publishNucleusProofTarget,
} from "../publication.js";

export type NucleusPublicationOutputFormat = "nobj" | "bin" | "hex" | "d8";

export interface NucleusPublicationOutputSelection {
  readonly format: NucleusPublicationOutputFormat;
  readonly path: string;
}

export interface NucleusPublicationCliOptions {
  readonly input?: string;
  readonly output?: string;
  readonly outputPaths: readonly string[];
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

export type NucleusPreparedSourcePublication =
  Awaited<ReturnType<typeof publishNucleusPreparedSourceTarget>>;

const hex2 = (value: number): string =>
  value.toString(16).toUpperCase().padStart(2, "0");

const intelRecord = (
  address: number,
  type: number,
  bytes: readonly number[],
): string => {
  const values = [bytes.length, address >>> 8, address & 0xff, type, ...bytes];
  const checksum = (-values.reduce((sum, byte) => sum + byte, 0)) & 0xff;
  return `:${values.map(hex2).join("")}${hex2(checksum)}`;
};

export function writeNucleusIntelHex(
  base: number,
  bytes: Uint8Array,
  { lineEnding = "\n" }: { readonly lineEnding?: string } = {},
): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    lines.push(
      intelRecord(base + offset, 0, [
        ...bytes.slice(offset, offset + 16),
      ]),
    );
  }
  lines.push(":00000001FF");
  return `${lines.join(lineEnding)}${lineEnding}`;
}

const publicationInput = (
  publication: NucleusPublication,
): string | undefined =>
  "entry" in publication ? publication.entry : publication.manifest;

export function writeNucleusD8(
  publication: NucleusPublication,
): string {
  const parsed = publication.nobj.parsed;
  const bank = parsed.map.banks[0];
  if (parsed.begin.banked || bank === undefined) {
    throw new Error("D8 output currently requires a flat NOBJ target");
  }
  const input = publicationInput(publication);
  const fileList = input === undefined ? [] : [input];
  const map = {
    format: "d8-debug-map",
    version: 1,
    arch: "z80",
    addressWidth: 16,
    endianness: "little",
    files: Object.fromEntries(fileList.map((file) => [file, {}])),
    segments: [{
      start: parsed.begin.imageBase,
      end: parsed.begin.imageBase + bank.usedLength,
    }],
    fileList,
    symbols: [],
    generator: {
      name: "nucleus",
      tool: "nucleus",
      inputs: input === undefined ? {} : { entry: input },
      entryAddress: parsed.map.entryAddress,
    },
  };
  return `${JSON.stringify(map, null, 2)}\n`;
}

const optionValue = (
  arguments_: readonly string[],
  index: number,
  name: string,
): string => {
  const value = arguments_[index + 1];
  if (value === undefined) throw new Error(`${name} requires a value`);
  return value;
};

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

export function parseNucleusPublicationOptions(
  arguments_: readonly string[],
  options: {
    readonly positionalName: string;
  },
): NucleusPublicationCliOptions {
  const outputPaths: string[] = [];
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
      outputPaths.push(optionValue(arguments_, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--root") {
      root = optionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--target") {
      targetFile = optionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--compiler-proof") {
      compilerProof = optionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--source-base") {
      sourceBase = parseNumber(optionValue(arguments_, index, argument), argument);
      index += 1;
      continue;
    }
    if (argument === "--source-capacity") {
      sourceCapacity = parseNumber(optionValue(arguments_, index, argument), argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    positional.push(argument);
  }

  if (positional.length > 1) {
    outputPaths.push(...positional.slice(1));
  }
  return Object.freeze({
    input: positional[0],
    output: outputPaths[0],
    outputPaths,
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
    source:
      options.sourceBase === undefined && options.sourceCapacity === undefined
        ? undefined
        : {
            sourceBase: options.sourceBase ?? 0x5000,
            sourceCapacity: options.sourceCapacity,
          },
  };
}

const outputFormat = (filename: string): NucleusPublicationOutputFormat => {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".nobj")) return "nobj";
  if (lower.endsWith(".bin")) return "bin";
  if (lower.endsWith(".hex")) return "hex";
  if (lower.endsWith(".d8.json")) return "d8";
  if (lower.endsWith(".com")) {
    throw new Error("Nucleus COM output is not implemented");
  }
  if (lower.endsWith(".lst")) {
    throw new Error("Nucleus listing output is not implemented");
  }
  throw new Error(`output path has no recognized format suffix: ${filename}`);
};

export function validateNucleusPublicationOutputs(
  filenames: readonly string[],
): readonly NucleusPublicationOutputSelection[] {
  const formats = new Set<NucleusPublicationOutputFormat>();
  const paths = new Set<string>();
  return filenames.map((filename) => {
    const format = outputFormat(filename);
    if (formats.has(format)) {
      throw new Error(`output format is repeated: ${format}`);
    }
    formats.add(format);
    const selectedPath = path.resolve(filename);
    const key =
      process.platform === "win32" ? selectedPath.toLowerCase() : selectedPath;
    if (paths.has(key)) throw new Error(`output path is repeated: ${filename}`);
    paths.add(key);
    return Object.freeze({ format, path: selectedPath });
  });
}

const materializedFlatBytes = (publication: NucleusPublication): Uint8Array => {
  const materialized = materializeNobj(publication.nobj.parsed);
  const flat = materialized.flatImage;
  const bank = publication.nobj.parsed.map.banks[0];
  if (flat === undefined || bank === undefined) {
    throw new Error("BIN/HEX output requires a flat NOBJ target");
  }
  return flat.slice(0, bank.usedLength);
};

const selectedOutputBytes = (
  publication: NucleusPublication,
  selection: NucleusPublicationOutputSelection,
): Uint8Array | string => {
  switch (selection.format) {
    case "nobj":
      return publication.nobj.serialized;
    case "bin":
      return materializedFlatBytes(publication);
    case "hex":
      return writeNucleusIntelHex(
        publication.nobj.parsed.begin.imageBase,
        materializedFlatBytes(publication),
      );
    case "d8":
      return writeNucleusD8(publication);
  }
};

export async function writeNucleusPublicationOutputs(
  publication: NucleusPublication,
  selections: readonly NucleusPublicationOutputSelection[],
): Promise<readonly string[]> {
  const committed: string[] = [];
  for (const selection of selections) {
    await mkdir(path.dirname(selection.path), { recursive: true });
    await writeFile(selection.path, selectedOutputBytes(publication, selection));
    committed.push(selection.path);
  }
  return Object.freeze(committed);
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
        ? { manifest: publication.manifest }
        : {
            root: publication.root,
            entry: publication.entry,
            compilerManifest: publication.compilerManifest,
            targetFile: publication.targetFile,
            sourceParts: publication.sourceParts,
            sourceBytes: publication.sourceBytes,
          }),
      output: committedOutputs.length === 1 ? committedOutputs[0] : publication.output,
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
  return [
    `Nucleus published ${publication.nobj.serialized.length} NOBJ byte(s).`,
    ...("entry" in publication
      ? [
          `source=${publication.entry}`,
          `parts=${publication.sourceParts}`,
          `sourceBytes=${publication.sourceBytes}`,
        ]
      : []),
    `records=${publication.nobj.parsed.commit.recordCount}`,
    `entry=${publication.nobj.parsed.map.entryBank}:${publication.nobj.parsed.map.entryAddress}`,
    ...committedOutputs.map((output) => `output=${output}`),
  ].join("\n") + "\n";
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
