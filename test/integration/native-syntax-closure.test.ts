import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('native syntax closure', () => {
  it('rejects prefix declaration compatibility forms', () => {
    for (const [source, message] of [
      ['.type Sprite = byte[4]', 'Use "Sprite .typealias ..." for type aliases.'],
      ['.type Sprite', 'Use "Sprite .type" for layouts.'],
      ['.union Value', 'Use "Value .union" for layouts.'],
      ['enum Colour Red, Green', 'Use "Colour .enum ..." for enums.'],
    ]) {
      const result = compileNext(`${source}\n`);
      expect(result.diagnostics).toEqual([expect.objectContaining({ message })]);
    }
  });

  it('recovers old prefix layout blocks without cascading body diagnostics', () => {
    const result = compileNext(`
.type Sprite
x       .byte
        .endtype
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'Use "Sprite .type" for layouts.' }),
    ]);
  });

  it('records colon equates for conditional assembly without address labels', () => {
    const result = compileNext(`
FLAG: .equ 1
.if FLAG
        .db 1
.endif
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([1]);
    expect(result.symbols).toMatchObject({ FLAG: 1 });
  });

  it('accepts colons on name-left layout declarations before body parsing', () => {
    const result = compileNext(`
Sprite: .type
x       .byte
        .endtype

        .db sizeof(Sprite), offset(Sprite, x)
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([1, 0]);

    const union = compileNext(`
Value:.union
x      .byte
       .endunion

       .db sizeof(Value), offset(Value, x)
`);

    expect(union.diagnostics).toEqual([]);
    expect(Array.from(union.bytes)).toEqual([1, 0]);
  });

  it('tolerates ASM80 quote forms while preserving string data behavior', () => {
    const accepted = compileNext(`
TEXT .equ "OK"
SPACE .equ " "
CHAR .equ 'A'
        ld a," "
        cp " "
        sub "a"-"A"
        .db 'B', "CD", TEXT, SPACE
        .db '<_>?)!@#$%^&*( : +|',22H
        .cstr "EF"
        .pstr "G"
        .istr "H"
`);

    expect(accepted.diagnostics).toEqual([]);
    expect(Array.from(accepted.bytes)).toEqual([
      0x3e,
      0x20,
      0xfe,
      0x20,
      0xd6,
      0x20,
      0x42,
      0x43,
      0x44,
      0x4f,
      0x4b,
      0x20,
      ...[...'<_>?)!@#$%^&*( : +|'].map((char) => char.charCodeAt(0)),
      0x22,
      0x45,
      0x46,
      0x00,
      0x01,
      0x47,
      0x48 | 0x80,
    ]);

    for (const [source, message] of [
      ['.cstr \'A\'', '.cstr expects one double-quoted string'],
      ['.pstr \'A\'', '.pstr expects one double-quoted string'],
      ['.istr \'A\'', '.istr expects one double-quoted string'],
    ]) {
      const result = compileNext(`${source}\n`);
      expect(result.diagnostics).toEqual([expect.objectContaining({ message })]);
    }
  });
});
