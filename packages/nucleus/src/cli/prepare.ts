#!/usr/bin/env node

import process from "node:process";

import { SourcePreparationError } from "@jhlagado/z80-tool-services/source-preparation";

import { prepareNucleusCompilation } from "../application.js";

const usage = `Usage: nucleus source:prepare [options] <entry.nu>

Options:
  --root DIR       Project root. Defaults to the current directory.
  --json           Print machine-readable JSON.
  -h, --help       Show this help.

The command resolves leading //% import directives through the shared Z80
source-preparation services and prints the ordered compiler input. It does not
compile, assemble, or publish output.
`;

interface Options {
  readonly root: string;
  readonly entry?: string;
  readonly json: boolean;
  readonly help: boolean;
}

function optionValue(arguments_: readonly string[], index: number, name: string): string {
  const value = arguments_[index + 1];
  if (value === undefined) throw new Error(`${name} requires a value`);
  return value;
}

function parseArguments(arguments_: readonly string[]): Options {
  let root = process.cwd();
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
    if (argument === "--root") {
      root = optionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    positional.push(argument);
  }

  if (positional.length > 1) throw new Error("only one entry source may be supplied");
  return Object.freeze({ root, entry: positional[0], json, help });
}

function jsonSummary(prepared: Awaited<ReturnType<typeof prepareNucleusCompilation>>): string {
  return `${JSON.stringify({
    parts: prepared.sourceParts.map((part, index) => ({
      ordinal: part.ordinal,
      bank: prepared.partBanks[index],
      logicalIdentity: part.diagnosticName,
      bytes: part.bytes.length,
    })),
    partBanks: prepared.partBanks,
    totalSourceBytes: prepared.totalSourceBytes,
    retainedPathBytes: prepared.project.retainedPathBytes,
  }, null, 2)}\n`;
}

function textSummary(prepared: Awaited<ReturnType<typeof prepareNucleusCompilation>>): string {
  const lines = [
    `Nucleus prepared ${prepared.sourceParts.length} part(s), ${prepared.totalSourceBytes} source byte(s).`,
  ];
  for (const [index, part] of prepared.sourceParts.entries()) {
    lines.push(`${part.ordinal}\tbank=${prepared.partBanks[index]}\tbytes=${part.bytes.length}\t${part.diagnosticName}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<number> {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage);
      return 0;
    }
    if (options.entry === undefined) throw new Error("entry source is required");
    const prepared = await prepareNucleusCompilation({
      root: options.root,
      entry: options.entry,
    });
    process.stdout.write(options.json ? jsonSummary(prepared) : textSummary(prepared));
    return 0;
  } catch (error) {
    if (error instanceof SourcePreparationError) {
      const location = error.location === undefined
        ? ""
        : `:${String(error.location.line ?? "?")}:${String(error.location.column ?? "?")}`;
      process.stderr.write(`nucleus source:prepare${location}: ${error.message}\n`);
      return 1;
    }
    process.stderr.write(`nucleus source:prepare: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

process.exitCode = await main();
