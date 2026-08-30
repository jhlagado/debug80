#!/usr/bin/env node

import process from "node:process";

import { isZ80Word, readCliOptionValue } from "@jhlagado/z80-tool-services";
import { SourcePreparationError } from "@jhlagado/z80-tool-services/source-preparation";

import { prepareNucleusCompilation } from "../application.js";
import { invokedDirectly } from "./publication-cli.js";

const usage = `Usage: nucleus source:prepare [options] <entry.nu>

Options:
  --root DIR       Project root. Defaults to the current directory.
  --runtime-services resident|host-streams
                   Runtime service link profile. Defaults to resident.
  --stub-base WORD Host-stream stub base, required for --runtime-services host-streams.
  --json           Print machine-readable JSON.
  -h, --help       Show this help.

The command resolves leading //% import directives through the shared Z80
source-preparation services and prints the ordered compiler input. It does not
compile, assemble, or publish output.
`;

interface Options {
  readonly root: string;
  readonly entry?: string;
  readonly runtimeServices: "resident" | "host-streams";
  readonly stubBase?: number;
  readonly json: boolean;
  readonly help: boolean;
}

function parseWord(value: string, name: string): number {
  const parsed = /^0x[0-9a-f]+$/i.test(value)
    ? Number.parseInt(value.slice(2), 16)
    : Number.parseInt(value, 10);
  if (!isZ80Word(parsed)) {
    throw new Error(`${name} must be a 0..65535 word`);
  }
  return parsed;
}

function parseArguments(arguments_: readonly string[]): Options {
  let root = process.cwd();
  let runtimeServices: Options["runtimeServices"] = "resident";
  let stubBase: number | undefined;
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
      root = readCliOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--runtime-services") {
      const value = readCliOptionValue(arguments_, index, argument);
      if (value !== "resident" && value !== "host-streams") {
        throw new Error("--runtime-services must be resident or host-streams");
      }
      runtimeServices = value;
      index += 1;
      continue;
    }
    if (argument === "--stub-base") {
      stubBase = parseWord(
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

  if (positional.length > 1)
    throw new Error("only one entry source may be supplied");
  if (runtimeServices === "host-streams" && stubBase === undefined) {
    throw new Error(
      "--stub-base is required for --runtime-services host-streams",
    );
  }
  if (runtimeServices === "resident" && stubBase !== undefined) {
    throw new Error("--stub-base requires --runtime-services host-streams");
  }
  return Object.freeze({
    root,
    entry: positional[0],
    runtimeServices,
    stubBase,
    json,
    help,
  });
}

function jsonSummary(
  prepared: Awaited<ReturnType<typeof prepareNucleusCompilation>>,
): string {
  return `${JSON.stringify(
    {
      parts: prepared.sourceParts.map((part, index) => ({
        ordinal: part.ordinal,
        bank: prepared.partBanks[index],
        logicalIdentity: part.diagnosticName,
        bytes: part.bytes.length,
      })),
      partBanks: prepared.partBanks,
      totalSourceBytes: prepared.totalSourceBytes,
      retainedPathBytes: prepared.project.retainedPathBytes,
      runtime: {
        serviceKind: prepared.runtime.serviceKind,
        vectorBytes: prepared.runtime.vectorBytes.length,
        hostStreams:
          prepared.runtime.hostStreams === undefined
            ? undefined
            : {
                stubBase: prepared.runtime.hostStreams.stubBase,
                stubSpacing: prepared.runtime.hostStreams.stubSpacing,
                stubs: prepared.runtime.hostStreams.stubs.map((stub) => ({
                  service: stub.service,
                  address: stub.address,
                  bytes: stub.bytes.length,
                })),
              },
      },
    },
    null,
    2,
  )}\n`;
}

function textSummary(
  prepared: Awaited<ReturnType<typeof prepareNucleusCompilation>>,
): string {
  const lines = [
    `Nucleus prepared ${prepared.sourceParts.length} part(s), ${prepared.totalSourceBytes} source byte(s).`,
  ];
  for (const [index, part] of prepared.sourceParts.entries()) {
    lines.push(
      `${part.ordinal}\tbank=${prepared.partBanks[index]}\tbytes=${part.bytes.length}\t${part.diagnosticName}`,
    );
  }
  lines.push(`runtime\tservices=${prepared.runtime.serviceKind}`);
  if (prepared.runtime.hostStreams !== undefined) {
    lines.push(
      `runtime\tstubBase=${prepared.runtime.hostStreams.stubBase}\tstubs=${prepared.runtime.hostStreams.stubs.length}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export async function runNucleusPrepareCli(
  arguments_: readonly string[],
): Promise<number> {
  try {
    const options = parseArguments(arguments_);
    if (options.help) {
      process.stdout.write(usage);
      return 0;
    }
    if (options.entry === undefined)
      throw new Error("entry source is required");
    const prepared = await prepareNucleusCompilation({
      root: options.root,
      entry: options.entry,
      runtime: {
        services:
          options.runtimeServices === "resident"
            ? { kind: "resident" }
            : { kind: "host-streams", stubBase: options.stubBase! },
      },
    });
    process.stdout.write(
      options.json ? jsonSummary(prepared) : textSummary(prepared),
    );
    return 0;
  } catch (error) {
    if (error instanceof SourcePreparationError) {
      const location =
        error.location === undefined
          ? ""
          : `:${String(error.location.line ?? "?")}:${String(error.location.column ?? "?")}`;
      process.stderr.write(
        `nucleus source:prepare${location}: ${error.message}\n`,
      );
      return 1;
    }
    process.stderr.write(
      `nucleus source:prepare: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

if (invokedDirectly(import.meta.url)) {
  process.exitCode = await runNucleusPrepareCli(process.argv.slice(2));
}
