/**
 * @fileoverview Cross-platform path utilities.
 * Provides Windows-safe path comparison and normalization functions.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Whether the current platform is Windows */
export const IS_WINDOWS = process.platform === 'win32';

/**
 * Probes the filesystem under `dir` for case sensitivity by checking whether
 * accessing the directory name in opposite case resolves to the same inode.
 * Falls back to `true` on Windows and `false` otherwise if the probe fails.
 */
function probeIsCaseInsensitive(dir: string): boolean {
  if (IS_WINDOWS) {
    return true;
  }
  try {
    const resolved = path.resolve(dir);
    const parent = path.dirname(resolved);
    const base = path.basename(resolved);
    if (base.length === 0) {
      return false;
    }
    const flipped = base === base.toLowerCase() ? base.toUpperCase() : base.toLowerCase();
    if (flipped === base) {
      return false;
    }
    const flippedPath = path.join(parent, flipped);
    const origStat = fs.statSync(resolved);
    let flippedStat: fs.Stats;
    try {
      flippedStat = fs.statSync(flippedPath);
    } catch {
      return false;
    }
    return origStat.ino === flippedStat.ino && origStat.dev === flippedStat.dev;
  } catch {
    return false;
  }
}

let caseInsensitiveFs: boolean | undefined;

function isCaseInsensitiveFs(): boolean {
  if (caseInsensitiveFs === undefined) {
    caseInsensitiveFs = probeIsCaseInsensitive(process.cwd());
  }
  return caseInsensitiveFs;
}

/**
 * Resolves to an absolute path and follows symlinks when the path exists (e.g. npm-linked trees).
 */
function canonicalizeExistingPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  try {
    if (fs.existsSync(resolved)) {
      return fs.realpathSync.native(resolved);
    }
  } catch {
    /* keep resolved */
  }
  return resolved;
}

/**
 * Canonical path for debugger {@link Source} / stack frames so they match VS Code's document URI
 * (realpath when the file exists; avoids lost current-line highlight with symlinks or odd casing).
 */
export function canonicalizeDebuggerSourcePath(filePath: string): string {
  return canonicalizeExistingPath(filePath);
}

/**
 * Normalizes a path for use as a map key.
 * Uses realpath when possible, lowercases on Windows and macOS so editor and map paths agree.
 *
 * @param filePath - Path to normalize
 * @returns Normalized path suitable for use as a map key
 */
export function normalizePathForKey(filePath: string): string {
  const resolved = canonicalizeExistingPath(filePath);
  return isCaseInsensitiveFs() ? resolved.toLowerCase() : resolved;
}

/**
 * Compares two file paths for equality.
 * Uses the same rules as {@link normalizePathForKey}.
 *
 * @param path1 - First path
 * @param path2 - Second path
 * @returns True if paths refer to the same file
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePathForKey(path1) === normalizePathForKey(path2);
}

/**
 * Checks if a path is contained within a base directory.
 * Uses case-insensitive comparison on Windows.
 * Properly handles path boundary (won't match /home/user with /home/use).
 *
 * @param filePath - Path to check
 * @param baseDir - Base directory
 * @returns True if filePath is within baseDir
 */
export function isPathWithin(filePath: string, baseDir: string): boolean {
  const normalizedPath = path.resolve(filePath);
  const normalizedBase = path.resolve(baseDir);

  // Ensure base ends with separator for proper prefix matching
  const baseWithSep = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;

  if (isCaseInsensitiveFs()) {
    const pathLower = normalizedPath.toLowerCase();
    const baseLower = baseWithSep.toLowerCase();
    // Also check if paths are exactly equal (file is the base dir itself)
    return pathLower === normalizedBase.toLowerCase() || pathLower.startsWith(baseLower);
  }

  return normalizedPath === normalizedBase || normalizedPath.startsWith(baseWithSep);
}

/**
 * Makes a path relative to base directory if contained within it.
 * Uses proper path boundary checking.
 *
 * @param filePath - File path to make relative
 * @param baseDir - Base directory
 * @returns Relative path if within base, otherwise absolute resolved path
 */
export function relativeIfWithin(filePath: string, baseDir: string): string {
  const normalizedPath = path.resolve(filePath);
  const normalizedBase = path.resolve(baseDir);

  if (isPathWithin(filePath, baseDir)) {
    return path.relative(normalizedBase, normalizedPath) || normalizedPath;
  }

  return normalizedPath;
}

/**
 * Converts a path to use forward slashes for portable storage.
 * Use this when storing paths in JSON files that may be shared across platforms.
 *
 * @param filePath - Path to normalize
 * @returns Path with forward slashes
 */
export function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

/**
 * Converts a portable path (forward slashes) to native platform separators.
 * Use this when reading paths from JSON files that use portable format.
 *
 * @param portablePath - Path with forward slashes
 * @returns Path with native separators
 */
export function fromPortablePath(portablePath: string): string {
  return portablePath.split('/').join(path.sep);
}

/**
 * Normalizes a relative path for portable storage.
 * Computes relative path from root and converts to forward slashes.
 *
 * @param root - Root directory
 * @param absolutePath - Absolute path to make relative
 * @returns Portable relative path with forward slashes
 */
export function toPortableRelative(root: string, absolutePath: string): string {
  const rel = path.relative(root, absolutePath) || path.basename(absolutePath);
  return toPortablePath(rel);
}
