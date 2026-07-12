/**
 * @fileoverview Source/mapping lifecycle helpers for debug sessions.
 */

import * as path from 'path';
import { MappingParseResult } from '../../mapping/types';
import type { SourceAddressSpace, SourceAddressTransform } from '../../mapping/types';
import { SourceMapIndex } from '../../mapping/source-map';
import { buildMappingFromDebugMap, MappingBuildResult } from './mapping-service';
import { Logger } from '../../util/logger';

export interface SourceManagerOptions {
  platform: string;
  baseDir: string;
  resolveRelative: (filePath: string, baseDir: string) => string;
  resolveMappedPath: (filePath: string) => string | undefined;
  relativeIfPossible: (filePath: string, baseDir: string) => string;
  resolveDebugMapPath: (
    args: { artifactBase?: string; outputDir?: string },
    baseDir: string,
    asmPath: string | undefined,
    hexPath: string
  ) => string;
  logger: Logger;
}

export interface SourceManagerState {
  sourceFile: string;
  sourceRoots: string[];
  mapping: MappingParseResult;
  mappingIndex: SourceMapIndex;
  missingSources: string[];
}

export interface BuildSourceStateArgs {
  hexPath: string;
  asmPath?: string;
  sourceFile?: string;
  sourceRoots: string[];
  debugMaps?: string[];
  debugMapAddressSpaces?: Record<string, SourceAddressSpace>;
  debugMapAddressTransforms?: Record<string, SourceAddressTransform>;
  mapArgs: { artifactBase?: string; outputDir?: string };
}

export class SourceManager {
  private platform: string;
  private baseDir: string;
  private resolveRelative: (filePath: string, baseDir: string) => string;
  private resolveMappedPath: (filePath: string) => string | undefined;
  private relativeIfPossible: (filePath: string, baseDir: string) => string;
  private resolveDebugMapPath: (
    args: { artifactBase?: string; outputDir?: string },
    baseDir: string,
    asmPath: string | undefined,
    hexPath: string
  ) => string;
  private logger: Logger;

  public constructor(options: SourceManagerOptions) {
    this.platform = options.platform;
    this.baseDir = options.baseDir;
    this.resolveRelative = options.resolveRelative;
    this.resolveMappedPath = options.resolveMappedPath;
    this.relativeIfPossible = options.relativeIfPossible;
    this.resolveDebugMapPath = options.resolveDebugMapPath;
    this.logger = options.logger;
  }

  public buildState(args: BuildSourceStateArgs): SourceManagerState {
    const sourceFileResolved = this.resolveMainSourceFile(
      args.asmPath,
      args.sourceFile,
      args.hexPath
    );
    let sourceRoots = this.resolveSourceRoots(args.sourceRoots);
    if (args.asmPath !== undefined && args.asmPath.length > 0) {
      const asmDir = path.dirname(this.resolveRelative(args.asmPath, this.baseDir));
      sourceRoots = [...sourceRoots, asmDir];
    }
    const mappingSourceForFallback =
      (args.asmPath !== undefined && args.asmPath.length > 0) ||
      (args.sourceFile !== undefined && args.sourceFile.length > 0)
        ? sourceFileResolved
        : undefined;

    const mappingResult = this.buildMapping({
      hexPath: args.hexPath,
      ...(args.asmPath !== undefined && args.asmPath.length > 0 ? { asmPath: args.asmPath } : {}),
      ...(mappingSourceForFallback !== undefined ? { sourceFile: mappingSourceForFallback } : {}),
      mapArgs: args.mapArgs,
      auxiliaryDebugMaps: args.debugMaps ?? [],
      debugMapAddressSpaces: args.debugMapAddressSpaces ?? {},
      debugMapAddressTransforms: args.debugMapAddressTransforms ?? {},
    });

    return {
      sourceFile: sourceFileResolved,
      sourceRoots,
      mapping: mappingResult.mapping,
      mappingIndex: mappingResult.index,
      missingSources: mappingResult.missingSources,
    };
  }

  private buildMapping(args: {
    hexPath: string;
    asmPath?: string;
    sourceFile?: string;
    mapArgs: { artifactBase?: string; outputDir?: string };
    auxiliaryDebugMaps: string[];
    debugMapAddressSpaces: Record<string, SourceAddressSpace>;
    debugMapAddressTransforms: Record<string, SourceAddressTransform>;
  }): MappingBuildResult {
    return buildMappingFromDebugMap({
      hexPath: args.hexPath,
      ...(args.asmPath !== undefined && args.asmPath.length > 0 ? { asmPath: args.asmPath } : {}),
      ...(args.sourceFile !== undefined && args.sourceFile.length > 0
        ? { sourceFile: args.sourceFile }
        : {}),
      mapArgs: args.mapArgs,
      auxiliaryDebugMaps: args.auxiliaryDebugMaps,
      debugMapAddressSpaces: args.debugMapAddressSpaces,
      debugMapAddressTransforms: args.debugMapAddressTransforms,
      service: {
        platform: this.platform,
        baseDir: this.baseDir,
        resolveMappedPath: (file) => this.resolveMappedPath(file),
        relativeIfPossible: (filePath, dir) => this.relativeIfPossible(filePath, dir),
        resolveDebugMapPath: (args, dir, asm, hex) => this.resolveDebugMapPath(args, dir, asm, hex),
        logger: this.logger,
      },
    });
  }

  private resolveMainSourceFile(
    asmPath: string | undefined,
    sourceFile: string | undefined,
    hexPath: string
  ): string {
    if (asmPath !== undefined && asmPath.length > 0) {
      return path.isAbsolute(asmPath)
        ? path.normalize(asmPath)
        : this.resolveRelative(asmPath, this.baseDir);
    }
    if (sourceFile !== undefined && sourceFile.length > 0) {
      return this.resolveRelative(sourceFile, this.baseDir);
    }
    return hexPath;
  }

  private resolveSourceRoots(roots: string[]): string[] {
    return roots.map((root) => this.resolveRelative(root, this.baseDir));
  }
}
