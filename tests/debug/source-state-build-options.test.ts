/**
 * @file Source-state build option helper tests.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSourceIdentityArgs,
  buildSourceMapArgs,
  buildLaunchSessionSourceRoots,
  createSourceStateManager,
} from '../../src/debug/launch/source-state-build-options';
import type { LaunchRequestArguments } from '../../src/debug/session/types';
import { resolveExecutableLocation } from '../../src/mapping/source-map';
import { NullLogger } from '../../src/util/logger';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
  },
}));

describe('source-state build option helpers', () => {
  it('keeps only non-empty source map arguments', () => {
    expect(
      buildSourceMapArgs({
        artifactBase: 'pacmo',
        outputDir: '',
      } as LaunchRequestArguments)
    ).toEqual({ artifactBase: 'pacmo' });

    expect(
      buildSourceMapArgs({
        artifactBase: '',
        outputDir: 'build',
      } as LaunchRequestArguments)
    ).toEqual({ outputDir: 'build' });
  });

  it('keeps only non-empty source identity arguments', () => {
    expect(
      buildSourceIdentityArgs({
        args: { sourceFile: 'src/main.asm' } as LaunchRequestArguments,
        asmPath: '/tmp/project/src/main.asm',
      })
    ).toEqual({ asmPath: '/tmp/project/src/main.asm', sourceFile: 'src/main.asm' });

    expect(
      buildSourceIdentityArgs({
        args: { sourceFile: '' } as LaunchRequestArguments,
        asmPath: '',
      })
    ).toEqual({});
  });

  it('resolves launch session source roots with asm directory and project base once', () => {
    const baseDir = path.join(os.tmpdir(), 'debug80-project');
    const asmPath = path.join(baseDir, 'src', 'main.asm');

    expect(
      buildLaunchSessionSourceRoots({
        args: { sourceRoots: ['src', baseDir] } as LaunchRequestArguments,
        baseDir,
        asmPath,
      })
    ).toEqual([path.resolve(baseDir, 'src'), path.resolve(baseDir)]);
  });

  it('resolves mapped paths against the latest source roots', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-source-state-options-'));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, 'src', 'main.asm');
    const hexPath = path.join(projectRoot, 'build', 'main.hex');
    const d8Path = path.join(projectRoot, 'build', 'main.d8.json');
    let sourceRoots: string[] = [];

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(hexPath), { recursive: true });
    fs.writeFileSync(sourcePath, 'START:\n  NOP\n');
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(
      d8Path,
      JSON.stringify({
        format: 'd8-debug-map',
        version: 1,
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        files: {
          'src/main.asm': {
            segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 2, kind: 'code' }],
          },
        },
        generator: { name: 'azm' },
      })
    );

    const manager = createSourceStateManager({
      platform: 'tec1g',
      baseDir: projectRoot,
      getSourceRoots: () => sourceRoots,
      logger: new NullLogger(),
    });

    sourceRoots = [projectRoot];
    const state = manager.buildState({
      hexPath,
      sourceRoots,
      mapArgs: { artifactBase: 'main', outputDir: 'build' },
    });

    expect(resolveExecutableLocation(state.mappingIndex, sourcePath, 2)).toEqual([0x4000]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
