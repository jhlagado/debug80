/**
 * @fileoverview Path resolution utilities for the Z80 debug adapter.
 * Handles resolving relative paths, finding files, and working with
 * workspace paths.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { LaunchRequestArguments } from './types';
import { FileResolutionError } from './errors';
import { isPathWithin } from './path-utils';

/**
 * Length of cache key hash (hex digits).
 */
export const CACHE_KEY_LENGTH = 12;

/**
 * Resolved artifact paths for a debug session.
 */
export interface ResolvedArtifacts {
  /** Path to the Intel HEX file */
  hexPath: string;
  /** Path to the listing file */
  listingPath: string;
  /** Path to the assembly source file (if known) */
  asmPath?: string;
}

/**
 * Resolves the base directory for a debug session.
 *
 * @param args - Launch request arguments
 * @returns The base directory path
 */
export function resolveBaseDir(args: LaunchRequestArguments): string {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // If a projectConfig is provided, use the workspace root when the config lives
  // inside it (including .vscode), otherwise fall back to the config directory.
  if (args.projectConfig !== undefined && args.projectConfig !== '') {
    const cfgPath = path.isAbsolute(args.projectConfig)
      ? args.projectConfig
      : workspace !== undefined
        ? path.join(workspace, args.projectConfig)
        : args.projectConfig;

    if (workspace !== undefined && cfgPath.startsWith(workspace)) {
      return workspace;
    }

    return path.dirname(cfgPath);
  }

  return workspace ?? process.cwd();
}

/**
 * Resolves a path relative to a base directory.
 *
 * @param p - Path to resolve
 * @param baseDir - Base directory for relative paths
 * @returns Absolute path
 */
export function resolveRelative(p: string, baseDir: string): string {
  if (path.isAbsolute(p)) {
    return p;
  }
  return path.resolve(baseDir, p);
}

/**
 * Resolves the path to an assembly source file.
 *
 * @param asm - Assembly path from arguments
 * @param baseDir - Base directory
 * @returns Absolute path, or undefined
 */
export function resolveAsmPath(asm: string | undefined, baseDir: string): string | undefined {
  if (asm === undefined || asm === '') {
    return undefined;
  }
  if (path.isAbsolute(asm)) {
    return asm;
  }
  return path.resolve(baseDir, asm);
}

/**
 * Resolves HEX and listing file paths from launch arguments.
 *
 * @param args - Launch request arguments
 * @param baseDir - Base directory
 * @returns Resolved artifact paths
 * @throws If required paths cannot be resolved
 */
export function resolveArtifacts(args: LaunchRequestArguments, baseDir: string): ResolvedArtifacts {
  const asmPath = resolveAsmPath(args.asm, baseDir);

  let hexPath = args.hex;
  let listingPath = args.listing;

  const hexMissing = hexPath === undefined || hexPath === '';
  const listingMissing = listingPath === undefined || listingPath === '';

  if (hexMissing || listingMissing) {
    if (asmPath === undefined || asmPath === '') {
      throw FileResolutionError.missingSource();
    }

    const artifactBase = args.artifactBase ?? path.basename(asmPath, path.extname(asmPath));
    const outDirRaw = args.outputDir ?? path.dirname(asmPath);
    const outDir = resolveRelative(outDirRaw, baseDir);

    hexPath = path.join(outDir, `${artifactBase}.hex`);
    listingPath = path.join(outDir, `${artifactBase}.lst`);
  }

  if (hexPath === undefined || listingPath === undefined || hexPath === '' || listingPath === '') {
    throw FileResolutionError.missingArtifacts();
  }

  const hexAbs = resolveRelative(hexPath, baseDir);
  const listingAbs = resolveRelative(listingPath, baseDir);

  const result: ResolvedArtifacts = { hexPath: hexAbs, listingPath: listingAbs };
  if (asmPath !== undefined) {
    result.asmPath = asmPath;
  }
  return result;
}

/**
 * Resolves source roots from launch arguments.
 *
 * @param args - Launch request arguments
 * @param baseDir - Base directory
 * @returns Array of resolved source root paths
 */
export function resolveSourceRoots(args: LaunchRequestArguments, baseDir: string): string[] {
  const roots = args.sourceRoots ?? [];
  return roots.map((root) => resolveRelative(root, baseDir));
}

/**
 * Resolves the cache directory path.
 *
 * @param baseDir - Base directory
 * @returns Cache directory path, or undefined if it cannot be created
 */
export function resolveCacheDir(baseDir: string): string | undefined {
  if (!baseDir || baseDir.length === 0) {
    return undefined;
  }

  try {
    const stat = fs.statSync(baseDir);
    if (!stat.isDirectory()) {
      return undefined;
    }

    const cacheDir = path.resolve(baseDir, '.debug80', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    return cacheDir;
  } catch {
    return undefined;
  }
}

/**
 * Builds a cache key for a listing file based on its path.
 *
 * @param listingPath - Path to the listing file
 * @returns Short hash string for use as cache key
 */
export function buildListingCacheKey(listingPath: string): string {
  const normalized = path.resolve(listingPath);
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, CACHE_KEY_LENGTH);
}

/**
 * Resolves the path to a D8 debug map file.
 *
 * @param args - Launch request arguments
 * @param baseDir - Base directory
 * @param asmPath - Assembly source path (optional)
 * @param listingPath - Listing file path
 * @returns Path to the debug map file
 */
export function resolveDebugMapPath(
  args: LaunchRequestArguments,
  baseDir: string,
  asmPath: string | undefined,
  listingPath: string
): string {
  const artifactBase =
    args.artifactBase ??
    (asmPath === undefined
      ? path.basename(listingPath, '.lst')
      : path.basename(asmPath, path.extname(asmPath)));

  const cacheDir = resolveCacheDir(baseDir);
  if (cacheDir !== undefined && cacheDir.length > 0) {
    const key = buildListingCacheKey(listingPath);
    return path.join(cacheDir, `${artifactBase}.${key}.d8dbg.json`);
  }

  const outDirRaw = args.outputDir ?? path.dirname(listingPath);
  const outDir = resolveRelative(outDirRaw, baseDir);
  return path.join(outDir, `${artifactBase}.d8dbg.json`);
}

/**
 * Resolves the path to a D8 debug map for an extra listing file.
 *
 * @param listingPath - Path to the extra listing file
 * @param baseDir - Base directory
 * @returns Path to the debug map file
 */
export function resolveExtraDebugMapPath(listingPath: string, baseDir: string): string {
  const base = path.basename(listingPath, path.extname(listingPath));
  const cacheDir = resolveCacheDir(baseDir);

  if (cacheDir !== undefined && cacheDir.length > 0) {
    const key = buildListingCacheKey(listingPath);
    return path.join(cacheDir, `${base}.${key}.d8dbg.json`);
  }

  const dir = path.dirname(listingPath);
  return path.join(dir, `${base}.d8dbg.json`);
}

/**
 * Makes a path relative to base directory if possible.
 *
 * @param filePath - File path to make relative
 * @param baseDir - Base directory
 * @returns Relative path if within base, otherwise absolute
 */
export function relativeIfPossible(filePath: string, baseDir: string): string {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(filePath);

  if (isPathWithin(normalizedPath, normalizedBase)) {
    return path.relative(normalizedBase, normalizedPath) || normalizedPath;
  }

  return normalizedPath;
}

/**
 * Checks if a debug map file is older than its source listing.
 *
 * @param mapPath - Path to the debug map file
 * @param listingPath - Path to the listing file
 * @returns True if the map is stale
 */
export function isDebugMapStale(mapPath: string, listingPath: string): boolean {
  if (!fs.existsSync(mapPath) || !fs.existsSync(listingPath)) {
    return false;
  }

  try {
    const mapStat = fs.statSync(mapPath);
    const listingStat = fs.statSync(listingPath);
    return listingStat.mtimeMs > mapStat.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Resolves extra listing file paths.
 *
 * @param extraListings - Array of extra listing paths
 * @param baseDir - Base directory
 * @param primaryListingPath - Primary listing path to exclude
 * @param onMissing - Callback for missing files
 * @returns Array of resolved extra listing paths
 */
export function resolveExtraListingPaths(
  extraListings: string[],
  baseDir: string,
  primaryListingPath: string,
  onMissing?: (path: string) => void
): string[] {
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

    const abs = resolveRelative(trimmed, baseDir);
    const normalized = path.resolve(abs);

    if (normalized === primary || seen.has(normalized)) {
      continue;
    }

    if (!fs.existsSync(normalized)) {
      if (onMissing) {
        onMissing(normalized);
      }
      continue;
    }

    resolved.push(normalized);
    seen.add(normalized);
  }

  return resolved;
}

/**
 * Resolves the source file path for a listing file.
 *
 * @param listingPath - Path to the listing file
 * @returns Path to the source file, or undefined
 */
export function resolveListingSourcePath(listingPath: string): string | undefined {
  const dir = path.dirname(listingPath);
  const base = path.basename(listingPath, path.extname(listingPath));
  const candidates = [`${base}.source.asm`, `${base}.asm`];

  for (const candidate of candidates) {
    const candidatePath = path.join(dir, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
}

/**
 * Resolves a mapped file path using source roots.
 *
 * @param file - File path from source map
 * @param listingPath - Path to the listing file
 * @param sourceRoots - Array of source root directories
 * @returns Resolved absolute path, or undefined
 */
export function resolveMappedPath(
  file: string,
  listingPath: string | undefined,
  sourceRoots: string[]
): string | undefined {
  if (path.isAbsolute(file)) {
    return file;
  }

  const roots: string[] = [];
  if (listingPath !== undefined) {
    roots.push(path.dirname(listingPath));
  }
  roots.push(...sourceRoots);

  for (const root of roots) {
    const candidate = path.resolve(root, file);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Resolves a fallback source file path.
 *
 * @param sourceFile - Source file from arguments
 * @param baseDir - Base directory
 * @param sourceRoots - Array of source root directories
 * @returns Resolved path suitable for use in source maps
 */
export function resolveFallbackSourceFile(
  sourceFile: string,
  baseDir: string,
  sourceRoots: string[]
): string | undefined {
  const resolved = resolveRelative(sourceFile, baseDir);

  for (const root of sourceRoots) {
    const rel = path.relative(root, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel;
    }
  }

  return resolved;
}
