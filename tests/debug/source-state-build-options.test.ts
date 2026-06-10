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

function withTempProject<T>(run: (projectRoot: string) => T): T {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-source-state-options-'));
  try {
    return run(path.join(tmpDir, 'project'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function writeTextFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeD8Map(filePath: string, files: Record<string, unknown>): void {
  writeTextFile(
    filePath,
    JSON.stringify({
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files,
      generator: { name: 'azm' },
    })
  );
}

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
    withTempProject((projectRoot) => {
      const sourcePath = path.join(projectRoot, 'src', 'main.asm');
      const hexPath = path.join(projectRoot, 'build', 'main.hex');
      const d8Path = path.join(projectRoot, 'build', 'main.d8.json');
      let sourceRoots: string[] = [];

      writeTextFile(sourcePath, 'START:\n  NOP\n');
      writeTextFile(hexPath, ':00000001FF\n');
      writeD8Map(d8Path, {
        'src/main.asm': {
          segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 2, kind: 'code' }],
        },
      });

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
    });
  });
});
