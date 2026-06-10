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
});
