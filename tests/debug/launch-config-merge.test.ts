/**
 * @file Direct tests for launch config merge staging.
 */

import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
const { getExtension } = vi.hoisted(() => ({
  getExtension: vi.fn(),
}));
vi.mock('vscode', () => ({
  extensions: {
    getExtension,
  },
}));
import {
  mergeLaunchConfigStages,
  type LaunchConfigManifest,
} from '../../src/debug/launch/launch-config-merge';
import type { LaunchRequestArguments } from '../../src/debug/session/types';

describe('launch-config-merge', () => {
  it('applies root config, target config, then explicit launch args in order', () => {
    const manifest: LaunchConfigManifest = {
      platform: 'tec1g',
      defaultTarget: 'game',
      assembler: 'azm',
      outputDir: 'build',
      artifactBase: 'root',
      stopOnEntry: false,
      azm: {
        registerContracts: 'audit',
        emitRegisterReport: false,
      },
      targets: {
        game: {
          asm: 'src/game.main.asm',
          outputDir: 'target-build',
          artifactBase: 'game',
          stopOnEntry: true,
          azm: {
            emitRegisterReport: true,
          },
        },
      },
    };

    const merged = mergeLaunchConfigStages(
      {
        path: '/project/debug80.json',
        manifest,
        targetName: 'game',
        targetCfg: manifest.targets?.game,
      },
      {
        projectConfig: '/project/debug80.json',
        outputDir: 'explicit-build',
        stopOnEntry: false,
        azm: {
          registerContracts: 'error',
        },
      } as LaunchRequestArguments,
      '/project'
    );

    expect(merged).toMatchObject({
      target: 'game',
      platform: 'tec1g',
      asm: 'src/game.main.asm',
      sourceFile: 'src/game.main.asm',
      assembler: 'azm',
      outputDir: 'explicit-build',
      artifactBase: 'game',
      stopOnEntry: false,
      azm: {
        registerContracts: 'error',
        emitRegisterReport: true,
      },
    });
  });

  it('shallow-merges nested platform blocks without dropping inherited TEC-1G ROM paths', () => {
    const manifest: LaunchConfigManifest = {
      platform: 'tec1g',
      defaultTarget: 'matrix',
      tec1g: {
        romHex: 'roms/mon3.bin',
        entry: 0,
        appStart: 0x4000,
      },
      targets: {
        matrix: {
          asm: 'src/matrix.main.asm',
          tec1g: {
            appStart: 0x5000,
          },
        },
      },
    };

    const merged = mergeLaunchConfigStages(
      {
        path: '/project/debug80.json',
        manifest,
        targetName: 'matrix',
        targetCfg: manifest.targets?.matrix,
      },
      {
        projectConfig: '/project/debug80.json',
        tec1g: {
          matrixMode: true,
        },
      } as LaunchRequestArguments,
      '/project'
    );

    expect(merged.tec1g).toEqual({
      romHex: path.resolve('/project', 'roms/mon3.bin'),
      entry: 0,
      appStart: 0x5000,
      matrixMode: true,
    });
  });

  it('treats null config fields as absent to preserve nullish fallback behavior', () => {
    const manifest = {
      platform: 'tec1g',
      asm: 'src/root.main.asm',
      sourceFile: 'src/root.main.asm',
      hex: 'build/root.hex',
      outputDir: 'build',
      stopOnEntry: true,
      targets: {
        game: {
          asm: null,
          sourceFile: null,
          hex: null,
          outputDir: null,
          stopOnEntry: null,
        },
      },
      defaultTarget: 'game',
    } as unknown as LaunchConfigManifest;

    const merged = mergeLaunchConfigStages(
      {
        path: '/project/debug80.json',
        manifest,
        targetName: 'game',
        targetCfg: manifest.targets?.game,
      },
      { projectConfig: '/project/debug80.json' } as LaunchRequestArguments,
      '/project'
    );

    expect(merged).toMatchObject({
      asm: 'src/root.main.asm',
      sourceFile: 'src/root.main.asm',
      hex: 'build/root.hex',
      outputDir: 'build',
      stopOnEntry: true,
    });
  });

  it('infers a bundled debug map from a bundled ROM reference', () => {
    const manifest: LaunchConfigManifest = {
      defaultTarget: 'game',
      defaultProfile: 'mon3',
      profiles: {
        mon3: {
          platform: 'tec1g',
          bundledAssets: {
            romHex: {
              bundleId: 'tec1g/mon3/v1',
              path: 'mon3.bin',
              destination: 'roms/tec1g/mon3/mon3.bin',
            },
          },
        },
      },
      targets: {
        game: {
          asm: 'src/game.main.asm',
          profile: 'mon3',
          debugMaps: ['/project/roms/tec1g/mon3/mon3.d8.json'],
        },
      },
    };

    const merged = mergeLaunchConfigStages(
      {
        path: '/project/debug80.json',
        manifest,
        targetName: 'game',
        targetCfg: manifest.targets?.game,
      },
      { projectConfig: '/project/debug80.json' } as LaunchRequestArguments,
      '/project',
      {
        resolveBundledAssetPath: (reference) =>
          reference.path === 'mon3.d8.json'
            ? '/extension/tec1g/mon3/v1/mon3.d8.json'
            : undefined,
      }
    );

    expect(merged.platform).toBe('tec1g');
    expect(merged.debugMaps).toEqual([
      '/project/roms/tec1g/mon3/mon3.d8.json',
      '/extension/tec1g/mon3/v1/mon3.d8.json',
    ]);
  });
});
