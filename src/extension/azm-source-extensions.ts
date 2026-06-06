/**
 * @file Shared AZM source extension helpers for extension-side UX paths.
 */

import * as path from 'path';

export const AZM_LANGUAGE_EXTENSIONS = ['.asm', '.z80', '.asmi'] as const;

const AZM_ENTRY_SOURCE_SUFFIXES = ['.main.asm'] as const;
const AZM_ENTRY_SOURCE_FILENAMES: readonly string[] = ['main.asm'];

function hasExtension(filePath: string, extensions: readonly string[]): boolean {
  return extensions.includes(path.extname(filePath).toLowerCase());
}

export function isAzmEntrySourcePath(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  return (
    AZM_ENTRY_SOURCE_FILENAMES.includes(fileName) ||
    AZM_ENTRY_SOURCE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))
  );
}

export function isAzmRebuildSourcePath(filePath: string): boolean {
  return hasExtension(filePath, AZM_LANGUAGE_EXTENSIONS);
}
