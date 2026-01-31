/**
 * @file Stack service tests.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { buildSourceMapIndex } from '../../src/mapping/source-map';
import { MappingParseResult, SourceMapSegment } from '../../src/mapping/parser';
import { ListingInfo } from '../../src/z80/loaders';
import { buildStackFrames, resolveSourceForAddress } from '../../src/debug/stack-service';

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
    const resolvedPath = path.resolve('/tmp/main.asm');
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
    const resolvedPath = path.resolve('/tmp/main.asm');
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
    const listingPath = path.resolve('/tmp/program.lst');
    const listing = makeListing(0x1234, 9);
    const result = resolveSourceForAddress(0x1234, {
      listing,
      listingPath,
      resolveMappedPath: () => undefined,
    });

    expect(result).toEqual({ path: listingPath, line: 9 });
  });
});
