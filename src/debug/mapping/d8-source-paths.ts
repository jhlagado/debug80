/**
 * @fileoverview Source file path helpers for native D8 source maps.
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { canonicalizeDebuggerSourcePath, isWindowsAbsolutePath } from './path-utils';

export function resolveDebugMapFilePath(
  file: string,
  mapPath: string,
  sourceRoots: string[],
  options: { fallbackDir?: string; canonicalize?: boolean } = {}
): string {
  const raw = stripFileScheme(file);
  if (path.isAbsolute(raw) || isWindowsAbsolutePath(raw)) {
    const normalized = isWindowsAbsolutePath(raw) ? path.win32.normalize(raw) : path.normalize(raw);
    return options.canonicalize !== false && fs.existsSync(normalized)
      ? canonicalizeDebuggerSourcePath(normalized)
      : normalized;
  }
  const resolved = resolveExistingSourceRootPath(raw, sourceRoots, options);
  return resolved ?? path.join(options.fallbackDir ?? path.dirname(mapPath), raw);
}

export function findPrimaryDebugMapSource(
  mapPath: string,
  files: string[],
  sourceRoots: string[]
): string | undefined {
  const mapBase = path.basename(mapPath, '.d8.json').toLowerCase();
  const candidates = files
    .filter((file) => file.trim().length > 0)
    .map((file) => resolveDebugMapFilePath(file, mapPath, sourceRoots));
  const exact = candidates.find(
    (file) => path.basename(file, path.extname(file)).toLowerCase() === mapBase
  );
  return exact ?? candidates[0];
}

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

function resolveExistingSourceRootPath(
  file: string,
  sourceRoots: string[],
  options: { canonicalize?: boolean }
): string | undefined {
  for (const root of sourceRoots) {
    const candidate = path.resolve(root, file);
    if (fs.existsSync(candidate)) {
      return options.canonicalize === false ? candidate : canonicalizeDebuggerSourcePath(candidate);
    }
  }
  return undefined;
}
