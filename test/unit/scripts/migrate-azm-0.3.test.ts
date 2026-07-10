import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// @ts-expect-error TypeScript does not generate declarations for repository scripts.
// prettier-ignore
const migrationModule = await import('../../../scripts/dev/migrate-azm-0.3.mjs');
const { collectMigrationSourceFiles, migrateAzm03Source } = migrationModule;

describe('AZM 0.3 source migration', () => {
  it('converts legacy routine contracts and preserves exports by default', () => {
    const source = [
      '; Routine prose.',
      ';! out A,carry',
      ';! in HL; clobbers BC',
      '@ReadByte:',
      '    ret',
      '',
    ].join('\n');

    expect(migrateAzm03Source(source)).toEqual({
      text: [
        '; Routine prose.',
        '.routine in HL out A,carry clobbers BC',
        '@ReadByte:',
        '    ret',
        '',
      ].join('\n'),
      diagnostics: [],
    });
  });

  it('adds a bare routine marker and can strip obsolete root exports', () => {
    expect(migrateAzm03Source('@Start:\n    ret\n', { stripExports: true })).toEqual({
      text: '.routine\nStart:\n    ret\n',
      diagnostics: [],
    });
  });

  it('is idempotent after preserving an exported routine', () => {
    const source = ';! out A\n@ReadByte:\n    ret\n';
    const once = migrateAzm03Source(source);
    const twice = migrateAzm03Source(once.text);

    expect(once.diagnostics).toEqual([]);
    expect(twice).toEqual({ text: once.text, diagnostics: [] });
  });

  it('is idempotent when contract directives intervene before an exported label', () => {
    const source = [
      '.routine out A',
      '.expectout Z',
      '.rcignore output_candidate "reviewed"',
      '.contracts audit',
      '@ReadByte:',
      '    ret',
      '',
    ].join('\n');

    expect(migrateAzm03Source(source)).toEqual({ text: source, diagnostics: [] });
  });

  it('is idempotent when loader and conditional directives intervene before a label', () => {
    const source = [
      '.routine out A',
      '.import "support.asm"',
      '.if 1',
      '.endif',
      '@ReadByte:',
      '    ret',
      '',
    ].join('\n');

    expect(migrateAzm03Source(source)).toEqual({ text: source, diagnostics: [] });
  });

  it('promotes a contracted plain helper to an explicit routine', () => {
    expect(migrateAzm03Source(';! clobbers B\nScanDwell:\n    ret\n')).toEqual({
      text: '.routine clobbers B\nScanDwell:\n    ret\n',
      diagnostics: [],
    });
  });

  it('converts policy, suppression, and expected-output comments', () => {
    const source = [
      ';! contracts audit',
      ';! rc-ignore-next missing_callee_contract: retained legacy call',
      '    call Legacy',
      '; expects out A,HL',
      '    call ReadPair',
      '',
    ].join('\n');

    expect(migrateAzm03Source(source)).toEqual({
      text: [
        '.contracts audit',
        '.rcignore missing_callee_contract "retained legacy call"',
        '    call Legacy',
        '.expectout A,HL',
        '    call ReadPair',
        '',
      ].join('\n'),
      diagnostics: [],
    });
  });

  it('does not silently move an orphaned legacy contract', () => {
    const source = ';! out A\n    ld a,1\n';
    const result = migrateAzm03Source(source);

    expect(result.text).toBe(source);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        line: 2,
        message: expect.stringContaining('not followed by a non-local label'),
      }),
    ]);
  });

  it('diagnoses legacy named outputs instead of writing invalid contracts', () => {
    const source = ';! out {A,carry} scanKeys\n@ReadKeys:\n    ret\n';
    const result = migrateAzm03Source(source);

    expect(result.text).toBe(source);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: expect.stringContaining('named outputs') }),
    ]);
  });

  it('preserves valid legacy flag aliases', () => {
    const source = ';! out Z,S,PV,P/V,HFLAG\n@Flags:\n    ret\n';
    expect(migrateAzm03Source(source)).toEqual({
      text: '.routine out Z,S,PV,P/V,HFLAG\n@Flags:\n    ret\n',
      diagnostics: [],
    });
  });

  it('normalizes whitespace-separated legacy carriers', () => {
    const source = ';! in BC; out A HL\n@ReadPair:\n    ret\n';
    expect(migrateAzm03Source(source)).toEqual({
      text: '.routine in BC out A,HL\n@ReadPair:\n    ret\n',
      diagnostics: [],
    });
  });

  it('diagnoses legacy interface boundary forms for manual migration', () => {
    for (const directive of ['extern LIB_READ out A', 'end']) {
      const source = `;! ${directive}\n@ReadByte:\n    ret\n`;
      const result = migrateAzm03Source(source);
      expect(result.text).toBe(source);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ message: expect.stringContaining('manual migration') }),
      ]);
    }
  });

  it('rejects invalid suppression kinds and expected-output carriers', () => {
    const source = [
      ';! rc-ignore-next typo_kind: not safe',
      '    call Legacy',
      '; expects out BAD',
      '    call ReadValue',
      '',
    ].join('\n');
    const result = migrateAzm03Source(source);

    expect(result.text).toBe(source);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: expect.stringContaining('typo_kind') }),
      expect.objectContaining({ message: expect.stringContaining('BAD') }),
    ]);
  });

  it('leaves unrelated bang comments untouched', () => {
    const source = ';!important implementation note\nMain:\n    ret\n';
    expect(migrateAzm03Source(source)).toEqual({ text: source, diagnostics: [] });
  });

  it('excludes generated output directories during recursive discovery', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-03-migration-discovery-'));
    try {
      await mkdir(join(dir, 'src'));
      await mkdir(join(dir, 'build'));
      await writeFile(join(dir, 'src', 'main.asm'), 'Main:\n');
      await writeFile(join(dir, 'build', 'main.z80'), 'Main:\n');

      expect(await collectMigrationSourceFiles(dir)).toEqual([join(dir, 'src', 'main.asm')]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
