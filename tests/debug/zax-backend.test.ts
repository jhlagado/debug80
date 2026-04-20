/**
 * @file ZAX backend tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ZaxBackend } from '../../src/debug/launch/zax-backend';

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
    delete process.env.DEBUG80_ZAX_CLI;
    delete process.env.DEBUG80_ZAX_ROOT;
  });

  it('uses DEBUG80_ZAX_CLI when set to an existing cli.js', () => {
    const fakeCli = path.join(tmpDir, 'cli.js');
    fs.writeFileSync(fakeCli, '// zax cli stub');
    process.env.DEBUG80_ZAX_CLI = fakeCli;

    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    fs.writeFileSync(asmPath, 'export func main() nop end\n');
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(listingPath, 'LISTING\n');
    spawnSync.mockReturnValue({ status: 0, stdout: `${hexPath}\n`, stderr: '' });

    const result = backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(true);
    const calls = spawnSync.mock.calls as Array<[string, string[], cp.SpawnSyncOptions]>;
    expect(calls[0]?.[1]?.[0]).toBe(fakeCli);
  });

  it('uses DEBUG80_ZAX_ROOT when dist/src/cli.js exists', () => {
    const root = path.join(tmpDir, 'ZAX');
    const cliPath = path.join(root, 'dist', 'src', 'cli.js');
    fs.mkdirSync(path.dirname(cliPath), { recursive: true });
    fs.writeFileSync(cliPath, '// zax cli');
    process.env.DEBUG80_ZAX_ROOT = root;

    const backend = new ZaxBackend();
    const asmPath = path.join(tmpDir, 'prog.zax');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    fs.writeFileSync(asmPath, 'export func main() nop end\n');
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(listingPath, 'LISTING\n');
    spawnSync.mockReturnValue({ status: 0, stdout: `${hexPath}\n`, stderr: '' });

    const result = backend.assemble({ asmPath, hexPath, listingPath });

    expect(result.success).toBe(true);
    const calls = spawnSync.mock.calls as Array<[string, string[], cp.SpawnSyncOptions]>;
    expect(calls[0]?.[1]?.[0]).toBe(cliPath);
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
    const calls = spawnSync.mock.calls as Array<[string, string[], cp.SpawnSyncOptions]>;
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    const [command, args, spawnOptions] = firstCall;
    expect(command).toBe(process.execPath);
    expect(args).toContain('--nobin');
    expect(args).toContain('--asm80');
    expect(args).toContain('-o');
    expect(args).toContain(path.join('build', 'prog.hex').replace(/\\/g, '/'));
    expect(args).toContain(path.basename(asmPath));
    expect(spawnOptions).toMatchObject({
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