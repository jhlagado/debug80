import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { MappingParseResult } from '../../src/mapping/parser';
import { parseMapping } from '../../src/mapping/parser';
import {
  buildSourceMapIndex,
  findAnchorLine,
  findSegmentForAddress,
  resolveLocation,
} from '../../src/mapping/source-map';

const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures');
const lstPath = path.join(fixtureDir, 'simple.lst');
const asmPath = path.join(fixtureDir, 'simple.asm');

const listingContent = fs.readFileSync(lstPath, 'utf-8');
const mapping = parseMapping(listingContent);
const resolvePath = (file: string): string | undefined =>
  file === 'simple.asm' ? asmPath : undefined;
const index = buildSourceMapIndex(mapping, resolvePath);

describe('source-map', () => {
  it('resolves locations to addresses', () => {
    assert.deepEqual(resolveLocation(index, asmPath, 1), [0x0000]);
    assert.deepEqual(resolveLocation(index, asmPath, 4), [0x0003]);
    assert.deepEqual(resolveLocation(index, asmPath, 5), [0x0003]);
  });

  it('returns empty for unknown files', () => {
    assert.deepEqual(resolveLocation(index, path.join(fixtureDir, 'missing.asm'), 1), []);
  });

  it('finds a segment by address', () => {
    const segment = findSegmentForAddress(index, 0x0001);
    assert.ok(segment);
    assert.equal(segment?.lst.line, 3);
  });

  it('falls back to anchors when no segment matches the line', () => {
    const address = resolveLocation(index, asmPath, 99);
    assert.deepEqual(address, [0x0003]);
  });

  it('skips unresolved files and null locations', () => {
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0,
          end: 1,
          loc: { file: null, line: null },
          lst: { line: 1, text: 'NOP' },
          confidence: 'LOW',
        },
        {
          start: 2,
          end: 3,
          loc: { file: 'missing.asm', line: 1 },
          lst: { line: 2, text: 'NOP' },
          confidence: 'LOW',
        },
      ],
      anchors: [
        { address: 0x2000, symbol: 'HERE', file: 'missing.asm', line: 1 },
      ],
    };
    const resolveNone = (_file: string): string | undefined => undefined;
    const custom = buildSourceMapIndex(mapping, resolveNone);
    const seg = findSegmentForAddress(custom, 0);
    assert.ok(seg);
    assert.equal(seg?.start, 0);
    assert.equal(findAnchorLine(custom, 'missing.asm', 0x2000), null);
  });

  it('finds anchor lines for addresses', () => {
    assert.equal(findAnchorLine(index, asmPath, 0x0000), 1);
    assert.equal(findAnchorLine(index, asmPath, 0x0002), 1);
    assert.equal(findAnchorLine(index, asmPath, 0xffff), 5);
  });

  it('prefers narrow segment with valid line over wide segment with line=0', () => {
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x4000,
          end: 0x4033,
          loc: { file: 'matrix.zax', line: 0 },
          lst: { line: 0, text: '' },
          confidence: 'HIGH',
        },
        {
          start: 0x4000,
          end: 0x4002,
          loc: { file: 'matrix.zax', line: 10 },
          lst: { line: 1, text: 'LD C, 1' },
          confidence: 'HIGH',
        },
        {
          start: 0x4002,
          end: 0x4004,
          loc: { file: 'matrix.zax', line: 11 },
          lst: { line: 2, text: 'LD E, 8' },
          confidence: 'HIGH',
        },
      ],
      anchors: [],
    };
    const resolveAll = () => '/test/matrix.zax';
    const idx = buildSourceMapIndex(mapping, resolveAll);

    const seg1 = findSegmentForAddress(idx, 0x4000);
    assert.ok(seg1);
    assert.equal(seg1.loc.line, 10);
    assert.equal(seg1.end - seg1.start, 2);

    const seg2 = findSegmentForAddress(idx, 0x4002);
    assert.ok(seg2);
    assert.equal(seg2.loc.line, 11);
    assert.equal(seg2.end - seg2.start, 2);

    const seg3 = findSegmentForAddress(idx, 0x4010);
    assert.ok(seg3);
    assert.equal(seg3.loc.line, 0);
  });

  it('prefers narrower segment when both have valid lines', () => {
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x1000,
          end: 0x1010,
          loc: { file: 'main.asm', line: 5 },
          lst: { line: 1, text: 'wide' },
          confidence: 'HIGH',
        },
        {
          start: 0x1000,
          end: 0x1002,
          loc: { file: 'main.asm', line: 7 },
          lst: { line: 2, text: 'narrow' },
          confidence: 'HIGH',
        },
      ],
      anchors: [],
    };
    const resolveAll = () => '/test/main.asm';
    const idx = buildSourceMapIndex(mapping, resolveAll);

    const seg = findSegmentForAddress(idx, 0x1000);
    assert.ok(seg);
    assert.equal(seg.loc.line, 7);
    assert.equal(seg.end - seg.start, 2);
  });
});
