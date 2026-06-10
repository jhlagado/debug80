/**
 * @fileoverview Source-state setup for launch session assembly.
 */

import * as path from 'path';
import * as fs from 'fs';
import { buildSymbolIndex } from '../mapping/symbol-service';
import { SourceManager } from '../mapping/source-manager';
import type { SourceStateManager } from '../mapping/source-state-manager';
import {
  relativeIfPossible,
  resolveDebugMapPath,
  resolveRelative,
  resolveMappedPath,
} from '../mapping/path-resolver';
import type { PlatformKind } from './program-loader';
import type { MappingParseResult, SourceMapAnchor } from '../../mapping/types';
import type { SourceMapIndex } from '../../mapping/source-map';
import type { Logger } from '../../util/logger';
import type { LaunchRequestArguments } from '../session/types';
import type { SessionStateShape } from '../session/session-state';
import type { SourceMapDebugSymbol } from '../session/session-state';
import {
  parseD8DebugMap,
  type D8DebugMap,
  type D8FileEntry,
  type D8Symbol,
} from '../../mapping/d8-map';

export interface LaunchSourceBuildResult {
  sourceRoots: string[];
  mapping: MappingParseResult;
  mappingIndex: SourceMapIndex;
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
  sourceMapSymbols: SourceMapDebugSymbol[];
  romSourcePaths: string[];
  autoOpenRomSourcePaths: string[];
}

export function buildLaunchSourceState(
  args: LaunchRequestArguments,
  platform: PlatformKind,
  baseDir: string,
  asmPath: string | undefined,
  hexPath: string,
  sourceState: SourceStateManager,
  sessionState: SessionStateShape,
  logger: Logger
): LaunchSourceBuildResult {
  const preSourceRoots: string[] = [];
  for (const root of args.sourceRoots ?? []) {
    pushUniquePath(preSourceRoots, resolveRelative(root, baseDir));
  }
  if (asmPath !== undefined && asmPath.length > 0) {
    pushUniquePath(preSourceRoots, path.dirname(resolveRelative(asmPath, baseDir)));
  }
  pushUniquePath(preSourceRoots, resolveRelative(baseDir, baseDir));
  sessionState.sourceRoots = preSourceRoots;
  const resolvedSourceRoots = preSourceRoots.length > 0 ? preSourceRoots : (args.sourceRoots ?? []);
  const mappedPathCache = new Map<string, string | undefined>();
  const resolveSessionMappedPath = (file: string): string | undefined => {
    const cached = mappedPathCache.get(file);
    if (cached !== undefined || mappedPathCache.has(file)) {
      return cached;
    }
    const resolved = resolveMappedPath(file, undefined, sessionState.sourceRoots);
    mappedPathCache.set(file, resolved);
    return resolved;
  };

  sourceState.setManager(
    new SourceManager({
      platform,
      baseDir,
      resolveRelative: (value, dir) => resolveRelative(value, dir),
      resolveMappedPath: resolveSessionMappedPath,
      relativeIfPossible: (filePath, dir) => relativeIfPossible(filePath, dir),
      resolveDebugMapPath: (launchArgs, dir, asm, hex) =>
        resolveDebugMapPath(launchArgs as LaunchRequestArguments, dir, asm, hex),
      logger,
    })
  );

  const builtSourceState = sourceState.build({
    hexPath,
    ...(asmPath !== undefined && asmPath.length > 0 ? { asmPath } : {}),
    ...(args.sourceFile !== undefined && args.sourceFile.length > 0
      ? { sourceFile: args.sourceFile }
      : {}),
    sourceRoots: resolvedSourceRoots,
    debugMaps: args.debugMaps ?? [],
    mapArgs: {
      ...(args.artifactBase !== undefined && args.artifactBase.length > 0
        ? { artifactBase: args.artifactBase }
        : {}),
      ...(args.outputDir !== undefined && args.outputDir.length > 0
        ? { outputDir: args.outputDir }
        : {}),
    },
  });

  const symbolIndex = buildSymbolIndex({
    mapping: builtSourceState.mapping,
  });
  sourceState.lookupAnchors = symbolIndex.lookupAnchors;
  const auxiliarySourceRoots = sessionState.sourceRoots;
  const sourceMapSymbols = readSourceMapSymbols({
    baseDir,
    hexPath,
    asmPath,
    debugMaps: args.debugMaps ?? [],
    sourceRoots: auxiliarySourceRoots,
    mapArgs: {
      ...(args.artifactBase !== undefined && args.artifactBase.length > 0
        ? { artifactBase: args.artifactBase }
        : {}),
      ...(args.outputDir !== undefined && args.outputDir.length > 0
        ? { outputDir: args.outputDir }
        : {}),
    },
    resolveDebugMapPath: (mapArgs, dir, asm, hex) => resolveDebugMapPath(mapArgs, dir, asm, hex),
    logger,
  });

  return {
    sourceRoots: builtSourceState.sourceRoots,
    mapping: builtSourceState.mapping,
    mappingIndex: builtSourceState.mappingIndex,
    symbolAnchors: symbolIndex.anchors,
    symbolList: symbolIndex.list,
    romSourcePaths: collectDebugMapSourcePaths(args.debugMaps ?? [], auxiliarySourceRoots),
    autoOpenRomSourcePaths: collectDebugMapPrimarySourcePaths(
      args.debugMaps ?? [],
      auxiliarySourceRoots
    ),
    sourceMapSymbols:
      sourceMapSymbols.length > 0
        ? sourceMapSymbols
        : symbolIndex.list.map((symbol) => ({
            name: symbol.name,
            address: symbol.address,
            kind: 'label',
            file: sourceState.file ?? '',
          })),
  };
}

function readSourceMapSymbols(options: {
  baseDir: string;
  hexPath: string;
  asmPath: string | undefined;
  debugMaps: string[];
  sourceRoots: string[];
  mapArgs: { artifactBase?: string; outputDir?: string };
  resolveDebugMapPath: (
    args: { artifactBase?: string; outputDir?: string },
    baseDir: string,
    asmPath: string | undefined,
    hexPath: string
  ) => string;
  logger: Logger;
}): SourceMapDebugSymbol[] {
  const mapPaths = collectSourceMapSymbolPaths(options);
  const symbols: SourceMapDebugSymbol[] = [];
  for (const mapPath of mapPaths) {
    const map = readD8MapForSourceMapSymbols(mapPath, options.logger);
    if (map !== undefined) {
      symbols.push(...sourceMapSymbolsFromD8Map(map, mapPath, options.sourceRoots));
    }
  }
  return sortSourceMapSymbols(symbols);
}

function collectSourceMapSymbolPaths(options: {
  baseDir: string;
  hexPath: string;
  asmPath: string | undefined;
  debugMaps: string[];
  mapArgs: { artifactBase?: string; outputDir?: string };
  resolveDebugMapPath: (
    args: { artifactBase?: string; outputDir?: string },
    baseDir: string,
    asmPath: string | undefined,
    hexPath: string
  ) => string;
}): string[] {
  return [
    resolvePreferredSymbolMapPath({
      mapPath: options.resolveDebugMapPath(
        options.mapArgs,
        options.baseDir,
        options.asmPath,
        options.hexPath
      ),
    }),
    ...options.debugMaps,
  ].filter((mapPath): mapPath is string => mapPath !== undefined);
}

function readD8MapForSourceMapSymbols(mapPath: string, logger: Logger): D8DebugMap | undefined {
  try {
    const parsed = parseD8DebugMap(fs.readFileSync(mapPath, 'utf-8'));
    if (parsed.map === undefined) {
      logger.warn(`Debug80: Could not read source map symbols: ${parsed.error}`);
      return undefined;
    }
    return parsed.map;
  } catch (err) {
    logger.warn(`Debug80: Failed to read source map symbols: ${String(err)}`);
    return undefined;
  }
}

function sourceMapSymbolsFromD8Map(
  map: D8DebugMap,
  mapPath: string,
  sourceRoots: string[]
): SourceMapDebugSymbol[] {
  return Object.entries(map.files).flatMap(([file, entry]) =>
    sourceMapSymbolsFromD8File(file, entry, mapPath, sourceRoots)
  );
}

function sourceMapSymbolsFromD8File(
  file: string,
  entry: D8FileEntry,
  mapPath: string,
  sourceRoots: string[]
): SourceMapDebugSymbol[] {
  if (file.trim() === '') {
    return [];
  }
  const resolvedFile = resolveDebugMapFilePath(file, mapPath, sourceRoots);
  return (entry.symbols ?? []).map((symbol) => sourceMapSymbolFromD8Symbol(symbol, resolvedFile));
}

function sourceMapSymbolFromD8Symbol(symbol: D8Symbol, file: string): SourceMapDebugSymbol {
  return {
    name: symbol.name,
    file,
    ...(symbol.line !== undefined ? { line: symbol.line } : {}),
    ...(symbol.address !== undefined ? { address: symbol.address } : {}),
    ...(symbol.value !== undefined ? { value: symbol.value } : {}),
    ...(symbol.size !== undefined ? { size: symbol.size } : {}),
    ...(symbol.kind !== undefined ? { kind: symbol.kind } : {}),
    ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
  };
}

function sortSourceMapSymbols(symbols: SourceMapDebugSymbol[]): SourceMapDebugSymbol[] {
  return symbols.sort((a, b) => a.name.localeCompare(b.name));
}

function resolvePreferredSymbolMapPath(options: { mapPath: string }): string | undefined {
  return fs.existsSync(options.mapPath) ? options.mapPath : undefined;
}

function pushUniquePath(paths: string[], candidate: string): void {
  const normalized = path.resolve(candidate);
  if (!paths.some((entry) => path.resolve(entry) === normalized)) {
    paths.push(candidate);
  }
}

function collectDebugMapPrimarySourcePaths(debugMaps: string[], sourceRoots: string[]): string[] {
  const paths = new Set<string>();
  for (const mapPath of debugMaps) {
    try {
      const parsed = parseD8DebugMap(fs.readFileSync(mapPath, 'utf-8'));
      if (parsed.map === undefined) {
        continue;
      }
      const primarySource = findPrimaryDebugMapSource(
        mapPath,
        Object.keys(parsed.map.files),
        sourceRoots
      );
      if (primarySource !== undefined) {
        paths.add(primarySource);
      }
    } catch {
      // Source opening is best-effort; mapping load logs parse/read failures.
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function collectDebugMapSourcePaths(debugMaps: string[], sourceRoots: string[]): string[] {
  const paths = new Set<string>();
  for (const mapPath of debugMaps) {
    try {
      const parsed = parseD8DebugMap(fs.readFileSync(mapPath, 'utf-8'));
      if (parsed.map === undefined) {
        continue;
      }
      for (const file of Object.keys(parsed.map.files)) {
        if (file.trim().length === 0) {
          continue;
        }
        paths.add(resolveDebugMapFilePath(file, mapPath, sourceRoots));
      }
    } catch {
      // Source opening is best-effort; mapping load logs parse/read failures.
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function findPrimaryDebugMapSource(
  mapPath: string,
  files: string[],
  sourceRoots: string[]
): string | undefined {
  const mapBase = path.basename(mapPath, '.d8.json').toLowerCase();
  const candidates = files
    .filter((file) => file.trim().length > 0)
    .map((file) => resolveDebugMapFilePath(file, mapPath, sourceRoots));
  const exact = candidates.find(
    (file) => path.basename(file, path.extname(file)).toLowerCase() === mapBase
  );
  return exact ?? candidates[0];
}

function resolveDebugMapFilePath(file: string, mapPath: string, sourceRoots: string[]): string {
  if (path.isAbsolute(file)) {
    return file;
  }
  return resolveMappedPath(file, undefined, sourceRoots) ?? path.join(path.dirname(mapPath), file);
}
