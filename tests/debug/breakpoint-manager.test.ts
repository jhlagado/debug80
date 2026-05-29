/**
 * @file Breakpoint manager tests.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BreakpointManager } from '../../src/debug/mapping/breakpoint-manager';
import { normalizePathForKey } from '../../src/debug/mapping/path-utils';
import { buildSourceMapIndex, type SourceMapIndex } from '../../src/mapping/source-map';
import type { SourceMapSegment } from '../../src/mapping/parser';
import { buildMappingFromD8DebugMap, parseD8DebugMap } from '../../src/mapping/d8-map';

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

  it('prefers the condition from the closest source line when breakpoints share an address', () => {
    const mgr = new BreakpointManager();
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    const sourcePath = path.resolve(baseDir, 'file.asm');
    const index = createMockIndex(new Map([[sourcePath, new Map([[12, [0x100]]])]]));

    mgr.setPending(sourcePath, [
      { line: 12, condition: 'BC = $1001' },
      { line: 10, condition: '.include' },
    ]);
    mgr.rebuild(index);

    expect(mgr.hasAddress(0x100)).toBe(true);
    expect(mgr.getCondition(0x100)).toBe('BC = $1001');
  });

  it('marks breakpoints as unverified when listing is missing', () => {
    const mgr = new BreakpointManager();
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    mgr.setPending(path.join(baseDir, 'file.asm'), [{ line: 10 }]);
    const applied = mgr.applyAll(undefined);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(false);
  });

  it('applies breakpoints from source mapping', () => {
    const mgr = new BreakpointManager();
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    const sourcePath = path.resolve(baseDir, 'file.asm');

    const index = createMockIndex(new Map([[sourcePath, new Map([[15, [0x300]]])]]));

    mgr.setPending(sourcePath, [{ line: 15 }]);
    const applied = mgr.applyForSource(index, sourcePath, [{ line: 15 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(true);
  });

  it('does not fall back to .source.asm when resolving breakpoints', () => {
    const mgr = new BreakpointManager();
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    const sourcePath = path.resolve(baseDir, 'mon.asm');

    const index = createMockIndex(
      new Map([[path.resolve(baseDir, 'mon.source.asm'), new Map([[42, [0x400]]])]])
    );

    mgr.setPending(sourcePath, [{ line: 42 }]);
    const applied = mgr.applyForSource(index, sourcePath, [{ line: 42 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(false);
  });

  it('falls back by basename when mapped path differs', () => {
    const mgr = new BreakpointManager();
    const requestedPath = path.resolve('/workspace/roms/mon3.z80');
    const mappedPath = path.resolve('/private/tmp/debug80/roms/mon3.z80');

    const index = createMockIndex(new Map([[mappedPath, new Map([[171, [0xc000]]])]]));

    mgr.setPending(requestedPath, [{ line: 171 }]);
    const applied = mgr.applyForSource(index, requestedPath, [{ line: 171 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(true);
  });

  it('binds breakpoints in the bundled MON3 source from its native D8 map', () => {
    const mgr = new BreakpointManager();
    const bundleRoot = path.join(process.cwd(), 'resources', 'bundles', 'tec1g', 'mon3', 'v1');
    const sourcePath = path.join(bundleRoot, 'mon3.z80');
    const d8Path = path.join(bundleRoot, 'mon3.d8.json');
    const parsed = parseD8DebugMap(fs.readFileSync(d8Path, 'utf-8'));

    expect(parsed.error).toBeUndefined();
    expect(parsed.map).toBeDefined();
    const mapping = buildMappingFromD8DebugMap(parsed.map!);
    const index = buildSourceMapIndex(mapping, (file) => {
      if (path.isAbsolute(file) && fs.existsSync(file)) {
        return file;
      }
      const candidate = path.join(bundleRoot, file);
      return fs.existsSync(candidate) ? candidate : undefined;
    });

    const applied = mgr.applyForSource(index, sourcePath, [{ line: 171 }]);

    expect(applied).toEqual([{ line: 171, verified: true }]);
    mgr.setPending(sourcePath, [{ line: 171 }]);
    mgr.rebuild(index);
    expect(mgr.hasAddress(0xc000)).toBe(true);
  });

  it('does not fall back to listing line for source files when mapping misses', () => {
    const mgr = new BreakpointManager();
    const sourcePath = path.resolve('/workspace/roms/mon3.z80');
    const index = createMockIndex(new Map());

    mgr.setPending(sourcePath, [{ line: 171 }]);
    const applied = mgr.applyForSource(index, sourcePath, [{ line: 171 }]);

    expect(applied.length).toBe(1);
    expect(applied[0]?.verified).toBe(false);

    mgr.rebuild(index);
    expect(mgr.hasAddress(0xc000)).toBe(false);
  });

  it('does not bind source breakpoints to zero-width directive or constant segments', () => {
    const mgr = new BreakpointManager();
    const sourcePath = path.resolve('/workspace/src/inc/constants.asm');
    const index = createMockIndex(
      new Map([[sourcePath, new Map([[39, [{ start: 0x4000, end: 0x4000 }]]])]])
    );

    mgr.setPending(sourcePath, [{ line: 39 }]);
    const applied = mgr.applyForSource(index, sourcePath, [{ line: 39 }]);

    expect(applied).toEqual([{ line: 39, verified: false }]);
    mgr.rebuild(index);
    expect(mgr.hasAddress(0x4000)).toBe(false);
  });

  it('activates every executable address mapped to the same source line', () => {
    const mgr = new BreakpointManager();
    const sourcePath = path.resolve('/workspace/src/main.asm');
    const index = createMockIndex(new Map([[sourcePath, new Map([[12, [0x4100, 0x4104]]])]]));

    mgr.setPending(sourcePath, [{ line: 12 }]);
    const applied = mgr.applyForSource(index, sourcePath, [{ line: 12 }]);

    expect(applied).toEqual([{ line: 12, verified: true }]);
    mgr.rebuild(index);
    expect(mgr.hasAddress(0x4100)).toBe(true);
    expect(mgr.hasAddress(0x4104)).toBe(true);
  });

  it('handles missing mapping gracefully', () => {
    const mgr = new BreakpointManager();
    const baseDir = path.join(path.parse(process.cwd()).root, 'test');
    const sourcePath = path.resolve(baseDir, 'other.asm');

    mgr.setPending(sourcePath, [{ line: 5 }]);
    const applied = mgr.applyForSource(undefined, sourcePath, [{ line: 5 }]);

    expect(applied[0]?.verified).toBe(false);
  });
});
