#!/usr/bin/env node

import process from "node:process";

import { publishNucleusProofTarget } from "../publication.js";

const usage = `Usage: nucleus proof:publish [options] <proof.json>

Options:
  -o, --output FILE  Write the committed NOBJ bytes to FILE.
  --json            Print machine-readable JSON.
  -h, --help        Show this help.

This development command runs an executable Nucleus proof manifest, requires it
to publish a committed NOBJ target, and optionally writes that NOBJ stream to
disk. It is a bridge to the final target publication command while resident
source descriptors are still proof-owned.
`;

interface Options {
  readonly manifest?: string;
  readonly output?: string;
  readonly json: boolean;
  readonly help: boolean;
}

function optionValue(arguments_: readonly string[], index: number, name: string): string {
  const value = arguments_[index + 1];
  if (value === undefined) throw new Error(`${name} requires a value`);
  return value;
}

function parseArguments(arguments_: readonly string[]): Options {
  let output: string | undefined;
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
    if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    positional.push(argument);
  }

  if (positional.length > 1) throw new Error("only one proof manifest may be supplied");
  return Object.freeze({ manifest: positional[0], output, json, help });
}

function jsonSummary(
  publication: Awaited<ReturnType<typeof publishNucleusProofTarget>>,
): string {
  return `${JSON.stringify(
    {
      manifest: publication.manifest,
      output: publication.output,
      bytes: publication.nobj.serialized.length,
      records: publication.nobj.parsed.commit.recordCount,
      entryBank: publication.nobj.parsed.map.entryBank,
      entryAddress: publication.nobj.parsed.map.entryAddress,
      selectedBank: publication.nobj.selectedBank,
      runtimeStreams: publication.nobj.runtimeStreams,
    },
    null,
    2,
  )}\n`;
}

function textSummary(
  publication: Awaited<ReturnType<typeof publishNucleusProofTarget>>,
): string {
  return [
    `Nucleus published ${publication.nobj.serialized.length} NOBJ byte(s).`,
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
    if (options.manifest === undefined) throw new Error("proof manifest is required");
    const publication = await publishNucleusProofTarget({
      manifest: options.manifest,
      output: options.output,
    });
    process.stdout.write(options.json ? jsonSummary(publication) : textSummary(publication));
    return 0;
  } catch (error) {
    process.stderr.write(
      `nucleus proof:publish: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

process.exitCode = await main();
