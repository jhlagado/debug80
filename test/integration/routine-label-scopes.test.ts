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

describe('routine-scoped label privacy', () => {
  it('lets two routines define the same plain label without colliding', () => {
    const result = compileSource(`
        .org 0100H
@First:
Loop:
        djnz Loop
        ret
@Second:
Loop:
        djnz Loop
        ret
`);

    expect(result.diagnostics).toEqual([]);
    // Each djnz binds to its own routine's Loop: offset -2 (0xFE).
    expect(Array.from(result.bytes)).toEqual([0x10, 0xfe, 0xc9, 0x10, 0xfe, 0xc9]);
    // Ambiguous local names display routine-qualified.
    expect(result.symbols).toMatchObject({
      First: 0x0100,
      Second: 0x0103,
      'First.Loop': 0x0100,
      'Second.Loop': 0x0103,
    });
    expect(result.symbols['Loop']).toBeUndefined();
  });

  it('displays an unambiguous routine-local label under its plain name', () => {
    const result = compileSource(`
        .org 0100H
@Main:
        jr Skip
        nop
Skip:
        ret
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toMatchObject({ Main: 0x0100, Skip: 0x0103 });
  });

  it('rejects a cross-routine reference to a routine-local label', () => {
    const result = compileSource(`
        .org 0100H
@First:
Helper:
        ret
@Second:
        call Helper
        ret
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message:
          'label "Helper" is local to routine @First in <memory>; export it with @Helper or move it above the first @ label',
        line: 7,
      }),
    ]);
  });

  it('rejects a file-level reference to a routine-local label', () => {
    const result = compileSource(`
        .org 0100H
Start:
        call Helper
        ret
@Routine:
Helper:
        ret
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message:
          'label "Helper" is local to routine @Routine in <memory>; export it with @Helper or move it above the first @ label',
        line: 4,
      }),
    ]);
  });

  it('keeps labels above the first @ label file-visible from inside routines', () => {
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

  it('treats data labels between routines as local to the preceding routine', () => {
    const result = compileSource(`
        .org 0100H
@First:
        ld hl,Stash
        ret
Stash:
        .ds 1
@Second:
        ld hl,Stash
        ret
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message:
          'label "Stash" is local to routine @First in <memory>; export it with @Stash or move it above the first @ label',
        line: 9,
      }),
    ]);
  });

  it('keeps programs without @ labels fully global', () => {
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

  it('resolves routine-local references case-insensitively within the routine', () => {
    const result = compileSource(`
        .org 0100H
@Main:
MyLoop:
        djnz myloop
        ret
`);

    expect(result.diagnostics).toEqual([]);
  });

  it('reports a duplicate when the same plain label repeats inside one routine', () => {
    const result = compileSource(`
        .org 0100H
@Main:
Loop:
        nop
Loop:
        ret
`);

    expect(result.diagnostics).not.toEqual([]);
    expect(result.diagnostics[0]?.message ?? '').toContain('Loop');
  });

  it('reports a duplicate when a routine-local label collides with a file-level label', () => {
    const result = compileSource(`
        .org 0100H
Value:
        .ds 1
@Main:
Value:
        ret
`);

    expect(result.diagnostics).not.toEqual([]);
  });

  it('scopes routine-local labels inside imported units to their routine', async () => {
    await withTempDir('azm-routine-scope-import-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'lib.asm');
      await writeFile(entry, '.import "lib.asm"\nmain:\n  call ReadKey\n', 'utf8');
      await writeFile(
        module,
        '@ReadKey:\n  jr Done\nDone:\n  ret\n@Other:\n  jr Done\n  ret\n',
        'utf8',
      );

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: `label "Done" is local to routine @ReadKey in ${module}; export it with @Done or move it above the first @ label`,
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
        '.import "lib.asm"\n.org $4000\n@Main:\nLoop:\n  call Work\n  jr Loop\n',
        'utf8',
      );
      await writeFile(module, '@Work:\nLoop:\n  djnz Loop\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
    });
  });
});
