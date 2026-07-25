/**
 * @file AZM public API contract tests for Debug80 integration.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

function withTempDir<T>(prefix: string, run: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return run(tmpDir).finally(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
}

describe('azm compile contract', () => {
  it('emits the native D8 artifact set expected by Debug80', async () => {
    await withTempDir('debug80-azm-contract-', async (tmpDir) => {
      const asmPath = path.join(tmpDir, 'main.z80');
      const hexPath = path.join(tmpDir, 'main.hex');
      const binPath = path.join(tmpDir, 'main.bin');

      fs.writeFileSync(asmPath, 'ORG 4000h\nMAIN: NOP\n');

      const result = await compile(
        asmPath,
        {
          outputType: 'hex',
          sourceRoot: tmpDir,
          emitBin: true,
          emitHex: true,
          emitD8m: true,
          d8mInputs: {
            hex: hexPath,
            bin: binPath,
          },
        },
        { formats: defaultFormatWriters }
      );

      expect(result.diagnostics).toEqual([]);
      expect(result.artifacts.map((artifact) => artifact.kind).sort()).toEqual([
        'bin',
        'd8m',
        'hex',
      ]);
    });
  });

  // The Contract Updates panel control depends on AZM returning revised source
  // rather than writing it. If that ever becomes a disk write or changes shape,
  // this fails rather than the feature silently doing nothing.
  it('returns revised source for register contract updates without writing it', async () => {
    await withTempDir('debug80-azm-annotations-', async (tmpDir) => {
      const asmPath = path.join(tmpDir, 'main.z80');
      const original = [
        '        ORG 4000h',
        '.routine',
        'Main:',
        '        ld a, 1',
        '        call Helper',
        '        ret',
        '.routine',
        'Helper:',
        '        ld d, 2',
        '        ret',
        '',
      ].join('\n');
      fs.writeFileSync(asmPath, original);

      const result = await compile(
        asmPath,
        {
          outputType: 'hex',
          registerContracts: 'audit',
          emitRegisterAnnotations: true,
          fixRegisterContracts: true,
          skipAssembly: true,
        },
        { formats: defaultFormatWriters }
      );

      const annotations = result.artifacts.find(
        (artifact) => artifact.kind === 'register-contracts-annotations'
      ) as { files: { path: string; text: string }[] } | undefined;

      expect(annotations).toBeDefined();
      expect(annotations?.files.length).toBeGreaterThan(0);

      const revised = annotations?.files[0];
      expect(revised?.path).toBe(asmPath);
      // Every bare directive is replaced by an inferred one.
      expect(revised?.text).not.toMatch(/^\.routine\s*$/m);
      expect(revised?.text).toContain('clobbers');
      expect(revised?.text).not.toBe(original);

      // AZM must not have touched the file itself.
      expect(fs.readFileSync(asmPath, 'utf8')).toBe(original);
    });
  });
});
