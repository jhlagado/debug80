import { describe, expect, it } from 'vitest';

import {
  buildCoveredEntrySourceKeys,
  buildTargetsPerEntrySourcePath,
  entrySourceKey,
  withDiscoverableTargetChoices,
  type TargetConfigRecord,
} from '../../src/extension/project-target-source-policy';

const PROJECT_ROOT = '/workspace/demo';

function targetSource(sourceFile: string) {
  return { sourceFile };
}

function targetChoice(name: string, sourceFile: string) {
  return {
    name,
    description: sourceFile,
    detail: sourceFile,
  };
}

describe('project target source discovery policy', () => {
  it('normalizes relative and absolute entry source paths against the project root', () => {
    expect(sourceKey('src\\main.asm')).toBe('src/main.asm');
    expect(sourceKey('/workspace/demo/src/main.asm')).toBe('src/main.asm');
  });

  it('tracks only existing configured target sources as covered', () => {
    const covered = coveredSourceKeys({
      targets: {
        main: targetSource('src/main.asm'),
        removed: targetSource('src/removed.main.asm'),
        legacy: { asm: 'src/legacy.main.asm' },
        generated: { source: 'src/generated.main.asm' },
        malformed: 'not-a-target',
      },
      targetExists: (target) => target.sourceFile !== 'src/removed.main.asm',
    });

    expect([...covered].sort()).toEqual([
      'src/generated.main.asm',
      'src/legacy.main.asm',
      'src/main.asm',
    ]);
  });

  it('adds uncovered source files as uniquely named discoverable targets', () => {
    const choices = discoverTargets({
      choices: [
        targetChoice('main', 'src/main.asm'),
        targetChoice('matrix', 'src/matrix.main.asm'),
      ],
      coveredSources: new Set(['src/main.asm']),
      sourceFiles: ['src/main.asm', 'src/matrix.main.asm', 'src/tools/matrix.main.asm'],
    });

    expect(choices).toEqual([
      targetChoice('main', 'src/main.asm'),
      targetChoice('matrix', 'src/matrix.main.asm'),
      {
        name: 'matrix.main',
        description: 'src/matrix.main.asm • new',
        detail: 'src/matrix.main.asm',
        discovered: true,
        sourceFile: 'src/matrix.main.asm',
      },
      {
        name: 'matrix.main-2',
        description: 'src/tools/matrix.main.asm • new',
        detail: 'src/tools/matrix.main.asm',
        discovered: true,
        sourceFile: 'src/tools/matrix.main.asm',
      },
    ]);
  });

  it('groups configured targets by entry source path for QuickPick source rows', () => {
    const grouped = targetsPerEntrySourcePath({
      targets: {
        main: targetSource('src/main.asm'),
        alias: { asm: '/workspace/demo/src/main.asm' },
        note: targetSource('src/readme.txt'),
        empty: {},
        malformed: null,
      },
      includeSource: (sourcePath) => sourcePath.endsWith('.asm'),
    });

    expect([...grouped.entries()]).toEqual([['src/main.asm', ['main', 'alias']]]);
  });
});

function sourceKey(sourcePath: string): string {
  return entrySourceKey(PROJECT_ROOT, sourcePath);
}

function coveredSourceKeys(options: {
  targets: Record<string, unknown>;
  targetExists: (target: TargetConfigRecord) => boolean;
}): Set<string> {
  return buildCoveredEntrySourceKeys(PROJECT_ROOT, options.targets, options.targetExists);
}

function discoverTargets(
  options: Omit<Parameters<typeof withDiscoverableTargetChoices>[0], 'projectRoot'>
): ReturnType<typeof withDiscoverableTargetChoices> {
  return withDiscoverableTargetChoices({
    projectRoot: PROJECT_ROOT,
    ...options,
  });
}

function targetsPerEntrySourcePath(options: {
  targets: Record<string, unknown>;
  includeSource: (sourcePath: string) => boolean;
}): ReturnType<typeof buildTargetsPerEntrySourcePath> {
  return buildTargetsPerEntrySourcePath(PROJECT_ROOT, options.targets, options.includeSource);
}
