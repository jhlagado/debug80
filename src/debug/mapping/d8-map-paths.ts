/**
 * @fileoverview Canonical and legacy filenames for D8 debug maps on disk.
 */

/** Current extension (includes leading dot), e.g. `build/main.d8.json` */
export const D8_DEBUG_MAP_EXT = '.d8.json';

/** Previous extension; still read for one release, removed after successful write to `.d8.json` */
const LEGACY_D8_DEBUG_MAP_EXT = '.d8dbg.json';

/**
 * If `canonicalPath` ends with {@link D8_DEBUG_MAP_EXT}, returns the same path with the legacy suffix.
 */
export function legacyDebugMapPath(canonicalPath: string): string | null {
  if (!canonicalPath.endsWith(D8_DEBUG_MAP_EXT)) {
    return null;
  }
  return canonicalPath.slice(0, -D8_DEBUG_MAP_EXT.length) + LEGACY_D8_DEBUG_MAP_EXT;
}
