import { describe, expect, it } from 'vitest';

import { loadVisibleTargetChoices } from '../../src/extension/project-target-config-policy';

describe('project target config policy', () => {
  it('builds target choices with source and platform descriptions', () => {
    const loaded = loadVisibleTargetChoices({
      projectRoot: '/workspace/demo',
      config: {
        defaultTarget: 'game',
        targets: {
          game: { sourceFile: 'src/game.main.asm', platform: 'tec1g' },
          serial: { asm: 'src/serial.main.asm', platform: 'simple' },
          generated: { source: 'src/generated.main.asm' },
          platformOnly: { platform: 'tec1g' },
          blankPlatform: { sourceFile: 'src/blank.main.asm', platform: '' },
        },
      },
      targetExists: () => true,
    });

    expect(loaded).toEqual({
      defaultTarget: 'game',
      choices: [
        {
          name: 'game',
          description: 'src/game.main.asm • tec1g',
          detail: 'src/game.main.asm',
        },
        {
          name: 'serial',
          description: 'src/serial.main.asm • simple',
          detail: 'src/serial.main.asm',
        },
        {
          name: 'generated',
          description: 'src/generated.main.asm',
          detail: 'src/generated.main.asm',
        },
        {
          name: 'platformOnly',
          description: 'tec1g',
        },
        {
          name: 'blankPlatform',
          description: 'src/blank.main.asm',
          detail: 'src/blank.main.asm',
        },
      ],
    });
  });

  it('filters malformed targets and targets whose program file no longer exists', () => {
    const loaded = loadVisibleTargetChoices({
      projectRoot: '/workspace/demo',
      config: {
        target: 'kept',
        targets: {
          kept: { sourceFile: 'src/kept.main.asm' },
          missing: { sourceFile: 'src/missing.main.asm' },
          invalidString: 'src/not-a-target.asm',
          invalidArray: [{ sourceFile: 'src/array.asm' }],
          invalidNull: null,
        },
      },
      targetExists: (target) => target.sourceFile !== 'src/missing.main.asm',
    });

    expect(loaded).toEqual({
      defaultTarget: 'kept',
      choices: [
        {
          name: 'kept',
          description: 'src/kept.main.asm',
          detail: 'src/kept.main.asm',
        },
      ],
    });
  });

  it('uses defaultTarget when target is absent and omits defaultTarget when neither is set', () => {
    expect(
      loadVisibleTargetChoices({
        projectRoot: '/workspace/demo',
        config: {
          targets: {
            only: { sourceFile: 'src/only.main.asm' },
          },
        },
        targetExists: () => true,
      })
    ).toEqual({
      choices: [
        {
          name: 'only',
          description: 'src/only.main.asm',
          detail: 'src/only.main.asm',
        },
      ],
    });
  });

  it('prefers target over defaultTarget when both are configured', () => {
    expect(
      loadVisibleTargetChoices({
        projectRoot: '/workspace/demo',
        config: {
          target: 'explicit',
          defaultTarget: 'fallback',
          targets: {
            explicit: { sourceFile: 'src/explicit.main.asm' },
            fallback: { sourceFile: 'src/fallback.main.asm' },
          },
        },
        targetExists: () => true,
      }).defaultTarget
    ).toBe('explicit');
  });
});
