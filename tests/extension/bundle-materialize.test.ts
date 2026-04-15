/**
 * @file Tests for bundled ROM materialization.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: path.join(base.fsPath, ...segments),
    }),
  },
}));

import * as vscode from 'vscode';
import {
  BUNDLED_MON3_V1_REL,
  materializeBundledRom,
} from '../../src/extension/bundle-materialize';
import * as crypto from 'crypto';

describe('bundle-materialize', () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('copies bundled ROM files into workspace destination', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-bund-'));
    tmpDirs.push(workspaceRoot);

    const bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-ext-'));
    tmpDirs.push(bundleRoot);
    const rel = 'tec1g/mon3/v1';
    const bundleDir = path.join(bundleRoot, 'resources', 'bundles', ...rel.split('/'));
    fs.mkdirSync(bundleDir, { recursive: true });
    const romPath = path.join(bundleDir, 'mon3.bin');
    fs.writeFileSync(romPath, Buffer.alloc(16, 0x42));

    const manifest = {
      schemaVersion: 1,
      id: 'tec1g/mon3',
      version: 'test',
      platform: 'tec1g',
      label: 'Test',
      files: [{ role: 'rom' as const, path: 'mon3.bin' }],
      workspaceLayout: { destination: 'roms/tec1g/mon3' },
    };
    fs.writeFileSync(path.join(bundleDir, 'bundle.json'), JSON.stringify(manifest));

    const extensionUri = vscode.Uri.file(bundleRoot);
    const result = materializeBundledRom(extensionUri, workspaceRoot, rel);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.romRelativePath).toBe('roms/tec1g/mon3/mon3.bin');
    const out = path.join(workspaceRoot, 'roms', 'tec1g', 'mon3', 'mon3.bin');
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out).length).toBe(16);
  });

  it('materializes rom and listing and returns both relative paths', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-bund2-'));
    tmpDirs.push(workspaceRoot);

    const bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-ext2-'));
    tmpDirs.push(bundleRoot);
    const rel = 'demo/bundle';
    const bundleDir = path.join(bundleRoot, 'resources', 'bundles', ...rel.split('/'));
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(path.join(bundleDir, 'rom.bin'), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(bundleDir, 'rom.lst'), '0000\n');

    const manifest = {
      schemaVersion: 1,
      id: 'demo',
      version: '1',
      platform: 'tec1g',
      label: 'Demo',
      files: [
        { role: 'rom' as const, path: 'rom.bin' },
        { role: 'listing' as const, path: 'rom.lst' },
      ],
      workspaceLayout: { destination: 'roms/out' },
    };
    fs.writeFileSync(path.join(bundleDir, 'bundle.json'), JSON.stringify(manifest));

    const result = materializeBundledRom(vscode.Uri.file(bundleRoot), workspaceRoot, rel);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.romRelativePath).toBe('roms/out/rom.bin');
    expect(result.listingRelativePath).toBe('roms/out/rom.lst');
  });

  it('exposes bundled MON3 path constant for scaffold', () => {
    expect(BUNDLED_MON3_V1_REL).toBe('tec1g/mon3/v1');
  });

  it('accepts listing checksum when file differs only by CRLF line endings', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-bund-crlf-'));
    tmpDirs.push(workspaceRoot);

    const bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-ext-crlf-'));
    tmpDirs.push(bundleRoot);
    const rel = 'demo/crlf';
    const bundleDir = path.join(bundleRoot, 'resources', 'bundles', ...rel.split('/'));
    fs.mkdirSync(bundleDir, { recursive: true });

    fs.writeFileSync(path.join(bundleDir, 'rom.bin'), Buffer.from([0xaa, 0xbb]));
    const listingLf = '0000: NOP\n0001: HALT\n';
    const listingCrlf = listingLf.replace(/\n/g, '\r\n');
    fs.writeFileSync(path.join(bundleDir, 'rom.lst'), listingCrlf, 'utf-8');
    const listingLfHash = crypto.createHash('sha256').update(Buffer.from(listingLf, 'utf-8')).digest('hex');

    const manifest = {
      schemaVersion: 1,
      id: 'demo-crlf',
      version: '1',
      platform: 'tec1g',
      label: 'Demo CRLF',
      files: [
        { role: 'rom' as const, path: 'rom.bin' },
        { role: 'listing' as const, path: 'rom.lst', sha256: listingLfHash },
      ],
      workspaceLayout: { destination: 'roms/crlf' },
    };
    fs.writeFileSync(path.join(bundleDir, 'bundle.json'), JSON.stringify(manifest));

    const result = materializeBundledRom(vscode.Uri.file(bundleRoot), workspaceRoot, rel);
    expect(result.ok).toBe(true);
  });

  it('materializes the committed MON3 bundle (checksums in bundle.json)', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const bundleJson = path.join(
      repoRoot,
      'resources',
      'bundles',
      'tec1g',
      'mon3',
      'v1',
      'bundle.json'
    );
    if (!fs.existsSync(bundleJson)) {
      return;
    }

    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-bund-real-'));
    tmpDirs.push(workspaceRoot);

    const result = materializeBundledRom(vscode.Uri.file(repoRoot), workspaceRoot, BUNDLED_MON3_V1_REL);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.romRelativePath).toBe('roms/tec1g/mon3/mon3.bin');
    expect(result.listingRelativePath).toBe('roms/tec1g/mon3/mon3.lst');
    expect(fs.existsSync(path.join(workspaceRoot, 'roms', 'tec1g', 'mon3', 'mon3.bin'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(workspaceRoot, 'roms', 'tec1g', 'mon3', 'mon3.lst'))).toBe(
      true
    );
  });
});
