/**
 * @file Shared AZM source extension helpers for extension-side UX paths.
 */

export const AZM_LANGUAGE_EXTENSIONS = ['.asm', '.z80', '.asmi'] as const;

export function isAzmRebuildSourcePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) {
    return false;
  }
  const extension = filePath.slice(dot).toLowerCase();
  return AZM_LANGUAGE_EXTENSIONS.includes(extension as (typeof AZM_LANGUAGE_EXTENSIONS)[number]);
}
