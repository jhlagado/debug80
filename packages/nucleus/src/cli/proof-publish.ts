#!/usr/bin/env node

import process from "node:process";

import {
  publishNucleusPreparedSourceTarget,
  publishNucleusProofTarget,
} from "../publication.js";
import {
  invokedDirectly,
  parseNucleusPublicationOptions,
  preparedSourcePublicationOptions,
  publicationJsonSummary,
  publicationTextSummary,
  validateNucleusPublicationOutputs,
  writeNucleusPublicationOutputs,
} from "./publication-cli.js";

const usage = `Usage: nucleus proof:publish [options] <proof.json | entry.nu> [output...]

Options:
  --assembler azm|atom   Assembler for proof images; default azm.
  --root DIR              Project root for entry.nu publication.
  --target FILE           Target publication descriptor for entry.nu publication.
  --compiler-proof FILE   Resident compiler proof image for entry.nu publication.
  --source-base N         Resident source byte base; default 0x5000.
  --source-capacity N     Resident source byte capacity; default 0x0800.
  --json                  Print machine-readable JSON.
  -o, --output FILE        Compatibility form for adding an output path.
  -h, --help              Show this help.

Output suffixes: .nobj .bin .hex .d8.json
Name output paths after the input. Each suffix selects one output format.
With no output path, the command publishes and summarizes without writing.

This development command either runs an executable Nucleus proof manifest or
prepares an entry .nu file, installs it into the current resident compiler proof
image, and publishes the committed NOBJ stream. It is a bridge to the final
target publication command while the resident compiler image is still proof
hosted.
`;

export async function runNucleusProofPublishCli(
  arguments_: readonly string[],
): Promise<number> {
  try {
    const options = parseNucleusPublicationOptions(arguments_, {
      positionalName: "input",
    });
    if (options.help) {
      process.stdout.write(usage);
      return 0;
    }
    if (options.input === undefined) throw new Error("input is required");
    const outputs = validateNucleusPublicationOutputs(options.outputPaths);
    const publishesPreparedSource =
      options.root !== undefined ||
      options.targetFile !== undefined ||
      options.compilerProof !== undefined ||
      options.sourceBase !== undefined ||
      options.sourceCapacity !== undefined ||
      !options.input.endsWith(".json");
    const publication = publishesPreparedSource
      ? await publishNucleusPreparedSourceTarget({
          ...preparedSourcePublicationOptions(options),
        })
      : await publishNucleusProofTarget({
          manifest: options.input,
          assembler: options.assembler,
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
      `nucleus proof:publish: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

if (invokedDirectly(import.meta.url)) {
  process.exitCode = await runNucleusProofPublishCli(process.argv.slice(2));
}
