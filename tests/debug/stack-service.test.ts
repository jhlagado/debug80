/**
 * @file Stack service tests.
 */

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSourceMapIndex } from '../../src/mapping/source-map';
import { MappingParseResult, SourceMapSegment } from '../../src/mapping/parser';
import { ListingInfo } from '../../src/z80/loaders';
import { buildStackFrames, resolveSourceForAddress } from '../../src/debug/mapping/stack-service';
import { buildMappingFromD8DebugMap, parseD8DebugMap } from '../../src/mapping/d8-map';
import { resolveMappedPath } from '../../src/debug/mapping/path-resolver';

vi.mock('vscode', () => ({ workspace: { workspaceFolders: undefined } }));
import { vi } from 'vitest';

const makeSegment = (start: number, end: number, file: string, line: number): SourceMapSegment => ({
  start,
  end,
  loc: { file, line },
  lst: { line: 1, text: '' },
  confidence: 'HIGH',
});

const makeListing = (address: number, line: number): ListingInfo => ({
  lineToAddress: new Map([[line, address]]),
  addressToLine: new Map([[address, line]]),
  entries: [{ line, address, length: 1 }],
});

describe('stack-service', () => {
  it('resolves source from mapping and builds stack frames', () => {
    const mapping: MappingParseResult = {
      segments: [makeSegment(0x1000, 0x1002, 'main.asm', 42)],
      anchors: [],
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
    });

    expect(frames.totalFrames).toBe(1);
    expect(frames.stackFrames[0]?.name).toBe('main');
    expect(frames.stackFrames[0]?.line).toBe(42);
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

  it('falls back to listing line when no mapping is available', () => {
    const listingPath = path.resolve(path.join(os.tmpdir(), 'program.lst'));
    const listing = makeListing(0x1234, 9);
    const result = resolveSourceForAddress(0x1234, {
      listing,
      listingPath,
      resolveMappedPath: () => undefined,
    });

    expect(result).toEqual({ path: listingPath, line: 9 });
  });
});

describe('stack-service ZAX D8 integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-zax-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves stack frame from native ZAX D8 with relative file key', () => {
    const sourceFile = path.join(tmpDir, 'matrix.zax');
    const buildDir = path.join(tmpDir, 'build');
    const listingPath = path.join(buildDir, 'matrix.lst');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sourceFile, '; matrix source\nNOP\nHALT\n');
    fs.writeFileSync(listingPath, '0000 00 NOP\n0001 76 HALT\n');

    const d8Content = JSON.stringify({
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {
        'matrix.zax': {
          segments: [
            { start: 0xc000, end: 0xc001, line: 2, lstLine: 1, lstText: 'NOP' },
            { start: 0xc001, end: 0xc002, line: 3, lstLine: 2, lstText: 'HALT' },
          ],
          symbols: [
            { name: 'START', address: 0xc000, line: 1 },
          ],
        },
      },
    });
    const d8Path = path.join(buildDir, 'matrix.d8.json');
    fs.writeFileSync(d8Path, d8Content);

    const { map } = parseD8DebugMap(d8Content);
    expect(map).toBeDefined();
    const mapping = buildMappingFromD8DebugMap(map!);
    expect(mapping.segments.length).toBe(2);
    expect(mapping.segments[0].loc.file).toBe('matrix.zax');

    const sourceRoots = [tmpDir];
    const resolve = (file: string) => resolveMappedPath(file, listingPath, sourceRoots);

    const index = buildSourceMapIndex(mapping, resolve);
    expect(index.segmentsByAddress.length).toBe(2);

    const result = resolveSourceForAddress(0xc000, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile: sourceFile,
      listingPath,
    });

    expect(result.line).toBe(2);
    expect(path.basename(result.path)).toBe('matrix.zax');
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('resolves stack frame after stepping to second instruction', () => {
    const sourceFile = path.join(tmpDir, 'matrix.zax');
    const buildDir = path.join(tmpDir, 'build');
    const listingPath = path.join(buildDir, 'matrix.lst');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sourceFile, '; src\nLD A, 0\nHALT\n');
    fs.writeFileSync(listingPath, 'listing');

    const d8Content = JSON.stringify({
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {
        'matrix.zax': {
          segments: [
            { start: 0xc000, end: 0xc002, line: 2, lstLine: 1, lstText: 'LD A, 0' },
            { start: 0xc002, end: 0xc003, line: 3, lstLine: 2, lstText: 'HALT' },
          ],
        },
      },
    });

    const { map } = parseD8DebugMap(d8Content);
    const mapping = buildMappingFromD8DebugMap(map!);
    const sourceRoots = [tmpDir];
    const resolve = (file: string) => resolveMappedPath(file, listingPath, sourceRoots);
    const index = buildSourceMapIndex(mapping, resolve);

    const step1 = resolveSourceForAddress(0xc000, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile,
      listingPath,
    });
    expect(step1.line).toBe(2);

    const step2 = resolveSourceForAddress(0xc002, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile,
      listingPath,
    });
    expect(step2.line).toBe(3);
    expect(step2.path).toBe(step1.path);
  });

  it('falls back to sourceFile at line 1 when D8 has no segment for PC', () => {
    const sourceFile = path.join(tmpDir, 'matrix.zax');
    const listingPath = path.join(tmpDir, 'build', 'matrix.lst');
    fs.mkdirSync(path.dirname(listingPath), { recursive: true });
    fs.writeFileSync(sourceFile, 'NOP');
    fs.writeFileSync(listingPath, 'listing');

    const d8Content = JSON.stringify({
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {
        'matrix.zax': {
          segments: [
            { start: 0xc000, end: 0xc001, line: 5, lstLine: 1, lstText: 'NOP' },
          ],
        },
      },
    });

    const { map } = parseD8DebugMap(d8Content);
    const mapping = buildMappingFromD8DebugMap(map!);
    const sourceRoots = [tmpDir];
    const resolve = (file: string) => resolveMappedPath(file, listingPath, sourceRoots);
    const index = buildSourceMapIndex(mapping, resolve);

    const result = resolveSourceForAddress(0xffff, {
      mappingIndex: index,
      resolveMappedPath: resolve,
      sourceFile,
      listingPath,
    });

    expect(result.line).toBe(1);
    expect(path.basename(result.path)).toBe('matrix.zax');
  });
});
