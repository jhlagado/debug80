import { describe, expect, it } from 'vitest';
import { resolveSetupCardState } from '../../../webview/common/setup-card-state';

describe('setup card state resolver', () => {
  it('returns open-folder action for missing workspace root', () => {
    const state = resolveSetupCardState(undefined, 'noWorkspace', 0);
    expect(state).not.toBeNull();
    expect(state?.primaryAction).toBe('openWorkspaceFolder');
    expect(state?.primaryLabel).toBe('Open Folder');
  });

  it('returns initialize-project action for uninitialized root', () => {
    const state = resolveSetupCardState(
      { name: 'demo', path: '/workspace/demo', hasProject: false },
      'uninitialized',
      0
    );
    expect(state).not.toBeNull();
    expect(state?.primaryAction).toBe('createProject');
    expect(state?.primaryLabel).toBe('Initialize Project');
    expect(state?.text).toBe('Uninitialized Debug80 project');
  });

  it('returns null when configured root already has a project (card hidden)', () => {
    expect(
      resolveSetupCardState(
        { name: 'demo', path: '/workspace/demo', hasProject: true },
        'initialized',
        0
      )
    ).toBeNull();
    expect(
      resolveSetupCardState(
        { name: 'demo', path: '/workspace/demo', hasProject: true },
        'initialized',
        2
      )
    ).toBeNull();
  });
});
