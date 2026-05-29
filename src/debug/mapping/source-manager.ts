/**
 * @fileoverview Source/mapping lifecycle helpers for debug sessions.
 */

import * as path from 'path';
import { MappingParseResult } from '../../mapping/parser';
import { SourceMapIndex } from '../../mapping/source-map';
import { buildMappingFromListing, MappingBuildResult } from './mapping-service';
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
    listingPath: string
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
  listingContent: string;
  listingPath: string;
  asmPath?: string;
  sourceFile?: string;
  sourceRoots: string[];
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
    listingPath: string
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
      args.listingPath
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
      listingContent: args.listingContent,
      listingPath: args.listingPath,
      ...(args.asmPath !== undefined && args.asmPath.length > 0 ? { asmPath: args.asmPath } : {}),
      ...(mappingSourceForFallback !== undefined ? { sourceFile: mappingSourceForFallback } : {}),
      mapArgs: args.mapArgs,
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
    listingContent: string;
    listingPath: string;
    asmPath?: string;
    sourceFile?: string;
    mapArgs: { artifactBase?: string; outputDir?: string };
  }): MappingBuildResult {
    return buildMappingFromListing({
      listingContent: args.listingContent,
      listingPath: args.listingPath,
      ...(args.asmPath !== undefined && args.asmPath.length > 0 ? { asmPath: args.asmPath } : {}),
      ...(args.sourceFile !== undefined && args.sourceFile.length > 0
        ? { sourceFile: args.sourceFile }
        : {}),
      mapArgs: args.mapArgs,
      service: {
        platform: this.platform,
        baseDir: this.baseDir,
        resolveMappedPath: (file) => this.resolveMappedPath(file),
        relativeIfPossible: (filePath, dir) => this.relativeIfPossible(filePath, dir),
        resolveDebugMapPath: (args, dir, asm, listing) =>
          this.resolveDebugMapPath(args, dir, asm, listing),
        logger: this.logger,
      },
    });
  }

  private resolveMainSourceFile(
    asmPath: string | undefined,
    sourceFile: string | undefined,
    listingPath: string
  ): string {
    if (asmPath !== undefined && asmPath.length > 0) {
      return path.isAbsolute(asmPath)
        ? path.normalize(asmPath)
        : this.resolveRelative(asmPath, this.baseDir);
    }
    if (sourceFile !== undefined && sourceFile.length > 0) {
      return this.resolveRelative(sourceFile, this.baseDir);
    }
    return listingPath;
  }

  private resolveSourceRoots(roots: string[]): string[] {
    return roots.map((root) => this.resolveRelative(root, this.baseDir));
  }
}
