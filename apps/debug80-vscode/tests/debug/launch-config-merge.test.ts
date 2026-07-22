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

const PROJECT_CONFIG = '/project/debug80.json';
const PROJECT_ROOT = '/project';

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
        registerContractsPolicy: {
          strict: ['src/**/*.asm'],
          audit: ['roms/**/*.asm'],
        },
      },
      targets: {
        game: {
          asm: 'src/game.main.asm',
          outputDir: 'target-build',
          artifactBase: 'game',
          stopOnEntry: true,
          azm: {
            emitRegisterReport: true,
            registerContractsPolicy: {
              strict: ['roms/tec1g/tecm8/**/*.asm'],
            },
          },
        },
      },
    };

    const merged = mergeForTarget(
      manifest,
      'game',
      launchArgs({
        outputDir: 'explicit-build',
        stopOnEntry: false,
        azm: {
          registerContracts: 'error',
        },
      })
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
        registerContractsPolicy: {
          strict: ['roms/tec1g/tecm8/**/*.asm'],
        },
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

    const merged = mergeForTarget(
      manifest,
      'matrix',
      launchArgs({
        tec1g: {
          matrixMode: true,
        },
      })
    );

    expect(merged.tec1g).toEqual({
      romHex: path.resolve('/project', 'roms/mon3.bin'),
      entry: 0,
      appStart: 0x5000,
      matrixMode: true,
    });
  });

  it('merges Simple configuration field by field across all three precedence layers', () => {
    const manifest: LaunchConfigManifest = {
      platform: 'simple',
      defaultTarget: 'game',
      simple: { entry: 0x0100, binFrom: 0x4000 },
      targets: {
        game: {
          asm: 'src/game.asm',
          simple: { appStart: 0x4000, binTo: 0x4fff },
        },
      },
    };

    const merged = mergeForTarget(manifest, 'game', launchArgs({ simple: { entry: 0x0200 } }));

    expect(merged.simple).toMatchObject({
      appStart: 0x4000,
      entry: 0x0200,
      binFrom: 0x4000,
      binTo: 0x4fff,
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

    const merged = mergeForTarget(manifest, 'game');

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

    const merged = mergeForTarget(manifest, 'game', launchArgs(), {
      resolveBundledAssetPath: (reference) =>
        reference.path === 'mon3.d8.json' ? '/extension/tec1g/mon3/v1/mon3.d8.json' : undefined,
    });

    expect(merged.platform).toBe('tec1g');
    expect(merged.debugMaps).toEqual([
      '/project/roms/tec1g/mon3/mon3.d8.json',
      '/extension/tec1g/mon3/v1/mon3.d8.json',
    ]);
  });
});

function mergeForTarget(
  manifest: LaunchConfigManifest,
  targetName: string,
  explicitArgs = launchArgs(),
  options?: Parameters<typeof mergeLaunchConfigStages>[3]
): LaunchRequestArguments {
  return mergeLaunchConfigStages(
    {
      path: PROJECT_CONFIG,
      manifest,
      targetName,
      targetCfg: manifest.targets?.[targetName],
    },
    explicitArgs,
    PROJECT_ROOT,
    options
  );
}

function launchArgs(args: Partial<LaunchRequestArguments> = {}): LaunchRequestArguments {
  return { projectConfig: PROJECT_CONFIG, ...args } as LaunchRequestArguments;
}
