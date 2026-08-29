#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanAssembly, writeTranslatedTree } from "./atom-migration-dry-run.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const defaultAsmRoot = path.join(packageRoot, "asm");
const defaultProofRoot = path.join(packageRoot, "proofs");
const defaultOut = path.join(packageRoot, "atom-asm");

function parseArgs(argv) {
  const options = {
    asmRoot: defaultAsmRoot,
    proofRoot: defaultProofRoot,
    out: defaultOut,
    mode: "check",
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--asm-root") {
      options.asmRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--proof-root") {
      options.proofRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--out") {
      options.out = path.resolve(argv[++index] ?? "");
    } else if (arg === "--check") {
      options.mode = "check";
    } else if (arg === "--write") {
      options.mode = "write";
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown option ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node packages/nucleus/scripts/atom-migration-materialize.mjs [options]

Options:
  --asm-root DIR    AZM assembly tree to translate. Defaults to packages/nucleus/asm.
  --proof-root DIR  Proof manifest tree to scan. Defaults to packages/nucleus/proofs.
  --out DIR         Permanent Atom assembly tree. Defaults to packages/nucleus/atom-asm.
  --check           Verify --out matches generated permanent Atom source. Default.
  --write           Replace --out with generated permanent Atom source.
  --json            Print JSON instead of text.
  --help            Show this help.
`);
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  };
  visit(root);
  return files.sort();
}

function compareTrees(expectedRoot, actualRoot) {
  if (!existsSync(actualRoot)) {
    return [Object.freeze({
      code: "missing-tree",
      file: ".",
      message: `${actualRoot} does not exist`,
    })];
  }
  if (!statSync(actualRoot).isDirectory()) {
    return [Object.freeze({
      code: "not-directory",
      file: ".",
      message: `${actualRoot} is not a directory`,
    })];
  }
  const expected = listFiles(expectedRoot);
  const actual = listFiles(actualRoot);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const differences = [];
  for (const file of expected) {
    if (!actualSet.has(file)) {
      differences.push(Object.freeze({
        code: "missing-file",
        file,
        message: `${file} is missing`,
      }));
      continue;
    }
    const expectedBytes = readFileSync(path.join(expectedRoot, file));
    const actualBytes = readFileSync(path.join(actualRoot, file));
    if (!expectedBytes.equals(actualBytes)) {
      differences.push(Object.freeze({
        code: "changed-file",
        file,
        message: `${file} differs from generated permanent Atom source`,
      }));
    }
  }
  for (const file of actual) {
    if (!expectedSet.has(file)) {
      differences.push(Object.freeze({
        code: "extra-file",
        file,
        message: `${file} is not generated permanent Atom source`,
      }));
    }
  }
  return differences;
}

function removeDirectoryContents(directory) {
  if (!existsSync(directory)) return;
  if (!statSync(directory).isDirectory()) {
    throw new Error(`${directory} is not a directory`);
  }
  for (const entry of readdirSync(directory)) {
    rmSync(path.join(directory, entry), { recursive: true, force: true });
  }
}

function writeJson(value) {
  console.log(`${JSON.stringify(value, null, 2)}`);
}

function printText(result) {
  console.log(`Nucleus permanent Atom source ${result.mode}: ${result.status}`);
  console.log(`out=${result.out}`);
  console.log(`files=${result.files}`);
  console.log(`issues=${result.issues}`);
  console.log(`differences=${result.differences.length}`);
  for (const difference of result.differences.slice(0, 20)) {
    console.log(`- ${difference.code} ${difference.file}: ${difference.message}`);
  }
}

function materialize(options) {
  const report = scanAssembly({
    asmRoot: options.asmRoot,
    proofRoot: options.proofRoot,
  });
  if (report.status !== "ready" || report.readiness.permanentSource !== "ready") {
    return Object.freeze({
      status: "blocked",
      mode: options.mode,
      out: options.out,
      files: 0,
      issues: report.issues.length,
      differences: [],
      readiness: report.readiness,
    });
  }

  if (options.mode === "write") {
    mkdirSync(options.out, { recursive: true });
    removeDirectoryContents(options.out);
    writeTranslatedTree(report, options.out, { symbols: "permanent" });
    return Object.freeze({
      status: "ready",
      mode: options.mode,
      out: options.out,
      files: listFiles(options.out).length,
      issues: 0,
      differences: [],
      readiness: report.readiness,
    });
  }

  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "nucleus-atom-materialize-"));
  try {
    writeTranslatedTree(report, temporaryRoot, { symbols: "permanent" });
    const differences = compareTrees(temporaryRoot, options.out);
    return Object.freeze({
      status: differences.length === 0 ? "ready" : "changed",
      mode: options.mode,
      out: options.out,
      files: listFiles(temporaryRoot).length,
      issues: 0,
      differences: Object.freeze(differences),
      readiness: report.readiness,
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = materialize(options);
    if (options.json) {
      writeJson(result);
    } else {
      printText(result);
    }
    process.exitCode = result.status === "ready" ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
