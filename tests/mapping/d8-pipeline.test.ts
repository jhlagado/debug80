/**
 * @file Full-pipeline integration tests for D8 debug maps.
 *
 * Exercises the entire chain:
 *   D8 JSON (disk) → parseD8DebugMap → buildMappingFromD8DebugMap
 *   → buildSourceMapIndex → findSegmentForAddress → resolveSourceForAddress
 *   → buildStackFrames
 *
 * Uses the committed golden ZAX fixture (tests/fixtures/zax/matrix.d8.json)
 * so any change to the D8 consumer pipeline that alters line resolution
 * will be caught immediately.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { parseD8DebugMap, buildMappingFromD8DebugMap } from '../../src/mapping/d8-map';
import { buildSourceMapIndex, findSegmentForAddress } from '../../src/mapping/source-map';
import { buildStackFrames, resolveSourceForAddress } from '../../src/debug/mapping/stack-service';

vi.mock('vscode', () => ({ workspace: { workspaceFolders: undefined } }));
import { vi } from 'vitest';

const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures', 'zax');
const d8Path = path.join(fixtureDir, 'matrix.d8.json');
const d8Content = fs.readFileSync(d8Path, 'utf-8');

const FAKE_SOURCE_PATH = path.resolve('/project/src', 'matrix.zax');

function buildPipeline() {
  const { map, error } = parseD8DebugMap(d8Content);
  expect(error).toBeUndefined();
  expect(map).toBeDefined();

  const mapping = buildMappingFromD8DebugMap(map!);
  const resolve = (file: string) =>
    file === 'matrix.zax' ? FAKE_SOURCE_PATH : undefined;
  const index = buildSourceMapIndex(mapping, resolve);

  return { map: map!, mapping, index, resolve };
}

describe('D8 golden fixture pipeline (matrix.zax)', () => {
  it('parses the golden D8 file without errors', () => {
    const { map } = parseD8DebugMap(d8Content);
    expect(map).toBeDefined();
    expect(map!.format).toBe('d8-debug-map');
    expect(map!.version).toBe(1);
    expect(map!.arch).toBe('z80');
  });

  it('builds mapping segments and anchors from the D8', () => {
    const { mapping } = buildPipeline();
    expect(mapping.segments.length).toBeGreaterThan(0);
    expect(mapping.anchors.length).toBeGreaterThan(0);

    const fileKeys = new Set(mapping.segments.map((s) => s.loc.file));
    expect(fileKeys.has('matrix.zax')).toBe(true);
  });

  it('every code instruction address resolves to a valid line >= 1', () => {
    const { index } = buildPipeline();

    const codeAddresses = [
      0x4000, 0x4002, 0x4004, 0x4007, 0x4008, 0x400a,
      0x400b, 0x400d, 0x400e, 0x400f, 0x4011, 0x4012,
      0x4013, 0x4015, 0x4016, 0x4017, 0x4019, 0x401b,
      0x401c, 0x401e, 0x4020, 0x4021, 0x4023, 0x4025,
      0x4027, 0x4028, 0x402a, 0x402c, 0x402e, 0x402f,
      0x4031, 0x4032,
    ];

    for (const addr of codeAddresses) {
      const seg = findSegmentForAddress(index, addr);
      expect(seg, `no segment for 0x${addr.toString(16)}`).toBeDefined();
      expect(
        seg!.loc.line,
        `segment at 0x${addr.toString(16)} has null line`
      ).not.toBeNull();
      expect(
        seg!.loc.line! >= 1,
        `segment at 0x${addr.toString(16)} has line=${seg!.loc.line} (expected >= 1)`
      ).toBe(true);
    }
  });

  it('resolveSourceForAddress returns the correct file and valid line for each instruction', () => {
    const { index, resolve } = buildPipeline();

    const expectedMappings: Array<[number, number]> = [
      [0x4000, 28],
      [0x4002, 29],
      [0x4004, 31],
      [0x4007, 32],
      [0x4008, 33],
      [0x400a, 35],
      [0x400b, 36],
      [0x400d, 37],
      [0x400e, 38],
      [0x400f, 39],
      [0x4011, 40],
      [0x4012, 41],
      [0x4013, 42],
      [0x4015, 43],
      [0x4016, 44],
      [0x4017, 45],
      [0x4019, 46],
      [0x401c, 47],
      [0x401e, 48],
      [0x4020, 49],
      [0x4021, 50],
      [0x4023, 51],
      [0x4025, 53],
      [0x4027, 57],
      [0x4028, 58],
      [0x402a, 60],
      [0x402c, 62],
      [0x402d, 63],
      [0x402f, 64],
      [0x4031, 65],
      [0x4032, 66],
    ];

    for (const [addr, expectedLine] of expectedMappings) {
      const result = resolveSourceForAddress(addr, {
        mappingIndex: index,
        resolveMappedPath: resolve,
        sourceFile: FAKE_SOURCE_PATH,
      });
      expect(result.line, `PC=0x${addr.toString(16)}`).toBe(expectedLine);
      expect(result.path).toBe(FAKE_SOURCE_PATH);
    }
  });

  it('buildStackFrames produces a valid Source with correct path and line', () => {
    const { index, resolve } = buildPipeline();

    const frames = buildStackFrames(0x4000, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile: FAKE_SOURCE_PATH,
    });

    expect(frames.totalFrames).toBe(1);
    const frame = frames.stackFrames[0];
    expect(frame).toBeDefined();
    expect(frame.line).toBe(28);
    expect(frame.source?.path).toBe(FAKE_SOURCE_PATH);
    expect(frame.source?.name).toBe('matrix.zax');
  });

  it('stepping through instructions produces sequential valid lines (no line=0)', () => {
    const { index, resolve } = buildPipeline();

    const stepSequence = [0x4000, 0x4002, 0x4004, 0x4007, 0x4008, 0x400a];

    let prevLine = 0;
    for (const pc of stepSequence) {
      const result = resolveSourceForAddress(pc, {
        mappingIndex: index,
        resolveMappedPath: resolve,
        sourceFile: FAKE_SOURCE_PATH,
      });
      expect(result.line, `PC=0x${pc.toString(16)} has invalid line`).toBeGreaterThanOrEqual(1);
      expect(result.path).toBe(FAKE_SOURCE_PATH);
      expect(
        result.line > prevLine,
        `PC=0x${pc.toString(16)}: line ${result.line} should be > previous ${prevLine}`
      ).toBe(true);
      prevLine = result.line;
    }
  });
});

describe('D8 pipeline address→line snapshot', () => {
  it('matches the expected snapshot for all segment start addresses', () => {
    const { index } = buildPipeline();

    const snapshot: Record<string, { file: string | null; line: number | null }> = {};
    for (const seg of index.segmentsByAddress) {
      const key = `0x${seg.start.toString(16).padStart(4, '0')}`;
      snapshot[key] = { file: seg.loc.file, line: seg.loc.line };
    }

    expect(snapshot).toMatchSnapshot();
  });
});
