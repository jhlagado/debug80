import {
  publishNucleusPreparedSourceTarget,
  publishNucleusProofTarget,
} from "../publication.js";

export interface NucleusPublicationCliOptions {
  readonly input?: string;
  readonly output?: string;
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
  let output: string | undefined;
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
      output = optionValue(arguments_, index, argument);
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
    throw new Error(`only one ${options.positionalName} may be supplied`);
  }
  return Object.freeze({
    input: positional[0],
    output,
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
    output: options.output,
  };
}

export function publicationJsonSummary(publication: NucleusPublication): string {
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
      output: publication.output,
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

export function publicationTextSummary(publication: NucleusPublication): string {
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
    ...(publication.output === undefined ? [] : [`output=${publication.output}`]),
  ].join("\n") + "\n";
}
