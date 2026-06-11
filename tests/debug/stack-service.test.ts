/**
 * @file Stack service tests.
 */

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSourceMapIndex } from '../../src/mapping/source-map';
import { MappingParseResult, SourceMapSegment } from '../../src/mapping/types';
import { buildStackFrames, resolveSourceForAddress } from '../../src/debug/mapping/stack-service';
import { buildMappingFromD8DebugMap, parseD8DebugMap } from '../../src/mapping/d8-map';
import { resolveMappedPath } from '../../src/debug/mapping/path-resolver';

vi.mock('vscode', () => ({ workspace: { workspaceFolders: undefined } }));
import { vi } from 'vitest';

const makeSegment = (start: number, end: number, file: string, line: number): SourceMapSegment => ({
  start,
  end,
  loc: { file, line },
  context: { line: 1, text: '' },
  confidence: 'HIGH',
});

function writeFixtureFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function createD8Fixture(
  tmpDir: string,
  options: {
    sourceText: string;
    d8Files: Record<string, unknown>;
  }
) {
  const sourceFile = path.join(tmpDir, 'matrix.asm');
  const artifactPath = path.join(tmpDir, 'build', 'matrix.hex');
  writeFixtureFile(sourceFile, options.sourceText);
  writeFixtureFile(artifactPath, ':00000001FF\n');

  const d8Content = JSON.stringify({
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
    files: options.d8Files,
  });

  const { map } = parseD8DebugMap(d8Content);
  expect(map).toBeDefined();
  const mapping = buildMappingFromD8DebugMap(map!);
  const sourceRoots = [tmpDir];
  const resolve = (file: string) => resolveMappedPath(file, artifactPath, sourceRoots);
  const index = buildSourceMapIndex(mapping, resolve);

  return { artifactPath, index, mapping, resolve, sourceFile };
}

describe('stack-service', () => {
  it('resolves source from mapping and builds stack frames', () => {
    const mapping: MappingParseResult = {
      segments: [makeSegment(0x1000, 0x1002, 'main.asm', 42)],
      anchors: [{ symbol: 'Start', address: 0x1000, file: 'main.asm', line: 42 }],
    };
    const resolvedPath = path.resolve(path.join(os.tmpdir(), 'main.asm'));
    const index = buildSourceMapIndex(mapping, () => resolvedPath);

    const result = resolveSourceForAddress(0x1000, {
      mappingIndex: index,
      resolveMappedPath: () => resolvedPath,
      sourceFile: resolvedPath,
    });

    expect(result).toEqual({ path: resolvedPath, line: 42 });

    const frames = buildStackFrames(0x1000, {
      mappingIndex: index,
      resolveMappedPath: () => resolvedPath,
      sourceFile: resolvedPath,
      symbolAnchors: mapping.anchors,
      lookupAnchors: mapping.anchors,
    });

    expect(frames.totalFrames).toBe(1);
    expect(frames.stackFrames[0]?.name).toBe('Start');
    expect(frames.stackFrames[0]?.line).toBe(42);
  });

  it('uses the nearest source-map symbol as the stack frame label', () => {
    const mapping: MappingParseResult = {
      segments: [makeSegment(0x1000, 0x1006, 'main.asm', 12)],
      anchors: [{ symbol: 'Loop', address: 0x1000, file: 'main.asm', line: 12 }],
    };
    const resolvedPath = path.resolve(path.join(os.tmpdir(), 'main.asm'));
    const index = buildSourceMapIndex(mapping, () => resolvedPath);

    const frames = buildStackFrames(0x1004, {
      mappingIndex: index,
      resolveMappedPath: () => resolvedPath,
      sourceFile: resolvedPath,
      symbolAnchors: mapping.anchors,
      lookupAnchors: mapping.anchors,
    });

    expect(frames.stackFrames[0]?.name).toBe('Loop+4');
  });

  it('walks stack words as best-effort symbolic return frames', () => {
    const mapping: MappingParseResult = {
      segments: [
        makeSegment(0x1000, 0x1006, 'main.asm', 12),
        makeSegment(0x2010, 0x2014, 'draw.asm', 20),
        makeSegment(0x3000, 0x3003, 'loop.asm', 30),
      ],
      anchors: [
        { symbol: 'Current', address: 0x1000, file: 'main.asm', line: 12 },
        { symbol: 'DrawSprite', address: 0x2000, file: 'draw.asm', line: 18 },
        { symbol: 'GameLoop', address: 0x3000, file: 'loop.asm', line: 30 },
      ],
    };
    const root = os.tmpdir();
    const index = buildSourceMapIndex(mapping, (file) => path.join(root, file));
    const memory = new Uint8Array(0x10000);
    memory[0xff00] = 0x12;
    memory[0xff01] = 0x20;
    memory[0xff02] = 0xaa;
    memory[0xff03] = 0x55;
    memory[0xff04] = 0x00;
    memory[0xff05] = 0x30;

    const frames = buildStackFrames(0x1002, {
      mappingIndex: index,
      resolveMappedPath: (file) => path.join(root, file),
      sourceFile: path.join(root, 'main.asm'),
      symbolAnchors: mapping.anchors,
      lookupAnchors: mapping.anchors,
      stackPointer: 0xff00,
      maxStackFrames: 8,
      readMemory: (address) => memory[address & 0xffff] ?? 0,
    });

    expect(frames.stackFrames.map((frame) => frame.name)).toEqual([
      'Current+2',
      'DrawSprite+18',
      '$55aa (likely data)',
      'GameLoop',
    ]);
    expect(frames.totalFrames).toBe(4);
  });

  it('uses address aliases when direct mapping misses', () => {
    const mapping: MappingParseResult = {
      segments: [makeSegment(0x2000, 0x2002, 'main.asm', 7)],
      anchors: [],
    };
    const resolvedPath = path.resolve(path.join(os.tmpdir(), 'main.asm'));
    const index = buildSourceMapIndex(mapping, () => resolvedPath);

    const result = resolveSourceForAddress(0x1000, {
      mappingIndex: index,
      resolveMappedPath: () => resolvedPath,
      sourceFile: resolvedPath,
      getAddressAliases: () => [0x1000, 0x2000],
    });

    expect(result).toEqual({ path: resolvedPath, line: 7 });
  });

  it('falls back to the active source file when no mapping is available', () => {
    const sourcePath = path.resolve(path.join(os.tmpdir(), 'program.z80'));
    const result = resolveSourceForAddress(0x1234, {
      sourceFile: sourcePath,
      resolveMappedPath: () => undefined,
    });

    expect(result).toEqual({ path: sourcePath, line: 1 });
  });
});

describe('stack-service AZM D8 integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-azm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves stack frame from native AZM D8 with relative file key', () => {
    const { index, mapping, resolve, sourceFile } = createD8Fixture(tmpDir, {
      sourceText: '; matrix source\nNOP\nHALT\n',
      d8Files: {
        'matrix.asm': {
          segments: [
            { start: 0xc000, end: 0xc001, line: 2, lstLine: 1, lstText: 'NOP' },
            { start: 0xc001, end: 0xc002, line: 3, lstLine: 2, lstText: 'HALT' },
          ],
          symbols: [{ name: 'START', address: 0xc000, line: 1 }],
        },
      },
    });
    expect(mapping.segments.length).toBe(2);
    expect(mapping.segments[0].loc.file).toBe('matrix.asm');
    expect(index.segmentsByAddress.length).toBe(2);

    const result = resolveSourceForAddress(0xc000, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile: sourceFile,
    });

    expect(result.line).toBe(2);
    expect(path.basename(result.path)).toBe('matrix.asm');
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('resolves stack frame after stepping to second instruction', () => {
    const { index, resolve, sourceFile } = createD8Fixture(tmpDir, {
      sourceText: '; src\nLD A, 0\nHALT\n',
      d8Files: {
        'matrix.asm': {
          segments: [
            { start: 0xc000, end: 0xc002, line: 2, lstLine: 1, lstText: 'LD A, 0' },
            { start: 0xc002, end: 0xc003, line: 3, lstLine: 2, lstText: 'HALT' },
          ],
        },
      },
    });

    const step1 = resolveSourceForAddress(0xc000, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile,
    });
    expect(step1.line).toBe(2);

    const step2 = resolveSourceForAddress(0xc002, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile,
    });
    expect(step2.line).toBe(3);
    expect(step2.path).toBe(step1.path);
  });

  it('falls back to sourceFile at line 1 when D8 has no segment for PC', () => {
    const { index, resolve, sourceFile } = createD8Fixture(tmpDir, {
      sourceText: 'NOP',
      d8Files: {
        'matrix.asm': {
          segments: [{ start: 0xc000, end: 0xc001, line: 5, lstLine: 1, lstText: 'NOP' }],
        },
      },
    });

    const result = resolveSourceForAddress(0xffff, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile,
    });

    expect(result.line).toBe(1);
    expect(path.basename(result.path)).toBe('matrix.asm');
  });
});
