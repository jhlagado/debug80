import { describe, expect, it } from 'vitest';

import {
  resolveTargetSelectionDecision,
  targetSelectionKeyFor,
} from '../../src/extension/project-target-policy';

describe('project target selection policy', () => {
  const choices = [{ name: 'main' }, { name: 'matrix' }];

  it('stores target selections under the project config path', () => {
    expect(targetSelectionKeyFor('/workspace/demo/.vscode/debug80.json')).toBe(
      'debug80.selectedTarget:/workspace/demo/.vscode/debug80.json'
    );
  });

  it('prefers a remembered target over the configured default target', () => {
    expect(
      resolveTargetSelectionDecision({
        choices,
        defaultTarget: 'main',
        storedTarget: 'matrix',
      })
    ).toEqual({ kind: 'use', targetName: 'matrix', source: 'stored' });
  });

  it('falls back from an invalid remembered target to the configured default target', () => {
    expect(
      resolveTargetSelectionDecision({
        choices,
        defaultTarget: 'main',
        storedTarget: 'removed',
      })
    ).toEqual({ kind: 'use', targetName: 'main', source: 'default' });
  });

  it('uses a sole target even when prompting is forced', () => {
    expect(
      resolveTargetSelectionDecision({
        choices: [{ name: 'only' }],
        defaultTarget: 'only',
        storedTarget: 'only',
        forcePrompt: true,
      })
    ).toEqual({ kind: 'use', targetName: 'only', source: 'sole' });
  });

  it('still reports remembered as the source when the sole target is remembered', () => {
    expect(
      resolveTargetSelectionDecision({
        choices: [{ name: 'only' }],
        defaultTarget: 'only',
        storedTarget: 'only',
      })
    ).toEqual({ kind: 'use', targetName: 'only', source: 'stored' });
  });

  it('requires a prompt when multiple targets remain and forcePrompt bypasses stored/default', () => {
    expect(
      resolveTargetSelectionDecision({
        choices,
        defaultTarget: 'main',
        storedTarget: 'matrix',
        forcePrompt: true,
      })
    ).toEqual({ kind: 'prompt' });
  });

  it('has no target when there are no configured choices', () => {
    expect(
      resolveTargetSelectionDecision({
        choices: [],
        defaultTarget: 'main',
        storedTarget: 'matrix',
      })
    ).toEqual({ kind: 'none' });
  });
});
