/**
 * @fileoverview Source-state setup for launch session assembly.
 */

import * as path from 'path';
import { buildSymbolIndex } from './symbol-service';
import { SourceManager } from './source-manager';
import type { SourceStateManager } from './source-state-manager';
import {
  relativeIfPossible,
  resolveDebugMapPath,
  resolveExtraDebugMapPath,
  resolveRelative,
  type LaunchArgsHelpers,
} from './launch-args';
import {
  resolveListingSourcePath,
  resolveMappedPath,
} from './path-resolver';
import type { PlatformKind } from './program-loader';
import type { MappingParseResult, SourceMapAnchor } from '../mapping/parser';
import type { SourceMapIndex } from '../mapping/source-map';
import type { Logger } from '../util/logger';
import type { LaunchRequestArguments } from './types';
import type { SessionStateShape } from './session-state';

export interface LaunchSourceBuildResult {
  sourceRoots: string[];
  extraListingPaths: string[];
  mapping: MappingParseResult;
  mappingIndex: SourceMapIndex;
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
}

export function buildLaunchSourceState(
  args: LaunchRequestArguments,
  platform: PlatformKind,
  baseDir: string,
  asmPath: string | undefined,
  listingPath: string,
  listingContent: string,
  extraListings: string[],
  sourceState: SourceStateManager,
  sessionState: SessionStateShape,
  launchArgsHelpers: LaunchArgsHelpers,
  logger: Logger
): LaunchSourceBuildResult {
  sessionState.listingPath = listingPath;
  const preSourceRoots: string[] = [];
  for (const root of args.sourceRoots ?? []) {
    preSourceRoots.push(resolveRelative(root, baseDir));
  }
  if (asmPath !== undefined && asmPath.length > 0) {
    preSourceRoots.push(path.dirname(resolveRelative(asmPath, baseDir)));
  }
  sessionState.sourceRoots = preSourceRoots;
  const resolvedSourceRoots = preSourceRoots.length > 0 ? preSourceRoots : args.sourceRoots ?? [];

  sourceState.setManager(
    new SourceManager({
      platform,
      baseDir,
      resolveRelative: (value, dir) => resolveRelative(value, dir),
      resolveMappedPath: (file): string | undefined =>
        resolveMappedPath(file, sessionState.listingPath, sessionState.sourceRoots),
      relativeIfPossible: (filePath, dir) => relativeIfPossible(filePath, dir),
      resolveExtraDebugMapPath: (value) => resolveExtraDebugMapPath(value, launchArgsHelpers),
      resolveDebugMapPath: (launchArgs, dir, asm, listing) =>
        resolveDebugMapPath(
          launchArgs as LaunchRequestArguments,
          dir,
          asm,
          listing,
          launchArgsHelpers
        ),
      resolveListingSourcePath: (listing) => resolveListingSourcePath(listing),
      logger,
    })
  );

  const builtSourceState = sourceState.build({
    listingContent,
    listingPath,
    ...(asmPath !== undefined && asmPath.length > 0 ? { asmPath } : {}),
    ...(args.sourceFile !== undefined && args.sourceFile.length > 0
      ? { sourceFile: args.sourceFile }
      : {}),
    sourceRoots: resolvedSourceRoots,
    extraListings,
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
    listingContent,
    sourceFile: sourceState.file,
  });
  sourceState.lookupAnchors = symbolIndex.lookupAnchors;

  return {
    sourceRoots: builtSourceState.sourceRoots,
    extraListingPaths: builtSourceState.extraListingPaths,
    mapping: builtSourceState.mapping,
    mappingIndex: builtSourceState.mappingIndex,
    symbolAnchors: symbolIndex.anchors,
    symbolList: symbolIndex.list,
  };
}
