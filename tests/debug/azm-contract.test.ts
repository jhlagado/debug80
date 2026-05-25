/**
 * @file AZM public API contract tests for Debug80 integration.
 */

import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

describe('azm compile contract', () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir !== undefined) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it('emits native D8 maps instead of legacy listing artifacts', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-azm-contract-'));
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
        emitAsm80: true,
        d8mInputs: {
          hex: hexPath,
          bin: binPath,
        },
      },
      { formats: defaultFormatWriters }
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.artifacts.map((artifact) => artifact.kind).sort()).toEqual([
      'asm80',
      'bin',
      'd8m',
      'hex',
    ]);
    expect(result.artifacts.some((artifact) => artifact.kind === 'lst')).toBe(false);
  });
});
