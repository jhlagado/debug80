/**
 * @fileoverview Path resolution utilities for the Z80 debug adapter.
 * Handles resolving relative paths, finding files, and working with
 * workspace paths.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';
import { LaunchRequestArguments } from '../session/types';
import { FileResolutionError } from '../session/errors';
import {
  canonicalizeDebuggerSourcePath,
  isPathWithin,
  isWindowsAbsolutePath,
  relativeIfWithin,
} from './path-utils';
import { D8_DEBUG_MAP_EXT } from './d8-map-paths';

/**
 * Resolved artifact paths for a debug session.
 */
export interface ResolvedArtifacts {
  /** Path to the Intel HEX file */
  hexPath: string;
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
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const defaultWorkspace = workspaceFolders[0]?.uri.fsPath;

  // If a projectConfig is provided, use the workspace root that contains it.
  if (args.projectConfig !== undefined && args.projectConfig !== '') {
    const cfgPath = path.isAbsolute(args.projectConfig)
      ? args.projectConfig
      : defaultWorkspace !== undefined
        ? path.join(defaultWorkspace, args.projectConfig)
        : args.projectConfig;

    // Find the workspace folder that contains this config
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      if (cfgPath.startsWith(folderPath + path.sep) || cfgPath.startsWith(folderPath + '/')) {
        return folderPath;
      }
    }

    // Fall back to the config's parent directory (not .vscode itself)
    const cfgDir = path.dirname(cfgPath);
    if (cfgDir.endsWith(`${path.sep}.vscode`) || cfgDir.endsWith('/.vscode')) {
      return path.dirname(cfgDir);
    }

    return cfgDir;
  }

  return defaultWorkspace ?? process.cwd();
}

/**
 * Resolves a path relative to a base directory.
 *
 * @param p - Path to resolve
 * @param baseDir - Base directory for relative paths
 * @returns Absolute path
 */
export function resolveRelative(p: string, baseDir: string): string {
  if (path.isAbsolute(p) || isWindowsAbsolutePath(p)) {
    return p;
  }
  if (isWindowsAbsolutePath(baseDir)) {
    return path.win32.resolve(baseDir, p);
  }
  return path.resolve(baseDir, p);
}

/**
 * Normalizes a source path to an absolute path using the provided base directory.
 *
 * @param sourcePath - Source path to normalize
 * @param baseDir - Base directory
 * @returns Absolute normalized path
 */
export function normalizeSourcePath(sourcePath: string, baseDir: string): string {
  if (isWindowsAbsolutePath(sourcePath)) {
    return sourcePath;
  }
  if (path.isAbsolute(sourcePath)) {
    return path.resolve(sourcePath);
  }
  if (isWindowsAbsolutePath(baseDir)) {
    return path.win32.resolve(baseDir, sourcePath);
  }
  return path.resolve(baseDir, sourcePath);
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
 * Resolves build artifact paths from launch arguments.
 *
 * @param args - Launch request arguments
 * @param baseDir - Base directory
 * @returns Resolved artifact paths
 * @throws If required paths cannot be resolved
 */
export function resolveArtifacts(args: LaunchRequestArguments, baseDir: string): ResolvedArtifacts {
  const asmPath = resolveAsmPath(args.asm, baseDir);

  let hexPath = args.hex;
  const hexMissing = hexPath === undefined || hexPath === '';

  if (hexMissing) {
    if (asmPath === undefined || asmPath === '') {
      throw FileResolutionError.missingSource();
    }

    const artifactBase = args.artifactBase ?? path.basename(asmPath, path.extname(asmPath));
    const outDirRaw = args.outputDir ?? path.dirname(asmPath);
    const outDir = resolveRelative(outDirRaw, baseDir);

    hexPath = path.join(outDir, `${artifactBase}.hex`);
  }

  if (hexPath === undefined || hexPath === '') {
    throw FileResolutionError.missingArtifacts();
  }

  const hexAbs = resolveRelative(hexPath, baseDir);
  const result: ResolvedArtifacts = { hexPath: hexAbs };
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
 * Resolves the path to a D8 debug map file.
 *
 * @param args - Launch request arguments
 * @param baseDir - Base directory
 * @param asmPath - Assembly source path (optional)
 * @param hexPath - HEX artifact path
 * @returns Path to the debug map file
 */
export function resolveDebugMapPath(
  args: LaunchRequestArguments,
  baseDir: string,
  asmPath: string | undefined,
  hexPath: string
): string {
  const artifactBase =
    args.artifactBase ??
    (asmPath === undefined
      ? path.basename(hexPath, path.extname(hexPath))
      : path.basename(asmPath, path.extname(asmPath)));

  const outDirRaw = args.outputDir ?? path.dirname(hexPath);
  const outDir = resolveRelative(outDirRaw, baseDir);
  return path.join(outDir, `${artifactBase}${D8_DEBUG_MAP_EXT}`);
}

/**
 * Makes a path relative to base directory if possible.
 *
 * @param filePath - File path to make relative
 * @param baseDir - Base directory
 * @returns Relative path if within base, otherwise absolute
 */
export function relativeIfPossible(filePath: string, baseDir: string): string {
  if (isWindowsAbsolutePath(filePath) || isWindowsAbsolutePath(baseDir)) {
    return relativeIfWithin(filePath, baseDir);
  }

  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(filePath);

  if (isPathWithin(normalizedPath, normalizedBase)) {
    return path.relative(normalizedBase, normalizedPath) || normalizedPath;
  }

  return normalizedPath;
}

/**
 * Resolves a mapped file path using source roots.
 *
 * @param file - File path from source map
 * @param sourceRoots - Array of source root directories
 * @returns Resolved absolute path, or undefined
 */
function stripFileScheme(mappedFile: string): string {
  const trimmed = mappedFile.trim();
  if (trimmed.startsWith('file:')) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function resolveMappedPath(
  file: string,
  artifactPath: string | undefined,
  sourceRoots: string[]
): string | undefined {
  const raw = stripFileScheme(file);
  if (path.isAbsolute(raw) || isWindowsAbsolutePath(raw)) {
    const normalized = isWindowsAbsolutePath(raw) ? path.win32.normalize(raw) : path.normalize(raw);
    if (fs.existsSync(normalized)) {
      return canonicalizeDebuggerSourcePath(normalized);
    }
    return normalized;
  }

  const roots: string[] = [...sourceRoots];
  if (artifactPath !== undefined) {
    roots.push(path.dirname(artifactPath));
  }

  for (const root of roots) {
    const candidate = path.resolve(root, raw);
    if (fs.existsSync(candidate)) {
      return canonicalizeDebuggerSourcePath(candidate);
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
