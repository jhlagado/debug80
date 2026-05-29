/**
 * @file AZM backend tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AzmBackend } from '../../src/debug/launch/azm-backend';

const compile = vi.hoisted(() => vi.fn());
const childProcess = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('@jhlagado/azm/compile', () => ({
  compile,
  defaultFormatWriters: {
    writeHex: vi.fn(),
    writeBin: vi.fn(),
    writeD8m: vi.fn(),
    writeListing: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  ...childProcess,
}));

describe('azm-backend', () => {
  let tmpDir: string;

  beforeEach(() => {
    compile.mockReset();
    Object.values(childProcess).forEach((mock) => mock.mockReset());
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-azm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assembles through the AZM library and writes Debug80-controlled artifacts', async () => {
    const backend = new AzmBackend();
    const asmPath = path.join(tmpDir, 'prog.asm');
    const outDir = path.join(tmpDir, 'build');
    const hexPath = path.join(outDir, 'prog.hex');
    const binPath = path.join(outDir, 'prog.bin');

    fs.writeFileSync(asmPath, 'ORG 0100h\nSTART: NOP\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [
        { kind: 'hex', text: ':00000001FF\n' },
        { kind: 'bin', bytes: new Uint8Array([0x00]) },
        { kind: 'd8m', json: { format: 'd8-debug-map', version: 1, arch: 'z80' } },
      ],
    });

    const result = await backend.assemble({ asmPath, hexPath, sourceRoot: tmpDir });

    expect(result.success).toBe(true);
    expectNoExternalProcess();
    expect(compile).toHaveBeenCalledWith(
      asmPath,
      {
        outputType: 'hex',
        emitBin: true,
        emitHex: true,
        emitD8m: true,
        sourceRoot: tmpDir,
        d8mInputs: {
          hex: hexPath,
          bin: binPath,
        },
      },
      expect.objectContaining({ formats: expect.any(Object) })
    );
    expect(fs.readFileSync(hexPath, 'utf-8')).toBe(':00000001FF\n');
    expect([...fs.readFileSync(binPath)]).toEqual([0x00]);
    expect(fs.existsSync(path.join(outDir, 'prog.d8.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'prog.lst'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'prog.z80'))).toBe(false);
  });

  it('requires native D8 output instead of legacy listing output', async () => {
    const backend = new AzmBackend();
    const asmPath = path.join(tmpDir, 'prog.z80');
    const outDir = path.join(tmpDir, 'build');
    const hexPath = path.join(outDir, 'prog.hex');

    fs.writeFileSync(asmPath, 'ORG 4000h\nSTART: NOP\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [
        { kind: 'hex', text: ':00000001FF\n' },
        { kind: 'bin', bytes: new Uint8Array([0x00]) },
        { kind: 'd8m', json: { format: 'd8-debug-map', version: 1, arch: 'z80' } },
      ],
    });

    const result = await backend.assemble({ asmPath, hexPath, sourceRoot: tmpDir });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(hexPath, 'utf-8')).toBe(':00000001FF\n');
    expect(fs.existsSync(path.join(outDir, 'prog.d8.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'prog.lst'))).toBe(false);
  });

  it('passes AZM register-care launch options and writes register reports', async () => {
    const backend = new AzmBackend();
    const asmPath = path.join(tmpDir, 'prog.asm');
    const outDir = path.join(tmpDir, 'build');
    const hexPath = path.join(outDir, 'prog.hex');

    fs.writeFileSync(asmPath, 'ORG 4000h\nSTART: NOP\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [
        { kind: 'hex', text: ':00000001FF\n' },
        { kind: 'd8m', json: { format: 'd8-debug-map', version: 1, arch: 'z80' } },
        { kind: 'register-care-report', text: 'Register care report\n' },
      ],
    });

    const result = await backend.assemble({
      asmPath,
      hexPath,
      azm: {
        registerCare: 'audit',
        emitRegisterReport: true,
        registerCareProfile: 'mon3',
      },
    });

    expect(result.success).toBe(true);
    expect(compile).toHaveBeenCalledWith(
      asmPath,
      expect.objectContaining({
        registerCare: 'audit',
        emitRegisterReport: true,
        registerCareProfile: 'mon3',
      }),
      expect.objectContaining({ formats: expect.any(Object) })
    );
    expect(fs.readFileSync(path.join(outDir, 'prog.regcare.txt'), 'utf-8')).toBe(
      'Register care report\n'
    );
  });

  it('uses binFrom and binTo as compact output bounds for binary rebuilds', async () => {
    const backend = new AzmBackend();
    const asmPath = path.join(tmpDir, 'prog.asm');
    const hexPath = path.join(tmpDir, 'build', 'prog.hex');

    fs.writeFileSync(asmPath, 'ORG 4000h\nDB 1,2,3\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [{ kind: 'bin', bytes: new Uint8Array([1, 2, 3]) }],
    });

    const result = await backend.assembleBin({ asmPath, hexPath, binFrom: 0x4000, binTo: 0x4002 });

    expect(result.success).toBe(true);
    expect(compile).toHaveBeenCalledWith(
      asmPath,
      expect.objectContaining({
        outputType: 'bin',
        emitBin: true,
        emitHex: false,
        emitD8m: false,
      }),
      expect.objectContaining({ formats: expect.any(Object) })
    );
    expect([...fs.readFileSync(path.join(tmpDir, 'build', 'prog.bin'))]).toEqual([1, 2, 3]);
  });

  it('returns compile diagnostics as Debug80 assembly failures', async () => {
    const backend = new AzmBackend();
    const asmPath = path.join(tmpDir, 'prog.asm');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const output: string[] = [];

    fs.writeFileSync(asmPath, 'BADOP\n');
    compile.mockResolvedValue({
      diagnostics: [
        {
          id: 'AZM200',
          severity: 'error',
          message: 'Unsupported instruction BADOP.',
          file: asmPath,
          line: 1,
          column: 1,
        },
      ],
      artifacts: [],
    });

    const result = await backend.assemble({
      asmPath,
      hexPath,
      onOutput: (message) => output.push(message),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported instruction BADOP.');
    expect(result.diagnostic).toMatchObject({
      path: asmPath,
      line: 1,
      column: 1,
      message: 'Unsupported instruction BADOP.',
    });
    expect(output.join('')).toContain('AZM200');
  });

  it('handles AZM diagnostics that do not include a source file', async () => {
    const backend = new AzmBackend();
    const asmPath = path.join(tmpDir, 'prog.asm');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const output: string[] = [];

    fs.writeFileSync(asmPath, 'BADOP\n');
    compile.mockResolvedValue({
      diagnostics: [
        {
          code: 'AZMN_CASE_STYLE',
          severity: 'warning',
          message: 'Case style warning without a source location.',
        },
        {
          code: 'AZMN_LOAD',
          severity: 'error',
          message: 'Assembly failed before a source location was available.',
        },
      ],
      artifacts: [],
    });

    const result = await backend.assemble({
      asmPath,
      hexPath,
      onOutput: (message) => output.push(message),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Assembly failed before a source location was available.');
    expect(result.error).not.toContain('localeCompare');
    expect(result.diagnostic).toMatchObject({
      message: 'Assembly failed before a source location was available.',
    });
    expect(result.diagnostic?.path).toBeUndefined();
    expect(output.join('')).toContain('AZMN_LOAD');
  });

  it('fails when AZM succeeds but required artifacts are missing', async () => {
    const backend = new AzmBackend();
    const asmPath = path.join(tmpDir, 'prog.asm');
    const hexPath = path.join(tmpDir, 'prog.hex');

    fs.writeFileSync(asmPath, 'ORG 0100h\nSTART: NOP\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [{ kind: 'd8m', json: { format: 'd8-debug-map', version: 1, arch: 'z80' } }],
    });

    const result = await backend.assemble({ asmPath, hexPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('did not produce HEX output');
  });

  it('fails when AZM succeeds without a native D8 map', async () => {
    const backend = new AzmBackend();
    const asmPath = path.join(tmpDir, 'prog.asm');
    const hexPath = path.join(tmpDir, 'prog.hex');

    fs.writeFileSync(asmPath, 'ORG 0100h\nSTART: NOP\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [{ kind: 'hex', text: ':00000001FF\n' }],
    });

    const result = await backend.assemble({ asmPath, hexPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('did not produce D8 output');
  });
});

function expectNoExternalProcess(): void {
  for (const mock of Object.values(childProcess)) {
    expect(mock).not.toHaveBeenCalled();
  }
}
