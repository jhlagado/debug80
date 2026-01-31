/**
 * @file Symbol service tests.
 */

import { describe, it, expect } from 'vitest';
import { MappingParseResult, SourceMapSegment } from '../../src/mapping/parser';
import { buildSymbolIndex, findNearestSymbol } from '../../src/debug/symbol-service';

const makeSegment = (start: number, end: number): SourceMapSegment => ({
  start,
  end,
  loc: { file: 'main.asm', line: 1 },
  lst: { line: 1, text: '' },
  confidence: 'HIGH',
});

describe('symbol-service', () => {
  it('builds symbol lists and filters lookup anchors to mapped ranges', () => {
    const mapping: MappingParseResult = {
      segments: [makeSegment(0x1000, 0x1004), makeSegment(0x2000, 0x2002)],
      anchors: [
        { symbol: 'Zed', address: 0x3000, file: 'main.asm', line: 10 },
        { symbol: 'Alpha', address: 0x1000, file: 'main.asm', line: 3 },
        { symbol: 'Alpha', address: 0x1002, file: 'main.asm', line: 6 },
      ],
    };

    const index = buildSymbolIndex({ mapping });

    expect(index.anchors.map((anchor) => anchor.address)).toEqual([0x1000, 0x1002, 0x3000]);
    expect(index.lookupAnchors.map((anchor) => anchor.address)).toEqual([0x1000, 0x1002]);
    expect(index.list).toEqual([
      { name: 'Alpha', address: 0x1000 },
      { name: 'Zed', address: 0x3000 },
    ]);
  });

  it('parses anchors from listing content with fallback file', () => {
    const listing = [
      'LABEL: 1234 DEFINED AT LINE 5 IN file.asm',
      'OTHER: 5678 DEFINED AT LINE 10',
    ].join('\n');

    const index = buildSymbolIndex({ listingContent: listing, sourceFile: 'fallback.asm' });

    expect(index.anchors).toEqual([
      { symbol: 'LABEL', address: 0x1234, file: 'file.asm', line: 5 },
      { symbol: 'OTHER', address: 0x5678, file: 'fallback.asm', line: 10 },
    ]);
  });

  it('finds the nearest symbol at or before the target address', () => {
    const mapping: MappingParseResult = {
      segments: [makeSegment(0x1000, 0x1004)],
      anchors: [
        { symbol: 'Alpha', address: 0x1000, file: 'main.asm', line: 3 },
        { symbol: 'Beta', address: 0x1002, file: 'main.asm', line: 6 },
      ],
    };
    const index = buildSymbolIndex({ mapping });

    expect(findNearestSymbol(0x1001, index)).toEqual({ name: 'Alpha', address: 0x1000 });
    expect(findNearestSymbol(0x0fff, index)).toBeNull();
  });
});
