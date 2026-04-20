/**
 * @fileoverview ROM/source listing request helpers.
 */

export type RomSource = { label: string; path: string; kind: 'listing' | 'source' };

export function buildRomSourcesResponse(sources: RomSource[]): { sources: RomSource[] } {
  return { sources };
}
