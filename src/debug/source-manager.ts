/**
 * @fileoverview Source/mapping lifecycle helpers for debug sessions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MappingParseResult } from '../mapping/parser';
import { SourceMapIndex } from '../mapping/source-map';
import { buildMappingFromListing, MappingBuildResult } from './mapping-service';

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
  resolveExtraDebugMapPath: (listingPath: string) => string;
  resolveListingSourcePath: (listingPath: string) => string | undefined;
  log: (message: string) => void;
}

export interface SourceManagerState {
  sourceFile: string;
  sourceRoots: string[];
  extraListingPaths: string[];
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
  extraListings: string[];
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
  private resolveExtraDebugMapPath: (listingPath: string) => string;
  private resolveListingSourcePath: (listingPath: string) => string | undefined;
  private log: (message: string) => void;

  public constructor(options: SourceManagerOptions) {
    this.platform = options.platform;
    this.baseDir = options.baseDir;
    this.resolveRelative = options.resolveRelative;
    this.resolveMappedPath = options.resolveMappedPath;
    this.relativeIfPossible = options.relativeIfPossible;
    this.resolveDebugMapPath = options.resolveDebugMapPath;
    this.resolveExtraDebugMapPath = options.resolveExtraDebugMapPath;
    this.resolveListingSourcePath = options.resolveListingSourcePath;
    this.log = options.log;
  }

  public buildState(args: BuildSourceStateArgs): SourceManagerState {
    const sourceFileResolved = this.resolveMainSourceFile(
      args.asmPath,
      args.sourceFile,
      args.listingPath
    );
    const sourceRoots = this.resolveSourceRoots(args.sourceRoots);
    const extraListingPaths = this.resolveExtraListingPaths(
      args.extraListings,
      args.listingPath
    );
    const mergedRoots = this.extendSourceRoots(sourceRoots, extraListingPaths);

    const mappingResult = this.buildMapping({
      listingContent: args.listingContent,
      listingPath: args.listingPath,
      ...(args.asmPath !== undefined && args.asmPath.length > 0 ? { asmPath: args.asmPath } : {}),
      ...(args.sourceFile !== undefined && args.sourceFile.length > 0
        ? { sourceFile: args.sourceFile }
        : {}),
      extraListingPaths,
      mapArgs: args.mapArgs,
    });

    return {
      sourceFile: sourceFileResolved,
      sourceRoots: mergedRoots,
      extraListingPaths,
      mapping: mappingResult.mapping,
      mappingIndex: mappingResult.index,
      missingSources: mappingResult.missingSources,
    };
  }

  public collectRomSources(
    extraListingPaths: string[]
  ): Array<{ label: string; path: string; kind: 'listing' | 'source' }> {
    const seen = new Set<string>();
    return extraListingPaths.flatMap((listingPath) => {
      const entries: Array<{ label: string; path: string; kind: 'listing' | 'source' }> = [];
      const pushUnique = (entryPath: string, kind: 'listing' | 'source'): void => {
        if (seen.has(entryPath)) {
          return;
        }
        entries.push({ label: path.basename(entryPath), path: entryPath, kind });
        seen.add(entryPath);
      };

      pushUnique(listingPath, 'listing');
      const sourcePath = this.resolveListingSourcePath(listingPath);
      if (typeof sourcePath === 'string' && sourcePath.length > 0) {
        pushUnique(sourcePath, 'source');
      }
      return entries;
    });
  }

  private buildMapping(args: {
    listingContent: string;
    listingPath: string;
    asmPath?: string;
    sourceFile?: string;
    extraListingPaths: string[];
    mapArgs: { artifactBase?: string; outputDir?: string };
  }): MappingBuildResult {
    return buildMappingFromListing({
      listingContent: args.listingContent,
      listingPath: args.listingPath,
      ...(args.asmPath !== undefined && args.asmPath.length > 0 ? { asmPath: args.asmPath } : {}),
      ...(args.sourceFile !== undefined && args.sourceFile.length > 0
        ? { sourceFile: args.sourceFile }
        : {}),
      extraListingPaths: args.extraListingPaths,
      mapArgs: args.mapArgs,
      service: {
        platform: this.platform,
        baseDir: this.baseDir,
        resolveMappedPath: (file) => this.resolveMappedPath(file),
        relativeIfPossible: (filePath, dir) => this.relativeIfPossible(filePath, dir),
        resolveExtraDebugMapPath: (p) => this.resolveExtraDebugMapPath(p),
        resolveDebugMapPath: (args, dir, asm, listing) =>
          this.resolveDebugMapPath(args, dir, asm, listing),
        log: (message) => this.log(message),
      },
    });
  }

  private resolveMainSourceFile(
    asmPath: string | undefined,
    sourceFile: string | undefined,
    listingPath: string
  ): string {
    if (asmPath !== undefined && asmPath.length > 0) {
      return asmPath;
    }
    if (sourceFile !== undefined && sourceFile.length > 0) {
      return this.resolveRelative(sourceFile, this.baseDir);
    }
    return listingPath;
  }

  private resolveSourceRoots(roots: string[]): string[] {
    return roots.map((root) => this.resolveRelative(root, this.baseDir));
  }

  private resolveExtraListingPaths(extraListings: string[], primaryListingPath: string): string[] {
    if (!Array.isArray(extraListings) || extraListings.length === 0) {
      return [];
    }
    const resolved: string[] = [];
    const seen = new Set<string>();
    const primary = path.resolve(primaryListingPath);
    for (const entry of extraListings) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed === '') {
        continue;
      }
      const abs = this.resolveRelative(trimmed, this.baseDir);
      const normalized = path.resolve(abs);
      if (normalized === primary || seen.has(normalized)) {
        continue;
      }
      if (!fs.existsSync(normalized)) {
        const prefix = `Debug80 [${this.platform}]`;
        this.log(`${prefix}: extra listing not found at "${normalized}".`);
        continue;
      }
      resolved.push(normalized);
      seen.add(normalized);
    }
    return resolved;
  }

  private extendSourceRoots(sourceRoots: string[], listingPaths: string[]): string[] {
    if (listingPaths.length === 0) {
      return sourceRoots;
    }
    const roots = new Set(sourceRoots.map((root) => path.resolve(root)));
    const merged = [...sourceRoots];
    for (const listingPath of listingPaths) {
      const root = path.resolve(path.dirname(listingPath));
      if (!roots.has(root)) {
        merged.push(root);
        roots.add(root);
      }
    }
    return merged;
  }
}
