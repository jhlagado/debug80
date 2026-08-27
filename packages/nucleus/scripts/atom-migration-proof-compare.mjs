#!/usr/bin/env node
import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "@jhlagado/azm/compile";
import {
  assembleResolvedAtomProject,
  materializeAtomGeneration,
} from "../../atom/src/host/index.mjs";

import {
  flattenTranslatedEntry,
  scanAssembly,
} from "./atom-migration-dry-run.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const defaultAsmRoot = path.join(packageRoot, "asm");
const defaultProofRoot = path.join(packageRoot, "proofs");
const defaultMaxInstructions = 200_000_000;
const defaultMaxCycles = 2_000_000_000;
const nucleusPreviewMemoryLayout = Object.freeze({
  symbolStart: 0x4100,
  symbolEnd: 0xc000,
  pendingStart: 0xc000,
  pendingEnd: 0xe000,
  partDescriptors: 0xe000,
});
const identifierPattern = /^[A-Za-z_.$?][A-Za-z0-9_.$?]*$/;
const expressionIdentifierPattern = /(^|[^A-Za-z0-9_.$?])([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s*([+-])\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)(?=$|[^A-Za-z0-9_.$?])/g;

function parseArgs(argv) {
  const options = {
    asmRoot: defaultAsmRoot,
    proofRoot: defaultProofRoot,
    json: false,
    reportOnly: false,
    out: undefined,
    entry: undefined,
    maxPartBytes: 0xffff,
    maxInstructions: defaultMaxInstructions,
    maxCycles: defaultMaxCycles,
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
  console.log(`Usage: node packages/nucleus/scripts/atom-migration-proof-compare.mjs [options]

Options:
  --asm-root DIR       Assembly tree. Defaults to packages/nucleus/asm.
  --proof-root DIR     Proof manifest tree. Defaults to packages/nucleus/proofs.
  --entry NAME         Compare one proof manifest basename or asm-root-relative entry.
  --max-part-bytes N   Maximum generated Atom-preview bytes per source part.
                       Defaults to 65535.
  --max-instructions N Maximum native Atom instructions per preview assembly.
                       Defaults to ${defaultMaxInstructions}.
  --max-cycles N       Maximum native Atom cycles per preview assembly.
                       Defaults to ${defaultMaxCycles}.
  --out FILE           Write the JSON comparison report.
  --json               Print the JSON comparison report.
  --report-only        Exit 0 even when comparisons fail.
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
    .map((name) => {
      const file = path.join(proofRoot, name);
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      return Object.freeze({ name, file, manifest });
    })
    .filter(({ manifest }) => typeof manifest.source === "string");
}

function entryForManifest(asmRoot, proof) {
  const sourcePath = path.resolve(path.dirname(proof.file), proof.manifest.source);
  return path.relative(asmRoot, sourcePath).split(path.sep).join("/");
}

function isMeasurement(proof, entry) {
  return proof.name.includes("measurement") || entry.includes("measurement");
}

function selectedProofs(proofs, asmRoot, entry) {
  if (entry === undefined) return proofs;
  return proofs.filter((proof) => {
    const proofEntry = entryForManifest(asmRoot, proof);
    return proof.name === entry || path.basename(proof.name, ".json") === entry || proofEntry === entry;
  });
}

function contentBase(generation) {
  const addresses = generation.images.map(({ address }) => address);
  for (const event of generation.layout ?? []) {
    if (event.kind === "reserve" && event.count !== 0) addresses.push(event.address);
  }
  return addresses.length === 0 ? generation.finalCursor : Math.min(...addresses);
}

function firstDifference(left, right) {
  const limit = Math.min(left.length, right.length);
  for (let offset = 0; offset < limit; offset += 1) {
    if (left[offset] !== right[offset]) {
      return Object.freeze({ offset, atom: left[offset], current: right[offset] });
    }
  }
  if (left.length !== right.length) {
    return Object.freeze({ offset: limit, atom: left.length > right.length ? left[limit] : undefined, current: right.length > left.length ? right[limit] : undefined });
  }
  return undefined;
}

function stripComment(line) {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote !== "") {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === ";") return line.slice(0, index);
  }
  return line;
}

function hexWord(value) {
  return `$${(value & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
}

function jsExpressionText(source, symbolValues) {
  let expression = source
    .replace(/\$([0-9A-Fa-f]+)/g, (_match, digits) => String(Number.parseInt(digits, 16)))
    .replace(/%([01]+)/g, (_match, digits) => String(Number.parseInt(digits, 2)))
    .replace(/\b([0-9A-Fa-f]+)[Hh]\b/g, (_match, digits) => String(Number.parseInt(digits, 16)))
    .replace(/\b([01]+)[Bb]\b/g, (_match, digits) => String(Number.parseInt(digits, 2)));
  expression = expression.replace(/[A-Za-z_.$?][A-Za-z0-9_.$?]*/g, (name) => {
    const value = symbolValues.get(name);
    return value === undefined ? name : String(value);
  });
  if (/[A-Za-z_.$?]/.test(expression)) return undefined;
  if (!/^[0-9a-fA-FxXbB\s()+\-*/%&|^~<>]+$/.test(expression)) return undefined;
  return expression;
}

function evaluateKnownExpression(source, symbolValues) {
  const expression = jsExpressionText(source, symbolValues);
  if (expression === undefined) return undefined;
  try {
    const value = Function(`"use strict"; return (${expression});`)();
    return Number.isFinite(value) && Number.isInteger(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function augmentSymbolValuesFromPreview(text, symbolValues) {
  const values = new Map(symbolValues);
  const definitions = text.split("\n").flatMap((line) => {
    const source = stripComment(line);
    const equ = /^(\s*)([A-Za-z_.$?][A-Za-z0-9_.$?]*)(:?\s+)EQU\b(.*)$/i.exec(source);
    return equ === null ? [] : [{ name: equ[2], expression: equ[4].trim() }];
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, expression } of definitions) {
      if (values.has(name)) continue;
      const value = evaluateKnownExpression(expression, values);
      if (value !== undefined) {
        values.set(name, value);
        changed = true;
      }
    }
  }
  return values;
}

function symbolValuesFromCurrentAssembly(current, ledger) {
  const values = new Map();
  const d8 = current.artifacts.find(({ kind }) => kind === "d8m")?.json;
  const symbols = Array.isArray(d8?.symbols) ? d8.symbols : [];
  for (const symbol of symbols) {
    if (
      symbol !== null &&
      typeof symbol === "object" &&
      typeof symbol.name === "string" &&
      identifierPattern.test(symbol.name)
    ) {
      const value = Number.isInteger(symbol.address) ? symbol.address : symbol.value;
      if (Number.isInteger(value)) values.set(symbol.name, value);
    }
  }
  for (const { original, atom } of ledger) {
    const value = values.get(original);
    if (value !== undefined) values.set(atom, value);
  }
  return values;
}

function lowerResolvedPreviewExpressions(text, symbolValues) {
  return text.split("\n").map((line) => {
    const source = stripComment(line);
    const comment = line.slice(source.length);
    const equ = /^(\s*)([A-Za-z_.$?][A-Za-z0-9_.$?]*)(:?\s+)EQU\b(.*)$/i.exec(source);
    if (equ !== null) {
      const value = symbolValues.get(equ[2]);
      if (value !== undefined && value >= 0 && value <= 0xffff) {
        return `${equ[1]}${equ[2]}${equ[3]}EQU ${hexWord(value)}${comment}`;
      }
      return `${equ[1]};@UNRESOLVED-EQU ${source.trim()}${comment}`;
    }
    const lowered = source.replace(expressionIdentifierPattern, (match, prefix, left, operator, right) => {
      const leftValue = symbolValues.get(left);
      const rightValue = symbolValues.get(right);
      if (leftValue === undefined || rightValue === undefined) return match;
      return `${prefix}${hexWord(operator === "+" ? leftValue + rightValue : leftValue - rightValue)}`;
    });
    return `${lowered}${comment}`;
  }).join("\n");
}

function previewPartsFromText(entry, text, { maxPartBytes }) {
  const encoder = new TextEncoder();
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [""];
  const parts = [];
  let current = "";
  let currentBytes = 0;

  for (const line of lines) {
    const lineBytes = encoder.encode(line).length;
    if (lineBytes > maxPartBytes) {
      throw new Error(`lowered Atom-preview line exceeds ${maxPartBytes} bytes`);
    }
    if (currentBytes !== 0 && currentBytes + lineBytes > maxPartBytes) {
      const bytes = encoder.encode(current);
      parts.push(Object.freeze({
        ordinal: parts.length,
        bank: 0,
        logicalIdentity: `${entry}#preview-${String(parts.length).padStart(3, "0")}`,
        originalBytes: bytes,
        compilerBytes: bytes,
        binaryIncludes: Object.freeze([]),
      }));
      current = "";
      currentBytes = 0;
    }
    current += line;
    currentBytes += lineBytes;
  }

  if (currentBytes !== 0 || parts.length === 0) {
    const bytes = encoder.encode(current);
    parts.push(Object.freeze({
      ordinal: parts.length,
      bank: 0,
      logicalIdentity: `${entry}#preview-${String(parts.length).padStart(3, "0")}`,
      originalBytes: bytes,
      compilerBytes: bytes,
      binaryIncludes: Object.freeze([]),
    }));
  }

  return Object.freeze(parts);
}

function previewPartsForEntry(report, entry, symbolValues, { maxPartBytes }) {
  const translated = flattenTranslatedEntry(report, entry);
  const augmentedValues = augmentSymbolValuesFromPreview(translated, symbolValues);
  const lowered = lowerResolvedPreviewExpressions(translated, augmentedValues);
  return previewPartsFromText(entry, lowered, { maxPartBytes });
}

async function compareOne({ report, proof, asmRoot, maxPartBytes, maxInstructions, maxCycles }) {
  const entry = entryForManifest(asmRoot, proof);
  if (isMeasurement(proof, entry)) {
    return Object.freeze({
      manifest: proof.name,
      entry,
      status: "skipped",
      reason: "measurement artifact",
    });
  }

  try {
    const current = await compile(path.resolve(asmRoot, entry), { outputType: "bin" });
    const diagnostics = current.diagnostics.filter(({ severity }) => severity === "error");
    if (diagnostics.length !== 0) {
      return Object.freeze({
        manifest: proof.name,
        entry,
        status: "current-assembler-error",
        diagnostics: diagnostics.slice(0, 5).map(({ message }) => message),
      });
    }
    const currentBin = current.artifacts.find(({ kind }) => kind === "bin")?.bytes;
    if (currentBin === undefined) {
      return Object.freeze({
        manifest: proof.name,
        entry,
        status: "current-assembler-error",
        diagnostics: ["current assembler did not produce a bin artifact"],
      });
    }
    const symbolValues = symbolValuesFromCurrentAssembly(current, report.ledger);
    const parts = previewPartsForEntry(report, entry, symbolValues, { maxPartBytes });
    const atomProject = Object.freeze({ parts });
    const atomAssembled = await assembleResolvedAtomProject(atomProject, {
      target: { start: 0, capacity: 0xffff },
      maxInstructions,
      maxCycles,
      nativeMemoryLayout: nucleusPreviewMemoryLayout,
    });
    const atomMaterialized = materializeAtomGeneration(atomAssembled.generation, {
      base: contentBase(atomAssembled.generation),
    });
    const equal = Buffer.compare(
      Buffer.from(atomMaterialized.bytes),
      Buffer.from(currentBin),
    ) === 0;
    return Object.freeze({
      manifest: proof.name,
      entry,
      status: equal ? "byte-identical" : "different",
      atomBytes: atomMaterialized.bytes.length,
      currentBytes: currentBin.length,
      atomPreviewParts: parts.length,
      atomInstructions: atomAssembled.execution.instructions,
      atomCycles: atomAssembled.execution.cycles,
      ...(equal ? {} : { firstDifference: firstDifference(atomMaterialized.bytes, currentBin) }),
    });
  } catch (error) {
    return Object.freeze({
      manifest: proof.name,
      entry,
      status: "atom-preview-error",
      message: error?.message ?? String(error),
      category: error?.category,
      code: error?.code,
      diagnostic: error?.diagnostic,
    });
  }
}

function summarize(results) {
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return Object.freeze(counts);
}

function printText(report) {
  console.log("Nucleus Atom-preview proof comparison");
  console.log("");
  console.log(`Proof manifests checked: ${report.results.length}`);
  for (const [status, count] of Object.entries(report.summary)) {
    console.log(`${status}: ${count}`);
  }
  console.log("");
  for (const result of report.results) {
    const detail = result.status === "byte-identical"
      ? `${result.atomBytes} bytes, ${result.atomPreviewParts} preview part(s)`
      : result.reason ?? result.message ?? JSON.stringify(result.firstDifference ?? {});
    console.log(`${result.status}\t${result.manifest}\t${result.entry}\t${detail}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = scanAssembly({ asmRoot: options.asmRoot, proofRoot: options.proofRoot });
  const proofs = selectedProofs(proofManifests(options.proofRoot), options.asmRoot, options.entry);
  if (options.entry !== undefined && proofs.length === 0) {
    throw new Error(`no proof manifest matched ${options.entry}`);
  }
  const results = [];
  for (const proof of proofs) {
    results.push(await compareOne({
      report,
      proof,
      asmRoot: options.asmRoot,
      maxPartBytes: options.maxPartBytes,
      maxInstructions: options.maxInstructions,
      maxCycles: options.maxCycles,
    }));
  }
  const comparison = Object.freeze({
    status: results.every(({ status }) => status === "byte-identical" || status === "skipped") ? "ready" : "blocked",
    asmRoot: options.asmRoot,
    proofRoot: options.proofRoot,
    maxPartBytes: options.maxPartBytes,
    maxInstructions: options.maxInstructions,
    maxCycles: options.maxCycles,
    nativeMemoryLayout: nucleusPreviewMemoryLayout,
    summary: summarize(results),
    results: Object.freeze(results),
  });
  if (options.out !== undefined) writeJsonFile(options.out, comparison);
  if (options.json) {
    console.log(JSON.stringify(comparison, null, 2));
  } else {
    printText(comparison);
  }
  return comparison.status === "ready" || options.reportOnly ? 0 : 1;
}

export {
  augmentSymbolValuesFromPreview,
  evaluateKnownExpression,
  lowerResolvedPreviewExpressions,
  previewPartsFromText,
  symbolValuesFromCurrentAssembly,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
