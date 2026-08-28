#!/usr/bin/env node
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const defaultAsmRoot = path.join(packageRoot, "asm");
const defaultProofRoot = path.join(packageRoot, "proofs");

const allowedDirectives = new Set([
  "db",
  "ds",
  "dw",
  "else",
  "end",
  "endif",
  "equ",
  "if",
  "include",
  "org",
  "routine",
]);

const mechanicalDirectives = new Set([
  "db",
  "ds",
  "dw",
  "else",
  "end",
  "endif",
  "equ",
  "if",
  "include",
  "org",
]);

const identifierPattern = /^[A-Za-z_.$?][A-Za-z0-9_.$?]*$/;
const sourceIdentifierPattern = /(^|[^A-Za-z0-9_.$?])([A-Za-z_.$?][A-Za-z0-9_.$?]*)(?=$|[^A-Za-z0-9_.$?])/g;
const simpleConditionPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const onePastAddressSpaceEquPattern = /^\s*(AddressSpaceLimit|ProofMemoryEnd):?\s+\.equ\s+\$10000\s*$/i;
const directiveTranslations = new Map([
  ["db", "DB"],
  ["ds", "DS"],
  ["dw", "DW"],
  ["else", "%ELSE"],
  ["endif", "%ENDIF"],
  ["equ", "EQU"],
  ["if", "%IF"],
  ["include", "%INCLUDE"],
  ["org", "ORG"],
]);

function parseArgs(argv) {
  const options = {
    asmRoot: defaultAsmRoot,
    proofRoot: defaultProofRoot,
    reportOnly: false,
    json: false,
    ledgerOut: undefined,
    issuesOut: undefined,
    includeReportOut: undefined,
    translatedRoot: undefined,
    flattenEntry: undefined,
    flattenOut: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--asm-root") {
      options.asmRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--proof-root") {
      options.proofRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--report-only") {
      options.reportOnly = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--ledger-out") {
      options.ledgerOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--issues-out") {
      options.issuesOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--include-report-out") {
      options.includeReportOut = path.resolve(argv[++index] ?? "");
    } else if (arg === "--translated-root") {
      options.translatedRoot = path.resolve(argv[++index] ?? "");
    } else if (arg === "--flatten-entry") {
      options.flattenEntry = argv[++index];
      if (options.flattenEntry === undefined) throw new Error("--flatten-entry requires a source path");
    } else if (arg === "--flatten-out") {
      options.flattenOut = path.resolve(argv[++index] ?? "");
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
  console.log(`Usage: node packages/nucleus/scripts/atom-migration-dry-run.mjs [options]

Options:
  --asm-root DIR     Assembly tree to scan. Defaults to packages/nucleus/asm.
  --proof-root DIR   Proof manifest tree to scan. Defaults to packages/nucleus/proofs.
  --report-only      Exit 0 even when migration gaps are found.
  --json             Print the complete report as JSON.
  --ledger-out FILE  Write the generated long-symbol ledger as JSON.
  --issues-out FILE  Write migration issues as JSON.
  --include-report-out FILE
                     Write include-after-header groups and target classes as JSON.
  --translated-root DIR
                     Write generated Atom-preview source files under DIR.
  --flatten-entry FILE
                     Textually lower includes for one entry, relative to asm root.
  --flatten-out FILE Write the flattened Atom-preview entry source to FILE.
  --help             Show this help.
`);
}

function writeJsonFile(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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

function maskQuoted(source) {
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== "") {
      output += " ";
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      output += " ";
      continue;
    }
    output += character;
  }
  return output;
}

function numberValue(text) {
  if (/^\$[0-9A-Fa-f]+$/.test(text)) return Number.parseInt(text.slice(1), 16);
  if (/^%[01]+$/.test(text)) return Number.parseInt(text.slice(1), 2);
  if (/^[0-9][0-9A-Fa-f]*[Hh]$/.test(text)) return Number.parseInt(text.slice(0, -1), 16);
  if (/^[01]+[Bb]$/.test(text)) return Number.parseInt(text.slice(0, -1), 2);
  if (/^[0-9]+$/.test(text)) return Number.parseInt(text, 10);
  return undefined;
}

function location(file, line) {
  return { file: path.relative(process.cwd(), file), line };
}

function addCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function isIncludeHeaderLine(code) {
  const trimmed = code.trim();
  if (trimmed === "") return true;
  if (/^\s*\.include\b/i.test(code)) return true;
  return false;
}

function findAssemblyFiles(root) {
  return globSync("**/*.{asm,asmi}", { cwd: root })
    .map((name) => path.join(root, name))
    .sort();
}

function sourcePackageRoot(asmRoot) {
  const resolvedAsmRoot = path.resolve(asmRoot);
  return path.basename(resolvedAsmRoot) === "asm"
    ? path.dirname(resolvedAsmRoot)
    : resolvedAsmRoot;
}

function resolveConfinedInclude(fromFile, include, root) {
  const resolved = path.resolve(path.dirname(fromFile), include);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`include escapes Nucleus source root: ${include}`);
  }
  return resolved;
}

function combineIncludeKinds(left, right) {
  if (left === "missing" || right === "missing") return "missing";
  const hasCode = left === "code" || left === "mixed-code-data" || right === "code" || right === "mixed-code-data";
  const hasData = left === "data" || left === "mixed-code-data" || right === "data" || right === "mixed-code-data";
  if (hasCode && hasData) return "mixed-code-data";
  if (hasCode) return "code";
  if (hasData) return "data";
  return "layout-only";
}

function classifyIncludeTarget(file, root = sourcePackageRoot(path.dirname(file)), seen = new Set()) {
  if (!existsSync(file)) {
    return Object.freeze({
      kind: "missing",
      lines: 0,
      labels: 0,
      instructions: 0,
      dataDirectives: 0,
      orgDirectives: 0,
      nestedIncludes: 0,
      recursiveIncludes: 0,
    });
  }
  const resolvedFile = path.resolve(file);
  if (seen.has(resolvedFile)) {
    return Object.freeze({
      kind: "layout-only",
      lines: 0,
      labels: 0,
      instructions: 0,
      dataDirectives: 0,
      orgDirectives: 0,
      nestedIncludes: 0,
      recursiveIncludes: 0,
    });
  }
  seen.add(resolvedFile);
  let labels = 0;
  let instructions = 0;
  let dataDirectives = 0;
  let orgDirectives = 0;
  let nestedIncludes = 0;
  let recursiveIncludes = 0;
  let nestedKind = "layout-only";
  const lines = readFileSync(file, "utf8").split(/\n/);
  for (const raw of lines) {
    const code = stripComment(raw.replace(/\r$/, ""));
    const trimmed = code.trim();
    if (trimmed === "") continue;
    const include = includeSpecifier(code);
    if (include !== undefined) {
      nestedIncludes += 1;
      recursiveIncludes += 1;
      const nested = classifyIncludeTarget(resolveConfinedInclude(file, include, root), root, seen);
      recursiveIncludes += nested.recursiveIncludes;
      labels += nested.labels;
      instructions += nested.instructions;
      dataDirectives += nested.dataDirectives;
      orgDirectives += nested.orgDirectives;
      nestedKind = combineIncludeKinds(nestedKind, nested.kind);
    }
    if (/^\s*\.org\b/i.test(code) || /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.org\b/i.test(code)) {
      orgDirectives += 1;
    }
    if (/^\s*\.(?:db|dw|ds)\b/i.test(code) || /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.(?:db|dw|ds)\b/i.test(code)) {
      dataDirectives += 1;
    }
    if (/^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*:/.test(code)) labels += 1;
    const instructionCode = code.replace(/^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*:\s*/, "");
    if (
      instructionCode.trim() !== "" &&
      /^\s*(?:[A-Za-z][A-Za-z0-9]*)\b/.test(instructionCode) &&
      !/^\s*\.(?:db|dw|ds|equ|include|if|else|endif|org|routine|end)\b/i.test(instructionCode) &&
      !/^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.(?:db|dw|ds|equ|include|if|else|endif|org|routine|end)\b/i.test(instructionCode)
    ) {
      instructions += 1;
    }
  }
  let kind = "layout-only";
  if (instructions > 0 && dataDirectives > 0) {
    kind = "mixed-code-data";
  } else if (instructions > 0) {
    kind = "code";
  } else if (dataDirectives > 0) {
    kind = "data";
  }
  kind = combineIncludeKinds(kind, nestedKind);
  return Object.freeze({
    kind,
    lines: lines.length,
    labels,
    instructions,
    dataDirectives,
    orgDirectives,
    nestedIncludes,
    recursiveIncludes,
  });
}

function findAssemblyFilesWithIncludes(asmRoot) {
  const root = sourcePackageRoot(asmRoot);
  const queue = findAssemblyFiles(asmRoot).map((file) => path.resolve(file));
  const seen = new Set();
  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index];
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\n/)) {
      const include = includeSpecifier(stripComment(raw.replace(/\r$/, "")));
      if (include === undefined) continue;
      const resolved = resolveConfinedInclude(file, include, root);
      if (!seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

function collectProofSymbols(root) {
  const symbols = new Set();
  if (!existsSync(root)) return symbols;
  for (const file of globSync("**/*.json", { cwd: root }).map((name) => path.join(root, name)).sort()) {
    const value = JSON.parse(readFileSync(file, "utf8"));
    collectStrings(value, symbols);
  }
  return symbols;
}

function collectStrings(value, symbols) {
  if (typeof value === "string") {
    if (identifierPattern.test(value)) symbols.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, symbols);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "symbols" && child !== null && typeof child === "object" && !Array.isArray(child)) {
        for (const symbol of Object.keys(child)) {
          if (identifierPattern.test(symbol)) symbols.add(symbol);
        }
      }
      collectStrings(child, symbols);
    }
  }
}

function atomSymbolFor(index) {
  return `N${index.toString(36).toUpperCase().padStart(7, "0")}`;
}

function atomLocalSymbolFor(index) {
  return `.L${index.toString(36).toUpperCase().padStart(5, "0")}`;
}

function splitSymbolWords(symbol) {
  return symbol
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);
}

function squeezeSymbolWord(word) {
  const upper = word.toUpperCase();
  if (upper.length <= 2) return upper;
  return upper[0] + upper.slice(1).replace(/[AEIOU]/g, "");
}

function atomAbbreviationBase(symbol) {
  const words = splitSymbolWords(symbol);
  const squeezed = words.map(squeezeSymbolWord);
  const base = squeezed.length === 0
    ? symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : squeezed.join("");
  const normalized = base.replace(/^[0-9]+/, "").replace(/[^A-Z0-9]/g, "");
  return (normalized === "" ? "N" : normalized).slice(0, 8);
}

function uniqueAtomAbbreviation(symbol, usedNames) {
  const base = atomAbbreviationBase(symbol);
  let candidate = base;
  for (let index = 0; usedNames.has(candidate.toUpperCase()); index += 1) {
    const suffix = index.toString(36).toUpperCase();
    const suffixLength = Math.min(3, suffix.length);
    candidate = `${base.slice(0, 8 - suffixLength)}${suffix.slice(-suffixLength)}`;
    if (index > 0xfff) {
      throw new Error(`could not generate Atom abbreviation for ${symbol}`);
    }
  }
  usedNames.add(candidate.toUpperCase());
  return candidate;
}

function symbolMapFromLedger(ledger) {
  return new Map(ledger.map((entry) => [entry.original, entry.atom]));
}

function symbolMetadataFromLedger(ledger) {
  return new Map(ledger.map((entry) => [entry.original, entry]));
}

function declarationComment(original, symbolMetadata) {
  const entry = symbolMetadata.get(original);
  if (entry === undefined) return "";
  if (entry.migrationKind === "local-label") return "";
  const permanent = entry.permanentAtom === entry.atom ? "" : ` PERMANENT ${entry.permanentAtom}`;
  return ` ;@NUC-GLOBAL ${entry.original}${permanent}`;
}

function classifyScope(symbol, file, proofSymbols) {
  if (proofSymbols.has(symbol)) return "exported-proof-symbol";
  const base = path.basename(file);
  if (base.includes("proof")) return "proof-only";
  if (symbol.startsWith(".") || symbol.startsWith("_")) return "private-or-local";
  return "global";
}

function collectSourceIdentifiers(unquotedCode) {
  const identifiers = [];
  for (const match of unquotedCode.matchAll(sourceIdentifierPattern)) {
    identifiers.push(match[2]);
  }
  return identifiers;
}

function lineRangeContains(line, start, end) {
  return line > start && (end === undefined || line < end);
}

function buildPermanentSymbolPlan(symbols, occurrences, proofSymbols) {
  const entries = [...symbols.values()];
  const symbolOccurrences = new Map();
  for (const occurrence of occurrences) {
    if (!symbols.has(occurrence.symbol)) continue;
    const list = symbolOccurrences.get(occurrence.symbol) ?? [];
    list.push(occurrence);
    symbolOccurrences.set(occurrence.symbol, list);
  }

  const crossFileSymbols = new Set();
  for (const entry of entries) {
    const definitionFiles = new Set(entry.definitions.map(({ file }) => file));
    if ((symbolOccurrences.get(entry.original) ?? []).some(({ file }) => !definitionFiles.has(file))) {
      crossFileSymbols.add(entry.original);
    }
  }

  const labelEntriesByFile = new Map();
  for (const entry of entries) {
    if (entry.definitionKind !== "label") continue;
    const file = entry.file;
    const list = labelEntriesByFile.get(file) ?? [];
    list.push(entry);
    labelEntriesByFile.set(file, list);
  }
  for (const list of labelEntriesByFile.values()) {
    list.sort((left, right) => left.definitions[0].line - right.definitions[0].line || left.original.localeCompare(right.original));
  }

  const anchorDefinitions = (list, nonLocalSymbols) => list
    .filter((entry) => entry.original.length <= 8 || nonLocalSymbols.has(entry.original))
    .flatMap((entry) => entry.definitions.map((definition) => ({
      entry,
      line: definition.line,
    })))
    .sort((left, right) => left.line - right.line || left.entry.original.localeCompare(right.entry.original));

  const nonLocalSymbols = new Set();
  const isLocalEligible = (entry) => (
    entry.original.length > 8 &&
    entry.definitionKind === "label" &&
    entry.definitions.length === 1 &&
    !proofSymbols.has(entry.original) &&
    !crossFileSymbols.has(entry.original)
  );

  for (const [file, list] of labelEntriesByFile.entries()) {
    const first = list[0];
    if (first !== undefined && isLocalEligible(first)) {
      nonLocalSymbols.add(first.original);
    }
    for (const entry of list) {
      if (!isLocalEligible(entry) || entry.original.length <= 8) {
        nonLocalSymbols.add(entry.original);
      }
      if (entry.original.length <= 8 || proofSymbols.has(entry.original) || crossFileSymbols.has(entry.original)) {
        nonLocalSymbols.add(entry.original);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [file, list] of labelEntriesByFile.entries()) {
      const anchors = anchorDefinitions(list, nonLocalSymbols);
      for (const entry of list) {
        if (!isLocalEligible(entry) || nonLocalSymbols.has(entry.original)) continue;
        const line = entry.definitions[0].line;
        let anchor;
        let nextAnchor;
        for (const candidate of anchors) {
          const candidateLine = candidate.line;
          if (candidateLine < line) anchor = candidate;
          if (candidateLine > line) {
            nextAnchor = candidate;
            break;
          }
        }
        const start = anchor?.line;
        const end = nextAnchor?.line;
        const safe = start !== undefined && (symbolOccurrences.get(entry.original) ?? [])
          .every((occurrence) => occurrence.file === file && lineRangeContains(occurrence.line, start, end));
        if (!safe) {
          nonLocalSymbols.add(entry.original);
          changed = true;
        }
      }
    }
  }

  const localCounters = new Map();
  const plan = new Map();
  const usedGlobalNames = new Set(entries
    .filter((entry) => entry.original.length <= 8)
    .map((entry) => entry.original.toUpperCase()));

  for (const [file, list] of labelEntriesByFile.entries()) {
    const anchors = anchorDefinitions(list, nonLocalSymbols);
    for (const entry of list) {
      if (!isLocalEligible(entry) || nonLocalSymbols.has(entry.original)) continue;
      const line = entry.definitions[0].line;
      let anchor;
      for (const candidate of anchors) {
        const candidateLine = candidate.line;
        if (candidateLine < line) anchor = candidate;
        if (candidateLine > line) break;
      }
      if (anchor === undefined) continue;
      const key = `${file}:${anchor.entry.original}:${anchor.line}`;
      const index = localCounters.get(key) ?? 0;
      localCounters.set(key, index + 1);
      plan.set(entry.original, {
        migrationKind: "local-label",
        permanentAtom: atomLocalSymbolFor(index),
        localScope: {
          anchor: anchor.entry.original,
          file: path.relative(process.cwd(), file),
          line: anchor.line,
        },
      });
    }
  }

  for (const entry of entries) {
    if (entry.original.length <= 8 || plan.has(entry.original)) continue;
    let migrationKind = "generated-global";
    if (proofSymbols.has(entry.original)) {
      migrationKind = "public-abbreviation-required";
    } else if (crossFileSymbols.has(entry.original)) {
      migrationKind = "cross-file-abbreviation-required";
    } else if (entry.definitionKind === "equ") {
      migrationKind = "equ-abbreviation-required";
    }
    plan.set(entry.original, {
      migrationKind,
      permanentAtom: uniqueAtomAbbreviation(entry.original, usedGlobalNames),
      localScope: null,
    });
  }

  return { plan, symbolOccurrences, crossFileSymbols };
}

function summarizeIncludeAfterHeader(records, asmRoot) {
  const bySource = new Map();
  const byTarget = new Map();
  for (const record of records) {
    const source = record.file;
    const target = record.resolved;
    const sourceEntry = bySource.get(source) ?? {
      file: path.relative(asmRoot, source).split(path.sep).join("/"),
      count: 0,
      targets: new Map(),
      firstLine: record.line,
    };
    sourceEntry.count += 1;
    sourceEntry.firstLine = Math.min(sourceEntry.firstLine, record.line);
    sourceEntry.targets.set(record.include, (sourceEntry.targets.get(record.include) ?? 0) + 1);
    bySource.set(source, sourceEntry);

    const targetEntry = byTarget.get(target) ?? {
      include: record.include,
      resolved: path.relative(asmRoot, target).split(path.sep).join("/"),
      count: 0,
      target: record.target,
      firstUse: {
        file: path.relative(asmRoot, source).split(path.sep).join("/"),
        line: record.line,
      },
    };
    targetEntry.count += 1;
    byTarget.set(target, targetEntry);
  }
  return Object.freeze({
    bySource: Object.freeze([...bySource.values()]
      .map((entry) => Object.freeze({
        file: entry.file,
        count: entry.count,
        firstLine: entry.firstLine,
        targets: Object.freeze(Object.fromEntries([...entry.targets.entries()].sort())),
      }))
      .sort((left, right) => right.count - left.count || left.file.localeCompare(right.file))),
    byTarget: Object.freeze([...byTarget.values()]
      .map((entry) => Object.freeze(entry))
      .sort((left, right) => right.count - left.count || left.resolved.localeCompare(right.resolved))),
  });
}

function scanAssembly({ asmRoot, proofRoot }) {
  const files = findAssemblyFilesWithIncludes(asmRoot);
  const packageRoot = sourcePackageRoot(asmRoot);
  const proofSymbols = collectProofSymbols(proofRoot);
  const directives = new Map();
  const conditionals = new Map();
  const includes = new Map();
  const symbols = new Map();
  const occurrences = [];
  const issues = [];
  const includeAfterHeaderRecords = [];
  let sourceLines = 0;
  let contractLines = 0;
  let proofLimitSymbols = 0;
  let includeAfterHeader = 0;

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\n/);
    sourceLines += lines.length;
    let includeHeaderClosed = false;
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const raw = lines[index].replace(/\r$/, "");
      const code = stripComment(raw);
      const unquotedCode = maskQuoted(code);
      for (const symbol of collectSourceIdentifiers(unquotedCode)) {
        occurrences.push({ symbol, file, line: lineNumber });
      }
      const onePastAddressSpaceEqu = onePastAddressSpaceEquPattern.exec(code);
      if (onePastAddressSpaceEqu !== null) {
        proofLimitSymbols += 1;
      }

      const directive = /^\s*\.([A-Za-z][A-Za-z0-9_]*)\b\s*(.*)$/.exec(code);
      if (directive !== null) {
        const name = directive[1].toLowerCase();
        const argument = directive[2].trim();
        addCount(directives, name);
        if (!allowedDirectives.has(name)) {
          issues.push({
            code: "unsupported-directive",
            message: `AZM directive .${name.toUpperCase()} has no Atom migration rule`,
            ...location(file, lineNumber),
          });
        }
        if (name === "routine") contractLines += 1;
        if (name === "include") {
          addCount(includes, argument);
          if (includeHeaderClosed) {
            const resolved = resolveConfinedInclude(file, argument.replace(/^"|"$/g, ""), packageRoot);
            const target = classifyIncludeTarget(resolved, packageRoot);
            includeAfterHeaderRecords.push(Object.freeze({
              file,
              line: lineNumber,
              include: argument,
              resolved,
              target,
            }));
            includeAfterHeader += 1;
            issues.push({
              code: "include-after-header",
              message: "include appears after the header; Nucleus Atom migration requires includes before ORG, labels, code, data, or contracts",
              ...location(file, lineNumber),
            });
          }
        }
        if (name === "if") {
          addCount(conditionals, argument);
          if (!simpleConditionPattern.test(argument)) {
            issues.push({
              code: "unsupported-conditional-expression",
              message: `conditional expression is not a simple feature flag: ${argument}`,
              ...location(file, lineNumber),
            });
          }
        }
      }
      if (!isIncludeHeaderLine(code)) {
        includeHeaderClosed = true;
      }
      if (directive === null) {
        const labelDirective = /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+)\.([A-Za-z][A-Za-z0-9_]*)\b\s*(.*)$/i.exec(code);
        if (labelDirective !== null) {
          const name = labelDirective[1].toLowerCase();
          if (name !== "equ") addCount(directives, name);
          if (!allowedDirectives.has(name)) {
            issues.push({
              code: "unsupported-directive",
              message: `AZM directive .${name.toUpperCase()} has no Atom migration rule`,
              ...location(file, lineNumber),
            });
          }
        }
      }

      const label = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*):/.exec(code);
      if (label !== null) {
        recordSymbol(symbols, label[1], file, lineNumber, proofSymbols, "label");
      }

      const equ = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)(?::\s*|\s+)\.equ\b/i.exec(code);
      if (equ !== null) {
        addCount(directives, "equ");
        recordSymbol(symbols, equ[1], file, lineNumber, proofSymbols, "equ");
      }

      for (const match of unquotedCode.matchAll(/(^|[^A-Za-z0-9_])(\$[0-9A-Fa-f]+|%[01]+|[0-9][0-9A-Fa-f]*[Hh]|[01]+[Bb]|[0-9]+)/g)) {
        const text = match[2];
        const value = numberValue(text);
        if (value !== undefined && value > 0xffff && onePastAddressSpaceEqu === null) {
          issues.push({
            code: "atom-expression-range",
            message: `numeric literal ${text} exceeds Atom's 16-bit expression range`,
            ...location(file, lineNumber),
          });
        }
      }
    }
  }

  const preprocessorSymbols = new Set(conditionals.keys());
  for (const symbol of preprocessorSymbols) {
    symbols.delete(symbol);
  }

  const { plan, symbolOccurrences, crossFileSymbols } = buildPermanentSymbolPlan(symbols, occurrences, proofSymbols);

  const ledger = [...symbols.values()]
    .filter((entry) => entry.original.length > 8)
    .sort((left, right) => left.original.localeCompare(right.original))
    .map((entry, index) => ({
      original: entry.original,
      atom: atomSymbolFor(index),
      permanentAtom: plan.get(entry.original)?.permanentAtom ?? atomSymbolFor(index),
      migrationKind: plan.get(entry.original)?.migrationKind ?? "generated-global",
      scope: entry.scope,
      owningFile: path.relative(asmRoot, entry.file).split(path.sep).join("/"),
      publicObligation: proofSymbols.has(entry.original) ? "proof-manifest" : null,
      definitionKind: entry.definitionKind,
      referenceCount: Math.max(0, (symbolOccurrences.get(entry.original) ?? []).length - entry.definitions.length),
      crossFileReferences: crossFileSymbols.has(entry.original),
      localScope: plan.get(entry.original)?.localScope ?? null,
      collisionGroup: [],
      definitions: entry.definitions.map((definition) => ({
        file: path.relative(process.cwd(), definition.file),
        line: definition.line,
      })),
    }));

  const caseGroups = new Map();
  for (const symbol of symbols.keys()) {
    const key = symbol.toUpperCase();
    const group = caseGroups.get(key) ?? [];
    group.push(symbol);
    caseGroups.set(key, group);
  }
  for (const group of caseGroups.values()) {
    const distinct = [...new Set(group)];
    if (distinct.length > 1) {
      issues.push({
        code: "atom-case-collision",
        message: `symbols collide in Atom's case-insensitive table: ${distinct.sort().join(", ")}`,
      });
    }
  }

  const originalAtomKeys = new Set([...symbols.keys()].map((symbol) => symbol.toUpperCase()));
  for (const entry of ledger) {
    if (originalAtomKeys.has(entry.atom.toUpperCase())) {
      issues.push({
        code: "generated-symbol-collision",
        message: `generated Atom symbol ${entry.atom} collides with an existing source symbol`,
        file: entry.definitions[0]?.file,
        line: entry.definitions[0]?.line,
      });
    }
    if (entry.migrationKind !== "local-label" && entry.permanentAtom === undefined) {
      const code = entry.migrationKind === "public-abbreviation-required"
        ? "long-symbol-public-abbreviation-required"
        : entry.migrationKind === "cross-file-abbreviation-required"
          ? "long-symbol-cross-file-abbreviation-required"
          : entry.migrationKind === "equ-abbreviation-required"
            ? "long-symbol-equ-abbreviation-required"
            : "long-symbol-global-ledger-required";
      issues.push({
        code,
        message: `${entry.original} requires a permanent Atom global name; preview uses ${entry.atom}`,
        file: entry.definitions[0]?.file,
        line: entry.definitions[0]?.line,
      });
    }
  }

  const directiveSummary = Object.fromEntries([...directives.entries()].sort());
  const conditionalSummary = Object.fromEntries(
    [...conditionals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );
  const includeSummary = Object.fromEntries([...includes.entries()].sort());

  return {
    status: issues.length === 0 ? "ready" : "blocked",
    asmRoot,
    proofRoot,
    measured: {
      files: files.length,
      sourceLines,
      definedSymbols: symbols.size,
      longSymbols: ledger.length,
      localLabelCandidates: ledger.filter((entry) => entry.migrationKind === "local-label").length,
      globalSymbolRenames: ledger.filter((entry) => entry.migrationKind !== "local-label").length,
      contractLines,
      directives: directiveSummary,
      conditionals: conditionalSummary,
      uniqueIncludes: includes.size,
      proofLimitSymbols,
      includeAfterHeader,
      preprocessorSymbols: preprocessorSymbols.size,
    },
    supportedMappings: {
      mechanicalDirectives: [...mechanicalDirectives].sort(),
      contractMetadata: [".routine"],
      simpleConditionals: true,
      generatedLongSymbolLedger: true,
    },
    includeArguments: includeSummary,
    includeAfterHeaderReport: summarizeIncludeAfterHeader(includeAfterHeaderRecords, asmRoot),
    preprocessorSymbols: Object.freeze([...preprocessorSymbols].sort()),
    ledger,
    issues,
  };
}

function replaceSymbolsInSource(source, symbolMap) {
  if (symbolMap.size === 0) return source;
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (quote !== "") {
      output += character;
      index += 1;
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    const match = /^[A-Za-z_.$?][A-Za-z0-9_.$?]*/.exec(source.slice(index));
    if (match !== null) {
      const word = match[0];
      output += symbolMap.get(word) ?? word;
      index += word.length;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function convertQuotedByteExpressions(source) {
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (quote !== "") {
      output += character;
      index += 1;
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'") {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    if (character === "\"") {
      const next = source[index + 1];
      const close = source[index + 2];
      if (next !== undefined && close === "\"") {
        output += `'${next === "'" ? "\\'" : next}'`;
        index += 3;
        continue;
      }
      if (next === "\\" && source[index + 3] === "\"") {
        const escaped = source[index + 2];
        if (escaped === undefined) {
          output += character;
          index += 1;
          continue;
        }
        output += `'\\${escaped}'`;
        index += 4;
        continue;
      }
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function convertLeadingImmediateGrouping(source) {
  return source.replace(
    /\b(LD\s+(?:BC|DE|HL|SP|IX|IY)\s*,\s*)\(([^()\r\n]*<<[^()\r\n]*)\)(?=\s*(?:[|+\-*/%&^]|$))/gi,
    "$1$2",
  );
}

function translateNucleusAzmLine(
  line,
  {
    sourceName = "<nucleus-asm>",
    lineNumber = 1,
    symbolMap = new Map(),
    symbolMetadata = new Map(),
    preprocessorSymbols = new Set(),
  } = {},
) {
  const source = stripComment(line);
  const comment = line.slice(source.length);
  const context = { file: sourceName, line: lineNumber };

  const leadingDirective = /^(\s*)\.([A-Za-z][A-Za-z0-9_]*)(\b.*)$/.exec(source);
  if (leadingDirective !== null) {
    const [, prefix, rawName, rest] = leadingDirective;
    const name = rawName.toLowerCase();
    if (name === "routine") {
      return `${prefix};@ROUTINE${rest.toUpperCase()}${comment}`;
    }
    if (name === "end") {
      return `${prefix};@AZM-END${comment}`;
    }
    const replacement = directiveTranslations.get(name);
    if (replacement === undefined) {
      throw new Error(`${context.file}:${context.line}: unsupported directive .${rawName}`);
    }
    return `${replaceSymbolsInSource(`${prefix}${replacement}${rest}`, symbolMap)}${comment}`;
  }

  const equ = /^(\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+))\.equ(\b.*)$/i.exec(source);
  if (equ !== null) {
    const onePastLimit = /^(\s*)(AddressSpaceLimit|ProofMemoryEnd)(:?\s+)\.equ\s+\$10000\s*$/i.exec(source);
    if (onePastLimit !== null) {
      const original = onePastLimit[2];
      const atom = symbolMap.get(original) ?? original;
      return `${onePastLimit[1]}${atom}${onePastLimit[3]}EQU 0${declarationComment(original, symbolMetadata)} ;@ATOM-PROOF-LIMIT ${original} 65536${comment === "" ? "" : ` ${comment}`}`;
    }
    const preprocessorDefinition = /^(\s*)([A-Za-z_.$?][A-Za-z0-9_.$?]*)(:\s*|\s+)\.equ\b(.*)$/i.exec(source);
    if (preprocessorDefinition !== null && preprocessorSymbols.has(preprocessorDefinition[2])) {
      return `${preprocessorDefinition[1]}%DEFINE ${preprocessorDefinition[2]}${preprocessorDefinition[4]}${comment}`;
    }
    const equName = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)/.exec(equ[1])?.[1];
    return `${replaceSymbolsInSource(`${equ[1]}EQU${equ[2]}`, symbolMap)}${equName === undefined ? "" : declarationComment(equName, symbolMetadata)}${comment}`;
  }

  const labelDirective = /^(\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*(?::\s*|\s+))\.([A-Za-z][A-Za-z0-9_]*)(\b.*)$/i.exec(source);
  if (labelDirective !== null) {
    const [, prefix, rawName, rest] = labelDirective;
    const replacement = directiveTranslations.get(rawName.toLowerCase());
    if (replacement === undefined) {
      throw new Error(`${context.file}:${context.line}: unsupported directive .${rawName}`);
    }
    const labelName = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*)/.exec(prefix)?.[1];
    return `${replaceSymbolsInSource(`${prefix}${replacement}${rest}`, symbolMap)}${labelName === undefined ? "" : declarationComment(labelName, symbolMetadata)}${comment}`;
  }

  const translatedSource = replaceSymbolsInSource(convertLeadingImmediateGrouping(convertQuotedByteExpressions(source)), symbolMap);
  const label = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*):/.exec(source);
  return `${translatedSource}${label === null ? "" : declarationComment(label[1], symbolMetadata)}${comment}`;
}

function writeTranslatedTree(report, translatedRoot) {
  const symbolMap = symbolMapFromLedger(report.ledger);
  const symbolMetadata = symbolMetadataFromLedger(report.ledger);
  const preprocessorSymbols = new Set(report.preprocessorSymbols);
  for (const file of findAssemblyFiles(report.asmRoot)) {
    const relative = path.relative(report.asmRoot, file);
    const output = path.join(translatedRoot, relative);
    const lines = readFileSync(file, "utf8").split(/\n/);
    const translated = lines
      .map((line, index) => translateNucleusAzmLine(line, {
        sourceName: relative,
        lineNumber: index + 1,
        symbolMap,
        symbolMetadata,
        preprocessorSymbols,
      }))
      .join("\n");
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, translated);
  }
}

function includeSpecifier(source) {
  const match = /^\s*\.include\s+"([^"\r\n]+)"\s*$/i.exec(source);
  return match?.[1];
}

function flattenTranslatedEntry(report, entry) {
  const symbolMap = symbolMapFromLedger(report.ledger);
  const symbolMetadata = symbolMetadataFromLedger(report.ledger);
  const preprocessorSymbols = new Set(report.preprocessorSymbols);
  const stack = [];
  const definitions = new Map();
  const conditionStack = [];

  function active() {
    return conditionStack.every((condition) => condition.active);
  }

  function parseDefinitionValue(text) {
    const trimmed = text.trim();
    const value = numberValue(trimmed);
    if (value === undefined) {
      throw new Error(`unsupported Nucleus preview definition value: ${trimmed}`);
    }
    return value;
  }

  function handlePreprocessorLine(source, output) {
    const define = /^(\s*)([A-Za-z_.$?][A-Za-z0-9_.$?]*)(:\s*|\s+)\.equ\b(.*)$/i.exec(source);
    if (define !== null && preprocessorSymbols.has(define[2])) {
      if (active()) {
        const value = parseDefinitionValue(define[4]);
        definitions.set(define[2], value);
        output.push(`${define[1]};@DEFINE ${define[2]} ${value}`);
      }
      return true;
    }

    const directive = /^\s*\.(if|else|endif)\b\s*(.*)$/i.exec(source);
    if (directive === null) return false;
    const name = directive[1].toLowerCase();
    const argument = directive[2].trim();
    if (name === "if") {
      if (!simpleConditionPattern.test(argument)) {
        throw new Error(`unsupported Nucleus preview conditional expression: ${argument}`);
      }
      const parentActive = active();
      const enabled = (definitions.get(argument) ?? 0) !== 0;
      conditionStack.push({ parentActive, conditionEnabled: enabled, active: parentActive && enabled });
      output.push(`;@IF ${argument} ${enabled ? 1 : 0}`);
      return true;
    }
    if (name === "else") {
      const top = conditionStack.at(-1);
      if (top === undefined) throw new Error("Nucleus preview conditional .ELSE without .IF");
      top.active = top.parentActive && !top.conditionEnabled;
      output.push(";@ELSE");
      return true;
    }
    const top = conditionStack.pop();
    if (top === undefined) throw new Error("Nucleus preview conditional .ENDIF without .IF");
    output.push(";@ENDIF");
    return true;
  }

  function expand(file) {
    const real = path.resolve(file);
    const activeIndex = stack.indexOf(real);
    if (activeIndex >= 0) {
      const cycle = [...stack.slice(activeIndex), real]
        .map((item) => path.relative(report.asmRoot, item).split(path.sep).join("/"))
        .join(" -> ");
      throw new Error(`include cycle while flattening Nucleus Atom preview: ${cycle}`);
    }
    stack.push(real);
    const relative = path.relative(report.asmRoot, real).split(path.sep).join("/");
    const lines = readFileSync(real, "utf8").split(/\n/);
    const output = [`;@SOURCE-BEGIN ${relative}`];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const source = stripComment(line);
      const comment = line.slice(source.length);
      if (handlePreprocessorLine(source, output)) {
        continue;
      }
      if (!active()) {
        continue;
      }
      const include = includeSpecifier(source);
      if (include !== undefined) {
        output.push(`;@INCLUDE-BEGIN ${include}${comment === "" ? "" : ` ${comment}`}`);
        output.push(expand(path.resolve(path.dirname(real), include)));
        output.push(`;@INCLUDE-END ${include}`);
        continue;
      }
      output.push(translateNucleusAzmLine(line, {
        sourceName: relative,
        lineNumber: index + 1,
        symbolMap,
        symbolMetadata,
        preprocessorSymbols,
      }));
    }
    output.push(`;@SOURCE-END ${relative}`);
    stack.pop();
    if (stack.length === 0 && conditionStack.length !== 0) {
      throw new Error("Nucleus preview conditional .IF without .ENDIF");
    }
    return output.join("\n");
  }

  return expand(path.resolve(report.asmRoot, entry));
}

function flattenedEntryParts(report, entry, { maxBytes = 0xffff } = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 0xffff) {
    throw new Error("flattened Atom-preview part byte limit must be 1 through 65535");
  }
  const text = flattenTranslatedEntry(report, entry);
  const encoder = new TextEncoder();
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [""];
  const parts = [];
  let current = "";
  let currentBytes = 0;

  for (const line of lines) {
    const lineBytes = encoder.encode(line).length;
    if (lineBytes > maxBytes) {
      throw new Error(`flattened Atom-preview line exceeds ${maxBytes} bytes`);
    }
    if (currentBytes !== 0 && currentBytes + lineBytes > maxBytes) {
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

function writeFlattenedEntry(report, entry, output) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${flattenTranslatedEntry(report, entry)}\n`);
}

function recordSymbol(symbols, original, file, line, proofSymbols, definitionKind) {
  const existing = symbols.get(original);
  if (existing !== undefined) {
    existing.definitions.push({ file, line });
    if (existing.definitionKind !== definitionKind) existing.definitionKind = "mixed";
    return;
  }
  symbols.set(original, {
    original,
    file,
    scope: classifyScope(original, file, proofSymbols),
    definitionKind,
    definitions: [{ file, line }],
  });
}

function printTextReport(report) {
  console.log(`Nucleus AZM-to-Atom dry-run: ${report.status}`);
  console.log(`files=${report.measured.files}`);
  console.log(`sourceLines=${report.measured.sourceLines}`);
  console.log(`definedSymbols=${report.measured.definedSymbols}`);
  console.log(`longSymbols=${report.measured.longSymbols}`);
  console.log(`contractLines=${report.measured.contractLines}`);
  console.log(`includeAfterHeader=${report.measured.includeAfterHeader}`);
  console.log(`localLabelCandidates=${report.measured.localLabelCandidates}`);
  console.log(`globalSymbolRenames=${report.measured.globalSymbolRenames}`);
  console.log(`issues=${report.issues.length}`);
  if (report.issues.length > 0) {
    console.log("");
    console.log("First issues:");
    for (const issue of report.issues.slice(0, 20)) {
      const at = issue.file === undefined ? "" : ` (${issue.file}:${issue.line ?? 0})`;
      console.log(`- ${issue.code}${at}: ${issue.message}`);
    }
  }
}

export {
  flattenTranslatedEntry,
  flattenedEntryParts,
  scanAssembly,
  symbolMetadataFromLedger,
  translateNucleusAzmLine,
  writeFlattenedEntry,
  writeTranslatedTree,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = scanAssembly(options);
    if (options.ledgerOut !== undefined) {
      writeJsonFile(options.ledgerOut, report.ledger);
    }
    if (options.issuesOut !== undefined) {
      writeJsonFile(options.issuesOut, report.issues);
    }
    if (options.includeReportOut !== undefined) {
      writeJsonFile(options.includeReportOut, report.includeAfterHeaderReport);
    }
    if (options.translatedRoot !== undefined) {
      writeTranslatedTree(report, options.translatedRoot);
    }
    if (options.flattenEntry !== undefined || options.flattenOut !== undefined) {
      if (options.flattenEntry === undefined || options.flattenOut === undefined) {
        throw new Error("--flatten-entry and --flatten-out must be used together");
      }
      writeFlattenedEntry(report, options.flattenEntry, options.flattenOut);
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report);
    }
    if (!options.reportOnly && report.issues.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
