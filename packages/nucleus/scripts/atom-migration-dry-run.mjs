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
const simpleConditionPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const directiveTranslations = new Map([
  ["db", "DB"],
  ["dw", "DW"],
  ["else", "%ELSE"],
  ["end", "END"],
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
    translatedRoot: undefined,
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
    } else if (arg === "--translated-root") {
      options.translatedRoot = path.resolve(argv[++index] ?? "");
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
  --translated-root DIR
                     Write generated Atom-preview source files under DIR.
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

function findAssemblyFiles(root) {
  return globSync("**/*.{asm,asmi}", { cwd: root })
    .map((name) => path.join(root, name))
    .sort();
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

function symbolMapFromLedger(ledger) {
  return new Map(ledger.map((entry) => [entry.original, entry.atom]));
}

function classifyScope(symbol, file, proofSymbols) {
  if (proofSymbols.has(symbol)) return "exported-proof-symbol";
  const base = path.basename(file);
  if (base.includes("proof")) return "proof-only";
  if (symbol.startsWith(".") || symbol.startsWith("_")) return "private-or-local";
  return "global";
}

function scanAssembly({ asmRoot, proofRoot }) {
  const files = findAssemblyFiles(asmRoot);
  const proofSymbols = collectProofSymbols(proofRoot);
  const directives = new Map();
  const conditionals = new Map();
  const includes = new Map();
  const symbols = new Map();
  const issues = [];
  let sourceLines = 0;
  let contractLines = 0;

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\n/);
    sourceLines += lines.length;
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const raw = lines[index].replace(/\r$/, "");
      const code = stripComment(raw);
      const unquotedCode = maskQuoted(code);

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
        if (name === "include") addCount(includes, argument);
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

      const label = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*):/.exec(code);
      if (label !== null) {
        recordSymbol(symbols, label[1], file, lineNumber, proofSymbols);
      }

      const equ = /^\s*([A-Za-z_.$?][A-Za-z0-9_.$?]*):?\s+\.equ\b/i.exec(code);
      if (equ !== null) {
        addCount(directives, "equ");
        recordSymbol(symbols, equ[1], file, lineNumber, proofSymbols);
      }

      for (const match of unquotedCode.matchAll(/(^|[^A-Za-z0-9_])(\$[0-9A-Fa-f]+|%[01]+|[0-9][0-9A-Fa-f]*[Hh]|[01]+[Bb]|[0-9]+)/g)) {
        const text = match[2];
        const value = numberValue(text);
        if (value !== undefined && value > 0xffff) {
          issues.push({
            code: "atom-expression-range",
            message: `numeric literal ${text} exceeds Atom's 16-bit expression range`,
            ...location(file, lineNumber),
          });
        }
      }
    }
  }

  const ledger = [...symbols.values()]
    .filter((entry) => entry.original.length > 8)
    .sort((left, right) => left.original.localeCompare(right.original))
    .map((entry, index) => ({
      original: entry.original,
      atom: atomSymbolFor(index),
      scope: entry.scope,
      owningFile: path.relative(asmRoot, entry.file).split(path.sep).join("/"),
      publicObligation: proofSymbols.has(entry.original) ? "proof-manifest" : null,
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
    issues.push({
      code: "unledgered-long-symbol",
      message: `${entry.original} requires generated Atom symbol ${entry.atom}`,
      file: entry.definitions[0]?.file,
      line: entry.definitions[0]?.line,
    });
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
      contractLines,
      directives: directiveSummary,
      conditionals: conditionalSummary,
      uniqueIncludes: includes.size,
    },
    supportedMappings: {
      mechanicalDirectives: [...mechanicalDirectives].sort(),
      contractMetadata: [".routine"],
      simpleConditionals: true,
      generatedLongSymbolLedger: true,
    },
    includeArguments: includeSummary,
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

function translateNucleusAzmLine(
  line,
  { sourceName = "<nucleus-asm>", lineNumber = 1, symbolMap = new Map() } = {},
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
    const replacement = directiveTranslations.get(name);
    if (replacement === undefined) {
      throw new Error(`${context.file}:${context.line}: unsupported directive .${rawName}`);
    }
    return `${replaceSymbolsInSource(`${prefix}${replacement}${rest}`, symbolMap)}${comment}`;
  }

  const equ = /^(\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*:?\s+)\.equ(\b.*)$/i.exec(source);
  if (equ !== null) {
    return `${replaceSymbolsInSource(`${equ[1]}EQU${equ[2]}`, symbolMap)}${comment}`;
  }

  return `${replaceSymbolsInSource(source, symbolMap)}${comment}`;
}

function writeTranslatedTree(report, translatedRoot) {
  const symbolMap = symbolMapFromLedger(report.ledger);
  for (const file of findAssemblyFiles(report.asmRoot)) {
    const relative = path.relative(report.asmRoot, file);
    const output = path.join(translatedRoot, relative);
    const lines = readFileSync(file, "utf8").split(/\n/);
    const translated = lines
      .map((line, index) => translateNucleusAzmLine(line, {
        sourceName: relative,
        lineNumber: index + 1,
        symbolMap,
      }))
      .join("\n");
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, translated);
  }
}

function recordSymbol(symbols, original, file, line, proofSymbols) {
  const existing = symbols.get(original);
  if (existing !== undefined) {
    existing.definitions.push({ file, line });
    return;
  }
  symbols.set(original, {
    original,
    file,
    scope: classifyScope(original, file, proofSymbols),
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

export { scanAssembly, translateNucleusAzmLine, writeTranslatedTree };

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
    if (options.translatedRoot !== undefined) {
      writeTranslatedTree(report, options.translatedRoot);
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
