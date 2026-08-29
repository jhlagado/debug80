#!/usr/bin/env node
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runProofManifest } from "../dist/src/proof.js";

import { scanAssembly, writeTranslatedTree } from "./atom-migration-dry-run.mjs";
import {
  entryBudget,
  readBudgetFile,
} from "./atom-migration-proof-compare.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const defaultAsmRoot = path.join(packageRoot, "asm");
const defaultProofRoot = path.join(packageRoot, "proofs");
const defaultPermanentRoot = path.join(packageRoot, "atom-asm");
const defaultBudgetFile = path.join(defaultProofRoot, "atom-migration-preview-budgets.json");
const defaultMaxInstructions = 200_000_000;
const defaultMaxCycles = 2_000_000_000;

function parseArgs(argv) {
  const options = {
    asmRoot: defaultAsmRoot,
    proofRoot: defaultProofRoot,
    entry: undefined,
    maxPartBytes: 0xffff,
    maxInstructions: defaultMaxInstructions,
    maxCycles: defaultMaxCycles,
    budgetFile: defaultBudgetFile,
    mode: "preview",
    permanentRoot: defaultPermanentRoot,
    regeneratePermanentRoot: false,
    json: false,
    reportOnly: false,
    out: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--asm-root") {
      options.asmRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--proof-root") {
      options.proofRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--entry") {
      options.entry = argv[++index];
      if (options.entry === undefined) throw new Error("--entry requires a proof manifest name or source entry");
    } else if (arg === "--max-part-bytes") {
      const value = Number.parseInt(argv[++index] ?? "", 10);
      if (!Number.isInteger(value) || value < 1 || value > 0xffff) {
        throw new Error("--max-part-bytes requires an integer from 1 through 65535");
      }
      options.maxPartBytes = value;
    } else if (arg === "--max-instructions") {
      const value = Number.parseInt(argv[++index] ?? "", 10);
      if (!Number.isInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) {
        throw new Error("--max-instructions requires a positive integer");
      }
      options.maxInstructions = value;
    } else if (arg === "--max-cycles") {
      const value = Number.parseInt(argv[++index] ?? "", 10);
      if (!Number.isInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) {
        throw new Error("--max-cycles requires a positive integer");
      }
      options.maxCycles = value;
    } else if (arg === "--budget-file") {
      options.budgetFile = path.resolve(argv[++index] ?? "");
    } else if (arg === "--no-budget-file") {
      options.budgetFile = undefined;
    } else if (arg === "--mode") {
      options.mode = argv[++index];
      if (!["preview", "permanent-ready"].includes(options.mode)) {
        throw new Error("--mode must be preview or permanent-ready");
      }
    } else if (arg === "--permanent-root") {
      options.permanentRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--regenerate-permanent-root") {
      options.regeneratePermanentRoot = true;
    } else if (arg === "--out") {
      options.out = path.resolve(argv[++index] ?? "");
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--report-only") {
      options.reportOnly = true;
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
  console.log(`Usage: node packages/nucleus/scripts/atom-migration-proof-run.mjs [options]

Options:
  --asm-root DIR       Assembly tree. Defaults to packages/nucleus/asm.
  --proof-root DIR     Proof manifest tree. Defaults to packages/nucleus/proofs.
  --entry NAME         Run one proof manifest basename or asm-root-relative entry.
  --max-part-bytes N   Maximum generated Atom-preview bytes per source part.
                       Defaults to 65535.
  --max-instructions N Maximum native Atom instructions per preview assembly.
                       Defaults to ${defaultMaxInstructions}.
  --max-cycles N       Maximum native Atom cycles per preview assembly.
                       Defaults to ${defaultMaxCycles}.
  --budget-file FILE   Per-manifest budget JSON. Defaults to
                       packages/nucleus/proofs/atom-migration-preview-budgets.json
                       when present.
  --no-budget-file     Ignore the default per-manifest budget file.
  --mode MODE          preview or permanent-ready. Defaults to preview.
  --permanent-root DIR Source-controlled Atom tree for permanent-ready mode.
                       Defaults to packages/nucleus/atom-asm.
  --regenerate-permanent-root
                       Generate permanent Atom source in a temporary directory
                       instead of reading --permanent-root.
  --out FILE           Write the JSON execution report.
  --json               Print the JSON execution report.
  --report-only        Exit 0 even when proof execution fails.
  --help               Show this help.
`);
}

function writeJsonFile(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function proofManifests(proofRoot) {
  return globSync("*.json", { cwd: proofRoot })
    .sort()
    .flatMap((name) => {
      const file = path.join(proofRoot, name);
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      if (typeof manifest.source !== "string") return [];
      return [Object.freeze({
        name,
        file,
        manifest,
      })];
    });
}

function entryForManifest(asmRoot, proof) {
  return path.relative(
    asmRoot,
    path.resolve(path.dirname(proof.file), proof.manifest.source),
  ).split(path.sep).join("/");
}

function selectedProofs(proofs, asmRoot, entry) {
  if (entry === undefined) return proofs;
  return proofs.filter((proof) =>
    proof.name === entry ||
    proof.name.replace(/\.json$/i, "") === entry ||
    entryForManifest(asmRoot, proof) === entry
  );
}

function isMeasurement(proof, entry) {
  return /measurement/i.test(proof.name) || /measurement/i.test(entry);
}

function summarize(results) {
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return Object.freeze(counts);
}

function printText(report) {
  console.log(`Nucleus Atom ${report.mode} proof execution`);
  console.log("");
  console.log(`Proof manifests checked: ${report.results.length}`);
  for (const [status, count] of Object.entries(report.summary)) {
    console.log(`${status}: ${count}`);
  }
  console.log("");
  for (const result of report.results) {
    const detail = result.status === "passed"
      ? `${result.instructions} instructions, ${result.cycles} cycles`
      : result.reason ?? result.message;
    console.log(`${result.status}\t${result.manifest}\t${result.entry}\t${detail}`);
  }
}

function proofMatrixByManifest(report) {
  return new Map(report.proofMatrix.map((row) => [row.proof, row]));
}

async function runOne({
  proof,
  asmRoot,
  proofRoot,
  report,
  proofMatrix,
  budget,
  maxPartBytes,
  mode,
  permanentRoot,
}) {
  const entry = entryForManifest(asmRoot, proof);
  if (budget.skip !== undefined) {
    return Object.freeze({
      manifest: proof.name,
      entry,
      status: "skipped",
      reason: budget.skip,
      budget: Object.freeze({ skip: budget.skip }),
    });
  }
  const budgetResult = Object.freeze({
    maxInstructions: budget.maxInstructions,
    maxCycles: budget.maxCycles,
  });
  if (isMeasurement(proof, entry)) {
    return Object.freeze({
      manifest: proof.name,
      entry,
      status: "skipped",
      reason: "measurement artifact",
      budget: budgetResult,
    });
  }

  if (mode === "permanent-ready") {
    const row = proofMatrix.get(proof.name);
    if (row?.status !== "atom-permanent-ready") {
      return Object.freeze({
        manifest: proof.name,
        entry,
        status: "skipped",
        reason: row?.status ?? "not in Atom migration proof matrix",
        budget: budgetResult,
      });
    }
    try {
      const outcome = await runProofManifest(proof.file, {
        assembler: {
          flavour: "atom",
          source: "permanent",
          root: permanentRoot,
          entry,
          maxInstructions: budget.maxInstructions,
          maxCycles: budget.maxCycles,
          legacyOutputOrder: true,
        },
        atomMigration: {
          proofSymbolMap: report.proofSymbolMap,
          proofLimitMap: report.proofLimitMap,
        },
      });
      return Object.freeze({
        manifest: proof.name,
        entry,
        status: "passed",
        instructions: outcome.instructions,
        cycles: outcome.cycles,
        extents: outcome.extents,
        budget: budgetResult,
      });
    } catch (error) {
      return Object.freeze({
        manifest: proof.name,
        entry,
        status: "failed",
        message: error?.message ?? String(error),
        budget: budgetResult,
      });
    }
  }

  try {
    const outcome = await runProofManifest(proof.file, {
      assembler: {
        flavour: "atom",
        source: "preview",
        asmRoot,
        proofRoot,
        entry,
        maxPartBytes,
        maxInstructions: budget.maxInstructions,
        maxCycles: budget.maxCycles,
      },
      atomMigration: {
        proofSymbolMap: report.proofSymbolMap,
        proofLimitMap: report.proofLimitMap,
      },
    });
    return Object.freeze({
      manifest: proof.name,
      entry,
      status: "passed",
      instructions: outcome.instructions,
      cycles: outcome.cycles,
      extents: outcome.extents,
      budget: budgetResult,
    });
  } catch (error) {
    return Object.freeze({
      manifest: proof.name,
      entry,
      status: "failed",
      message: error?.message ?? String(error),
      budget: budgetResult,
    });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const migrationReport = scanAssembly({
    asmRoot: options.asmRoot,
    proofRoot: options.proofRoot,
  });
  const proofMatrix = proofMatrixByManifest(migrationReport);
  const generatedPermanentRoot = options.mode === "permanent-ready" && options.regeneratePermanentRoot
    ? mkdtempSync(path.join(os.tmpdir(), "nucleus-atom-permanent-run-"))
    : undefined;
  if (generatedPermanentRoot !== undefined) {
    writeTranslatedTree(migrationReport, generatedPermanentRoot, { symbols: "permanent" });
  }
  const permanentRoot = options.mode === "permanent-ready"
    ? generatedPermanentRoot ?? options.permanentRoot
    : undefined;
  const budgets = readBudgetFile(options.budgetFile);
  const proofs = selectedProofs(
    proofManifests(options.proofRoot),
    options.asmRoot,
    options.entry,
  );
  if (options.entry !== undefined && proofs.length === 0) {
    throw new Error(`no proof manifest matched ${options.entry}`);
  }
  const defaultBudget = Object.freeze({
    maxInstructions: options.maxInstructions,
    maxCycles: options.maxCycles,
  });
  const results = [];
  try {
    for (const proof of proofs) {
      const budget = entryBudget(proof, defaultBudget, budgets, {
        force: options.entry !== undefined,
      });
      const entry = entryForManifest(options.asmRoot, proof);
      if (!options.json) {
        console.error(`running ${proof.name}\t${entry}`);
      }
      const result = await runOne({
        proof,
        asmRoot: options.asmRoot,
        proofRoot: options.proofRoot,
        report: migrationReport,
        proofMatrix,
        budget,
        maxPartBytes: options.maxPartBytes,
        mode: options.mode,
        permanentRoot,
      });
      results.push(result);
      if (!options.json) {
        console.error(`${result.status} ${proof.name}`);
      }
    }
  } finally {
    if (generatedPermanentRoot !== undefined) {
      rmSync(generatedPermanentRoot, { recursive: true, force: true });
    }
  }
  const execution = Object.freeze({
    status: results.every(({ status }) => status === "passed" || status === "skipped")
      ? "ready"
      : "blocked",
    mode: options.mode,
    asmRoot: options.asmRoot,
    proofRoot: options.proofRoot,
    maxPartBytes: options.maxPartBytes,
    permanentRoot,
    regeneratePermanentRoot: options.regeneratePermanentRoot,
    maxInstructions: options.maxInstructions,
    maxCycles: options.maxCycles,
    budgetFile: options.budgetFile,
    budgetEntries: budgets.size,
    summary: summarize(results),
    results: Object.freeze(results),
  });
  if (options.out !== undefined) writeJsonFile(options.out, execution);
  if (options.json) {
    console.log(JSON.stringify(execution, null, 2));
  } else {
    printText(execution);
  }
  return execution.status === "ready" || options.reportOnly ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
