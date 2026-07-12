import { describe, expect, it } from 'vitest';

import {
  loadVisibleTargetChoices,
  type LoadVisibleTargetChoicesOptions,
} from '../../src/extension/project-target-config-policy';

function sourceTarget(sourceFile: string, platform?: string) {
  return {
    sourceFile,
    ...(platform !== undefined ? { platform } : {}),
  };
}

function platformTarget(platform: string) {
  return { platform };
}

function sourceChoice(name: string, sourceFile: string, platform?: string) {
  const hasPlatform = platform !== undefined && platform.length > 0;
  return {
    name,
    description: hasPlatform ? `${sourceFile} • ${platform}` : sourceFile,
    detail: sourceFile,
  };
}

function platformChoice(name: string, platform: string) {
  return {
    name,
    description: platform,
  };
}

describe('project target config policy', () => {
  it('builds target choices with source and platform descriptions', () => {
    const loaded = loadChoices({
      config: {
        defaultTarget: 'game',
        targets: {
          game: sourceTarget('src/game.main.asm', 'tec1g'),
          serial: { asm: 'src/serial.main.asm', platform: 'simple' },
          generated: { source: 'src/generated.main.asm' },
          platformOnly: platformTarget('tec1g'),
          blankPlatform: sourceTarget('src/blank.main.asm', ''),
        },
      },
    });

    expect(loaded).toEqual({
      defaultTarget: 'game',
      choices: [
        sourceChoice('game', 'src/game.main.asm', 'tec1g'),
        sourceChoice('serial', 'src/serial.main.asm', 'simple'),
        sourceChoice('generated', 'src/generated.main.asm'),
        platformChoice('platformOnly', 'tec1g'),
        sourceChoice('blankPlatform', 'src/blank.main.asm'),
      ],
    });
  });

  it('filters malformed targets and targets whose program file no longer exists', () => {
    const loaded = loadChoices({
      config: {
        target: 'kept',
        targets: {
          kept: sourceTarget('src/kept.main.asm'),
          missing: sourceTarget('src/missing.main.asm'),
          invalidString: 'src/not-a-target.asm',
          invalidArray: [{ sourceFile: 'src/array.asm' }],
          invalidNull: null,
        },
      },
      targetExists: (target) => target.sourceFile !== 'src/missing.main.asm',
    });

    expect(loaded).toEqual({
      defaultTarget: 'kept',
      choices: [sourceChoice('kept', 'src/kept.main.asm')],
    });
  });

  it('uses defaultTarget when target is absent and omits defaultTarget when neither is set', () => {
    expect(
      loadChoices({
        config: {
          targets: {
            only: sourceTarget('src/only.main.asm'),
          },
        },
      })
    ).toEqual({
      choices: [sourceChoice('only', 'src/only.main.asm')],
    });
  });

  it('prefers target over defaultTarget when both are configured', () => {
    expect(
      loadChoices({
        config: {
          target: 'explicit',
          defaultTarget: 'fallback',
          targets: {
            explicit: sourceTarget('src/explicit.main.asm'),
            fallback: sourceTarget('src/fallback.main.asm'),
          },
        },
      }).defaultTarget
    ).toBe('explicit');
  });
});

function loadChoices(options: {
  config: LoadVisibleTargetChoicesOptions['config'];
  targetExists?: LoadVisibleTargetChoicesOptions['targetExists'];
}): ReturnType<typeof loadVisibleTargetChoices> {
  return loadVisibleTargetChoices({
    projectRoot: '/workspace/demo',
    targetExists: () => true,
    ...options,
  });
}
