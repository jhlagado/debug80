/**
 * @file Tests for D8 contract validation.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validateD8Segments } from '../../src/mapping/d8-validate';
import type { D8DebugMap } from '../../src/mapping/d8-map';
import { parseD8DebugMap } from '../../src/mapping/d8-map';

function makeMinimalMap(overrides: Partial<D8DebugMap> = {}): D8DebugMap {
  return {
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
    files: {},
    ...overrides,
  };
}

describe('validateD8Segments', () => {
  it('returns no warnings for a clean D8 map', () => {
    const map = makeMinimalMap({
      files: {
        'main.asm': {
          segments: [
            { start: 0x1000, end: 0x1002, line: 10, lstLine: 1 },
            { start: 0x1002, end: 0x1003, line: 11, lstLine: 2 },
          ],
        },
      },
    });
    const warnings = validateD8Segments(map);
    expect(warnings).toEqual([]);
  });

  it('warns about lstLine=0', () => {
    const map = makeMinimalMap({
      files: {
        'main.asm': {
          segments: [{ start: 0x1000, end: 0x1033, lstLine: 0 }],
        },
      },
    });
    const warnings = validateD8Segments(map);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.message.includes('lstLine=0'))).toBe(true);
  });

  it('warns about line=0', () => {
    const map = makeMinimalMap({
      files: {
        'main.asm': {
          segments: [{ start: 0x1000, end: 0x1002, line: 0, lstLine: 1 }],
        },
      },
    });
    const warnings = validateD8Segments(map);
    expect(warnings.some((w) => w.message.includes('line=0'))).toBe(true);
  });

  it('warns about negative line values', () => {
    const map = makeMinimalMap({
      files: {
        'main.asm': {
          segments: [{ start: 0x1000, end: 0x1002, line: -1, lstLine: 1 }],
        },
      },
    });
    const warnings = validateD8Segments(map);
    expect(warnings.some((w) => w.message.includes('line=-1'))).toBe(true);
  });

  it('warns about empty / inverted ranges', () => {
    const map = makeMinimalMap({
      files: {
        'main.asm': {
          segments: [{ start: 0x1002, end: 0x1000, line: 5, lstLine: 1 }],
        },
      },
    });
    const warnings = validateD8Segments(map);
    expect(warnings.some((w) => w.message.includes('empty or inverted'))).toBe(true);
  });

  it('warns about wide segments shadowing narrower segments with valid lines', () => {
    const map = makeMinimalMap({
      files: {
        'matrix.zax': {
          segments: [
            { start: 0x4000, end: 0x4033, lstLine: 0 },
            { start: 0x4000, end: 0x4002, line: 28, lstLine: 28 },
            { start: 0x4002, end: 0x4004, line: 29, lstLine: 29 },
          ],
        },
      },
    });
    const warnings = validateD8Segments(map);
    expect(warnings.some((w) => w.message.includes('shadows narrower'))).toBe(true);
  });

  it('does not warn when wide segment has a valid line', () => {
    const map = makeMinimalMap({
      files: {
        'main.asm': {
          segments: [
            { start: 0x1000, end: 0x1020, line: 5, lstLine: 5 },
            { start: 0x1000, end: 0x1002, line: 6, lstLine: 6 },
          ],
        },
      },
    });
    const warnings = validateD8Segments(map);
    expect(warnings.filter((w) => w.message.includes('shadows'))).toEqual([]);
  });

  it('detects problems in the golden ZAX fixture', () => {
    const d8Path = path.join(process.cwd(), 'tests', 'fixtures', 'zax', 'matrix.d8.json');
    const content = fs.readFileSync(d8Path, 'utf-8');
    const { map } = parseD8DebugMap(content);
    expect(map).toBeDefined();

    const warnings = validateD8Segments(map!);
    const lstLine0Warnings = warnings.filter((w) => w.message.includes('lstLine=0'));
    expect(lstLine0Warnings.length).toBeGreaterThanOrEqual(1);

    const shadowWarnings = warnings.filter((w) => w.message.includes('shadows'));
    expect(shadowWarnings.length).toBeGreaterThanOrEqual(1);
  });
});
