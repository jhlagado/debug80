import assert from 'node:assert/strict';
import test from 'node:test';
import { buildD8DebugMap, buildMappingFromD8DebugMap, parseD8DebugMap } from './d8-map';
import { MappingParseResult } from './parser';

test('D8 map v2 round-trip preserves mapping', () => {
  const mapping: MappingParseResult = {
    segments: [
      {
        start: 0x1000,
        end: 0x1003,
        loc: { file: 'src/main.asm', line: 12 },
        lst: { line: 200, text: 'JP START' },
        confidence: 'HIGH',
      },
      {
        start: 0x1003,
        end: 0x1004,
        loc: { file: 'src/main.asm', line: 13 },
        lst: { line: 201, text: 'NOP' },
        confidence: 'MEDIUM',
      },
    ],
    anchors: [
      {
        address: 0x1000,
        symbol: 'START',
        file: 'src/main.asm',
        line: 12,
      },
    ],
  };

  const map = buildD8DebugMap(mapping, {
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
  });

  assert.equal(map.version, 2);
  assert.equal(map.format, 'd8-debug-map');
  assert.equal(map.segments.start.length, mapping.segments.length);

  const { map: parsed, error } = parseD8DebugMap(JSON.stringify(map));
  assert.equal(error, undefined);
  assert.ok(parsed);

  const roundTrip = buildMappingFromD8DebugMap(parsed!);
  assert.deepEqual(roundTrip, mapping);
});
