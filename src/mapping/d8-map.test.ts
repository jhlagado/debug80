import assert from 'node:assert/strict';
import test from 'node:test';
import { buildD8DebugMap, buildMappingFromD8DebugMap, parseD8DebugMap } from './d8-map';
import { MappingParseResult } from './parser';

test('D8 map uses defaults and lstText table', () => {
  const mapping: MappingParseResult = {
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
  };

  const map = buildD8DebugMap(mapping, {
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
  });

  assert.equal(map.version, 1);
  assert.equal(map.segmentDefaults?.kind, 'unknown');
  assert.equal(map.segmentDefaults?.confidence, 'high');
  assert.equal(map.symbolDefaults?.kind, 'label');
  assert.equal(map.symbolDefaults?.scope, 'global');
  assert.equal(map.lstText?.length, 3);

  assert.ok(!Array.isArray(map.files));
  const fileEntry = (map.files as Record<string, { segments?: unknown[] }>)['src/main.asm'];
  assert.ok(fileEntry);
  assert.ok(fileEntry.segments);
  const segments = fileEntry.segments as Array<{
    file?: string;
    confidence?: string;
    lst?: { text?: string; textId?: number };
  }>;
  assert.equal(segments[0]?.file, undefined);
  assert.equal(segments[0]?.confidence, undefined);
  assert.equal(segments[2]?.confidence, 'low');
  assert.equal(segments[0]?.lst?.text, undefined);
  assert.equal(typeof segments[0]?.lst?.textId, 'number');

  const { map: parsed, error } = parseD8DebugMap(JSON.stringify(map));
  assert.equal(error, undefined);
  assert.ok(parsed);

  const roundTrip = buildMappingFromD8DebugMap(parsed!);
  assert.deepEqual(roundTrip, mapping);
});
