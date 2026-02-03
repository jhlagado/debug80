/**
 * @file Path resolver tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildListingCacheKey,
  isDebugMapStale,
  relativeIfPossible,
  resolveArtifacts,
  resolveBaseDir,
  resolveCacheDir,
  resolveDebugMapPath,
  resolveExtraListingPaths,
  resolveFallbackSourceFile,
  resolveListingSourcePath,
  resolveMappedPath,
} from '../../src/debug/path-resolver';
import { LaunchRequestArguments } from '../../src/debug/types';

const workspaceState = vi.hoisted(
  () => ({ workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined })
);

vi.mock('vscode', () => ({
  workspace: workspaceState,
}));

describe('path-resolver', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-paths-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspaceState.workspaceFolders = undefined;
  });

  it('uses workspace root when project config is inside it', () => {
    const workspace = path.join(tmpDir, 'workspace');
    workspaceState.workspaceFolders = [{ uri: { fsPath: workspace } }];
    const args = { projectConfig: path.join('.vscode', 'debug80.json') } as LaunchRequestArguments;
    expect(resolveBaseDir(args)).toBe(workspace);
  });

  it('uses config directory when config is outside workspace', () => {
    const workspace = path.join(tmpDir, 'workspace');
    const configPath = path.join(tmpDir, 'other', 'debug80.json');
    workspaceState.workspaceFolders = [{ uri: { fsPath: workspace } }];
    const args = { projectConfig: configPath } as LaunchRequestArguments;
    expect(resolveBaseDir(args)).toBe(path.dirname(configPath));
  });

  it('resolves artifacts relative to the base dir', () => {
    const asmPath = path.join(tmpDir, 'demo.asm');
    fs.writeFileSync(asmPath, 'NOP\n');
    const args = { asm: asmPath } as LaunchRequestArguments;

    const resolved = resolveArtifacts(args, tmpDir);
    expect(resolved.hexPath).toBe(path.join(tmpDir, 'demo.hex'));
    expect(resolved.listingPath).toBe(path.join(tmpDir, 'demo.lst'));
    expect(resolved.asmPath).toBe(asmPath);
  });

  it('creates cache directory and resolves debug map in cache', () => {
    const baseDir = path.join(tmpDir, 'project');
    fs.mkdirSync(baseDir, { recursive: true });
    const listingPath = path.join(baseDir, 'demo.lst');
    fs.writeFileSync(listingPath, 'LIST\n');

    const cacheDir = resolveCacheDir(baseDir);
    expect(cacheDir).toBe(path.join(baseDir, '.debug80', 'cache'));
    expect(fs.existsSync(cacheDir ?? '')).toBe(true);

    const args = { artifactBase: 'demo' } as LaunchRequestArguments;
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, listingPath);
    const key = buildListingCacheKey(listingPath);
    expect(mapPath).toBe(path.join(cacheDir ?? '', `demo.${key}.d8dbg.json`));
  });

  it('filters extra listings to existing unique paths', () => {
    const listingA = path.join(tmpDir, 'a.lst');
    const listingB = path.join(tmpDir, 'b.lst');
    fs.writeFileSync(listingA, 'A');
    fs.writeFileSync(listingB, 'B');

    const resolved = resolveExtraListingPaths(
      [listingA, listingB, listingA, path.join(tmpDir, 'missing.lst')],
      tmpDir,
      listingA
    );

    expect(resolved).toEqual([listingB]);
  });

  it('resolves listing source path from .source.asm when present', () => {
    const dir = path.join(tmpDir, 'build');
    fs.mkdirSync(dir, { recursive: true });
    const listing = path.join(dir, 'demo.lst');
    const source = path.join(dir, 'demo.source.asm');
    fs.writeFileSync(listing, 'LIST');
    fs.writeFileSync(source, 'NOP');

    expect(resolveListingSourcePath(listing)).toBe(source);
  });

  it('resolves mapped path using listing directory and source roots', () => {
    const listingPath = path.join(tmpDir, 'build', 'demo.lst');
    fs.mkdirSync(path.dirname(listingPath), { recursive: true });
    fs.writeFileSync(listingPath, 'LIST');

    const sourceRoot = path.join(tmpDir, 'src');
    fs.mkdirSync(sourceRoot, { recursive: true });
    const filePath = path.join(sourceRoot, 'lib.asm');
    fs.writeFileSync(filePath, 'NOP');

    expect(resolveMappedPath('lib.asm', listingPath, [sourceRoot])).toBe(filePath);
  });

  it('resolves fallback source file relative to source roots', () => {
    const root = path.join(tmpDir, 'src');
    const filePath = path.join(root, 'demo.asm');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(filePath, 'NOP');

    const resolved = resolveFallbackSourceFile(filePath, tmpDir, [root]);
    expect(resolved).toBe(path.join('demo.asm'));
  });

  it('detects stale debug maps based on timestamps', () => {
    const listing = path.join(tmpDir, 'demo.lst');
    const map = path.join(tmpDir, 'demo.d8dbg.json');
    fs.writeFileSync(listing, 'LIST');
    fs.writeFileSync(map, 'MAP');

    const now = Date.now();
    fs.utimesSync(map, now / 1000 - 10, now / 1000 - 10);
    fs.utimesSync(listing, now / 1000, now / 1000);

    expect(isDebugMapStale(map, listing)).toBe(true);
  });

  it('returns relative paths when within base', () => {
    const baseDir = path.join(tmpDir, 'project');
    const filePath = path.join(baseDir, 'src', 'demo.asm');
    expect(relativeIfPossible(filePath, baseDir)).toBe(path.join('src', 'demo.asm'));
  });
});
