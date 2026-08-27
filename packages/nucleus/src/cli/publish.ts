#!/usr/bin/env node

import process from "node:process";

import { publishNucleusPreparedSourceTarget } from "../publication.js";
import {
  parseNucleusPublicationOptions,
  preparedSourcePublicationOptions,
  publicationJsonSummary,
  publicationTextSummary,
} from "./publication-cli.js";

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

async function main(): Promise<number> {
  try {
    const options = parseNucleusPublicationOptions(process.argv.slice(2), {
      positionalName: "entry source",
    });
    if (options.help) {
      process.stdout.write(usage);
      return 0;
    }
    const publication = await publishNucleusPreparedSourceTarget({
      ...preparedSourcePublicationOptions(options),
    });
    process.stdout.write(
      options.json
        ? publicationJsonSummary(publication)
        : publicationTextSummary(publication),
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `nucleus publish: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

process.exitCode = await main();
