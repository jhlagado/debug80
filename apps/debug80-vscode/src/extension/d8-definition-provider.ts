/**
 * @file Source-map-backed editor navigation for Z80 assembly sources.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { D8DebugMap, D8Symbol } from '../mapping/d8-map';
import { parseD8DebugMap } from '../mapping/d8-map';
import { resolveDebugMapFilePath } from '../debug/mapping/d8-source-paths';
import { d8SymbolToSourceMapSymbol, type D8SourceMapSymbol } from '../debug/mapping/d8-symbols';
import { findProjectConfigPath, readProjectConfig } from './project-config';
import { resolveTargetNameForConfig } from './project-target-selection';

export type D8EditorSymbol = D8SourceMapSymbol & {
  line: number;
  column?: number;
};

type Debug80ProjectConfig = NonNullable<ReturnType<typeof readProjectConfig>>;
type Debug80TargetConfig = NonNullable<Debug80ProjectConfig['targets']>[string];
type ContractClauseKey = 'in' | 'out' | 'maybe-out' | 'clobbers' | 'preserves';

const SYMBOL_RE = /[@.$?A-Za-z_][@.$?A-Za-z0-9_]*/;
const D8_EXT = '.d8.json';
export const D8_SOURCE_LANGUAGES = ['z80-asm', 'glim'] as const;
const D8_DOCUMENT_SELECTOR = D8_SOURCE_LANGUAGES.map((language) => ({ language }));
const D8_INDEX_SOURCE_UNITS = new WeakMap<
  Map<string, D8EditorSymbol[]>,
  { byFile: Map<string, Set<string>>; all: Set<string> }
>();
const AZMDOC_CONTRACT_KEYS: ContractClauseKey[] = [
  'in',
  'out',
  'maybe-out',
  'clobbers',
  'preserves',
];

export function registerD8DefinitionProvider(
  context: vscode.ExtensionContext,
  output?: vscode.OutputChannel
): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      D8_DOCUMENT_SELECTOR,
      new D8DefinitionProvider(context, output)
    )
  );
}

export function registerD8WorkspaceSymbolProvider(
  context: vscode.ExtensionContext,
  output?: vscode.OutputChannel
): void {
  context.subscriptions.push(new D8WorkspaceSymbolProvider(context, output));
}

export function registerD8HoverProvider(
  context: vscode.ExtensionContext,
  output?: vscode.OutputChannel
): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      D8_DOCUMENT_SELECTOR,
      new D8HoverProvider(context, output)
    )
  );
}

export function buildD8SymbolIndex(map: D8DebugMap): Map<string, D8EditorSymbol[]> {
  const index = new Map<string, D8EditorSymbol[]>();
  const sourceUnitsByFile = new Map<string, Set<string>>();
  const allSourceUnits = new Set<string>();
  for (const symbol of collectD8EditorSymbols(map)) {
    addD8SymbolIndexEntry(index, symbol.name, symbol);
    const localName = ownerLocalSourceName(symbol);
    if (localName !== undefined) {
      addD8SymbolIndexEntry(index, localName, symbol);
    }
    const sourceName = sourcePrivateSourceName(symbol);
    if (sourceName !== undefined) {
      addD8SymbolIndexEntry(index, sourceName, symbol);
    }
    if (symbol.sourceUnit !== undefined) {
      const file = normalizePathKey(symbol.file);
      const sourceUnits = sourceUnitsByFile.get(file) ?? new Set<string>();
      const sourceUnit = normalizePathKey(symbol.sourceUnit);
      sourceUnits.add(sourceUnit);
      allSourceUnits.add(sourceUnit);
      sourceUnitsByFile.set(file, sourceUnits);
    }
  }
  D8_INDEX_SOURCE_UNITS.set(index, { byFile: sourceUnitsByFile, all: allSourceUnits });
  return index;
}

function addD8SymbolIndexEntry(
  index: Map<string, D8EditorSymbol[]>,
  name: string,
  symbol: D8EditorSymbol
): void {
  const list = index.get(name) ?? [];
  list.push(symbol);
  index.set(name, list);
}

function ownerLocalSourceName(symbol: D8EditorSymbol): string | undefined {
  if (symbol.visibility !== 'local') {
    return undefined;
  }
  const separator = symbol.name.lastIndexOf('._');
  return separator >= 0 ? symbol.name.slice(separator + 1) : undefined;
}

function sourcePrivateSourceName(symbol: D8EditorSymbol): string | undefined {
  if (symbol.visibility !== 'source') {
    return undefined;
  }
  const separator = symbol.name.lastIndexOf('::');
  return separator >= 0 ? symbol.name.slice(separator + 2) : undefined;
}

export function collectD8EditorSymbols(map: D8DebugMap): D8EditorSymbol[] {
  const symbols: D8EditorSymbol[] = [];
  for (const [fileKey, entry] of Object.entries(map.files)) {
    for (const symbol of entry.symbols ?? []) {
      const def = d8SymbolToEditorSymbol(fileKey, symbol);
      if (def !== undefined) {
        symbols.push(def);
      }
    }
  }
  return symbols;
}

export function d8SymbolToEditorSymbol(
  fileKey: string,
  symbol: D8Symbol
): D8EditorSymbol | undefined {
  if (fileKey.trim() === '' || symbol.line === undefined || symbol.line < 1) {
    return undefined;
  }
  return { ...d8SymbolToSourceMapSymbol(symbol, fileKey), line: symbol.line };
}

export function resolveD8MapPathForTarget(
  projectRoot: string,
  configPath: string,
  workspaceState: vscode.Memento | undefined
): string | undefined {
  const config = readProjectConfig(configPath);
  if (config === undefined) {
    return undefined;
  }
  const targetName = resolveTargetNameForConfig(workspaceState, configPath);
  const target = targetName !== undefined ? config.targets?.[targetName] : undefined;
  const sourcePath = resolveConfiguredSourcePath(config, target);
  const artifactBase = resolveConfiguredArtifactBase(config, target, targetName, sourcePath);
  if (artifactBase === undefined || artifactBase.trim() === '') {
    return undefined;
  }
  const baseDir = resolveD8OutputDirectory(
    projectRoot,
    config.outputDir,
    target?.outputDir,
    sourcePath
  );
  return path.join(baseDir, `${artifactBase}${D8_EXT}`);
}

function resolveConfiguredSourcePath(
  config: Debug80ProjectConfig,
  target: Debug80TargetConfig | undefined
): string | undefined {
  return (
    target?.sourceFile ??
    target?.asm ??
    target?.source ??
    config.sourceFile ??
    config.asm ??
    config.source
  );
}

function resolveConfiguredArtifactBase(
  config: Debug80ProjectConfig,
  target: Debug80TargetConfig | undefined,
  targetName: string | undefined,
  sourcePath: string | undefined
): string | undefined {
  if (target?.artifactBase !== undefined || config.artifactBase !== undefined) {
    return target?.artifactBase ?? config.artifactBase;
  }
  if (sourcePath !== undefined) {
    return path.basename(sourcePath, path.extname(sourcePath));
  }
  return targetName ?? config.target ?? config.defaultTarget;
}

function resolveD8OutputDirectory(
  projectRoot: string,
  configOutputDir: string | undefined,
  targetOutputDir: string | undefined,
  sourcePath: string | undefined
): string {
  const outputDir = targetOutputDir ?? configOutputDir;
  if (outputDir !== undefined && outputDir.trim() !== '') {
    return resolveProjectPath(projectRoot, outputDir);
  }
  if (sourcePath !== undefined) {
    return path.dirname(resolveProjectPath(projectRoot, sourcePath));
  }
  return projectRoot;
}

export function lookupD8Definition(
  index: Map<string, D8EditorSymbol[]>,
  symbol: string,
  currentFile?: string,
  currentLine?: number
): D8EditorSymbol | undefined {
  const sourceName = symbol.startsWith('@') ? symbol.slice(1) : symbol;
  const candidates = index.get(sourceName) ?? [];
  if (candidates.length === 0) {
    return undefined;
  }
  if (currentFile !== undefined) {
    const currentKey = normalizePathKey(currentFile);
    const provenance = D8_INDEX_SOURCE_UNITS.get(index);
    const hasPhysicalCandidate = candidates.some(
      (candidate) => normalizePathKey(candidate.file) === currentKey
    );
    const sourceUnits =
      provenance?.byFile.get(currentKey) ??
      (!hasPhysicalCandidate && provenance?.all.size === 1 ? provenance.all : undefined);
    const currentSourceUnit = sourceUnits?.size === 1 ? [...sourceUnits][0] : undefined;
    const sameFile = contextualCandidates(candidates, currentKey, currentSourceUnit, sourceUnits);
    const ownerLocal = findOwnerLocalDefinition(index, sameFile, currentLine, currentKey);
    if (ownerLocal !== undefined) {
      return ownerLocal;
    }
    const sameFileNonLocal = sameFile.find((candidate) => candidate.visibility !== 'local');
    if (sameFileNonLocal !== undefined) {
      return sameFileNonLocal;
    }
    if (currentLine === undefined && sameFile[0] !== undefined) {
      return sameFile[0];
    }
  }
  return candidates.find(
    (candidate) =>
      candidate.scope === 'global' &&
      candidate.visibility !== 'source' &&
      candidate.visibility !== 'local'
  );
}

function contextualCandidates(
  candidates: D8EditorSymbol[],
  currentKey: string,
  currentSourceUnit: string | undefined,
  knownSourceUnits: Set<string> | undefined
): D8EditorSymbol[] {
  if (knownSourceUnits !== undefined && knownSourceUnits.size > 1) {
    return [];
  }
  if (currentSourceUnit !== undefined) {
    return candidates.filter(
      (candidate) =>
        candidate.sourceUnit !== undefined &&
        normalizePathKey(candidate.sourceUnit) === currentSourceUnit
    );
  }
  const sourceUnitMatches = candidates.filter(
    (candidate) =>
      candidate.sourceUnit !== undefined && normalizePathKey(candidate.sourceUnit) === currentKey
  );
  if (sourceUnitMatches.length > 0) {
    return sourceUnitMatches;
  }

  const physicalFileMatches = candidates.filter(
    (candidate) => normalizePathKey(candidate.file) === currentKey
  );
  const sourceUnits = new Set(
    physicalFileMatches.map((candidate) => candidate.sourceUnit ?? candidate.file)
  );
  return sourceUnits.size <= 1 ? physicalFileMatches : [];
}

function findOwnerLocalDefinition(
  index: Map<string, D8EditorSymbol[]>,
  candidates: D8EditorSymbol[],
  currentLine: number | undefined,
  currentFile: string
): D8EditorSymbol | undefined {
  if (currentLine === undefined) {
    return undefined;
  }
  const matches = candidates
    .map((candidate) => ({ candidate, owner: ownerDefinition(index, candidate) }))
    .filter(
      (entry): entry is { candidate: D8EditorSymbol; owner: D8EditorSymbol } =>
        entry.owner !== undefined &&
        (normalizePathKey(entry.owner.file) !== currentFile || entry.owner.line <= currentLine)
    );
  if (matches.length === 1) {
    return matches[0]?.candidate;
  }
  return matches
    .filter((entry) => normalizePathKey(entry.owner.file) === currentFile)
    .sort((left, right) => right.owner.line - left.owner.line)[0]?.candidate;
}

function ownerDefinition(
  index: Map<string, D8EditorSymbol[]>,
  candidate: D8EditorSymbol
): D8EditorSymbol | undefined {
  if (candidate.visibility !== 'local') {
    return undefined;
  }
  const separator = candidate.name.lastIndexOf('._');
  if (separator < 0) {
    return undefined;
  }
  const ownerName = candidate.name.slice(0, separator);
  return index.get(ownerName)?.find((owner) => {
    if (candidate.sourceUnit !== undefined) {
      return owner.sourceUnit === candidate.sourceUnit;
    }
    return normalizePathKey(owner.file) === normalizePathKey(candidate.file);
  });
}

export function formatD8Hover(symbol: D8EditorSymbol, contractLine?: string): string {
  const lines = [symbol.name];
  const details: string[] = [];
  if (symbol.kind !== undefined) {
    details.push(formatSymbolKind(symbol.kind));
  }
  if (symbol.address !== undefined) {
    details.push(formatHex(symbol.address, 4));
  } else if (symbol.value !== undefined) {
    details.push(`${formatHex(symbol.value, 2)} / ${symbol.value}`);
  }
  if (symbol.size !== undefined && symbol.size > 0) {
    details.push(`${symbol.size} byte${symbol.size === 1 ? '' : 's'}`);
  }
  if (details.length > 0) {
    lines.push(details.join(' '));
  }
  if (contractLine !== undefined && contractLine.trim() !== '') {
    lines.push(contractLine);
  }
  lines.push(`${symbol.file}:${symbol.line}`);
  return lines.join('\n');
}

export function parseAzmDocContractNearLine(
  sourceText: string,
  definitionLine: number
): string | undefined {
  const lines = sourceText.split(/\r?\n/);
  const clauses = parseAzmDocContractClauses(collectAzmDocContractLines(lines, definitionLine));
  const ordered = formatAzmDocContractClauses(clauses);
  return ordered.length > 0 ? ordered.join('    ') : undefined;
}

function collectAzmDocContractLines(lines: string[], definitionLine: number): string[] {
  const start = Math.max(0, definitionLine - 2);
  const routine = /^\s*\.routine\b(.*)$/i.exec(lines[start] ?? '');
  return routine === null ? [] : [routine[1] ?? ''];
}

function parseAzmDocContractClauses(contractLines: string[]): Map<ContractClauseKey, string> {
  const clauses = new Map<ContractClauseKey, string>();
  for (const line of contractLines) {
    for (const part of line.split(';')) {
      for (const clause of parseAzmDocContractClausesFromText(part)) {
        clauses.set(clause.key, clause.value);
      }
    }
  }
  return clauses;
}

function parseAzmDocContractClausesFromText(
  text: string
): Array<{ key: ContractClauseKey; value: string }> {
  const clauses: Array<{ key: ContractClauseKey; value: string }> = [];
  const pattern =
    /\b(in|out|maybe-out|clobbers|preserves)\b\s*:?\s*(.+?)(?=\s+\b(?:in|out|maybe-out|clobbers|preserves)\b|$)/gi;
  for (const match of text.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    const value = match[2]?.trim();
    if (isContractClauseKey(key) && value !== undefined && value !== '') {
      clauses.push({ key, value: value.replace(/\s*,\s*/g, ',') });
    }
  }
  return clauses;
}

function formatAzmDocContractClauses(clauses: Map<ContractClauseKey, string>): string[] {
  return AZMDOC_CONTRACT_KEYS.map((key) => {
    const value = clauses.get(key);
    return value !== undefined ? `${key}: ${value}` : undefined;
  }).filter((entry): entry is string => entry !== undefined);
}

function isContractClauseKey(value: string | undefined): value is ContractClauseKey {
  return (
    value === 'in' ||
    value === 'out' ||
    value === 'maybe-out' ||
    value === 'clobbers' ||
    value === 'preserves'
  );
}

export function isD8MapPossiblyStale(
  map: D8DebugMap,
  mapPath: string,
  projectRoot: string
): boolean {
  let mapMtime = 0;
  try {
    mapMtime = fs.statSync(mapPath).mtimeMs;
  } catch {
    return false;
  }
  for (const fileKey of Object.keys(map.files)) {
    if (fileKey.trim() === '') {
      continue;
    }
    try {
      const sourceMtime = fs.statSync(
        resolveEditorDebugMapFilePath(fileKey, mapPath, projectRoot)
      ).mtimeMs;
      if (sourceMtime > mapMtime + 1000) {
        return true;
      }
    } catch {
      // Missing source files are handled by the feature that tries to navigate to them.
    }
  }
  return false;
}

class D8DefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output?: vscode.OutputChannel
  ) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Definition> {
    const wordRange = document.getWordRangeAtPosition(position, SYMBOL_RE);
    if (wordRange === undefined) {
      return undefined;
    }
    const symbol = document.getText(wordRange);
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (folder === undefined) {
      return undefined;
    }
    const configPath = findProjectConfigPath(folder);
    if (configPath === undefined) {
      return undefined;
    }
    const d8Path = resolveD8MapPathForTarget(
      folder.uri.fsPath,
      configPath,
      this.context.workspaceState
    );
    if (d8Path === undefined || !fs.existsSync(d8Path)) {
      void vscode.window.showInformationMessage(
        'Debug80: Source map missing. Build the target first.'
      );
      return undefined;
    }

    const parsed = parseD8DebugMap(fs.readFileSync(d8Path, 'utf-8'));
    if (parsed.map === undefined) {
      this.output?.appendLine(`Debug80: Could not read D8 map for definitions: ${parsed.error}`);
      return undefined;
    }
    if (isD8MapPossiblyStale(parsed.map, d8Path, folder.uri.fsPath)) {
      void vscode.window.showInformationMessage(
        'Debug80: Source map may be stale. Build again if navigation looks wrong.'
      );
    }
    const index = buildD8SymbolIndex(parsed.map);
    const currentRelative = path.relative(folder.uri.fsPath, document.uri.fsPath);
    const definition = lookupD8Definition(index, symbol, currentRelative, position.line + 1);
    if (definition === undefined) {
      return undefined;
    }
    const targetPath = resolveEditorDebugMapFilePath(definition.file, d8Path, folder.uri.fsPath);
    const targetPosition = new vscode.Position(Math.max(0, definition.line - 1), 0);
    return new vscode.Location(vscode.Uri.file(targetPath), targetPosition);
  }
}

class D8WorkspaceSymbolProvider implements vscode.Disposable {
  private readonly disposable: vscode.Disposable;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output?: vscode.OutputChannel
  ) {
    this.disposable = vscode.languages.registerWorkspaceSymbolProvider({
      provideWorkspaceSymbols: (query: string): vscode.ProviderResult<vscode.SymbolInformation[]> =>
        this.provideWorkspaceSymbols(query),
    });
  }

  dispose(): void {
    this.disposable.dispose();
  }

  private provideWorkspaceSymbols(query: string): vscode.SymbolInformation[] {
    const loaded = loadFirstWorkspaceD8Map(this.context, this.output);
    if (loaded === undefined) {
      return [];
    }
    const needle = query.trim().toLowerCase();
    const symbols = flattenD8Symbols(loaded.map).filter((symbol) =>
      needle === '' ? true : symbol.name.toLowerCase().includes(needle)
    );
    return symbols.map((symbol) => {
      const targetPath = resolveEditorDebugMapFilePath(
        symbol.file,
        loaded.path,
        loaded.folder.uri.fsPath
      );
      const location = new vscode.Location(
        vscode.Uri.file(targetPath),
        new vscode.Position(Math.max(0, symbol.line - 1), Math.max(0, (symbol.column ?? 1) - 1))
      );
      return new vscode.SymbolInformation(
        symbol.name,
        symbolKindForD8(symbol),
        formatSymbolKind(symbol.kind),
        location
      );
    });
  }
}

class D8HoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output?: vscode.OutputChannel
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const wordRange = document.getWordRangeAtPosition(position, SYMBOL_RE);
    if (wordRange === undefined) {
      return undefined;
    }
    const symbolName = document.getText(wordRange);
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (folder === undefined) {
      return undefined;
    }
    const loaded = loadD8MapForFolder(folder, this.context, this.output);
    if (loaded === undefined) {
      return undefined;
    }
    const currentRelative = path.relative(folder.uri.fsPath, document.uri.fsPath);
    const symbol = lookupD8Definition(
      buildD8SymbolIndex(loaded.map),
      symbolName,
      currentRelative,
      position.line + 1
    );
    if (symbol === undefined) {
      return undefined;
    }
    const targetPath = resolveEditorDebugMapFilePath(symbol.file, loaded.path, folder.uri.fsPath);
    const contractLine = readContractLine(targetPath, symbol.line);
    const markdown = new vscode.MarkdownString();
    markdown.appendCodeblock(formatD8Hover(symbol, contractLine), 'text');
    return new vscode.Hover(markdown, wordRange);
  }
}

function readContractLine(sourcePath: string, definitionLine: number): string | undefined {
  try {
    return parseAzmDocContractNearLine(fs.readFileSync(sourcePath, 'utf-8'), definitionLine);
  } catch {
    return undefined;
  }
}

function loadFirstWorkspaceD8Map(
  context: vscode.ExtensionContext,
  output?: vscode.OutputChannel
): { folder: vscode.WorkspaceFolder; map: D8DebugMap; path: string } | undefined {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const loaded = loadD8MapForFolder(folder, context, output);
    if (loaded !== undefined) {
      return loaded;
    }
  }
  return undefined;
}

function loadD8MapForFolder(
  folder: vscode.WorkspaceFolder,
  context: vscode.ExtensionContext,
  output?: vscode.OutputChannel
): { folder: vscode.WorkspaceFolder; map: D8DebugMap; path: string } | undefined {
  const configPath = findProjectConfigPath(folder);
  if (configPath === undefined) {
    return undefined;
  }
  const d8Path = resolveD8MapPathForTarget(folder.uri.fsPath, configPath, context.workspaceState);
  if (d8Path === undefined || !fs.existsSync(d8Path)) {
    return undefined;
  }
  const parsed = parseD8DebugMap(fs.readFileSync(d8Path, 'utf-8'));
  if (parsed.map === undefined) {
    output?.appendLine(`Debug80: Could not read source map: ${parsed.error}`);
    return undefined;
  }
  return { folder, map: parsed.map, path: d8Path };
}

function flattenD8Symbols(map: D8DebugMap): D8EditorSymbol[] {
  return collectD8EditorSymbols(map).sort(compareD8EditorSymbols);
}

function compareD8EditorSymbols(a: D8EditorSymbol, b: D8EditorSymbol): number {
  return a.name.localeCompare(b.name) || a.file.localeCompare(b.file);
}

function symbolKindForD8(symbol: D8EditorSymbol): vscode.SymbolKind {
  switch (symbol.kind) {
    case 'constant':
      return vscode.SymbolKind.Constant;
    case 'data':
      return vscode.SymbolKind.Variable;
    case 'macro':
      return vscode.SymbolKind.Function;
    case 'label':
    case 'unknown':
    default:
      return symbol.name.startsWith('@') ? vscode.SymbolKind.Function : vscode.SymbolKind.Field;
  }
}

function resolveProjectPath(projectRoot: string, value: string): string {
  return path.isAbsolute(value) ? value : path.join(projectRoot, value);
}

function resolveEditorDebugMapFilePath(file: string, mapPath: string, projectRoot: string): string {
  return resolveDebugMapFilePath(file, mapPath, [projectRoot], {
    fallbackDir: projectRoot,
    canonicalize: false,
  });
}

function normalizePathKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function formatSymbolKind(kind: D8Symbol['kind'] | undefined): string {
  switch (kind) {
    case 'constant':
      return 'constant';
    case 'data':
      return 'data';
    case 'macro':
      return 'macro';
    case 'label':
      return 'label';
    case 'unknown':
    case undefined:
    default:
      return 'symbol';
  }
}

function formatHex(value: number, minDigits: number): string {
  const digits = Math.max(minDigits, value > 0xffff ? 6 : value > 0xff ? 4 : 2);
  return `$${(value >>> 0).toString(16).toUpperCase().padStart(digits, '0')}`;
}
