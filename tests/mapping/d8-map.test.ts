import { describe, expect, it } from 'vitest';
import { buildD8DebugMap, buildMappingFromD8DebugMap, parseD8DebugMap } from '../../src/mapping/d8-map';
import { MappingParseResult } from '../../src/mapping/parser';

const makeMapping = (): MappingParseResult => ({
  segments: [
    {
      start: 0x1000,
      end: 0x1002,
      loc: { file: 'src/main.asm', line: 10 },
      lst: { line: 120, text: 'LD A,B' },
      confidence: 'HIGH',
    },
    {
      start: 0x1002,
      end: 0x1003,
      loc: { file: 'src/main.asm', line: 11 },
      lst: { line: 121, text: 'INC A' },
      confidence: 'HIGH',
    },
    {
      start: 0x1003,
      end: 0x1004,
      loc: { file: 'src/main.asm', line: 12 },
      lst: { line: 122, text: 'NOP' },
      confidence: 'LOW',
    },
  ],
  anchors: [
    {
      address: 0x1000,
      symbol: 'START',
      file: 'src/main.asm',
      line: 10,
    },
  ],
});

describe('d8-map', () => {
  it('uses defaults and lstText table for repeated lines', () => {
    const mapping = makeMapping();
    const map = buildD8DebugMap(mapping, {
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
    });

    expect(map.version).toBe(1);
    expect(map.segmentDefaults?.kind).toBe('unknown');
    expect(map.segmentDefaults?.confidence).toBe('high');
    expect(map.symbolDefaults?.kind).toBe('label');
    expect(map.symbolDefaults?.scope).toBe('global');
    expect(map.lstText?.length).toBe(3);

    const fileEntry = map.files['src/main.asm'];
    expect(fileEntry).toBeDefined();
    expect(fileEntry?.segments?.[0]?.confidence).toBeUndefined();
    expect(fileEntry?.segments?.[2]?.confidence).toBe('low');
    expect(fileEntry?.segments?.[0]?.lstText).toBeUndefined();
    expect(typeof fileEntry?.segments?.[0]?.lstTextId).toBe('number');
  });

  it('round-trips through JSON parse and rebuild', () => {
    const mapping = makeMapping();
    const map = buildD8DebugMap(mapping, {
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
    });
    const { map: parsed, error } = parseD8DebugMap(JSON.stringify(map));
    expect(error).toBeUndefined();
    expect(parsed).toBeDefined();
    const roundTrip = buildMappingFromD8DebugMap(parsed!);
    expect(roundTrip).toEqual(mapping);
  });

  it('parses invalid JSON with a readable error', () => {
    const { error } = parseD8DebugMap('{');
    expect(error).toMatch(/Invalid JSON/);
  });

  it('rejects invalid segment lstTextId ranges', () => {
    const badMap = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      lstText: ['line 0'],
      files: {
        'src/main.asm': {
          segments: [
            { start: 0, end: 1, lstLine: 1, lstTextId: 99 },
          ],
        },
      },
    };
    const { error } = parseD8DebugMap(JSON.stringify(badMap));
    expect(error).toBe('Segment lstTextId is out of range.');
  });

  it('drops symbols without a line during rebuild', () => {
    const map = buildD8DebugMap(makeMapping(), {
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
    });
    const entry = map.files['src/main.asm'];
    if (entry?.symbols) {
      entry.symbols.push({ name: 'NOLINE', address: 0x2000 });
    }
    const rebuilt = buildMappingFromD8DebugMap(map);
    const symbols = rebuilt.anchors.map((a) => a.symbol);
    expect(symbols).not.toContain('NOLINE');
  });

  it('omits confidence defaults when no segments exist', () => {
    const map = buildD8DebugMap(
      { segments: [], anchors: [] },
      { arch: 'z80', addressWidth: 16, endianness: 'little' }
    );
    expect(map.segmentDefaults?.confidence).toBeUndefined();
  });

  it('returns empty mappings for invalid file maps', () => {
    const badMap = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: [],
    };
    const rebuilt = buildMappingFromD8DebugMap(badMap as never);
    expect(rebuilt).toEqual({ segments: [], anchors: [] });
  });

  it('applies default confidence when segment confidence is missing', () => {
    const map = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {
        'src/main.asm': {
          segments: [{ start: 0, end: 1, lstLine: 1 }],
        },
      },
    };
    const rebuilt = buildMappingFromD8DebugMap(map as never);
    expect(rebuilt.segments[0]?.confidence).toBe('LOW');
  });

  it('rejects invalid map shapes and field types', () => {
    const cases: Array<[string, unknown]> = [
      ['Expected a JSON object.', 'not-an-object'],
      ['Missing or invalid format field.', { format: 'nope', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: {} }],
      ['Unsupported D8 map version.', { format: 'd8-debug-map', version: 2, arch: 'z80', addressWidth: 16, endianness: 'little', files: {} }],
      ['Missing arch.', { format: 'd8-debug-map', version: 1, arch: '', addressWidth: 16, endianness: 'little', files: {} }],
      ['Missing addressWidth.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: NaN, endianness: 'little', files: {} }],
      ['Missing endianness.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'sideways', files: {} }],
      ['Missing files map.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: null }],
      ['segmentDefaults must be an object.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: {}, segmentDefaults: 5 }],
      ['segmentDefaults.kind is invalid.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: {}, segmentDefaults: { kind: 'bad' } }],
      ['segmentDefaults.confidence is invalid.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: {}, segmentDefaults: { confidence: 'bad' } }],
      ['symbolDefaults must be an object.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: {}, symbolDefaults: 5 }],
      ['symbolDefaults.kind is invalid.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: {}, symbolDefaults: { kind: 'bad' } }],
      ['symbolDefaults.scope is invalid.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: {}, symbolDefaults: { scope: 'bad' } }],
      ['lstText must be an array when present.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: {}, lstText: 'not-array' }],
      ['File entry must be an object.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': 'bad' } }],
      ['File meta must be an object.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { meta: 'bad' } } }],
      ['File meta sha256 must be a string.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { meta: { sha256: 1 } } } }],
      ['File meta lineCount must be a number.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { meta: { lineCount: 'no' } } } }],
      ['File segments must be an array.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: 'no' } } }],
      ['Segment entry must be an object.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: ['bad'] } } }],
      ['Segment start/end must be numbers.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: [{ start: 'a', end: 1, lstLine: 1 }] } } }],
      ['Segment line must be a number or null.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: [{ start: 0, end: 1, line: 'no', lstLine: 1 }] } } }],
      ['Segment kind is invalid.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: [{ start: 0, end: 1, lstLine: 1, kind: 'bad' }] } } }],
      ['Segment confidence is invalid.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: [{ start: 0, end: 1, lstLine: 1, confidence: 'bad' }] } } }],
      ['Segment lstLine must be a number.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: [{ start: 0, end: 1, lstLine: 'no' }] } } }],
      ['Segment lstText must be a string.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: [{ start: 0, end: 1, lstLine: 1, lstText: 1 }] } } }],
      ['Segment lstTextId must be a number.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { segments: [{ start: 0, end: 1, lstLine: 1, lstTextId: 'no' }] } } }],
      ['File symbols must be an array.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { symbols: 'no' } } }],
      ['Symbol entry must be an object.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { symbols: ['bad'] } } }],
      ['Symbol name must be a string.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { symbols: [{ name: '', address: 0 }] } } }],
      ['Symbol address must be a number.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { symbols: [{ name: 'X', address: 'no' }] } } }],
      ['Symbol line must be a number or null.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { symbols: [{ name: 'X', address: 0, line: 'no' }] } } }],
      ['Symbol kind is invalid.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { symbols: [{ name: 'X', address: 0, kind: 'bad' }] } } }],
      ['Symbol scope is invalid.', { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little', files: { 'src/main.asm': { symbols: [{ name: 'X', address: 0, scope: 'bad' }] } } }],
    ];

    for (const [message, payload] of cases) {
      const { error } = parseD8DebugMap(JSON.stringify(payload));
      expect(error).toBe(message);
    }
  });
});
