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
import type { MappingParseResult, SourceMapAnchor } from '../../mapping/parser';
import type { SourceMapIndex } from '../../mapping/source-map';
import type { Logger } from '../../util/logger';
import type { LaunchRequestArguments } from '../session/types';
import type { SessionStateShape } from '../session/session-state';
import type { SourceMapDebugSymbol } from '../session/session-state';
import { parseD8DebugMap } from '../../mapping/d8-map';

export interface LaunchSourceBuildResult {
  sourceRoots: string[];
  mapping: MappingParseResult;
  mappingIndex: SourceMapIndex;
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
  sourceMapSymbols: SourceMapDebugSymbol[];
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
  const sourceMapSymbols = readSourceMapSymbols({
    baseDir,
    hexPath,
    asmPath,
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
  mapArgs: { artifactBase?: string; outputDir?: string };
  resolveDebugMapPath: (
    args: { artifactBase?: string; outputDir?: string },
    baseDir: string,
    asmPath: string | undefined,
    hexPath: string
  ) => string;
  logger: Logger;
}): SourceMapDebugSymbol[] {
  const mapPath = resolvePreferredSymbolMapPath({
    mapPath: options.resolveDebugMapPath(
      options.mapArgs,
      options.baseDir,
      options.asmPath,
      options.hexPath
    ),
  });
  if (mapPath === undefined) {
    return [];
  }
  try {
    const parsed = parseD8DebugMap(fs.readFileSync(mapPath, 'utf-8'));
    if (parsed.map === undefined) {
      options.logger.warn(`Debug80: Could not read source map symbols: ${parsed.error}`);
      return [];
    }
    const symbols: SourceMapDebugSymbol[] = [];
    for (const [file, entry] of Object.entries(parsed.map.files)) {
      if (file.trim() === '') {
        continue;
      }
      for (const symbol of entry.symbols ?? []) {
        symbols.push({
          name: symbol.name,
          file,
          ...(symbol.line !== undefined ? { line: symbol.line } : {}),
          ...(symbol.address !== undefined ? { address: symbol.address } : {}),
          ...(symbol.value !== undefined ? { value: symbol.value } : {}),
          ...(symbol.size !== undefined ? { size: symbol.size } : {}),
          ...(symbol.kind !== undefined ? { kind: symbol.kind } : {}),
          ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
        });
      }
    }
    return symbols.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    options.logger.warn(`Debug80: Failed to read source map symbols: ${String(err)}`);
    return [];
  }
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
