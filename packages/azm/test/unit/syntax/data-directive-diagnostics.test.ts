import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../../src/model/diagnostic.js';
import type { SourceItem } from '../../../src/model/source-item.js';
import { asmLine } from './asm80-parse-helpers.js';
import { azmDirectiveAliases } from './asm80-alias-helpers.js';
import { parseLogicalLine } from '../../../src/syntax/parse-line.js';

function parseLine(text: string): {
  readonly items: readonly SourceItem[];
  readonly diagnostics: readonly Diagnostic[];
} {
  return parseLogicalLine(asmLine(text), { directiveAliasPolicy: azmDirectiveAliases });
}

describe('typographic quote diagnostics', () => {
  it('names the typographic double quote in a failing .db value list', () => {
    const parsed = parseLine('  .db “HELLO”,0');
    expect(parsed.items).toEqual([]);
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_PARSE',
        message: 'invalid .db value list: typographic quote character “ found — use ASCII quotes (")',
      }),
    );
  });

  it('names the typographic single quote in a failing .db value list', () => {
    const parsed = parseLine('  .db ‘A’,0');
    expect(parsed.items).toEqual([]);
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_PARSE',
        message: "invalid .db value list: typographic quote character ‘ found — use ASCII quotes (')",
      }),
    );
  });

  it('keeps the generic .db error when no typographic quote is present', () => {
    const parsed = parseLine('  .db 1,,2');
    expect(parsed.items).toEqual([]);
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_PARSE',
        message: 'invalid .db value list',
      }),
    );
  });

  it('still accepts ASCII-quoted .db strings that contain typographic quotes', () => {
    const parsed = parseLine('  .db "he said “hi”",0');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.items).toMatchObject([
      {
        kind: 'db',
        values: [{ kind: 'string-fragment', value: 'he said “hi”' }, { kind: 'number', value: 0 }],
      },
    ]);
  });

  it('names the typographic quote in a failing .cstr string', () => {
    const parsed = parseLine('  .cstr “HELLO”');
    expect(parsed.items).toEqual([]);
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_PARSE',
        message:
          '.cstr expects one double-quoted string: typographic quote character “ found — use ASCII quotes (")',
      }),
    );
  });

  it('names the typographic quote in a failing .equ expression', () => {
    const parsed = parseLine('GREETING .equ “HI”');
    expect(parsed.items).toEqual([]);
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_PARSE',
        message:
          'invalid .equ expression: “HI” (typographic quote character “ found — use ASCII quotes ("))',
      }),
    );
  });
});

describe('ambiguous binary literal warnings', () => {
  it('warns when a .db value is a single binary digit with a B suffix', () => {
    const parsed = parseLine('  .db 1B, 40, 12, 54, 0');
    expect(parsed.items).toMatchObject([
      {
        kind: 'db',
        values: [
          { kind: 'number', value: 1 },
          { kind: 'number', value: 40 },
          { kind: 'number', value: 12 },
          { kind: 'number', value: 54 },
          { kind: 'number', value: 0 },
        ],
      },
    ]);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'AZMN_PARSE',
        message:
          '.db value 1B is a binary literal with value 1 (trailing B is the binary suffix) — ' +
          'write 0x1B or 1Bh if hex 27 was intended',
      }),
    ]);
  });

  it('warns for 0B and lowercase 1b as well', () => {
    const parsed = parseLine('  .db 0B, 1b');
    expect(parsed.diagnostics).toHaveLength(2);
    expect(parsed.diagnostics.every((diagnostic) => diagnostic.severity === 'warning')).toBe(true);
  });

  it('warns in .dw value lists too', () => {
    const parsed = parseLine('  .dw 1B');
    expect(parsed.items).toMatchObject([{ kind: 'dw', values: [{ kind: 'number', value: 1 }] }]);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'AZMN_PARSE' }),
    ]);
  });

  it('does not warn for multi-digit binary literals or other forms', () => {
    for (const text of [
      '  .db 10101010b',
      '  .db 0x1B',
      '  .db 1Bh',
      '  .db %1',
      '  .db 27',
      '  .db 1B+0',
    ]) {
      const parsed = parseLine(text);
      expect(parsed.diagnostics).toEqual([]);
    }
  });
});
