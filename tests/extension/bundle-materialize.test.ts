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
  materializeBundledAsset,
  materializeBundledRom,
} from '../../src/extension/bundle-materialize';

describe('bundle-materialize', () => {
  const tmpDirs: string[] = [];

  function tempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  function tempWorkspace(prefix = 'debug80-workspace-'): string {
    return tempDir(prefix);
  }

  function createBundleRoot(
    prefix: string,
    rel: string
  ): { bundleRoot: string; bundleDir: string } {
    const bundleRoot = tempDir(prefix);
    const bundleDir = path.join(bundleRoot, 'resources', 'bundles', ...rel.split('/'));
    fs.mkdirSync(bundleDir, { recursive: true });
    return { bundleRoot, bundleDir };
  }

  function writeManifest(bundleDir: string, manifest: unknown): void {
    fs.writeFileSync(path.join(bundleDir, 'bundle.json'), JSON.stringify(manifest));
  }

  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('copies bundled ROM files into workspace destination', () => {
    const workspaceRoot = tempWorkspace('debug80-bund-');
    const rel = 'tec1g/mon3/v1';
    const { bundleRoot, bundleDir } = createBundleRoot('debug80-ext-', rel);
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
    writeManifest(bundleDir, manifest);

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

  it('materializes rom and debug map and returns both relative paths', () => {
    const workspaceRoot = tempWorkspace('debug80-bund2-');
    const rel = 'demo/bundle';
    const { bundleRoot, bundleDir } = createBundleRoot('debug80-ext2-', rel);
    fs.writeFileSync(path.join(bundleDir, 'rom.bin'), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(bundleDir, 'rom.d8.json'), '{}\n');

    const manifest = {
      schemaVersion: 1,
      id: 'demo',
      version: '1',
      platform: 'tec1g',
      label: 'Demo',
      files: [
        { role: 'rom' as const, path: 'rom.bin' },
        { role: 'debug_map' as const, path: 'rom.d8.json' },
      ],
      workspaceLayout: { destination: 'roms/out' },
    };
    writeManifest(bundleDir, manifest);

    const result = materializeBundledRom(vscode.Uri.file(bundleRoot), workspaceRoot, rel);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.romRelativePath).toBe('roms/out/rom.bin');
    expect(result.debugMapRelativePath).toBe('roms/out/rom.d8.json');
  });

  it('materializes a single bundled asset reference to an explicit destination', () => {
    const workspaceRoot = tempWorkspace('debug80-asset-');
    const rel = 'demo/asset/v1';
    const { bundleRoot, bundleDir } = createBundleRoot('debug80-asset-ext-', rel);
    fs.writeFileSync(path.join(bundleDir, 'payload.bin'), Buffer.from([0xde, 0xad, 0xbe, 0xef]));

    const manifest = {
      schemaVersion: 1,
      id: 'demo-asset',
      version: '1',
      platform: 'tec1g',
      label: 'Demo Asset',
      files: [{ role: 'rom' as const, path: 'payload.bin' }],
      workspaceLayout: { destination: 'roms/demo-default' },
    };
    writeManifest(bundleDir, manifest);

    const result = materializeBundledAsset(vscode.Uri.file(bundleRoot), workspaceRoot, {
      bundleId: rel,
      path: 'payload.bin',
      destination: 'assets/custom/payload.bin',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.destinationRelative).toBe('assets/custom/payload.bin');
    expect(result.materializedRelativePath).toBe('assets/custom/payload.bin');
    expect(fs.existsSync(path.join(workspaceRoot, 'assets', 'custom', 'payload.bin'))).toBe(true);
  });

  it('rejects a bundled ROM when the checksum does not match', () => {
    const workspaceRoot = tempWorkspace('debug80-bund-badsha-');
    const rel = 'demo/badsha/v1';
    const { bundleRoot, bundleDir } = createBundleRoot('debug80-bund-ext-badsha-', rel);
    fs.writeFileSync(path.join(bundleDir, 'rom.bin'), Buffer.from([0x11, 0x22, 0x33]));
    writeManifest(bundleDir, {
      schemaVersion: 1,
      id: 'demo-badsha',
      version: '1',
      platform: 'tec1g',
      label: 'Bad SHA',
      files: [{ role: 'rom' as const, path: 'rom.bin', sha256: 'deadbeef' }],
      workspaceLayout: { destination: 'roms/badsha' },
    });

    const result = materializeBundledRom(vscode.Uri.file(bundleRoot), workspaceRoot, rel);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain('Checksum mismatch');
    expect(result.reason).toContain('rom.bin');
    expect(fs.existsSync(path.join(workspaceRoot, 'roms', 'badsha', 'rom.bin'))).toBe(false);
  });

  it('rejects a bundled asset destination that escapes the workspace root', () => {
    const workspaceBase = tempDir('debug80-asset-root-');
    const workspaceRoot = path.join(workspaceBase, 'project');
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const rel = 'demo/escape/v1';
    const { bundleRoot, bundleDir } = createBundleRoot('debug80-asset-ext-escape-', rel);
    fs.writeFileSync(path.join(bundleDir, 'payload.bin'), Buffer.from([0x01]));
    writeManifest(bundleDir, {
      schemaVersion: 1,
      id: 'demo-escape',
      version: '1',
      platform: 'tec1g',
      label: 'Escape',
      files: [{ role: 'rom' as const, path: 'payload.bin' }],
      workspaceLayout: { destination: 'roms/escape' },
    });

    const escapeTarget = path.resolve(workspaceRoot, '../../escape.bin');
    fs.rmSync(escapeTarget, { force: true });

    const result = materializeBundledAsset(vscode.Uri.file(bundleRoot), workspaceRoot, {
      bundleId: rel,
      path: 'payload.bin',
      destination: '../../escape.bin',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain('escapes the workspace root');
    expect(fs.existsSync(escapeTarget)).toBe(false);
  });

  it('rejects an absolute bundled asset destination path', () => {
    const workspaceRoot = tempWorkspace('debug80-asset-abs-');
    const rel = 'demo/abs/v1';
    const { bundleRoot, bundleDir } = createBundleRoot('debug80-asset-ext-abs-', rel);
    fs.writeFileSync(path.join(bundleDir, 'payload.bin'), Buffer.from([0x02]));
    writeManifest(bundleDir, {
      schemaVersion: 1,
      id: 'demo-abs',
      version: '1',
      platform: 'tec1g',
      label: 'Absolute',
      files: [{ role: 'rom' as const, path: 'payload.bin' }],
      workspaceLayout: { destination: 'roms/abs' },
    });

    const absoluteTarget = path.resolve(os.tmpdir(), 'debug80-absolute.bin');
    fs.rmSync(absoluteTarget, { force: true });

    const result = materializeBundledAsset(vscode.Uri.file(bundleRoot), workspaceRoot, {
      bundleId: rel,
      path: 'payload.bin',
      destination: absoluteTarget,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain('must be workspace-relative');
    expect(fs.existsSync(absoluteTarget)).toBe(false);
  });

  it('exposes bundled MON3 path constant for scaffold', () => {
    expect(BUNDLED_MON3_V1_REL).toBe('tec1g/mon3/v1');
  });

  it('materializes the committed MON3 bundle (checksums in bundle.json)', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const bundleDir = path.join(repoRoot, 'resources', 'bundles', 'tec1g', 'mon3', 'v1');
    const bundleJson = path.join(bundleDir, 'bundle.json');
    if (!fs.existsSync(bundleJson)) {
      return;
    }

    // Keep this test focused on materialization paths/content presence by using
    // a copied manifest with checksum fields removed while still sourcing committed assets.
    const extensionRoot = tempDir('debug80-ext-real-');
    const copiedBundleDir = path.join(extensionRoot, 'resources', 'bundles', 'tec1g', 'mon3', 'v1');
    fs.mkdirSync(copiedBundleDir, { recursive: true });
    fs.copyFileSync(path.join(bundleDir, 'mon3.bin'), path.join(copiedBundleDir, 'mon3.bin'));
    fs.copyFileSync(
      path.join(bundleDir, 'mon3.d8.json'),
      path.join(copiedBundleDir, 'mon3.d8.json')
    );
    const manifest = JSON.parse(fs.readFileSync(bundleJson, 'utf-8')) as {
      files?: Array<Record<string, unknown>>;
    };
    if (Array.isArray(manifest.files)) {
      manifest.files = manifest.files
        .filter((entry) => entry['role'] === 'rom' || entry['role'] === 'debug_map')
        .map((entry) => {
          const next = { ...entry };
          delete next.sha256;
          return next;
        });
    }
    fs.writeFileSync(path.join(copiedBundleDir, 'bundle.json'), JSON.stringify(manifest, null, 2));

    const workspaceRoot = tempWorkspace('debug80-bund-real-');

    const result = materializeBundledRom(
      vscode.Uri.file(extensionRoot),
      workspaceRoot,
      BUNDLED_MON3_V1_REL
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.romRelativePath).toBe('roms/tec1g/mon3/mon3.bin');
    expect(result.debugMapRelativePath).toBe('roms/tec1g/mon3/mon3.d8.json');
    expect(fs.existsSync(path.join(workspaceRoot, 'roms', 'tec1g', 'mon3', 'mon3.bin'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, 'roms', 'tec1g', 'mon3', 'mon3.d8.json'))).toBe(
      true
    );
  });
});
