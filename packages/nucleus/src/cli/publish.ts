#!/usr/bin/env node

import process from "node:process";

import { publishNucleusPreparedSourceTarget } from "../publication.js";

const usage = `Usage: nucleus publish [options] <entry.nu>

Options:
  -o, --output FILE        Write the committed NOBJ bytes to FILE.
  --root DIR              Project root; default current directory.
  --target FILE           Target publication descriptor.
  --compiler-proof FILE   Resident compiler proof image for this bridge.
  --source-base N         Resident source byte base; default 0x5000.
  --source-capacity N     Resident source byte capacity; default 0x0800.
  --json                  Print machine-readable JSON.
  -h, --help              Show this help.

This development command prepares a Nucleus entry source file, installs it into
the current resident compiler image, and publishes the committed NOBJ stream.
`;

interface Options {
  readonly entry?: string;
  readonly output?: string;
  readonly root?: string;
  readonly targetFile?: string;
  readonly compilerProof?: string;
  readonly sourceBase?: number;
  readonly sourceCapacity?: number;
  readonly json: boolean;
  readonly help: boolean;
}

function optionValue(arguments_: readonly string[], index: number, name: string): string {
  const value = arguments_[index + 1];
  if (value === undefined) throw new Error(`${name} requires a value`);
  return value;
}

function parseNumber(value: string, name: string): number {
  const parsed = /^0x[0-9a-f]+$/i.test(value)
    ? Number.parseInt(value.slice(2), 16)
    : /^[0-9]+$/.test(value)
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseArguments(arguments_: readonly string[]): Options {
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

  if (positional.length > 1) throw new Error("only one entry source may be supplied");
  return Object.freeze({
    entry: positional[0],
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

function jsonSummary(
  publication: Awaited<ReturnType<typeof publishNucleusPreparedSourceTarget>>,
): string {
  return `${JSON.stringify(
    {
      root: publication.root,
      entry: publication.entry,
      compilerManifest: publication.compilerManifest,
      targetFile: publication.targetFile,
      output: publication.output,
      sourceParts: publication.sourceParts,
      sourceBytes: publication.sourceBytes,
      bytes: publication.nobj.serialized.length,
      records: publication.nobj.parsed.commit.recordCount,
      imageFill: publication.nobj.parsed.begin.imageFill,
      entryBank: publication.nobj.parsed.map.entryBank,
      entryAddress: publication.nobj.parsed.map.entryAddress,
      selectedBank: publication.nobj.selectedBank,
    },
    null,
    2,
  )}\n`;
}

function textSummary(
  publication: Awaited<ReturnType<typeof publishNucleusPreparedSourceTarget>>,
): string {
  return [
    `Nucleus published ${publication.nobj.serialized.length} NOBJ byte(s).`,
    `source=${publication.entry}`,
    `parts=${publication.sourceParts}`,
    `sourceBytes=${publication.sourceBytes}`,
    `records=${publication.nobj.parsed.commit.recordCount}`,
    `entry=${publication.nobj.parsed.map.entryBank}:${publication.nobj.parsed.map.entryAddress}`,
    ...(publication.output === undefined ? [] : [`output=${publication.output}`]),
  ].join("\n") + "\n";
}

async function main(): Promise<number> {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage);
      return 0;
    }
    if (options.entry === undefined) throw new Error("entry source is required");
    const publication = await publishNucleusPreparedSourceTarget({
      root: options.root,
      entry: options.entry,
      targetFile: options.targetFile,
      compilerManifest: options.compilerProof,
      source:
        options.sourceBase === undefined &&
        options.sourceCapacity === undefined
          ? undefined
          : {
              sourceBase: options.sourceBase ?? 0x5000,
              sourceCapacity: options.sourceCapacity,
            },
      output: options.output,
    });
    process.stdout.write(options.json ? jsonSummary(publication) : textSummary(publication));
    return 0;
  } catch (error) {
    process.stderr.write(
      `nucleus publish: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

process.exitCode = await main();
