/**
 * @file D8-backed Go to Definition support for Z80 assembly sources.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { D8DebugMap, D8Symbol } from '../mapping/d8-map';
import { parseD8DebugMap } from '../mapping/d8-map';
import { findProjectConfigPath, readProjectConfig } from './project-config';
import { resolveTargetNameForConfig } from './project-target-selection';

type D8DefinitionSymbol = {
  name: string;
  file: string;
  line: number;
  column?: number;
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

export function buildD8SymbolIndex(map: D8DebugMap): Map<string, D8DefinitionSymbol[]> {
  const index = new Map<string, D8DefinitionSymbol[]>();
  for (const [fileKey, entry] of Object.entries(map.files)) {
    if (fileKey.trim() === '') {
      continue;
    }
    for (const symbol of entry.symbols ?? []) {
      const line = symbol.line;
      if (line === undefined || line < 1) {
        continue;
      }
      const def: D8DefinitionSymbol = {
        name: symbol.name,
        file: fileKey,
        line,
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
    target?.sourceFile ?? target?.asm ?? target?.source ?? config.sourceFile ?? config.asm ?? config.source;
  const artifactBase =
    target?.artifactBase ??
    config.artifactBase ??
    (sourcePath !== undefined
      ? path.basename(sourcePath, path.extname(sourcePath))
      : targetName ?? config.target ?? config.defaultTarget);
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
  index: Map<string, D8DefinitionSymbol[]>,
  symbol: string,
  currentFile?: string
): D8DefinitionSymbol | undefined {
  const candidates = index.get(symbol) ?? (symbol.startsWith('@') ? [] : (index.get(`@${symbol}`) ?? []));
  if (candidates.length === 0) {
    return undefined;
  }
  if (currentFile !== undefined) {
    const currentKey = normalizePathKey(currentFile);
    const sameFile = candidates.find((candidate) => normalizePathKey(candidate.file) === currentKey);
    if (sameFile !== undefined) {
      return sameFile;
    }
  }
  const global = candidates.find((candidate) => candidate.scope === 'global');
  return global ?? candidates[0];
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
    const d8Path = resolveD8MapPathForTarget(folder.uri.fsPath, configPath, this.context.workspaceState);
    if (d8Path === undefined || !fs.existsSync(d8Path)) {
      void vscode.window.showInformationMessage(
        'Debug80: Build the current target before using Go to Definition.'
      );
      return undefined;
    }

    const parsed = parseD8DebugMap(fs.readFileSync(d8Path, 'utf-8'));
    if (parsed.map === undefined) {
      this.output?.appendLine(`Debug80: Could not read D8 map for definitions: ${parsed.error}`);
      return undefined;
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

function resolveProjectPath(projectRoot: string, value: string): string {
  return path.isAbsolute(value) ? value : path.join(projectRoot, value);
}

function normalizePathKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}
