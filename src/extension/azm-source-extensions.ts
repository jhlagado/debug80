/**
 * @file Shared AZM source extension helpers for extension-side UX paths.
 */

import * as path from 'path';

export const AZM_ENTRY_SOURCE_EXTENSIONS = ['.z80'] as const;
export const AZM_ENTRY_SOURCE_SUFFIXES = ['.main.asm'] as const;
export const AZM_LANGUAGE_EXTENSIONS = ['.asm', '.z80', '.asmi'] as const;
export const AZM_REBUILD_EXTENSIONS = AZM_LANGUAGE_EXTENSIONS;

function hasExtension(filePath: string, extensions: readonly string[]): boolean {
  return extensions.includes(path.extname(filePath).toLowerCase());
}

export function isAzmEntrySourcePath(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  return (
    hasExtension(fileName, AZM_ENTRY_SOURCE_EXTENSIONS) ||
    AZM_ENTRY_SOURCE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))
  );
}

export function isAzmRebuildSourcePath(filePath: string): boolean {
  return hasExtension(filePath, AZM_REBUILD_EXTENSIONS);
}
