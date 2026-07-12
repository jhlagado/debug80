import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

describe('Stage 4 explicit fixup slice', () => {
  it('patches forward ABS16 instruction operands', () => {
    const result = compileNext(`
        .org 0100H
main:
        CALL target
        NOP
target:
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      main: 0x0100,
      target: 0x0104,
    });
    expect(Array.from(result.bytes)).toEqual([0xcd, 0x04, 0x01, 0x00, 0xc9]);
  });

  it('patches symbolic .dw operands with supported addends', () => {
    const result = compileNext(`
        .org 4000H
        .dw target + 1, 1 + target, target - 1
target:
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({ target: 0x4006 });
    expect(result.bytes[0]).toBe(0xc9);
    expect(result.bytes[0x4000]).toBe(0x07);
    expect(result.bytes[0x4001]).toBe(0x40);
    expect(result.bytes[0x4002]).toBe(0x07);
    expect(result.bytes[0x4003]).toBe(0x40);
    expect(result.bytes[0x4004]).toBe(0x05);
    expect(result.bytes[0x4005]).toBe(0x40);
    expect(result.bytes[0x4006]).toBe(0xc9);
  });

  it('patches forward REL8 operands from the address after the branch', () => {
    const result = compileNext(`
        .org 0100H
        JR target
        NOP
target:
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({ target: 0x0103 });
    expect(Array.from(result.bytes)).toEqual([0x18, 0x01, 0x00, 0xc9]);
  });

  it('patches conditional JR and DJNZ rel8 operands case-insensitively', () => {
    const result = compileNext(`
        .org 0100H
loop:
        jr Nz, done
        dJnZ loop
done:
        RET
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toEqual({
      done: 0x0104,
      loop: 0x0100,
    });
    expect(Array.from(result.bytes)).toEqual([0x20, 0x02, 0x10, 0xfc, 0xc9]);
  });

  it('reports unresolved ABS16 symbols through fixup diagnostics', () => {
    const result = compileNext(`
        .org 0100H
        JP missing_label
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message: 'Unresolved symbol "missing_label" in 16-bit fixup.',
      }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('reports ABS16 range diagnostics through the fixup patch path', () => {
    const result = compileNext(`
        .org 0100H
        JP too_far
too_far .equ 10000H
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message: '16-bit fixup address out of range for "too_far" with addend 0: 65536.',
      }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('reports unresolved REL8 symbols through fixup diagnostics', () => {
    const result = compileNext(`
        .org 0100H
        JR missing_label
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message: 'Unresolved symbol "missing_label" in rel8 jr fixup.',
      }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('reports REL8 range diagnostics for unconditional, conditional, and DJNZ branches', () => {
    const padding = Array.from({ length: 130 }, () => '        NOP').join('\n');
    const result = compileNext(`
        .org 0100H
        JR far
        JR NZ, far
        DJNZ far
${padding}
far:
        RET
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('jr target out of range for rel8 branch'),
      }),
      expect.objectContaining({
        message: expect.stringContaining('jr nz target out of range for rel8 branch'),
      }),
      expect.objectContaining({
        message: expect.stringContaining('djnz target out of range for rel8 branch'),
      }),
    ]);
    expect(Array.from(result.bytes)).toEqual([]);
  });

  it('keeps symbols case-sensitive by default', () => {
    const result = compileNext(`
        .org 0100H
Target:
        RET
        JP target
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message: 'Unresolved symbol "target" in 16-bit fixup.',
      }),
    ]);
  });

  it('resolves label and equate fixups case-insensitively when requested', () => {
    const result = compileNext(
      `
Base    .equ Target
        JP target
        .dw base
Target:
        RET
`,
      { symbolCase: 'insensitive' },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toMatchObject({ Base: 0x0005, Target: 0x0005 });
    expect(Array.from(result.bytes)).toEqual([0xc3, 0x05, 0x00, 0x05, 0x00, 0xc9]);
  });

  it('resolves string equates case-insensitively when sizing and emitting .db', () => {
    const result = compileNext(
      `
Message .equ "OK"
        .db message
`,
      { symbolCase: 'insensitive' },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toMatchObject({ Message: 0 });
    expect(Array.from(result.bytes)).toEqual([0x4f, 0x4b]);
  });

  it('rejects case-only duplicate symbols in case-insensitive mode', () => {
    const result = compileNext(
      `
Loop:
loop:
        RET
`,
      { symbolCase: 'insensitive' },
    );

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: 'duplicate symbol: loop' }),
    ]);
  });
});
