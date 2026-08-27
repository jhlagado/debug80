#!/usr/bin/env node

import process from "node:process";

import {
  publishNucleusPreparedSourceTarget,
  publishNucleusProofTarget,
} from "../publication.js";
import {
  parseNucleusPublicationOptions,
  preparedSourcePublicationOptions,
  publicationJsonSummary,
  publicationTextSummary,
} from "./publication-cli.js";

const usage = `Usage: nucleus proof:publish [options] <proof.json | entry.nu>

Options:
  -o, --output FILE        Write the committed NOBJ bytes to FILE.
  --root DIR              Project root for entry.nu publication.
  --target FILE           Target publication descriptor for entry.nu publication.
  --compiler-proof FILE   Resident compiler proof image for entry.nu publication.
  --source-base N         Resident source byte base; default 0x5000.
  --source-capacity N     Resident source byte capacity; default 0x0800.
  --json                  Print machine-readable JSON.
  -h, --help              Show this help.

This development command either runs an executable Nucleus proof manifest or
prepares an entry .nu file, installs it into the current resident compiler proof
image, and publishes the committed NOBJ stream. It is a bridge to the final
target publication command while the resident compiler image is still proof
hosted.
`;

async function main(): Promise<number> {
  try {
    const options = parseNucleusPublicationOptions(process.argv.slice(2), {
      positionalName: "input",
    });
    if (options.help) {
      process.stdout.write(usage);
      return 0;
    }
    if (options.input === undefined) throw new Error("input is required");
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
          output: options.output,
        });
    process.stdout.write(
      options.json
        ? publicationJsonSummary(publication)
        : publicationTextSummary(publication),
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `nucleus proof:publish: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

process.exitCode = await main();
