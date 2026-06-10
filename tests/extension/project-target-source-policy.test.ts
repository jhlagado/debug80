import { describe, expect, it } from 'vitest';

import {
  buildCoveredEntrySourceKeys,
  buildTargetsPerEntrySourcePath,
  entrySourceKey,
  withDiscoverableTargetChoices,
} from '../../src/extension/project-target-source-policy';

describe('project target source discovery policy', () => {
  it('normalizes relative and absolute entry source paths against the project root', () => {
    expect(entrySourceKey('/workspace/demo', 'src\\main.asm')).toBe('src/main.asm');
    expect(entrySourceKey('/workspace/demo', '/workspace/demo/src/main.asm')).toBe('src/main.asm');
  });

  it('tracks only existing configured target sources as covered', () => {
    const covered = buildCoveredEntrySourceKeys(
      '/workspace/demo',
      {
        main: { sourceFile: 'src/main.asm' },
        removed: { sourceFile: 'src/removed.main.asm' },
        legacy: { asm: 'src/legacy.main.asm' },
        generated: { source: 'src/generated.main.asm' },
        malformed: 'not-a-target',
      },
      (target) => target.sourceFile !== 'src/removed.main.asm'
    );

    expect([...covered].sort()).toEqual([
      'src/generated.main.asm',
      'src/legacy.main.asm',
      'src/main.asm',
    ]);
  });

  it('adds uncovered source files as uniquely named discoverable targets', () => {
    const choices = withDiscoverableTargetChoices({
      choices: [
        { name: 'main', description: 'src/main.asm', detail: 'src/main.asm' },
        { name: 'matrix', description: 'src/matrix.main.asm', detail: 'src/matrix.main.asm' },
      ],
      projectRoot: '/workspace/demo',
      coveredSources: new Set(['src/main.asm']),
      sourceFiles: ['src/main.asm', 'src/matrix.main.asm', 'src/tools/matrix.main.asm'],
    });

    expect(choices).toEqual([
      { name: 'main', description: 'src/main.asm', detail: 'src/main.asm' },
      { name: 'matrix', description: 'src/matrix.main.asm', detail: 'src/matrix.main.asm' },
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
    const grouped = buildTargetsPerEntrySourcePath(
      '/workspace/demo',
      {
        main: { sourceFile: 'src/main.asm' },
        alias: { asm: '/workspace/demo/src/main.asm' },
        note: { sourceFile: 'src/readme.txt' },
        empty: {},
        malformed: null,
      },
      (sourcePath) => sourcePath.endsWith('.asm')
    );

    expect([...grouped.entries()]).toEqual([['src/main.asm', ['main', 'alias']]]);
  });
});
