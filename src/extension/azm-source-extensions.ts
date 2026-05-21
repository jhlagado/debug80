/**
 * @file Shared AZM source extension helpers for extension-side UX paths.
 */

import * as path from 'path';

export const AZM_ENTRY_SOURCE_EXTENSIONS = ['.asm', '.z80', '.a80', '.s'] as const;
export const AZM_LANGUAGE_EXTENSIONS = [...AZM_ENTRY_SOURCE_EXTENSIONS, '.asmi'] as const;
export const AZM_REBUILD_EXTENSIONS = AZM_LANGUAGE_EXTENSIONS;

function hasExtension(filePath: string, extensions: readonly string[]): boolean {
  return extensions.includes(path.extname(filePath).toLowerCase());
}

export function isAzmEntrySourcePath(filePath: string): boolean {
  return hasExtension(filePath, AZM_ENTRY_SOURCE_EXTENSIONS);
}

export function isAzmRebuildSourcePath(filePath: string): boolean {
  return hasExtension(filePath, AZM_REBUILD_EXTENSIONS);
}
