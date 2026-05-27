/**
 * @file Source-map-backed editor navigation for Z80 assembly sources.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { D8DebugMap, D8Symbol } from '../mapping/d8-map';
import { parseD8DebugMap } from '../mapping/d8-map';
import { findProjectConfigPath, readProjectConfig } from './project-config';
import { resolveTargetNameForConfig } from './project-target-selection';

export type D8EditorSymbol = {
  name: string;
  file: string;
  line: number;
  column?: number;
  address?: number;
  value?: number;
  size?: number;
  kind?: D8Symbol['kind'];
  scope?: D8Symbol['scope'];
};

const SYMBOL_RE = /[@.$?A-Za-z_][@.$?A-Za-z0-9_]*/;
const D8_EXT = '.d8.json';

export function registerD8DefinitionProvider(
  context: vscode.ExtensionContext,
  output?: vscode.OutputChannel
): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [{ language: 'z80-asm' }],
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
      [{ language: 'z80-asm' }],
      new D8HoverProvider(context, output)
    )
  );
}

export function buildD8SymbolIndex(map: D8DebugMap): Map<string, D8EditorSymbol[]> {
  const index = new Map<string, D8EditorSymbol[]>();
  for (const [fileKey, entry] of Object.entries(map.files)) {
    if (fileKey.trim() === '') {
      continue;
    }
    for (const symbol of entry.symbols ?? []) {
      const line = symbol.line;
      if (line === undefined || line < 1) {
        continue;
      }
      const def: D8EditorSymbol = {
        name: symbol.name,
        file: fileKey,
        line,
        ...(symbol.address !== undefined ? { address: symbol.address } : {}),
        ...(symbol.value !== undefined ? { value: symbol.value } : {}),
        ...(symbol.size !== undefined ? { size: symbol.size } : {}),
        ...(symbol.kind !== undefined ? { kind: symbol.kind } : {}),
        ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
      };
      const list = index.get(symbol.name) ?? [];
      list.push(def);
      index.set(symbol.name, list);
    }
  }
  return index;
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
  const sourcePath =
    target?.sourceFile ??
    target?.asm ??
    target?.source ??
    config.sourceFile ??
    config.asm ??
    config.source;
  const artifactBase =
    target?.artifactBase ??
    config.artifactBase ??
    (sourcePath !== undefined
      ? path.basename(sourcePath, path.extname(sourcePath))
      : (targetName ?? config.target ?? config.defaultTarget));
  if (artifactBase === undefined || artifactBase.trim() === '') {
    return undefined;
  }
  const outputDir = target?.outputDir ?? config.outputDir;
  const baseDir =
    outputDir !== undefined && outputDir.trim() !== ''
      ? resolveProjectPath(projectRoot, outputDir)
      : sourcePath !== undefined
        ? path.dirname(resolveProjectPath(projectRoot, sourcePath))
        : projectRoot;
  return path.join(baseDir, `${artifactBase}${D8_EXT}`);
}

export function lookupD8Definition(
  index: Map<string, D8EditorSymbol[]>,
  symbol: string,
  currentFile?: string
): D8EditorSymbol | undefined {
  const candidates =
    index.get(symbol) ?? (symbol.startsWith('@') ? [] : (index.get(`@${symbol}`) ?? []));
  if (candidates.length === 0) {
    return undefined;
  }
  if (currentFile !== undefined) {
    const currentKey = normalizePathKey(currentFile);
    const sameFile = candidates.find(
      (candidate) => normalizePathKey(candidate.file) === currentKey
    );
    if (sameFile !== undefined) {
      return sameFile;
    }
  }
  const global = candidates.find((candidate) => candidate.scope === 'global');
  return global ?? candidates[0];
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
  const start = Math.max(0, definitionLine - 2);
  const contractLines: string[] = [];
  for (let i = start; i >= 0 && contractLines.length < 8; i -= 1) {
    const line = lines[i] ?? '';
    if (/^\s*$/.test(line)) {
      if (contractLines.length > 0) {
        break;
      }
      continue;
    }
    const match = /^\s*;!\s*(.*)$/.exec(line);
    if (!match) {
      break;
    }
    contractLines.unshift(match[1] ?? '');
  }
  const clauses = new Map<string, string>();
  for (const line of contractLines) {
    for (const part of line.split(';')) {
      const trimmed = part.trim();
      if (trimmed === '') {
        continue;
      }
      const compact = /^(in|out|clobbers|preserves)\s*:\s*(.+)$/i.exec(trimmed);
      const plain = /^(in|out|clobbers|preserves)\b\s+(.+)$/i.exec(trimmed);
      const match = compact ?? plain;
      if (!match) {
        continue;
      }
      const key = match[1]?.toLowerCase();
      const value = match[2]?.trim();
      if (key !== undefined && value !== undefined && value !== '') {
        clauses.set(key, value.replace(/\s*,\s*/g, ','));
      }
    }
  }
  const ordered = ['in', 'out', 'clobbers', 'preserves']
    .map((key) => {
      const value = clauses.get(key);
      return value !== undefined ? `${key}: ${value}` : undefined;
    })
    .filter((entry): entry is string => entry !== undefined);
  return ordered.length > 0 ? ordered.join('    ') : undefined;
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
      const sourceMtime = fs.statSync(resolveProjectPath(projectRoot, fileKey)).mtimeMs;
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
    const definition = lookupD8Definition(index, symbol, currentRelative);
    if (definition === undefined) {
      return undefined;
    }
    const targetPath = resolveProjectPath(folder.uri.fsPath, definition.file);
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
      const targetPath = resolveProjectPath(loaded.folder.uri.fsPath, symbol.file);
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
    const symbol = lookupD8Definition(buildD8SymbolIndex(loaded.map), symbolName, currentRelative);
    if (symbol === undefined) {
      return undefined;
    }
    const targetPath = resolveProjectPath(folder.uri.fsPath, symbol.file);
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
  const symbols: D8EditorSymbol[] = [];
  for (const [fileKey, entry] of Object.entries(map.files)) {
    if (fileKey.trim() === '') {
      continue;
    }
    for (const symbol of entry.symbols ?? []) {
      if (symbol.line === undefined || symbol.line < 1) {
        continue;
      }
      symbols.push({
        name: symbol.name,
        file: fileKey,
        line: symbol.line,
        ...(symbol.address !== undefined ? { address: symbol.address } : {}),
        ...(symbol.value !== undefined ? { value: symbol.value } : {}),
        ...(symbol.size !== undefined ? { size: symbol.size } : {}),
        ...(symbol.kind !== undefined ? { kind: symbol.kind } : {}),
        ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
      });
    }
  }
  return symbols.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
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
