import { describe, expect, it } from 'vitest';

import {
  buildEntrySourcePickRows,
  buildTargetChoicePickRows,
} from '../../src/extension/project-target-quickpick-policy';

describe('project target QuickPick policy', () => {
  it('marks remembered and default target rows without changing their target names', () => {
    expect(
      buildTargetChoicePickRows({
        choices: [
          { name: 'main', description: 'src/main.asm', detail: 'src/main.asm' },
          { name: 'serial', description: 'src/serial.asm' },
          { name: 'blank' },
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
    const targetsPerPath = new Map<string, string[]>();
    targetsPerPath.set('src/main.asm', ['main']);
    targetsPerPath.set('src/shared.main.asm', ['shared', 'shared-alt']);

    expect(
      buildEntrySourcePickRows({
        paths: ['src/main.asm', 'src/new.main.asm', 'src/shared.main.asm'],
        separatorKind: -1,
        separatorLabel: 'AZM sources',
        detail: 'AZM',
        projectRoot: '/workspace/demo',
        targetsPerPath,
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
    expect(
      buildEntrySourcePickRows({
        paths: ['src/new.main.asm'],
        separatorKind: -1,
        separatorLabel: 'AZM sources',
        detail: 'AZM',
        projectRoot: '/workspace/demo',
        targetsPerPath: new Map(),
        bindTarget: undefined,
      })
    ).toEqual([{ kind: -1, label: 'AZM sources' }]);
  });
});
