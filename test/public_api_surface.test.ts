import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from './helpers/cli/build.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  name: string;
  bin: Record<string, string>;
  exports: Record<string, unknown> & { './cli': Record<string, unknown> };
};

async function runPackageScript(source: string, args: string[] = []): Promise<unknown> {
  const { stdout } = await execFileAsync(
    'node',
    ['--input-type=module', '--eval', source, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  return JSON.parse(stdout.trim()) as unknown;
}

describe('public package API surface', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('exposes tooling load/analyze through the stable subpath with preloaded entry text', async () => {
    const entryFile = resolve(repoRoot, 'test', 'fixtures', 'virtual_public_api_entry.asm');
    const source = `
      import { analyzeProgram, loadProgram } from '@jhlagado/azm/tooling';

      const result = await loadProgram({
        entryFile: process.argv[1],
        preloadedText: 'main:\\n    call helper\\n    ret\\nhelper:\\n    ret\\n',
      });
      const analysis = result.loadedProgram
        ? analyzeProgram(result.loadedProgram)
        : { diagnostics: [] };

      console.log(JSON.stringify({
        loadDiagnostics: result.diagnostics,
        analyzed: Boolean(result.loadedProgram && analysis.env),
        analysisDiagnostics: analysis.diagnostics,
        programKind: result.loadedProgram?.program.kind ?? null,
        fileCount: result.loadedProgram?.program.files.length ?? 0,
      }));
    `;

    const output = (await runPackageScript(source, [entryFile])) as {
      loadDiagnostics: unknown[];
      analyzed: boolean;
      analysisDiagnostics: unknown[];
      programKind: string | null;
      fileCount: number;
    };

    expect(output.loadDiagnostics).toEqual([]);
    expect(output.analysisDiagnostics).toEqual([]);
    expect(output.analyzed).toBe(true);
    expect(output.programKind).toBe('Program');
    expect(output.fileCount).toBe(1);
  });

  it('exposes compile through the stable compile subpath', async () => {
    const entryFile = resolve(repoRoot, 'test', 'fixtures', 'virtual_public_api_compile.asm');
    const source = `
      import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

      const result = await compile(
        process.argv[1],
        { emitListing: false, emitAsm80: false },
        { formats: defaultFormatWriters },
      );

      console.log(JSON.stringify({
        diagnostics: result.diagnostics,
        artifactKinds: result.artifacts.map((artifact) => artifact.kind),
      }));
    `;

    const output = (await runPackageScript(source, [entryFile])) as {
      diagnostics: unknown[];
      artifactKinds: string[];
    };

    expect(output.diagnostics).toEqual([]);
    expect(output.artifactKinds).toEqual(['bin', 'hex', 'd8m']);
  });

  it('re-exports the stable surface from the package root', async () => {
    const entryFile = resolve(repoRoot, 'test', 'fixtures', 'virtual_public_api_root.asm');
    const source = `
      import { DiagnosticIds, analyzeProgram, loadProgram } from '@jhlagado/azm';

      const result = await loadProgram({
        entryFile: process.argv[1],
        preloadedText: 'main:\\n    ret\\n',
      });
      const analysis = result.loadedProgram ? analyzeProgram(result.loadedProgram) : { diagnostics: [] };

      console.log(JSON.stringify({
        hasProgram: Boolean(result.loadedProgram),
        diagnostics: [...result.diagnostics, ...analysis.diagnostics],
        semanticErrorId: DiagnosticIds.SemanticsError,
      }));
    `;

    const output = (await runPackageScript(source, [entryFile])) as {
      hasProgram: boolean;
      diagnostics: unknown[];
      semanticErrorId: string;
    };

    expect(output.hasProgram).toBe(true);
    expect(output.diagnostics).toEqual([]);
    expect(output.semanticErrorId).toBe('AZM400');
  });

  it('publishes only AZM-branded stable package subpaths', () => {
    expect(packageJson.name).toBe('@jhlagado/azm');
    expect(packageJson.bin).toEqual({ azm: 'dist/src/cli.js' });
    expect(Object.keys(packageJson.exports).sort()).toEqual([
      '.',
      './cli',
      './compile',
      './package.json',
      './tooling',
    ]);

    const serializedExports = JSON.stringify(packageJson.exports);
    expect(serializedExports).not.toContain('@jhlagado/zax');
    expect(serializedExports).not.toContain('zax');
    expect(packageJson.exports['./cli']).not.toHaveProperty('require');
  });
});
