import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyzeProgramNext, compileSource, loadProgramNext } from '../../src/index.js';

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('owner-scoped local label privacy', () => {
  it('lets two owners define the same underscore-prefixed label without colliding', () => {
    const result = compileSource(`
        .org 0100H
@First:
_loop:
        djnz _loop
        ret
@Second:
_loop:
        djnz _loop
        ret
`);

    expect(result.diagnostics).toEqual([]);
    // Each djnz binds to its own routine's Loop: offset -2 (0xFE).
    expect(Array.from(result.bytes)).toEqual([0x10, 0xfe, 0xc9, 0x10, 0xfe, 0xc9]);
    // Ambiguous local names display routine-qualified.
    expect(result.symbols).toMatchObject({
      First: 0x0100,
      Second: 0x0103,
      'First._loop': 0x0100,
      'Second._loop': 0x0103,
    });
    expect(result.symbols['_loop']).toBeUndefined();
  });

  it('displays an unambiguous local label under its plain name', () => {
    const result = compileSource(`
        .org 0100H
@Main:
        jr _skip
        nop
_skip:
        ret
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toMatchObject({ Main: 0x0100, _skip: 0x0103 });
  });

  it('rejects a cross-owner reference to a local label', () => {
    const result = compileSource(`
        .org 0100H
@First:
_helper:
        ret
@Second:
        call _helper
        ret
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'local symbol "_helper" belongs to First in <memory>',
        line: 7,
      }),
    ]);
  });

  it('rejects a reference from another owner to a local label', () => {
    const result = compileSource(`
        .org 0100H
Start:
        call _helper
        ret
@Routine:
_helper:
        ret
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'local symbol "_helper" belongs to Routine in <memory>',
        line: 4,
      }),
    ]);
  });

  it('keeps ordinary labels visible from all owners', () => {
    const result = compileSource(`
        .org 0100H
Buffer:
        .ds 2
@First:
        ld hl,Buffer
        ret
@Second:
        ld hl,Buffer
        ret
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toMatchObject({ Buffer: 0x0100 });
  });

  it('keeps underscore-prefixed data labels local to the preceding owner', () => {
    const result = compileSource(`
        .org 0100H
@First:
        ld hl,_stash
        ret
_stash:
        .ds 1
@Second:
        ld hl,_stash
        ret
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'local symbol "_stash" belongs to First in <memory>',
        line: 9,
      }),
    ]);
  });

  it('keeps unprefixed labels source-unit global', () => {
    const result = compileSource(`
        .org 0100H
main:
        call helper
        ret
helper:
        ret
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toMatchObject({ main: 0x0100, helper: 0x0104 });
  });

  it('resolves local references case-sensitively within their owner', () => {
    const result = compileSource(`
        .org 0100H
@Main:
_myLoop:
        djnz _MYLOOP
        ret
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('_MYLOOP'),
      }),
    ]);
  });

  it('reports a duplicate when the same local label repeats under one owner', () => {
    const result = compileSource(`
        .org 0100H
@Main:
_loop:
        nop
_loop:
        ret
`);

    expect(result.diagnostics).not.toEqual([]);
    expect(result.diagnostics[0]?.message ?? '').toContain('_loop');
  });

  it('allows a local label to differ from a source-unit global by its prefix', () => {
    const result = compileSource(`
        .org 0100H
Value:
        .ds 1
@Main:
_value:
        ret
`);

    expect(result.diagnostics).toEqual([]);
  });

  it('scopes local labels inside imported units to their owner', async () => {
    await withTempDir('azm-routine-scope-import-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'lib.asm');
      await writeFile(entry, '.import "lib.asm"\nmain:\n  call ReadKey\n', 'utf8');
      await writeFile(
        module,
        '@ReadKey:\n  jr _done\n_done:\n  ret\n@Other:\n  jr _done\n  ret\n',
        'utf8',
      );

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: `local symbol "_done" belongs to ReadKey in ${module}`,
          sourceName: module,
          line: 6,
        }),
      ]);
    });
  });

  it('lets the same local name coexist across the root file and an imported unit', async () => {
    await withTempDir('azm-routine-scope-shadow-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'lib.asm');
      await writeFile(
        entry,
        '.import "lib.asm"\n.org $4000\n@Main:\n_loop:\n  call Work\n  jr _loop\n',
        'utf8',
      );
      await writeFile(module, '@Work:\n_loop:\n  djnz _loop\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
    });
  });
});
