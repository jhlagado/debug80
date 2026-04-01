/**
 * @file ZAX backend tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ZaxBackend } from '../../src/debug/zax-backend';

const spawnSync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawnSync,
}));

describe('zax-backend', () => {
  let tmpDir: string;

  beforeEach(() => {
    spawnSync.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-zax-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assembles successfully and copies listings when needed', () => {
    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const outDir = path.join(tmpDir, 'build');
    const hexPath = path.join(outDir, 'prog.hex');
    const listingPath = path.join(outDir, 'listings', 'prog.lst');
    const producedListing = path.join(outDir, 'prog.lst');

    fs.writeFileSync(asmPath, 'main { nop; }\n');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(producedListing, 'LISTING\n');
    spawnSync.mockReturnValue({ status: 0, stdout: `${hexPath}\n`, stderr: '' });

    const result = backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(true);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync.mock.calls[0]?.[0]).toBe(process.execPath);
    expect(spawnSync.mock.calls[0]?.[1]).toContain('--nobin');
    expect(spawnSync.mock.calls[0]?.[1]).toContain('-o');
    expect(spawnSync.mock.calls[0]?.[1]).toContain(path.join('build', 'prog.hex').replace(/\\/g, '/'));
    expect(spawnSync.mock.calls[0]?.[1]).toContain(path.basename(asmPath));
    expect(spawnSync.mock.calls[0]?.[2]).toMatchObject({
      cwd: path.dirname(asmPath),
      encoding: 'utf-8',
    });
    expect(fs.readFileSync(listingPath, 'utf-8')).toBe('LISTING\n');
  });

  it('returns compile errors from the CLI', () => {
    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    fs.writeFileSync(asmPath, 'bad\n');
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'prog.zax:1:1: error: bad\n' });

    const result = backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('zax exited with code 1');
    expect(result.error).toContain('error: bad');
  });

  it('returns CLI errors from the CLI', () => {
    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    fs.writeFileSync(asmPath, 'bad\n');
    spawnSync.mockReturnValue({ status: 2, stdout: '', stderr: 'zax: Unknown option\n' });

    const result = backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('zax exited with code 2');
  });

  it('returns a helpful error when zax cannot start', () => {
    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    fs.writeFileSync(asmPath, 'main { nop; }\n');
    spawnSync.mockReturnValue({ error: { code: 'ENOENT', message: 'not found' } });

    const result = backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('zax not found');
  });

  it('fails when zax succeeds but required artifacts are missing', () => {
    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    fs.writeFileSync(asmPath, 'main { nop; }\n');
    spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });

    const result = backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(false);
    expect(result.error).toContain('did not produce HEX output');
  });

  it('does not implement binary or in-process mapping hooks', () => {
    const backend = new ZaxBackend() as Record<string, unknown>;

    expect('assembleBin' in backend).toBe(false);
    expect('compileMappingInProcess' in backend).toBe(false);
  });
});