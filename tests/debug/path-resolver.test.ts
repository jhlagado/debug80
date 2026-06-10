/**
 * @file Path resolver tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  normalizeSourcePath,
  relativeIfPossible,
  resolveArtifacts,
  resolveBaseDir,
  resolveDebugMapPath,
  resolveFallbackSourceFile,
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

function writeFixtureFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

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
    writeFixtureFile(asmPath, 'NOP\n');
    const args = { asm: asmPath } as LaunchRequestArguments;

    const resolved = resolveArtifacts(args, tmpDir);
    expect(resolved.hexPath).toBe(path.join(tmpDir, 'demo.hex'));
    expect(resolved.asmPath).toBe(asmPath);
  });

  it('resolves debug map beside the build artifact without creating a project cache', () => {
    const baseDir = path.join(tmpDir, 'project');
    const hexPath = path.join(baseDir, 'demo.hex');
    writeFixtureFile(hexPath, ':00000001FF\n');

    const args = { artifactBase: 'demo' } as LaunchRequestArguments;
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, hexPath);
    expect(mapPath).toBe(path.join(baseDir, 'demo.d8.json'));
    expect(fs.existsSync(path.join(baseDir, '.debug80'))).toBe(false);
  });

  it('does not resolve source maps from the retired project cache directory', () => {
    const baseDir = path.join(tmpDir, 'project');
    const cacheDir = path.join(baseDir, '.debug80', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'demo.cached.d8.json'), '{}\n');
    const hexPath = path.join(baseDir, 'build', 'demo.hex');
    writeFixtureFile(hexPath, ':00000001FF\n');

    const args = {
      artifactBase: 'demo',
      outputDir: 'build',
    } as LaunchRequestArguments;
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, hexPath);

    expect(mapPath).toBe(path.join(baseDir, 'build', 'demo.d8.json'));
    expect(mapPath).not.toContain(`${path.sep}.debug80${path.sep}`);
  });

  it('resolves mapped path using artifact directory and source roots', () => {
    const hexPath = path.join(tmpDir, 'build', 'demo.hex');
    writeFixtureFile(hexPath, ':00000001FF\n');

    const sourceRoot = path.join(tmpDir, 'src');
    const filePath = path.join(sourceRoot, 'lib.asm');
    writeFixtureFile(filePath, 'NOP');

    expect(resolveMappedPath('lib.asm', hexPath, [sourceRoot])).toBe(
      canonicalizeDebuggerSourcePath(filePath)
    );
  });

  it('prefers source roots over generated files next to the build artifact', () => {
    const hexPath = path.join(tmpDir, 'build', 'pacmo.hex');
    writeFixtureFile(hexPath, ':00000001FF\n');
    writeFixtureFile(path.join(tmpDir, 'build', 'pacmo.z80'), '; lowered AZM output\n');

    const sourceRoot = path.join(tmpDir, 'src', 'pacmo');
    const sourcePath = path.join(sourceRoot, 'pacmo.z80');
    writeFixtureFile(sourcePath, 'nop\n');

    expect(resolveMappedPath('pacmo.z80', hexPath, [sourceRoot])).toBe(
      canonicalizeDebuggerSourcePath(sourcePath)
    );
  });

  it('resolves fallback source file relative to source roots', () => {
    const root = path.join(tmpDir, 'src');
    const filePath = path.join(root, 'demo.asm');
    writeFixtureFile(filePath, 'NOP');

    const resolved = resolveFallbackSourceFile(filePath, tmpDir, [root]);
    expect(resolved).toBe(path.join('demo.asm'));
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
