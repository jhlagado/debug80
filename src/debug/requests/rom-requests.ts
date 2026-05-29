/**
 * @fileoverview ROM source request helpers.
 */

export type RomSource = { label: string; path: string; kind: 'source' };

export function buildRomSourcesResponse(sources: RomSource[]): { sources: RomSource[] } {
  return { sources };
}
