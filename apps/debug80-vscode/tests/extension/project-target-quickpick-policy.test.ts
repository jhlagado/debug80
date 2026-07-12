import { describe, expect, it } from 'vitest';

import {
  buildEntrySourcePickRows,
  buildTargetChoicePickRows,
} from '../../src/extension/project-target-quickpick-policy';

type EntrySourceRowsOptions = Parameters<typeof buildEntrySourcePickRows>[0];

function targetChoice(name: string, description?: string, detail?: string) {
  return {
    name,
    ...(description !== undefined ? { description } : {}),
    ...(detail !== undefined ? { detail } : {}),
  };
}

function entrySourceRowsOptions(
  overrides: Partial<EntrySourceRowsOptions>
): EntrySourceRowsOptions {
  return {
    paths: [],
    separatorKind: -1,
    separatorLabel: 'AZM sources',
    detail: 'AZM',
    projectRoot: '/workspace/demo',
    targetsPerPath: new Map(),
    bindTarget: undefined,
    ...overrides,
  };
}

function targetBindings(entries: Array<[string, string[]]>): Map<string, string[]> {
  return new Map(entries);
}

function buildAzmSourceRows(
  overrides: Partial<EntrySourceRowsOptions>
): ReturnType<typeof buildEntrySourcePickRows> {
  return buildEntrySourcePickRows(entrySourceRowsOptions(overrides));
}

describe('project target QuickPick policy', () => {
  it('marks remembered and default target rows without changing their target names', () => {
    expect(
      buildTargetChoicePickRows({
        choices: [
          targetChoice('main', 'src/main.asm', 'src/main.asm'),
          targetChoice('serial', 'src/serial.asm'),
          targetChoice('blank'),
        ],
        storedTarget: 'serial',
        defaultTarget: 'main',
      })
    ).toEqual([
      {
        label: 'main',
        description: 'src/main.asm • default',
        detail: 'src/main.asm',
        targetName: 'main',
      },
      {
        label: 'serial',
        description: 'src/serial.asm • current',
        targetName: 'serial',
      },
      {
        label: 'blank',
        targetName: 'blank',
      },
    ]);
  });

  it('adds bound and unbound AZM source rows below a separator', () => {
    expect(
      buildAzmSourceRows({
        paths: ['src/main.asm', 'src/new.main.asm', 'src/shared.main.asm'],
        targetsPerPath: targetBindings([
          ['src/main.asm', ['main']],
          ['src/shared.main.asm', ['shared', 'shared-alt']],
        ]),
        bindTarget: 'main',
      })
    ).toEqual([
      { kind: -1, label: 'AZM sources' },
      {
        label: 'src/main.asm',
        description: 'Target: main',
        detail: 'AZM',
        targetName: 'main',
      },
      {
        label: 'src/new.main.asm',
        description: 'Set as entry for target "main"',
        detail: 'AZM',
        targetName: 'main',
        applyEntrySource: 'src/new.main.asm',
      },
      {
        label: 'src/shared.main.asm',
        description: 'Targets: shared, shared-alt',
        detail: 'AZM',
        targetName: 'shared',
      },
    ]);
  });

  it('omits unbound AZM source rows when there is no target to bind', () => {
    expect(buildAzmSourceRows({ paths: ['src/new.main.asm'] })).toEqual([
      { kind: -1, label: 'AZM sources' },
    ]);
  });
});
