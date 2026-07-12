import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeProgram,
  analyzeProgramNext,
  compile,
  defaultFormatWriters,
  loadProgram,
  loadProgramNext,
} from '../../src/index.js';
import { assembleProgram } from '../../src/assembly/assemble-program.js';

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('stage 11 tooling API', () => {
  it('loads preloaded entry text through the programming API without reading the entry file', async () => {
    await withTempDir('azm-next-tooling-preload-', async (dir) => {
      const entry = join(dir, 'nested', '..', 'unsaved.asm');
      const normalizedEntry = normalize(entry);
      const result = await loadProgramNext({
        entryFile: entry,
        preloadedText: 'main:\n  ld a,$2a\n  ret\n',
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.loadedProgram?.program.kind).toBe('Program');
      expect(result.loadedProgram?.program.entryFile).toBe(normalizedEntry);
      expect(result.loadedProgram?.program.files[0].name).toBe(normalizedEntry);
      expect(result.loadedProgram?.program.files).toHaveLength(1);
      expect(result.loadedProgram?.sourceTexts.get(normalizedEntry)).toBe(
        'main:\n  ld a,$2a\n  ret\n',
      );
      expect(result.loadedProgram?.sourceLineComments.size).toBe(0);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ main: 0 });

      const stableNameResult = await loadProgram({
        entryFile: entry,
        preloadedText: 'main:\n  ret\n',
      });
      expect(analyzeProgram(stableNameResult.loadedProgram!).diagnostics).toEqual([]);
    });
  });

  it('expands quoted includes through explicit include directories and preserves child provenance', async () => {
    await withTempDir('azm-next-tooling-include-', async (dir) => {
      const includes = join(dir, 'includes');
      const entry = join(dir, 'main.asm');
      const child = join(includes, 'values.inc');
      await mkdir(includes);
      await writeFile(entry, '.org $4000\n.include "values.inc"\nmain:\n  ld a,VALUE\n', 'utf8');
      await writeFile(child, 'VALUE EQU $2a ; exported value\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry, includeDirs: [includes] });

      expect(result.diagnostics).toEqual([]);
      expect(result.loadedProgram?.sourceTexts.get(entry)).toContain('.include "values.inc"');
      expect(result.loadedProgram?.sourceTexts.get(child)).toBe('VALUE EQU $2a ; exported value\n');
      expect(result.loadedProgram?.sourceLineComments.get(child)?.get(1)).toBe('exported value');
      expect(result.loadedProgram?.program.files[0]?.items.map((item) => item.kind)).toEqual([
        'org',
        'equ',
        'comment',
        'label',
        'instruction',
      ]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ VALUE: 0x2a, main: 0x4000 });
    });
  });

  it('loads imported files as separate source ownership units without enforcing privacy yet', async () => {
    await withTempDir('azm-next-tooling-import-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'keyboard.asm');
      await writeFile(entry, '.org $4000\n.import "keyboard.asm"\nmain:\n  call ReadKey\n', 'utf8');
      await writeFile(module, '@ReadKey:\n  call ScanMatrix\nScanMatrix:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.diagnostics).toEqual([]);
      expect(result.loadedProgram?.sourceTexts.get(entry)).toContain('.import "keyboard.asm"');
      expect(result.loadedProgram?.sourceTexts.get(module)).toContain('@ReadKey:');

      const items = result.loadedProgram?.program.files[0]?.items ?? [];
      const labels = items
        .filter((item) => item.kind === 'label')
        .map((item) => ({
          name: item.name,
          isExported: item.isExported,
          sourceName: item.span.sourceName,
          sourceUnit: item.span.sourceUnit,
          sourceRelation: item.span.sourceRelation,
        }));
      expect(labels).toEqual([
        {
          name: 'ReadKey',
          isExported: true,
          sourceName: module,
          sourceUnit: module,
          sourceRelation: 'import',
        },
        {
          name: 'ScanMatrix',
          isExported: undefined,
          sourceName: module,
          sourceUnit: module,
          sourceRelation: 'import',
        },
        {
          name: 'main',
          isExported: undefined,
          sourceName: entry,
          sourceUnit: entry,
          sourceRelation: 'entry',
        },
      ]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({
        ReadKey: 0x4000,
        ScanMatrix: 0x4003,
        main: 0x4004,
      });
    });
  });

  it('resolves imported public labels case-insensitively when requested', async () => {
    await withTempDir('azm-next-tooling-import-symbol-case-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'keyboard.asm');
      await writeFile(entry, '.org $4000\n.import "keyboard.asm"\nmain:\n  call readkey\n', 'utf8');
      await writeFile(module, '@ReadKey:\n  ret\n', 'utf8');

      const strict = await compile(entry, { emitBin: true, emitHex: false, emitD8m: false });
      expect(strict.diagnostics).toEqual([
        expect.objectContaining({ message: 'Unresolved symbol "readkey" in 16-bit fixup.' }),
      ]);

      const insensitive = await compile(entry, {
        symbolCase: 'insensitive',
        emitBin: true,
        emitHex: false,
        emitD8m: false,
      });
      expect(insensitive.diagnostics).toEqual([]);
      const bin = insensitive.artifacts.find((artifact) => artifact.kind === 'bin');
      expect(bin?.kind === 'bin' ? Array.from(bin.bytes) : []).toEqual([0xc9, 0xcd, 0x00, 0x40]);
    });
  });

  it('keeps textual includes inside the importing source ownership unit', async () => {
    await withTempDir('azm-next-tooling-import-include-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'keyboard.asm');
      const fragment = join(dir, 'keyboard-private.inc');
      await writeFile(entry, '.import "keyboard.asm"\nmain:\n  call ReadKey\n', 'utf8');
      await writeFile(module, '@ReadKey:\n.include "keyboard-private.inc"\n  ret\n', 'utf8');
      await writeFile(fragment, 'ScanMatrix:\n  xor a\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.diagnostics).toEqual([]);
      const labels = (result.loadedProgram?.program.files[0]?.items ?? [])
        .filter((item) => item.kind === 'label')
        .map((item) => ({
          name: item.name,
          sourceName: item.span.sourceName,
          sourceUnit: item.span.sourceUnit,
          sourceRelation: item.span.sourceRelation,
        }));
      expect(labels).toEqual([
        {
          name: 'ReadKey',
          sourceName: module,
          sourceUnit: module,
          sourceRelation: 'import',
        },
        {
          name: 'ScanMatrix',
          sourceName: fragment,
          sourceUnit: module,
          sourceRelation: 'include',
        },
        {
          name: 'main',
          sourceName: entry,
          sourceUnit: entry,
          sourceRelation: 'entry',
        },
      ]);
    });
  });

  it('keeps included private labels private when the including unit is imported', async () => {
    await withTempDir('azm-next-tooling-import-include-private-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'keyboard.asm');
      const fragment = join(dir, 'keyboard-private.inc');
      await writeFile(entry, '.import "keyboard.asm"\nmain:\n  call ScanMatrix\n', 'utf8');
      await writeFile(module, '.include "keyboard-private.inc"\n@ReadKey:\n  ret\n', 'utf8');
      await writeFile(fragment, 'ScanMatrix:\n  xor a\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "ScanMatrix" is private to ${fragment}; export it with @ScanMatrix or keep the reference inside that file`,
          sourceName: entry,
          line: 3,
          column: 3,
        },
      ]);
    });
  });

  it('reports missing imports with import-specific source diagnostics', async () => {
    await withTempDir('azm-next-tooling-missing-import-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, '.import "missing.asm"\nmain:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.loadedProgram).toBeUndefined();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          code: 'AZMN_SOURCE',
          message: expect.stringContaining('Failed to resolve import "missing.asm"'),
          sourceName: entry,
          line: 1,
          column: 1,
        }),
      ]);
    });
  });

  it('resolves imports through include directories and supports nested imports', async () => {
    await withTempDir('azm-next-tooling-import-search-', async (dir) => {
      const includes = join(dir, 'includes');
      const entry = join(dir, 'main.asm');
      const module = join(includes, 'keyboard.asm');
      const nested = join(includes, 'matrix.asm');
      await mkdir(includes);
      await writeFile(entry, '.org $5000\n.import "keyboard.asm"\nmain:\n  call ReadKey\n', 'utf8');
      await writeFile(
        module,
        '.import "matrix.asm"\n@ReadKey:\n  call ScanMatrix\n  ret\n',
        'utf8',
      );
      await writeFile(nested, '@ScanMatrix:\n  xor a\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry, includeDirs: [includes] });

      expect(result.diagnostics).toEqual([]);
      const labels = (result.loadedProgram?.program.files[0]?.items ?? [])
        .filter((item) => item.kind === 'label')
        .map((item) => ({
          name: item.name,
          sourceName: item.span.sourceName,
          sourceUnit: item.span.sourceUnit,
          sourceRelation: item.span.sourceRelation,
        }));
      expect(labels).toEqual([
        {
          name: 'ScanMatrix',
          sourceName: nested,
          sourceUnit: nested,
          sourceRelation: 'import',
        },
        {
          name: 'ReadKey',
          sourceName: module,
          sourceUnit: module,
          sourceRelation: 'import',
        },
        {
          name: 'main',
          sourceName: entry,
          sourceUnit: entry,
          sourceRelation: 'entry',
        },
      ]);
      expect(analyzeProgramNext(result.loadedProgram!).env.symbols).toMatchObject({
        ScanMatrix: 0x5000,
        ReadKey: 0x5002,
        main: 0x5006,
      });
    });
  });

  it('loads repeated direct imports only once', async () => {
    await withTempDir('azm-next-tooling-import-repeat-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'keyboard.asm');
      await writeFile(
        entry,
        '.org $6000\n.import "keyboard.asm"\n.import "keyboard.asm"\nmain:\n  call ReadKey\n',
        'utf8',
      );
      await writeFile(module, '@ReadKey:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.diagnostics).toEqual([]);
      const labels = (result.loadedProgram?.program.files[0]?.items ?? []).filter(
        (item) => item.kind === 'label',
      );
      expect(labels.map((item) => item.name)).toEqual(['ReadKey', 'main']);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ ReadKey: 0x6000, main: 0x6001 });
    });
  });

  it('loads diamond imports only once while keeping public exports available', async () => {
    await withTempDir('azm-next-tooling-import-diamond-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const left = join(dir, 'left.asm');
      const right = join(dir, 'right.asm');
      const shared = join(dir, 'shared.asm');
      await writeFile(
        entry,
        [
          '.org $7000',
          '.import "left.asm"',
          '.import "right.asm"',
          'main:',
          '  call Left',
          '  call Right',
          '  call Shared',
          '',
        ].join('\n'),
        'utf8',
      );
      await writeFile(left, '.import "shared.asm"\n@Left:\n  call Shared\n  ret\n', 'utf8');
      await writeFile(right, '.import "shared.asm"\n@Right:\n  call Shared\n  ret\n', 'utf8');
      await writeFile(shared, '@Shared:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.diagnostics).toEqual([]);
      const labels = (result.loadedProgram?.program.files[0]?.items ?? [])
        .filter((item) => item.kind === 'label')
        .map((item) => item.name);
      expect(labels).toEqual(['Shared', 'Left', 'Right', 'main']);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({
        Shared: 0x7000,
        Left: 0x7001,
        Right: 0x7005,
        main: 0x7009,
      });
    });
  });

  it('keeps repeated includes textual and repeatable', async () => {
    await withTempDir('azm-next-tooling-include-repeat-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const fragment = join(dir, 'fragment.inc');
      await writeFile(
        entry,
        '.include "fragment.inc"\n.include "fragment.inc"\nmain:\n  ret\n',
        'utf8',
      );
      await writeFile(fragment, '.db $2a\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.diagnostics).toEqual([]);
      const items = result.loadedProgram?.program.files[0]?.items ?? [];
      expect(items.map((item) => item.kind)).toEqual(['db', 'db', 'label', 'instruction']);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ main: 2 });
    });
  });

  it('treats include and import as distinct composition modes for the same file', async () => {
    await withTempDir('azm-next-tooling-include-import-mixed-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const shared = join(dir, 'shared.asm');
      await writeFile(entry, '.include "shared.asm"\n.import "shared.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(shared, '.db $2a\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.diagnostics).toEqual([]);
      const items = result.loadedProgram?.program.files[0]?.items ?? [];
      expect(items.map((item) => item.kind)).toEqual(['db', 'db', 'label', 'instruction']);
      expect(
        items
          .filter((item) => item.kind === 'db')
          .map((item) => ({
            sourceUnit: item.span.sourceUnit,
            sourceRelation: item.span.sourceRelation,
          })),
      ).toEqual([
        { sourceUnit: entry, sourceRelation: 'include' },
        { sourceUnit: shared, sourceRelation: 'import' },
      ]);
    });
  });

  it('reports recursive imports before parsing', async () => {
    await withTempDir('azm-next-tooling-recursive-import-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(module, '.import "main.asm"\n@Module:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.loadedProgram).toBeUndefined();
      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SOURCE',
          message: `recursive import: ${entry}`,
          sourceName: entry,
        },
      ]);
    });
  });

  it('allows external references to imported public @ labels', async () => {
    await withTempDir('azm-next-tooling-import-public-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'keyboard.asm');
      await writeFile(entry, '.org $6000\n.import "keyboard.asm"\nmain:\n  call ReadKey\n', 'utf8');
      await writeFile(module, '@ReadKey:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ ReadKey: 0x6000, main: 0x6001 });
    });
  });

  it('rejects external references to imported private labels with a visibility diagnostic', async () => {
    await withTempDir('azm-next-tooling-import-private-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'keyboard.asm');
      await writeFile(
        entry,
        '.org $6000\n.import "keyboard.asm"\nmain:\n  call ScanMatrix\n',
        'utf8',
      );
      await writeFile(module, 'ScanMatrix:\n  ret\n@ReadKey:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "ScanMatrix" is private to ${module}; export it with @ScanMatrix or keep the reference inside that file`,
          sourceName: entry,
          line: 4,
          column: 3,
        },
      ]);
    });
  });

  it('rejects external jp/fixup references to imported private labels', async () => {
    await withTempDir('azm-next-tooling-import-private-jp-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'flow.asm');
      await writeFile(entry, '.org $6200\n.import "flow.asm"\nmain:\n  jp PrivateTarget\n', 'utf8');
      await writeFile(module, 'PrivateTarget:\n  ret\n@PublicTarget:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "PrivateTarget" is private to ${module}; export it with @PrivateTarget or keep the reference inside that file`,
          sourceName: entry,
          line: 4,
          column: 3,
        },
      ]);
    });
  });

  it('allows imported files to reference their own private labels', async () => {
    await withTempDir('azm-next-tooling-import-private-internal-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'keyboard.asm');
      await writeFile(entry, '.import "keyboard.asm"\nmain:\n  call ReadKey\n', 'utf8');
      await writeFile(module, '@ReadKey:\n  call ScanMatrix\nScanMatrix:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({
        ReadKey: 0,
        ScanMatrix: 3,
        main: 4,
      });
    });
  });

  it('allows duplicate imported private labels in different source units', async () => {
    await withTempDir('azm-next-tooling-import-private-duplicate-units-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const first = join(dir, 'first.asm');
      const second = join(dir, 'second.asm');
      await writeFile(entry, '.import "first.asm"\n.import "second.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(first, '@First:\n  call Hidden\n  ret\nHidden:\n  ret\n', 'utf8');
      await writeFile(second, '@Second:\n  call Hidden\n  ret\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([]);
      expect(Array.from(assembly.bytes)).toEqual([
        0xcd, 0x04, 0x00, 0xc9, 0xc9, 0xcd, 0x09, 0x00, 0xc9, 0xc9, 0xc9,
      ]);
    });
  });

  it('resolves external references to public exports when another import has the same private label', async () => {
    await withTempDir('azm-next-tooling-import-public-private-order-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const privateModule = join(dir, 'private.asm');
      const publicModule = join(dir, 'public.asm');
      await writeFile(
        entry,
        '.import "private.asm"\n.import "public.asm"\nmain:\n  call Hidden\n',
        'utf8',
      );
      await writeFile(privateModule, '@Private:\nHidden:\n  ret\n', 'utf8');
      await writeFile(publicModule, '@Hidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([]);
      expect(Array.from(assembly.bytes)).toEqual([0xc9, 0xc9, 0xcd, 0x01, 0x00]);
    });
  });

  it('resolves external references to public exports before later same-name private imports', async () => {
    await withTempDir('azm-next-tooling-import-public-private-reverse-order-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const publicModule = join(dir, 'public.asm');
      const privateModule = join(dir, 'private.asm');
      await writeFile(
        entry,
        '.import "public.asm"\n.import "private.asm"\nmain:\n  call Hidden\n',
        'utf8',
      );
      await writeFile(publicModule, '@Hidden:\n  ret\n', 'utf8');
      await writeFile(privateModule, '@Private:\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([]);
      expect(Array.from(assembly.bytes)).toEqual([0xc9, 0xc9, 0xcd, 0x00, 0x00]);
    });
  });

  it('does not resolve a case-distinct public export over an exact private declaration', async () => {
    await withTempDir('azm-next-tooling-import-public-private-case-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const privateModule = join(dir, 'private.asm');
      const publicModule = join(dir, 'public.asm');
      await writeFile(
        entry,
        '.import "private.asm"\n.import "public.asm"\nmain:\n  call Hidden\n',
        'utf8',
      );
      await writeFile(privateModule, '@Private:\nHidden:\n  ret\n', 'utf8');
      await writeFile(publicModule, '@hidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([
        expect.objectContaining({ message: expect.stringMatching(/Hidden.*private/) }),
      ]);
    });
  });

  it('requires exact case for same-unit imported private label references', async () => {
    await withTempDir('azm-next-tooling-import-private-internal-case-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(module, '@Public:\n  call hidden\n  ret\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([
        expect.objectContaining({ message: expect.stringContaining('hidden') }),
      ]);
    });
  });

  it('keeps exact same-unit public labels ahead of private case-insensitive fallback', async () => {
    await withTempDir('azm-next-tooling-import-public-exact-before-private-case-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(
        module,
        '@hidden:\n  ret\n@Caller:\n  call hidden\n  ret\nHidden:\n  ret\n',
        'utf8',
      );

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([]);
      expect(Array.from(assembly.bytes)).toEqual([0xc9, 0xcd, 0x00, 0x00, 0xc9, 0xc9, 0xc9]);
    });
  });

  it('does not use non-exact public or private label fallbacks', async () => {
    await withTempDir('azm-next-tooling-import-public-lower-before-private-case-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(
        module,
        '@hidden:\n  ret\n@Caller:\n  call HIDDEN\n  ret\nHidden:\n  ret\n',
        'utf8',
      );

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([
        expect.objectContaining({ message: expect.stringContaining('HIDDEN') }),
      ]);
    });
  });

  it('keeps exact same-unit equates ahead of private case-insensitive fallback', async () => {
    await withTempDir('azm-next-tooling-import-equate-exact-before-private-case-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(module, 'hidden .equ 1\n@Caller:\n  jp hidden\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([]);
      expect(Array.from(assembly.bytes)).toEqual([0xc3, 0x01, 0x00, 0xc9, 0xc9]);
    });
  });

  it('does not resolve a case-distinct equate over an exact private label', async () => {
    await withTempDir('azm-next-tooling-import-private-equate-case-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nhidden .equ 1\nmain:\n  jp Hidden\n', 'utf8');
      await writeFile(module, '@Public:\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([
        expect.objectContaining({ message: expect.stringMatching(/Hidden.*private/) }),
      ]);
    });
  });

  it('retains case-distinct private declarations in D8 with source visibility', async () => {
    await withTempDir('azm-next-tooling-import-private-case-symbol-leak-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const publicModule = join(dir, 'public.asm');
      const privateModule = join(dir, 'private.asm');
      await writeFile(entry, '.import "public.asm"\n.import "private.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(publicModule, '@hidden:\n  ret\n', 'utf8');
      await writeFile(privateModule, '@Private:\nHidden:\n  ret\n', 'utf8');

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(loaded.diagnostics).toEqual([]);
      const assembly = assembleProgram(loaded.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([]);
      expect(assembly.symbols).toMatchObject({ hidden: 0 });
      expect(assembly.symbols.Hidden).toBeUndefined();

      const result = await compile(entry, { sourceRoot: dir }, { formats: defaultFormatWriters });
      expect(result.diagnostics).toEqual([]);
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
      expect(d8m?.kind).toBe('d8m');
      if (d8m?.kind !== 'd8m') return;
      expect(d8m.json.symbols).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'label', name: 'hidden', file: 'public.asm' }),
        ]),
      );
      expect(d8m.json.symbols).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'label',
            name: 'Hidden',
            file: 'private.asm',
            visibility: 'source',
            identity: expect.any(String),
          }),
        ]),
      );
    });
  });

  it('keeps D8 symbol provenance on the public export when a later private label has the same name', async () => {
    await withTempDir('azm-next-tooling-import-private-d8-public-provenance-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const publicModule = join(dir, 'public.asm');
      const privateModule = join(dir, 'private.asm');
      await writeFile(entry, '.import "public.asm"\n.import "private.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(publicModule, '@Hidden:\n  ret\n', 'utf8');
      await writeFile(privateModule, '@Private:\nHidden:\n  ret\n', 'utf8');

      const result = await compile(entry, { sourceRoot: dir }, { formats: defaultFormatWriters });

      expect(result.diagnostics).toEqual([]);
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
      expect(d8m?.kind).toBe('d8m');
      if (d8m?.kind !== 'd8m') return;
      expect(d8m.json.symbols).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'label',
            name: 'Hidden',
            address: 0,
            file: 'public.asm',
            visibility: 'exported',
          }),
          expect.objectContaining({
            kind: 'label',
            name: 'private.asm::Hidden',
            address: 1,
            file: 'private.asm',
            visibility: 'source',
          }),
        ]),
      );
    });
  });

  it('emits colliding imported private labels with stable public identities', async () => {
    await withTempDir('azm-next-tooling-import-private-symbol-leak-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, '.import "first.asm"\n.import "second.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(join(dir, 'first.asm'), '@First:\n  call Hidden\nHidden:\n  ret\n', 'utf8');
      await writeFile(join(dir, 'second.asm'), '@Second:\n  call Hidden\nHidden:\n  ret\n', 'utf8');

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(loaded.diagnostics).toEqual([]);
      const assembly = assembleProgram(loaded.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([]);
      expect(Object.keys(assembly.symbols).some((name) => name.includes('azm-private'))).toBe(
        false,
      );

      const result = await compile(entry, { sourceRoot: dir }, { formats: defaultFormatWriters });

      expect(result.diagnostics).toEqual([]);
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
      expect(JSON.stringify(d8m)).not.toContain('azm-private');
      if (d8m?.kind !== 'd8m') return;
      expect(d8m.json.symbols).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'first.asm::Hidden', visibility: 'source' }),
          expect.objectContaining({ name: 'second.asm::Hidden', visibility: 'source' }),
        ]),
      );
    });
  });

  it('keeps owner-local D8 identities distinct across textual includes', async () => {
    await withTempDir('azm-next-tooling-include-local-identities-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        ['.org $4000', '.include "a.asm"', '.include "b.asm"', '.end', ''].join('\n'),
      );
      await writeFile(join(dir, 'a.asm'), ['OwnerA:', '_loop:', '    nop', ''].join('\n'));
      await writeFile(join(dir, 'b.asm'), ['OwnerB:', '_loop:', '    ret', ''].join('\n'));

      const result = await compile(entry, { sourceRoot: dir }, { formats: defaultFormatWriters });
      expect(result.diagnostics).toEqual([]);
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
      if (d8m?.kind !== 'd8m') throw new Error('missing D8 artifact');
      const locals = d8m.json.symbols.filter((symbol) => symbol.visibility === 'local');
      expect(locals.map((symbol) => symbol.name)).toEqual(['OwnerA._loop', 'OwnerB._loop']);
      expect(new Set(locals.map((symbol) => symbol.identity)).size).toBe(2);
      expect(locals.map((symbol) => symbol.identity)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('a.asm:2:1:label:OwnerA._loop'),
          expect.stringContaining('b.asm:2:1:label:OwnerB._loop'),
        ]),
      );
    });
  });

  it('qualifies imported private labels used as .ds sizes and fills inside the same unit', async () => {
    await withTempDir('azm-next-tooling-import-private-ds-label-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(module, '@Public:\n  nop\nHidden:\n  .ds Hidden, Hidden\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const assembly = assembleProgram(result.loadedProgram!.program.files[0].items);
      expect(assembly.diagnostics).toEqual([]);
      expect(Array.from(assembly.bytes)).toEqual([0x00, 0x01, 0xc9]);
    });
  });

  it('rejects duplicate private labels inside the same imported source unit', async () => {
    await withTempDir('azm-next-tooling-import-private-duplicate-same-unit-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(module, '@Public:\nHidden:\n  ret\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: 'duplicate symbol: Hidden',
          sourceName: module,
          line: 4,
          column: 1,
        },
      ]);
    });
  });

  it('rejects public and private labels with the same name inside one imported source unit', async () => {
    await withTempDir('azm-next-tooling-import-public-private-duplicate-unit-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  ret\n', 'utf8');
      await writeFile(module, '@Hidden:\n  ret\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: 'duplicate symbol: Hidden',
          sourceName: module,
          line: 3,
          column: 1,
        },
      ]);
    });
  });

  it('keeps case-distinct imported private labels visible only inside their own units', async () => {
    await withTempDir('azm-next-tooling-import-private-case-distinct-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const first = join(dir, 'first.asm');
      const second = join(dir, 'second.asm');
      await writeFile(
        entry,
        '.import "first.asm"\n.import "second.asm"\nmain:\n  jp Hidden\n',
        'utf8',
      );
      await writeFile(first, 'Hidden:\n  ret\n@First:\n  ret\n', 'utf8');
      await writeFile(second, 'hidden:\n  ret\n@Second:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "Hidden" is private to ${first}; export it with @Hidden or keep the reference inside that file`,
          sourceName: entry,
          line: 4,
          column: 3,
        },
      ]);
    });
  });

  it('allows entry equates to share names with imported private labels', async () => {
    await withTempDir('azm-next-tooling-import-private-equ-collision-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nHidden .equ 1\nmain:\n  jp Hidden\n', 'utf8');
      await writeFile(module, '@Public:\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ Hidden: 1 });
    });
  });

  it('reports private visibility diagnostics when a type name shares an imported private label name', async () => {
    await withTempDir('azm-next-tooling-import-private-type-collision-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(
        entry,
        '.import "module.asm"\nhidden .type\n.endtype\nmain:\n  jp Hidden\n',
        'utf8',
      );
      await writeFile(module, 'Hidden:\n  ret\n@Public:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "Hidden" is private to ${module}; export it with @Hidden or keep the reference inside that file`,
          sourceName: entry,
          line: 5,
          column: 3,
        },
      ]);
    });
  });

  it('reports private visibility diagnostics when an enum name shares an imported private label name', async () => {
    await withTempDir('azm-next-tooling-import-private-enum-collision-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(
        entry,
        '.import "module.asm"\nhidden .enum Value\nmain:\n  jp Hidden\n',
        'utf8',
      );
      await writeFile(module, 'Hidden:\n  ret\n@Public:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "Hidden" is private to ${module}; export it with @Hidden or keep the reference inside that file`,
          sourceName: entry,
          line: 4,
          column: 3,
        },
      ]);
    });
  });

  it('allows entry enum members to share names with imported private labels', async () => {
    await withTempDir('azm-next-tooling-import-private-enum-member-collision-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(
        entry,
        '.import "module.asm"\nHidden .enum target\nmain:\n  jp Hidden.target\n',
        'utf8',
      );
      await writeFile(module, '@Public:\nHidden.target:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ 'Hidden.target': 0 });
    });
  });

  it('allows case-distinct entry enum members alongside imported private labels', async () => {
    await withTempDir(
      'azm-next-tooling-import-private-enum-member-case-collision-',
      async (dir) => {
        const entry = join(dir, 'main.asm');
        const module = join(dir, 'module.asm');
        await writeFile(
          entry,
          '.import "module.asm"\nHidden .enum Target\nmain:\n  jp Hidden.Target\n',
          'utf8',
        );
        await writeFile(module, '@Public:\nhidden.target:\n  ret\n', 'utf8');

        const result = await loadProgramNext({ entryFile: entry });
        expect(result.diagnostics).toEqual([]);

        const analysis = analyzeProgramNext(result.loadedProgram!);
        expect(analysis.diagnostics).toEqual([]);
        expect(analysis.env.symbols).toMatchObject({ 'Hidden.Target': 0 });
      },
    );
  });

  it('does not resolve case-distinct enum members over exact private labels', async () => {
    await withTempDir('azm-next-tooling-import-private-enum-member-case-visible-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const enumModule = join(dir, 'enum.asm');
      const labelModule = join(dir, 'labels.asm');
      await writeFile(
        entry,
        '.import "enum.asm"\n.import "labels.asm"\nmain:\n  jp hidden.target\n',
        'utf8',
      );
      await writeFile(enumModule, '@Hidden .enum Target\n', 'utf8');
      await writeFile(labelModule, '@Public:\nhidden.target:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({ message: expect.stringMatching(/hidden\.target.*private/) }),
      ]);
    });
  });

  it('rejects imported private labels used as bare .ds sizes', async () => {
    await withTempDir('azm-next-tooling-import-private-ds-size-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  .ds Hidden\n', 'utf8');
      await writeFile(module, 'Hidden:\n  ret\n@Public:\n  nop\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "Hidden" is private to ${module}; export it with @Hidden or keep the reference inside that file`,
          sourceName: entry,
          line: 3,
          column: 3,
        },
      ]);
    });
  });

  it('leaves imported private labels in array type-size expressions to type diagnostics', async () => {
    await withTempDir('azm-next-tooling-import-private-ds-array-type-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  .ds Hidden[2]\n', 'utf8');
      await writeFile(module, '@Public:\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: 'unknown type: Hidden',
          sourceName: entry,
          line: 3,
          column: 3,
        },
      ]);
    });
  });

  it('rejects private labels from include-only imported wrappers', async () => {
    await withTempDir('azm-next-tooling-import-include-only-wrapper-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const wrapper = join(dir, 'wrapper.asm');
      const fragment = join(dir, 'frag.inc');
      await writeFile(entry, '.import "wrapper.asm"\nmain:\n  call Hidden\n', 'utf8');
      await writeFile(wrapper, '.include "frag.inc"\n', 'utf8');
      await writeFile(fragment, 'Hidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "Hidden" is private to ${fragment}; export it with @Hidden or keep the reference inside that file`,
          sourceName: entry,
          line: 3,
          column: 3,
        },
      ]);
    });
  });

  it('keeps include-only entry files public to imported modules', async () => {
    await withTempDir('azm-next-tooling-entry-include-only-public-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const entryLabels = join(dir, 'entry-labels.inc');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.include "entry-labels.inc"\n.import "module.asm"\n', 'utf8');
      await writeFile(entryLabels, 'EntryLabel:\n  ret\n', 'utf8');
      await writeFile(module, '@UseEntry:\n  call EntryLabel\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({
        EntryLabel: 0,
        UseEntry: 1,
      });
    });
  });

  it('prefers exact equate references over case-insensitive imported private labels', async () => {
    await withTempDir('azm-next-tooling-import-private-equ-case-reference-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(
        entry,
        '.import "module.asm"\nhidden .equ 4660\nmain:\n  jp hidden\n',
        'utf8',
      );
      await writeFile(module, '@Public:\nHidden:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({
        hidden: 4660,
      });
    });
  });

  it('allows op-generated same-unit references to imported private labels', async () => {
    await withTempDir('azm-next-tooling-import-private-op-generated-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(entry, '.import "module.asm"\nmain:\n  call Public\n', 'utf8');
      await writeFile(
        module,
        [
          'op JumpTo(t imm16)',
          '  call t',
          'end',
          '@Public:',
          '  JumpTo Hidden',
          '  ret',
          'Hidden:',
          '  ret',
          '',
        ].join('\n'),
        'utf8',
      );

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
    });
  });

  it('rejects imported private label references from data and equate expressions', async () => {
    await withTempDir('azm-next-tooling-import-private-data-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'module.asm');
      await writeFile(
        entry,
        '.import "module.asm"\nVALUE .equ Hidden\nmain:\n  .dw Hidden\n',
        'utf8',
      );
      await writeFile(module, 'Hidden:\n  ret\n@Public:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "Hidden" is private to ${module}; export it with @Hidden or keep the reference inside that file`,
          sourceName: entry,
          line: 2,
          column: 1,
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: `symbol "Hidden" is private to ${module}; export it with @Hidden or keep the reference inside that file`,
          sourceName: entry,
          line: 4,
          column: 3,
        }),
      ]);
    });
  });

  it('keeps flat non-imported programs unchanged', async () => {
    await withTempDir('azm-next-tooling-flat-symbols-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, '.org $7000\nmain:\n  call helper\nhelper:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });
      expect(result.diagnostics).toEqual([]);

      const analysis = analyzeProgramNext(result.loadedProgram!);
      expect(analysis.diagnostics).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({ main: 0x7000, helper: 0x7003 });
    });
  });

  it('reports included-file parse diagnostics at the included file location', async () => {
    await withTempDir('azm-next-tooling-include-error-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const child = join(dir, 'bad.inc');
      await writeFile(entry, '.include "bad.inc"\nmain:\n  ret\n', 'utf8');
      await writeFile(child, '???\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.loadedProgram).toBeDefined();
      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_PARSE',
          message: 'unsupported source line: ???',
          sourceName: child,
          line: 1,
          column: 1,
        },
      ]);
    });
  });

  it('rejects unsupported entry extensions through the programming API', async () => {
    await withTempDir('azm-next-tooling-extension-', async (dir) => {
      const entry = join(dir, 'main.txt');
      await writeFile(entry, 'main:\n  ret\n', 'utf8');

      const result = await loadProgramNext({ entryFile: entry });

      expect(result.loadedProgram).toBeUndefined();
      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SOURCE',
          message: 'unsupported source file extension (expected .asm or .z80)',
          sourceName: entry,
        },
      ]);
    });
  });

  it('emits case-style warnings from tooling analysis', async () => {
    await withTempDir('azm-next-tooling-case-style-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, ['main:', '  ld a, 1', '  ret', ''].join('\n'), 'utf8');

      const loaded = await loadProgram({ entryFile: entry });
      expect(loaded.diagnostics).toEqual([]);
      expect(loaded.loadedProgram).toBeDefined();

      const analysis = analyzeProgram(loaded.loadedProgram!, { caseStyle: 'upper' });
      expect(analysis.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: mnemonic "ld" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: register "a" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: mnemonic "ret" should be uppercase under --case-style=upper.',
        }),
      ]);
    });
  });
});
