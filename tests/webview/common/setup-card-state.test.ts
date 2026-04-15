import { describe, expect, it } from 'vitest';
import { resolveSetupCardState } from '../../../webview/common/setup-card-state';

describe('setup card state resolver', () => {
  it('returns open-folder action for missing workspace root', () => {
    const state = resolveSetupCardState(undefined, 0);
    expect(state).not.toBeNull();
    expect(state?.primaryAction).toBe('openWorkspaceFolder');
    expect(state?.primaryLabel).toBe('Open Folder');
  });

  it('returns create-project action for uninitialized root', () => {
    const state = resolveSetupCardState(
      { name: 'demo', path: '/workspace/demo', hasProject: false },
      0
    );
    expect(state).not.toBeNull();
    expect(state?.primaryAction).toBe('createProject');
    expect(state?.primaryLabel).toBe('Create Project');
  });

  it('returns null when configured root already has a project (card hidden)', () => {
    expect(
      resolveSetupCardState({ name: 'demo', path: '/workspace/demo', hasProject: true }, 0)
    ).toBeNull();
    expect(
      resolveSetupCardState({ name: 'demo', path: '/workspace/demo', hasProject: true }, 2)
    ).toBeNull();
  });
});
