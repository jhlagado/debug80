import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseListingWrittenRange } from '../../../scripts/dev/listingRangeTools.mjs';
import { writeLst } from '../../../src/outputs/write-lst.js';
import type {
  EmittedByteMap,
  EmittedSourceSegment,
  SymbolEntry,
} from '../../../src/outputs/types.js';
import type { LogicalLine } from '../../../src/source/logical-lines.js';

function byteMap(
  entries: readonly (readonly [number, number])[],
  sourceSegments: readonly EmittedSourceSegment[],
): EmittedByteMap {
  return { bytes: new Map(entries), sourceSegments };
}

function segment(
  file: string,
  line: number,
  start: number,
  end: number,
  kind: EmittedSourceSegment['kind'] = 'code',
): EmittedSourceSegment {
  return { file, line, column: 1, start, end, kind, confidence: 'high' };
}

function logical(sourceName: string, line: number, text: string): LogicalLine {
  return { sourceName, line, text };
}

function lines(text: string): string[] {
  return text.split('\n');
}

describe('writeLst', () => {
  it('renders gutters, empty-gutter lines, and the symbol trailer', () => {
    const source = '; boot\nstart:  ld a, 1\n        ret\n';
    const map = byteMap(
      [
        [0x8000, 0x3e],
        [0x8001, 0x01],
        [0x8002, 0xc9],
      ],
      [segment('main.asm', 2, 0x8000, 0x8002), segment('main.asm', 3, 0x8002, 0x8003)],
    );
    const symbols: SymbolEntry[] = [
      { kind: 'label', name: 'start', address: 0x8000 },
      { kind: 'constant', name: 'IOPORT', value: 0xf8 },
    ];

    const result = writeLst(map, symbols, {
      sourceTexts: new Map([['main.asm', source]]),
      logicalLines: [
        logical('main.asm', 1, '; boot'),
        logical('main.asm', 2, 'start:  ld a, 1'),
        logical('main.asm', 3, '        ret'),
      ],
    });

    expect(lines(result.text)).toEqual([
      '                    ; boot',
      '8000   3E 01        start:  ld a, 1',
      '8002   C9                   ret',
      '',
      'IOPORT      00F8',
      'start       8000',
      '',
    ]);
  });

  it('shifts the source right for 5-8 byte rows and wraps longer runs', () => {
    const bytes: [number, number][] = [];
    for (let index = 0; index < 12; index += 1) {
      bytes.push([0x4000 + index, index + 1]);
    }
    const map = byteMap(bytes, [segment('main.asm', 1, 0x4000, 0x400c, 'data')]);

    const result = writeLst(map, [], {
      sourceTexts: new Map([['main.asm', 'table:  .db 1,2,3,4,5,6,7,8,9,10,11,12\n']]),
      logicalLines: [logical('main.asm', 1, 'table:  .db 1,2,3,4,5,6,7,8,9,10,11,12')],
    });

    expect(lines(result.text)[0]).toBe(
      '4000   01 02 03 04 05 06 07 08  table:  .db 1,2,3,4,5,6,7,8,9,10,11,12',
    );
    expect(lines(result.text)[1]).toBe('4008   09 0A 0B 0C');
  });

  it('renders unfilled ds reservations as address-only gutters', () => {
    const map = byteMap([[0x4002, 0xc9]], [segment('main.asm', 2, 0x4002, 0x4003)]);

    const result = writeLst(map, [], {
      sourceTexts: new Map([['main.asm', 'buf:    .ds 2\n        ret\n']]),
      logicalLines: [
        logical('main.asm', 1, 'buf:    .ds 2'),
        logical('main.asm', 2, '        ret'),
      ],
      reservationSegments: [segment('main.asm', 1, 0x4000, 0x4002, 'directive')],
    });

    expect(lines(result.text)[0]).toBe('4000                buf:    .ds 2');
    expect(lines(result.text)[1]).toBe('4002   C9                   ret');
  });

  it('interleaves imported lines and reconstructs the swallowed import line', () => {
    const mainText = '        .org 08000H\n.import "lib.asm"\nmain:   ret\n';
    const libText = 'lib:    nop\n';
    const map = byteMap(
      [
        [0x8000, 0x00],
        [0x8001, 0xc9],
      ],
      [segment('lib.asm', 1, 0x8000, 0x8001), segment('main.asm', 3, 0x8001, 0x8002)],
    );

    const result = writeLst(map, [], {
      sourceTexts: new Map([
        ['main.asm', mainText],
        ['lib.asm', libText],
      ]),
      logicalLines: [
        logical('main.asm', 1, '        .org 08000H'),
        { ...logical('main.asm', 2, '.import "lib.asm"'), loadDirective: true },
        logical('lib.asm', 1, 'lib:    nop'),
        logical('main.asm', 3, 'main:   ret'),
      ],
    });

    expect(lines(result.text).slice(0, 4)).toEqual([
      '                            .org 08000H',
      '                    .import "lib.asm"',
      '8000   00           lib:    nop',
      '8001   C9           main:   ret',
    ]);
  });

  it('prints the gutter once for repeated occurrences of the same line', () => {
    const map = byteMap(
      [
        [0x4000, 0x00],
        [0x4001, 0x00],
      ],
      [
        segment('twice.asm', 1, 0x4000, 0x4001),
        segment('twice.asm', 1, 0x4001, 0x4002),
      ],
    );

    const result = writeLst(map, [], {
      sourceTexts: new Map([['twice.asm', '        nop\n']]),
      logicalLines: [logical('twice.asm', 1, '        nop'), logical('twice.asm', 1, '        nop')],
    });

    expect(lines(result.text).slice(0, 2)).toEqual([
      '4000   00 00                nop',
      '                            nop',
    ]);
  });

  it('qualifies ambiguous symbol names and overflows the 12-column pad', () => {
    const symbols: SymbolEntry[] = [
      {
        kind: 'label',
        name: 'helper',
        address: 0x9000,
        sourceUnit: 'lib/util.asm',
        needsSourceQualifier: true,
      },
      { kind: 'label', name: 'a_very_long_symbol_name', address: 0x1234 },
    ];

    const result = writeLst(byteMap([], []), symbols, {
      sourceTexts: new Map(),
      logicalLines: [],
    });

    expect(lines(result.text)).toContain('a_very_long_symbol_name 1234');
    expect(lines(result.text)).toContain('lib/util.asm::helper 9000');
  });

  it('round-trips the written range through the asm80 listing parser', () => {
    const bytes: [number, number][] = [];
    for (let index = 0; index < 20; index += 1) {
      bytes.push([0x8000 + index, index & 0xff]);
    }
    const map = byteMap(bytes, [
      segment('main.asm', 1, 0x8000, 0x8012, 'data'),
      segment('main.asm', 2, 0x8012, 0x8014),
    ]);

    const result = writeLst(map, [], {
      sourceTexts: new Map([['main.asm', 'blob:   .db 0\n        ret\n']]),
      logicalLines: [
        logical('main.asm', 1, 'blob:   .db 0'),
        logical('main.asm', 2, '        ret'),
      ],
    });

    const dir = mkdtempSync(join(tmpdir(), 'azm-write-lst-oracle-'));
    const listingPath = join(dir, 'out.lst');
    writeFileSync(listingPath, result.text, 'utf8');
    expect(parseListingWrittenRange(listingPath)).toEqual({ start: 0x8000, end: 0x8014 });
  });
});
