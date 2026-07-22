/**
 * @file Shared source extension helpers for extension-side UX paths.
 */

export const AZM_LANGUAGE_EXTENSIONS = ['.asm', '.z80', '.asmi'] as const;
export const DEBUG80_REBUILD_SOURCE_EXTENSIONS = [...AZM_LANGUAGE_EXTENSIONS, '.glim'] as const;

export function isDebug80RebuildSourcePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) {
    return false;
  }
  const extension = filePath.slice(dot).toLowerCase();
  return DEBUG80_REBUILD_SOURCE_EXTENSIONS.includes(
    extension as (typeof DEBUG80_REBUILD_SOURCE_EXTENSIONS)[number]
  );
}
