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
  let proofLimitSymbols = 0;
  let lateIncludes = 0;

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\n/);
    sourceLines += lines.length;
    let seenSourceBeforeInclude = false;
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const raw = lines[index].replace(/\r$/, "");
      const code = stripComment(raw);
      const unquotedCode = maskQuoted(code);
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
          if (seenSourceBeforeInclude) {
            lateIncludes += 1;
            issues.push({
              code: "late-include",
              message: "AZM textual include appears after source; Atom %INCLUDE is header-only",
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
      if (code.trim() !== "" && !/^\s*\.include\b/i.test(code)) {
        seenSourceBeforeInclude = true;
      }
      if (directive === null) {
        const labelDirective = /^\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*:?\s+\.([A-Za-z][A-Za-z0-9_]*)\b\s*(.*)$/i.exec(code);
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
      proofLimitSymbols,
      lateIncludes,
      preprocessorSymbols: preprocessorSymbols.size,
    },
    supportedMappings: {
      mechanicalDirectives: [...mechanicalDirectives].sort(),
      contractMetadata: [".routine"],
      simpleConditionals: true,
      generatedLongSymbolLedger: true,
    },
    includeArguments: includeSummary,
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

function translateNucleusAzmLine(
  line,
  {
    sourceName = "<nucleus-asm>",
    lineNumber = 1,
    symbolMap = new Map(),
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

  const equ = /^(\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*:?\s+)\.equ(\b.*)$/i.exec(source);
  if (equ !== null) {
    const onePastLimit = /^(\s*)(AddressSpaceLimit|ProofMemoryEnd)(:?\s+)\.equ\s+\$10000\s*$/i.exec(source);
    if (onePastLimit !== null) {
      const original = onePastLimit[2];
      const atom = symbolMap.get(original) ?? original;
      return `${onePastLimit[1]}${atom}${onePastLimit[3]}EQU 0 ;@ATOM-PROOF-LIMIT ${original} 65536${comment === "" ? "" : ` ${comment}`}`;
    }
    const preprocessorDefinition = /^(\s*)([A-Za-z_.$?][A-Za-z0-9_.$?]*)(:?\s+)\.equ\b(.*)$/i.exec(source);
    if (preprocessorDefinition !== null && preprocessorSymbols.has(preprocessorDefinition[2])) {
      return `${preprocessorDefinition[1]}%DEFINE ${preprocessorDefinition[2]}${preprocessorDefinition[4]}${comment}`;
    }
    return `${replaceSymbolsInSource(`${equ[1]}EQU${equ[2]}`, symbolMap)}${comment}`;
  }

  const labelDirective = /^(\s*[A-Za-z_.$?][A-Za-z0-9_.$?]*:?\s+)\.([A-Za-z][A-Za-z0-9_]*)(\b.*)$/i.exec(source);
  if (labelDirective !== null) {
    const [, prefix, rawName, rest] = labelDirective;
    const replacement = directiveTranslations.get(rawName.toLowerCase());
    if (replacement === undefined) {
      throw new Error(`${context.file}:${context.line}: unsupported directive .${rawName}`);
    }
    return `${replaceSymbolsInSource(`${prefix}${replacement}${rest}`, symbolMap)}${comment}`;
  }

    return `${replaceSymbolsInSource(convertQuotedByteExpressions(source), symbolMap)}${comment}`;
}

function writeTranslatedTree(report, translatedRoot) {
  const symbolMap = symbolMapFromLedger(report.ledger);
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
    const define = /^(\s*)([A-Za-z_.$?][A-Za-z0-9_.$?]*)(:?\s+)\.equ\b(.*)$/i.exec(source);
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

function writeFlattenedEntry(report, entry, output) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${flattenTranslatedEntry(report, entry)}\n`);
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

export {
  flattenTranslatedEntry,
  scanAssembly,
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
