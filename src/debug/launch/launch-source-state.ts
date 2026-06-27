/**
 * @fileoverview Source-state setup for launch session assembly.
 */

import * as fs from 'fs';
import { buildSymbolIndex } from '../mapping/symbol-service';
import type { SourceStateManager } from '../mapping/source-state-manager';
import { resolveDebugMapPath } from '../mapping/path-resolver';
import { findPrimaryDebugMapSource, resolveDebugMapFilePath } from '../mapping/d8-source-paths';
import { d8SymbolToSourceMapSymbol } from '../mapping/d8-symbols';
import type { PlatformKind } from './program-loader';
import type { MappingParseResult, SourceMapAnchor } from '../../mapping/types';
import type { SourceMapIndex } from '../../mapping/source-map';
import type { Logger } from '../../util/logger';
import type { LaunchRequestArguments } from '../session/types';
import type { SessionStateShape } from '../session/session-state';
import type { SourceMapDebugSymbol } from '../session/session-state';
import {
  buildLaunchSessionSourceRoots,
  buildSourceMapArgs,
  buildSourceStateBuildArgs,
  createSourceStateManager,
} from './source-state-build-options';
import {
  parseD8DebugMap,
  type D8DebugMap,
  type D8FileEntry,
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
  const preSourceRoots = buildLaunchSessionSourceRoots({ args, baseDir, asmPath });
  sessionState.sourceRoots = preSourceRoots;

  sourceState.setManager(
    createSourceStateManager({
      platform,
      baseDir,
      getSourceRoots: () => sessionState.sourceRoots,
      logger,
    })
  );

  const builtSourceState = sourceState.build(buildSourceStateBuildArgs({
    args,
    hexPath,
    asmPath,
    sourceRoots: preSourceRoots,
    debugMaps: args.debugMaps ?? [],
    debugMapAddressSpaces: args.debugMapAddressSpaces ?? {},
  }));

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
    mapArgs: buildSourceMapArgs(args),
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
  return (entry.symbols ?? []).map((symbol) =>
    d8SymbolToSourceMapSymbol(symbol, resolvedFile)
  );
}

function sortSourceMapSymbols(symbols: SourceMapDebugSymbol[]): SourceMapDebugSymbol[] {
  return symbols.sort((a, b) => a.name.localeCompare(b.name));
}

function resolvePreferredSymbolMapPath(options: { mapPath: string }): string | undefined {
  return fs.existsSync(options.mapPath) ? options.mapPath : undefined;
}

function collectDebugMapPrimarySourcePaths(debugMaps: string[], sourceRoots: string[]): string[] {
  const paths = new Set<string>();
  collectFromAuxiliaryDebugMaps(debugMaps, (mapPath, map) => {
    const primarySource = findPrimaryDebugMapSource(mapPath, Object.keys(map.files), sourceRoots);
    if (primarySource !== undefined) {
      paths.add(primarySource);
    }
  });
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function collectDebugMapSourcePaths(debugMaps: string[], sourceRoots: string[]): string[] {
  const paths = new Set<string>();
  collectFromAuxiliaryDebugMaps(debugMaps, (mapPath, map) => {
    for (const file of Object.keys(map.files)) {
      if (file.trim().length === 0) {
        continue;
      }
      paths.add(resolveDebugMapFilePath(file, mapPath, sourceRoots));
    }
  });
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function collectFromAuxiliaryDebugMaps(
  debugMaps: string[],
  collect: (mapPath: string, map: D8DebugMap) => void
): void {
  for (const mapPath of debugMaps) {
    try {
      const parsed = parseD8DebugMap(fs.readFileSync(mapPath, 'utf-8'));
      if (parsed.map !== undefined) {
        collect(mapPath, parsed.map);
      }
    } catch {
      // Source opening is best-effort; mapping load logs parse/read failures.
    }
  }
}
