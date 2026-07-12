/**
 * @fileoverview Shared source-state build option helpers.
 */

import * as path from 'path';
import { SourceManager, type BuildSourceStateArgs } from '../mapping/source-manager';
import {
  relativeIfPossible,
  resolveDebugMapPath,
  resolveMappedPath,
  resolveRelative,
} from '../mapping/path-resolver';
import type { LaunchRequestArguments } from '../session/types';
import type { Logger } from '../../util/logger';

export function buildLaunchSessionSourceRoots(options: {
  args: Pick<LaunchRequestArguments, 'sourceRoots'>;
  baseDir: string;
  asmPath: string | undefined;
}): string[] {
  const roots: string[] = [];
  for (const root of options.args.sourceRoots ?? []) {
    pushUniquePath(roots, resolveRelative(root, options.baseDir));
  }
  if (options.asmPath !== undefined && options.asmPath.length > 0) {
    pushUniquePath(roots, path.dirname(resolveRelative(options.asmPath, options.baseDir)));
  }
  pushUniquePath(roots, resolveRelative(options.baseDir, options.baseDir));
  return roots;
}

export function buildSourceIdentityArgs(options: {
  args: Pick<LaunchRequestArguments, 'sourceFile'>;
  asmPath: string | undefined;
}): Pick<BuildSourceStateArgs, 'asmPath' | 'sourceFile'> {
  return {
    ...(options.asmPath !== undefined && options.asmPath.length > 0
      ? { asmPath: options.asmPath }
      : {}),
    ...(options.args.sourceFile !== undefined && options.args.sourceFile.length > 0
      ? { sourceFile: options.args.sourceFile }
      : {}),
  };
}

export function buildSourceMapArgs(
  args: Pick<LaunchRequestArguments, 'artifactBase' | 'outputDir'>
): BuildSourceStateArgs['mapArgs'] {
  return {
    ...(args.artifactBase !== undefined && args.artifactBase.length > 0
      ? { artifactBase: args.artifactBase }
      : {}),
    ...(args.outputDir !== undefined && args.outputDir.length > 0
      ? { outputDir: args.outputDir }
      : {}),
  };
}

export function buildSourceStateBuildArgs(options: {
  args: LaunchRequestArguments;
  hexPath: string;
  asmPath: string | undefined;
  sourceRoots: string[];
  debugMaps?: string[];
  debugMapAddressSpaces?: BuildSourceStateArgs['debugMapAddressSpaces'];
  debugMapAddressTransforms?: BuildSourceStateArgs['debugMapAddressTransforms'];
}): BuildSourceStateArgs {
  const debugMaps = options.debugMaps ?? options.args.debugMaps;
  const debugMapAddressSpaces = options.debugMapAddressSpaces ?? options.args.debugMapAddressSpaces;
  const debugMapAddressTransforms =
    options.debugMapAddressTransforms ?? options.args.debugMapAddressTransforms;
  return {
    hexPath: options.hexPath,
    ...buildSourceIdentityArgs({ args: options.args, asmPath: options.asmPath }),
    sourceRoots: options.sourceRoots,
    ...(debugMaps !== undefined ? { debugMaps } : {}),
    ...(debugMapAddressSpaces !== undefined ? { debugMapAddressSpaces } : {}),
    ...(debugMapAddressTransforms !== undefined ? { debugMapAddressTransforms } : {}),
    mapArgs: buildSourceMapArgs(options.args),
  };
}

export function createSourceStateManager(options: {
  platform: string;
  baseDir: string;
  getSourceRoots: () => string[];
  logger: Logger;
}): SourceManager {
  const mappedPathCache = new Map<string, string | undefined>();
  const resolveSessionMappedPath = (file: string): string | undefined => {
    const cached = mappedPathCache.get(file);
    if (cached !== undefined || mappedPathCache.has(file)) {
      return cached;
    }
    const resolved = resolveMappedPath(file, undefined, options.getSourceRoots());
    mappedPathCache.set(file, resolved);
    return resolved;
  };

  return new SourceManager({
    platform: options.platform,
    baseDir: options.baseDir,
    resolveRelative: (value, dir) => resolveRelative(value, dir),
    resolveMappedPath: resolveSessionMappedPath,
    relativeIfPossible: (filePath, dir) => relativeIfPossible(filePath, dir),
    resolveDebugMapPath: (args, dir, asm, hex) =>
      resolveDebugMapPath(args as LaunchRequestArguments, dir, asm, hex),
    logger: options.logger,
  });
}

function pushUniquePath(paths: string[], candidate: string): void {
  const normalized = path.resolve(candidate);
  if (!paths.some((entry) => path.resolve(entry) === normalized)) {
    paths.push(candidate);
  }
}
