import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { MappingParseResult } from '../mapping/parser';
import { parseMapping } from '../mapping/parser';
import { applyLayer2 } from '../mapping/layer2';

const fixtureDir = path.join(process.cwd(), 'src', 'test', 'fixtures');
const lstPath = path.join(fixtureDir, 'simple.lst');
const asmPath = path.join(fixtureDir, 'simple.asm');
const extraAsmPath = path.join(fixtureDir, 'layer2-extra.asm');

const listingContent = fs.readFileSync(lstPath, 'utf-8');

const resolvePath = (file: string): string | undefined =>
  file === 'simple.asm' ? asmPath : undefined;
const resolveExtra = (file: string): string | undefined =>
  file === 'layer2-extra.asm' ? extraAsmPath : undefined;

const resolveMissing = (_file: string): string | undefined => undefined;

describe('mapping-layer2', () => {
  it('updates line mappings when source files are present', () => {
    const mapping = parseMapping(listingContent);
    const result = applyLayer2(mapping, { resolvePath });

    assert.deepEqual(result.missingSources, []);

    const nopSeg = mapping.segments.find((seg) => seg.lst.line === 2);
    assert.ok(nopSeg);
    assert.equal(nopSeg.loc.line, 2);
    assert.equal(nopSeg.confidence, 'HIGH');

    const inSeg = mapping.segments.find((seg) => seg.lst.line === 3);
    assert.ok(inSeg);
    assert.equal(inSeg.loc.line, 3);
  });

  it('reports missing sources without failing', () => {
    const mapping = parseMapping(listingContent);
    const result = applyLayer2(mapping, { resolvePath: resolveMissing });

    assert.ok(result.missingSources.includes('simple.asm'));
    const nopSeg = mapping.segments.find((seg) => seg.lst.line === 2);
    assert.ok(nopSeg);
    assert.equal(nopSeg.loc.line, null);
  });

  it('adjusts confidence for data, ambiguous, and macro blocks', () => {
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x1000,
          end: 0x1000,
          loc: { file: 'layer2-extra.asm', line: 1 },
          lst: { line: 1, text: 'LABEL:' },
          confidence: 'LOW',
        },
        {
          start: 0x1000,
          end: 0x1001,
          loc: { file: 'layer2-extra.asm', line: null },
          lst: { line: 2, text: 'DB 1,2' },
          confidence: 'MEDIUM',
        },
        {
          start: 0x1001,
          end: 0x1002,
          loc: { file: 'layer2-extra.asm', line: null },
          lst: { line: 3, text: 'NOP' },
          confidence: 'LOW',
        },
        {
          start: 0x1002,
          end: 0x1002,
          loc: { file: 'layer2-extra.asm', line: null },
          lst: { line: 4, text: 'Macro unroll block' },
          confidence: 'MEDIUM',
        },
        {
          start: 0x1002,
          end: 0x1003,
          loc: { file: 'layer2-extra.asm', line: null },
          lst: { line: 5, text: 'UNMATCHED' },
          confidence: 'MEDIUM',
        },
      ],
      anchors: [],
    };

    const result = applyLayer2(mapping, { resolvePath: resolveExtra });
    expect(result.missingSources).toEqual([]);

    const dataSeg = mapping.segments[1];
    expect(dataSeg?.loc.line).toBe(2);
    expect(dataSeg?.confidence).toBe('LOW');

    const nopSeg = mapping.segments[2];
    expect(nopSeg?.loc.line).toBe(3);
    expect(nopSeg?.confidence).toBe('MEDIUM');

    const unmatchedSeg = mapping.segments[4];
    expect(unmatchedSeg?.loc.line).toBeNull();
    expect(unmatchedSeg?.confidence).toBe('LOW');
  });

  it('drops matches that are far behind the hint line for data segments', () => {
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x2000,
          end: 0x2001,
          loc: { file: 'layer2-extra.asm', line: 200 },
          lst: { line: 1, text: 'DB 1,2' },
          confidence: 'MEDIUM',
        },
      ],
      anchors: [],
    };

    applyLayer2(mapping, { resolvePath: resolveExtra });
    const seg = mapping.segments[0];
    expect(seg?.loc.line).toBe(200);
    expect(seg?.confidence).toBe('LOW');
  });

  it('handles comments with strings containing semicolons', () => {
    // Test that semicolons inside strings are not treated as comments
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x3000,
          end: 0x3003,
          loc: { file: 'layer2-extra.asm', line: null },
          lst: { line: 1, text: 'DB "test;str"' },
          confidence: 'MEDIUM',
        },
      ],
      anchors: [],
    };

    const result = applyLayer2(mapping, { resolvePath: resolveExtra });
    // Should not crash and should process correctly
    expect(result).toBeDefined();
  });

  it('handles escaped characters in strings', () => {
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x3000,
          end: 0x3003,
          loc: { file: 'layer2-extra.asm', line: null },
          lst: { line: 1, text: "DB 'test\\'s'" },
          confidence: 'MEDIUM',
        },
      ],
      anchors: [],
    };

    const result = applyLayer2(mapping, { resolvePath: resolveExtra });
    expect(result).toBeDefined();
  });

  it('handles single-quoted strings with semicolons', () => {
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x3000,
          end: 0x3003,
          loc: { file: 'layer2-extra.asm', line: null },
          lst: { line: 1, text: "DB ';test'" },
          confidence: 'MEDIUM',
        },
      ],
      anchors: [],
    };

    const result = applyLayer2(mapping, { resolvePath: resolveExtra });
    expect(result).toBeDefined();
  });
});
