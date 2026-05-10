/**
 * @file ZAX backend tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ZaxBackend } from '../../src/debug/launch/zax-backend';

const compile = vi.hoisted(() => vi.fn());
const spawnSync = vi.hoisted(() => vi.fn());

vi.mock('@jhlagado/zax/dist/src/compile.js', () => ({
  compile,
}));

vi.mock('@jhlagado/zax/dist/src/formats/index.js', () => ({
  defaultFormatWriters: {
    writeHex: vi.fn(),
    writeD8m: vi.fn(),
    writeListing: vi.fn(),
    writeAsm80: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawnSync,
}));

describe('zax-backend', () => {
  let tmpDir: string;

  beforeEach(() => {
    compile.mockReset();
    spawnSync.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-zax-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assembles through the ZAX library and writes Debug80-controlled artifacts', async () => {
    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const outDir = path.join(tmpDir, 'build');
    const hexPath = path.join(outDir, 'prog.hex');
    const listingPath = path.join(outDir, 'listings', 'prog.lst');

    fs.writeFileSync(asmPath, 'main { nop; }\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [
        { kind: 'hex', text: ':00000001FF\n' },
        { kind: 'lst', text: 'LISTING\n' },
        { kind: 'd8m', json: { format: 'd8-debug-map', version: 1, arch: 'z80' } },
        { kind: 'asm80', text: 'ORG 0100h\nNOP\n' },
      ],
    });

    const result = await backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(true);
    expect(spawnSync).not.toHaveBeenCalled();
    expect(compile).toHaveBeenCalledWith(
      asmPath,
      {
        emitBin: false,
        emitHex: true,
        emitD8m: true,
        emitListing: true,
        emitAsm80: true,
        requireMain: true,
        defaultCodeBase: 0x0100,
      },
      expect.objectContaining({ formats: expect.any(Object) })
    );
    expect(fs.readFileSync(hexPath, 'utf-8')).toBe(':00000001FF\n');
    expect(fs.readFileSync(listingPath, 'utf-8')).toBe('LISTING\n');
    expect(fs.existsSync(path.join(outDir, 'prog.d8.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'listings', 'prog.d8.json'))).toBe(true);
    expect(fs.readFileSync(path.join(outDir, 'prog.z80'), 'utf-8')).toBe('ORG 0100h\nNOP\n');
  });

  it('returns compile diagnostics as Debug80 assembly failures', async () => {
    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');
    const output: string[] = [];

    fs.writeFileSync(asmPath, 'bad\n');
    compile.mockResolvedValue({
      diagnostics: [
        {
          id: 'SemanticsError',
          severity: 'error',
          message: 'Program must define main.',
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
      listingPath,
      onOutput: (message) => output.push(message),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Program must define main.');
    expect(result.diagnostic).toMatchObject({
      path: asmPath,
      line: 1,
      column: 1,
      message: 'Program must define main.',
    });
    expect(output.join('')).toContain('SemanticsError');
  });

  it('fails when ZAX succeeds but required artifacts are missing', async () => {
    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    fs.writeFileSync(asmPath, 'main { nop; }\n');
    compile.mockResolvedValue({
      diagnostics: [],
      artifacts: [{ kind: 'lst', text: 'LISTING\n' }],
    });

    const result = await backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('did not produce HEX output');
  });

  it('does not implement binary or in-process mapping hooks', () => {
    const backend = new ZaxBackend() as Record<string, unknown>;

    expect('assembleBin' in backend).toBe(false);
    expect('compileMappingInProcess' in backend).toBe(false);
  });
});
