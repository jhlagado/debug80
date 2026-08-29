#!/usr/bin/env node

import process from "node:process";

import { publishNucleusPreparedSourceTarget } from "../publication.js";
import {
  invokedDirectly,
  parseNucleusPublicationOptions,
  preparedSourcePublicationOptions,
  publicationJsonSummary,
  publicationTextSummary,
  validateNucleusPublicationOutputs,
  writeNucleusPublicationOutputs,
} from "./publication-cli.js";

const usage = `Usage: nucleus publish [options] <entry.nu> [output...]

Options:
  --root DIR              Project root; default current directory.
  --target FILE           Target publication descriptor.
  --compiler-proof FILE   Resident compiler proof image for this bridge.
  --source-base N         Resident source byte base; default 0x5000.
  --source-capacity N     Resident source byte capacity; default 0x0800.
  --json                  Print machine-readable JSON.
  -o, --output FILE        Compatibility form for adding an output path.
  -h, --help              Show this help.

Output suffixes: .nobj .bin .hex .d8.json
Name output paths after the input. Each suffix selects one output format.
With no output path, the command publishes and summarizes without writing.

This development command prepares a Nucleus entry source file, installs it into
the current resident compiler image, and publishes the committed NOBJ stream.
`;

export async function runNucleusPublishCli(
  arguments_: readonly string[],
): Promise<number> {
  try {
    const options = parseNucleusPublicationOptions(arguments_, {
      positionalName: "entry source",
    });
    if (options.help) {
      process.stdout.write(usage);
      return 0;
    }
    const outputs = validateNucleusPublicationOutputs(options.outputPaths);
    const publication = await publishNucleusPreparedSourceTarget({
      ...preparedSourcePublicationOptions(options),
    });
    const committedOutputs = await writeNucleusPublicationOutputs(
      publication,
      outputs,
    );
    process.stdout.write(
      options.json
        ? publicationJsonSummary(publication, committedOutputs)
        : publicationTextSummary(publication, committedOutputs),
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `nucleus publish: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

if (invokedDirectly(import.meta.url)) {
  process.exitCode = await runNucleusPublishCli(process.argv.slice(2));
}
