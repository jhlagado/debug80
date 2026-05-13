/**
 * @file Breakpoint manager tests.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { BreakpointManager } from '../../src/debug/mapping/breakpoint-manager';
import { normalizePathForKey } from '../../src/debug/mapping/path-utils';
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

function createMockIndex(
  fileMap: Map<string, Map<number, Array<number | { start: number; end: number }>>>
): SourceMapIndex {
  const segmentsByFileLine = new Map<string, Map<number, SourceMapSegment[]>>();
  for (const [file, lines] of fileMap) {
    const key = normalizePathForKey(file);
    const lineMap = new Map<number, SourceMapSegment[]>();
    for (const [line, addrs] of lines) {
      lineMap.set(
        line,
        addrs.map((entry) => {
          const start = typeof entry === 'number' ? entry : entry.start;
          const end = typeof entry === 'number' ? entry + 1 : entry.end;
          return {
            start,
            end,
            confidence: 'HIGH' as const,
            loc: { file, line },
            lst: { line: 1, text: '' },
          };
        })
      );
    }
    segmentsByFileLine.set(key, lineMap);
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
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    mgr.setPending(path.join(baseDir, 'file.asm'), [{ line: 10 }, { line: 20 }]);
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
    const listingPath = path.join(path.parse(process.cwd()).root, 'test', 'program.lst');

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
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    mgr.setPending(path.join(baseDir, 'file.asm'), [{ line: 10 }]);
    const applied = mgr.applyAll(undefined, undefined, undefined);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(false);
  });

  it('applies breakpoints from source mapping', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map());
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    const listingPath = path.join(baseDir, 'program.lst');
    const sourcePath = path.resolve(baseDir, 'file.asm');

    const index = createMockIndex(new Map([[sourcePath, new Map([[15, [0x300]]])]]));

    mgr.setPending(sourcePath, [{ line: 15 }]);
    const applied = mgr.applyForSource(listing, listingPath, index, sourcePath, [{ line: 15 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(true);
  });

  it('does not fall back to .source.asm when resolving breakpoints', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map());
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    const listingPath = path.join(baseDir, 'program.lst');
    const sourcePath = path.resolve(baseDir, 'mon.asm');

    const index = createMockIndex(
      new Map([[path.resolve(baseDir, 'mon.source.asm'), new Map([[42, [0x400]]])]])
    );

    mgr.setPending(sourcePath, [{ line: 42 }]);
    const applied = mgr.applyForSource(listing, listingPath, index, sourcePath, [{ line: 42 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(false);
  });

  it('falls back by basename when mapped path differs', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map());
    const listingPath = path.join(path.parse(process.cwd()).root, 'test', 'program.lst');
    const requestedPath = path.resolve('/workspace/roms/mon3.z80');
    const mappedPath = path.resolve('/private/tmp/debug80/roms/mon3.z80');

    const index = createMockIndex(new Map([[mappedPath, new Map([[171, [0xc000]]])]]));

    mgr.setPending(requestedPath, [{ line: 171 }]);
    const applied = mgr.applyForSource(listing, listingPath, index, requestedPath, [{ line: 171 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(true);
  });

  it('does not fall back to listing line for source files when mapping misses', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map([[171, 0xc000]]));
    const listingPath = path.join(path.parse(process.cwd()).root, 'test', 'program.lst');
    const sourcePath = path.resolve('/workspace/roms/mon3.z80');
    const index = createMockIndex(new Map());

    mgr.setPending(sourcePath, [{ line: 171 }]);
    const applied = mgr.applyForSource(listing, listingPath, index, sourcePath, [{ line: 171 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(false);

    mgr.rebuild(listing, listingPath, index);
    expect(mgr.hasAddress(0xc000)).toBe(false);
  });

  it('does not bind source breakpoints to zero-width directive or constant segments', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map([[39, 0x4000]]));
    const listingPath = path.join(path.parse(process.cwd()).root, 'test', 'program.lst');
    const sourcePath = path.resolve('/workspace/src/inc/constants.asm');
    const index = createMockIndex(
      new Map([[sourcePath, new Map([[39, [{ start: 0x4000, end: 0x4000 }]]])]])
    );

    mgr.setPending(sourcePath, [{ line: 39 }]);
    const applied = mgr.applyForSource(listing, listingPath, index, sourcePath, [{ line: 39 }]);

    expect(applied).toEqual([{ line: 39, verified: false }]);
    mgr.rebuild(listing, listingPath, index);
    expect(mgr.hasAddress(0x4000)).toBe(false);
  });

  it('activates every executable address mapped to the same source line', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map());
    const listingPath = path.join(path.parse(process.cwd()).root, 'test', 'program.lst');
    const sourcePath = path.resolve('/workspace/src/main.asm');
    const index = createMockIndex(new Map([[sourcePath, new Map([[12, [0x4100, 0x4104]]])]]));

    mgr.setPending(sourcePath, [{ line: 12 }]);
    const applied = mgr.applyForSource(listing, listingPath, index, sourcePath, [{ line: 12 }]);

    expect(applied).toEqual([{ line: 12, verified: true }]);
    mgr.rebuild(listing, listingPath, index);
    expect(mgr.hasAddress(0x4100)).toBe(true);
    expect(mgr.hasAddress(0x4104)).toBe(true);
  });

  it('falls back to the next available listing entry', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(
      new Map([
        [10, 0x0000],
        [20, 0x0200],
      ])
    );
    const listingPath = path.join(path.parse(process.cwd()).root, 'test', 'program.lst');

    mgr.setPending(listingPath, [{ line: 1 }]);
    const applied = mgr.applyForSource(listing, listingPath, undefined, listingPath, [{ line: 1 }]);

    expect(applied[0]?.verified).toBe(true);
    mgr.rebuild(listing, listingPath, undefined);
    expect(mgr.hasAddress(0x0000)).toBe(true);
  });

  it('handles missing mapping gracefully', () => {
    const mgr = new BreakpointManager();
    const listing = createMockListing(new Map());
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    const listingPath = path.join(baseDir, 'program.lst');
    const sourcePath = path.resolve(baseDir, 'other.asm');

    mgr.setPending(sourcePath, [{ line: 5 }]);
    const applied = mgr.applyForSource(listing, listingPath, undefined, sourcePath, [{ line: 5 }]);

    expect(applied[0]?.verified).toBe(false);
  });
});
