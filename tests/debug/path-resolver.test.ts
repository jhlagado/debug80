/**
 * @file Path resolver tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isDebugMapStale,
  normalizeSourcePath,
  relativeIfPossible,
  resolveArtifacts,
  resolveBaseDir,
  resolveDebugMapPath,
  resolveExtraListingPaths,
  resolveFallbackSourceFile,
  resolveListingSourcePath,
  resolveMappedPath,
} from '../../src/debug/mapping/path-resolver';
import { canonicalizeDebuggerSourcePath } from '../../src/debug/mapping/path-utils';
import { LaunchRequestArguments } from '../../src/debug/session/types';

const workspaceState = vi.hoisted(() => ({
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
}));

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

  it('uses project root when config is .vscode/debug80.json outside workspace', () => {
    const workspace = path.join(tmpDir, 'workspace');
    const projectRoot = path.join(tmpDir, 'other-project');
    const configPath = path.join(projectRoot, '.vscode', 'debug80.json');
    workspaceState.workspaceFolders = [{ uri: { fsPath: workspace } }];
    const args = { projectConfig: configPath } as LaunchRequestArguments;
    expect(resolveBaseDir(args)).toBe(projectRoot);
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

  it('resolves debug map beside the build artifact without creating a project cache', () => {
    const baseDir = path.join(tmpDir, 'project');
    fs.mkdirSync(baseDir, { recursive: true });
    const listingPath = path.join(baseDir, 'demo.lst');
    fs.writeFileSync(listingPath, 'LIST\n');

    const args = { artifactBase: 'demo' } as LaunchRequestArguments;
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, listingPath);
    expect(mapPath).toBe(path.join(baseDir, 'demo.d8.json'));
    expect(fs.existsSync(path.join(baseDir, '.debug80'))).toBe(false);
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

  it('does not resolve listing source path from .source.asm', () => {
    const dir = path.join(tmpDir, 'build');
    fs.mkdirSync(dir, { recursive: true });
    const listing = path.join(dir, 'demo.lst');
    const source = path.join(dir, 'demo.source.asm');
    fs.writeFileSync(listing, 'LIST');
    fs.writeFileSync(source, 'NOP');

    expect(resolveListingSourcePath(listing)).toBeUndefined();
  });

  it('resolves listing source path from .z80 when present', () => {
    const dir = path.join(tmpDir, 'build');
    fs.mkdirSync(dir, { recursive: true });
    const listing = path.join(dir, 'mon3.lst');
    const source = path.join(dir, 'mon3.z80');
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

    expect(resolveMappedPath('lib.asm', listingPath, [sourceRoot])).toBe(
      canonicalizeDebuggerSourcePath(filePath)
    );
  });

  it('prefers source roots over generated files next to the listing', () => {
    const listingPath = path.join(tmpDir, 'build', 'pacmo.lst');
    fs.mkdirSync(path.dirname(listingPath), { recursive: true });
    fs.writeFileSync(listingPath, 'LIST');
    fs.writeFileSync(path.join(tmpDir, 'build', 'pacmo.z80'), '; lowered AZM output\n');

    const sourceRoot = path.join(tmpDir, 'src', 'pacmo');
    fs.mkdirSync(sourceRoot, { recursive: true });
    const sourcePath = path.join(sourceRoot, 'pacmo.z80');
    fs.writeFileSync(sourcePath, 'nop\n');

    expect(resolveMappedPath('pacmo.z80', listingPath, [sourceRoot])).toBe(
      canonicalizeDebuggerSourcePath(sourcePath)
    );
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
    const map = path.join(tmpDir, 'demo.d8.json');
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

  it('treats Windows drive paths as absolute on non-Windows hosts', () => {
    const sourcePath = 'C:\\Users\\Ada Lovelace\\Debug80 Project\\src\\main.asm';
    expect(normalizeSourcePath(sourcePath, '/tmp/workspace')).toBe(sourcePath);
  });

  it('returns relative paths for Windows drive paths inside the base', () => {
    expect(
      relativeIfPossible(
        'C:\\Users\\Ada Lovelace\\Debug80 Project\\src\\main.asm',
        'c:\\users\\ada lovelace\\debug80 project'
      )
    ).toBe('src\\main.asm');
  });
});
