/**
 * @fileoverview Auxiliary source request helpers.
 */

export type RomSource = { label: string; path: string; kind: 'source'; autoOpen?: boolean };

export function buildRomSourcesResponse(sources: RomSource[]): { sources: RomSource[] } {
  return { sources };
}
