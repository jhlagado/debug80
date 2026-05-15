/**
 * @file Configure-project target edit helper tests.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectConfig } from '../../src/debug/session/types';
import { applyConfigureProjectTargetEdit } from '../../src/extension/configure-project-edit';

describe('configure-project target edit', () => {
  it('applies platform override and updates project platform for a single target', () => {
    const config: ProjectConfig = {
      targets: {
        app: { sourceFile: 'src/main.asm', platform: 'simple', simple: {} },
      },
    };

    const result = applyConfigureProjectTargetEdit(config, 'app', {
      kind: 'targetPlatformOverride',
      platform: 'tec1g',
    });

    expect(result).toEqual({ kind: 'updated', targetName: 'app' });
    expect(config.projectVersion).toBe(2);
    expect(config.projectPlatform).toBe('tec1g');
    expect(config.targets?.app?.platform).toBe('tec1g');
    expect(config.targets?.app?.simple).toBeUndefined();
    expect(config.targets?.app?.tec1g).toBeDefined();
  });

  it('keeps project platform stable when editing one target in a multi-target config', () => {
    const config: ProjectConfig = {
      projectPlatform: 'tec1',
      targets: {
        app: { sourceFile: 'src/main.asm', platform: 'simple' },
        other: { sourceFile: 'src/other.asm', platform: 'tec1' },
      },
    };

    applyConfigureProjectTargetEdit(config, 'app', {
      kind: 'targetPlatformOverride',
      platform: 'tec1g',
    });

    expect(config.projectPlatform).toBe('tec1');
    expect(config.targets?.app?.platform).toBe('tec1g');
  });

  it('sets zax assembler for zax source files and clears stale zax for asm files', () => {
    const config: ProjectConfig = {
      targets: {
        app: { sourceFile: 'src/old.zax', asm: 'src/old.zax', assembler: 'zax' },
      },
    };

    applyConfigureProjectTargetEdit(config, 'app', {
      kind: 'program',
      sourceFile: 'src/main.asm',
    });
    expect(config.targets?.app?.sourceFile).toBe('src/main.asm');
    expect(config.targets?.app?.asm).toBe('src/main.asm');
    expect(config.targets?.app?.assembler).toBeUndefined();

    applyConfigureProjectTargetEdit(config, 'app', {
      kind: 'program',
      sourceFile: 'src/main.zax',
    });
    expect(config.targets?.app?.assembler).toBe('zax');
  });

  it('renames targets and updates target aliases', () => {
    const config: ProjectConfig = {
      target: 'app',
      defaultTarget: 'app',
      targets: {
        app: { sourceFile: 'src/main.asm' },
      },
    };

    const result = applyConfigureProjectTargetEdit(config, 'app', {
      kind: 'targetName',
      targetName: 'renamed',
    });

    expect(result).toEqual({ kind: 'updated', targetName: 'renamed' });
    expect(config.target).toBe('renamed');
    expect(config.defaultTarget).toBe('renamed');
    expect(config.targets?.app).toBeUndefined();
    expect(config.targets?.renamed?.sourceFile).toBe('src/main.asm');
  });

  it('reports missing and unchanged targets without mutating', () => {
    const config: ProjectConfig = {
      targets: {
        app: { sourceFile: 'src/main.asm' },
      },
    };

    expect(
      applyConfigureProjectTargetEdit(config, 'missing', {
        kind: 'assembler',
        assembler: 'zax',
      })
    ).toEqual({ kind: 'missingTarget' });
    expect(
      applyConfigureProjectTargetEdit(config, 'app', {
        kind: 'targetName',
        targetName: 'app',
      })
    ).toEqual({ kind: 'noChange' });
    expect(config.targets).toEqual({ app: { sourceFile: 'src/main.asm' } });
  });
});
