/**
 * @file Breakpoint manager tests.
 */

import { describe, it, expect } from 'vitest';
import { BreakpointManager } from '../../src/debug/breakpoint-manager';
import type { ListingInfo } from '../../src/z80/loaders';
import type { SourceMapIndex } from '../../src/mapping/source-map';
import type { SourceMapSegment } from '../../src/mapping/parser';

function createMockListing(lineToAddress: Map<number, number>): ListingInfo {
  const entries = Array.from(lineToAddress.entries())
    .sort(([a], [b]) => a - b)
    .map(([line, address]) => ({ line, address, length: 1 }));
  return {
    entries,
    lineToAddress,
    addressToLine: new Map(),
  };
}

function createMockIndex(fileMap: Map<string, Map<number, number[]>>): SourceMapIndex {
  const segmentsByFileLine = new Map<string, Map<number, SourceMapSegment[]>>();
  for (const [file, lines] of fileMap) {
    const lineMap = new Map<number, SourceMapSegment[]>();
    for (const [line, addrs] of lines) {
      lineMap.set(
        line,
        addrs.map((a) => ({
          start: a,
          end: a + 1,
          confidence: 'HIGH' as const,
          loc: { file, line },
          lst: { line: 1, text: '' },
        }))
      );
    }
    segmentsByFileLine.set(file, lineMap);
  }
  return {
    segmentsByAddress: [],
    segmentsByFileLine,
    anchorsByFile: new Map(),
  };
}

describe('BreakpointManager', () => {
  it('stores and clears pending breakpoints', () => {
    const mgr = new BreakpointManager();
    mgr.setPending('/test/file.asm', [{ line: 10 }, { line: 20 }]);
    mgr.reset();
    expect(mgr.hasAddress(0x100)).toBe(false);
  });

  it('applies breakpoints from listing file', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(
      new Map([
        [10, 0x100],
        [20, 0x200],
      ])
    );
    const listingPath = '/test/program.lst';

    mgr.setPending(listingPath, [{ line: 10 }, { line: 20 }]);
    const applied = mgr.applyAll(listing, listingPath, undefined);

    expect(applied.length).toBe(2);
    expect(applied[0]?.verified).toBe(true);
    expect(applied[1]?.verified).toBe(true);
    expect(mgr.hasAddress(0x100)).toBe(true);
    expect(mgr.hasAddress(0x200)).toBe(true);
  });

  it('marks breakpoints as unverified when listing is missing', () => {
    const mgr = new BreakpointManager();
    mgr.setPending('/test/file.asm', [{ line: 10 }]);
    const applied = mgr.applyAll(undefined, undefined, undefined);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(false);
  });

  it('applies breakpoints from source mapping', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map());
    const listingPath = '/test/program.lst';
    const sourcePath = '/test/file.asm';

    const index = createMockIndex(new Map([[sourcePath, new Map([[15, [0x300]]])]]));

    mgr.setPending(sourcePath, [{ line: 15 }]);
    const applied = mgr.applyForSource(listing, listingPath, index, sourcePath, [{ line: 15 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(true);
  });

  it('falls back to .source.asm when resolving breakpoints', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map());
    const listingPath = '/test/program.lst';
    const sourcePath = '/test/mon.asm';

    const index = createMockIndex(
      new Map([['/test/mon.source.asm', new Map([[42, [0x400]]])]])
    );

    mgr.setPending(sourcePath, [{ line: 42 }]);
    const applied = mgr.applyForSource(listing, listingPath, index, sourcePath, [{ line: 42 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(true);
  });

  it('falls back to the next available listing entry', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(
      new Map([
        [10, 0x0000],
        [20, 0x0200],
      ])
    );
    const listingPath = '/test/program.lst';

    mgr.setPending(listingPath, [{ line: 1 }]);
    const applied = mgr.applyForSource(listing, listingPath, undefined, listingPath, [
      { line: 1 },
    ]);

    expect(applied[0]?.verified).toBe(true);
    mgr.rebuild(listing, listingPath, undefined);
    expect(mgr.hasAddress(0x0000)).toBe(true);
  });

  it('handles missing mapping gracefully', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map());
    const listingPath = '/test/program.lst';
    const sourcePath = '/test/other.asm';

    mgr.setPending(sourcePath, [{ line: 5 }]);
    const applied = mgr.applyForSource(listing, listingPath, undefined, sourcePath, [{ line: 5 }]);

    expect(applied[0]?.verified).toBe(false);
  });
});
