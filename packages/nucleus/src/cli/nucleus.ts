#!/usr/bin/env node

import process from "node:process";

import { invokedDirectly } from "./publication-cli.js";
import { runNucleusPrepareCli } from "./prepare.js";
import { runNucleusProofPublishCli } from "./proof-publish.js";
import { runNucleusPublishCli } from "./publish.js";

const usage = `Usage: nucleus <command> [options]

Commands:
  prepare        Resolve source parts and print the prepared compiler input.
  publish        Publish NOBJ from an entry .nu source file.
  proof:publish  Run or publish through proof/debug manifests.

Use "nucleus <command> --help" for command-specific options.
`;

export async function runNucleusCli(arguments_: readonly string[]): Promise<number> {
  const [command, ...rest] = arguments_;
  if (command === undefined || command === "-h" || command === "--help") {
    process.stdout.write(usage);
    return 0;
  }
  if (command === "prepare" || command === "source:prepare") {
    return runNucleusPrepareCli(rest);
  }
  if (command === "publish" || command === "publish:nobj") {
    return runNucleusPublishCli(rest);
  }
  if (command === "proof:publish") {
    return runNucleusProofPublishCli(rest);
  }
  process.stderr.write(`nucleus: unknown command ${command}\n`);
  process.stderr.write(usage);
  return 1;
}

if (invokedDirectly(import.meta.url)) {
  process.exitCode = await runNucleusCli(process.argv.slice(2));
}
