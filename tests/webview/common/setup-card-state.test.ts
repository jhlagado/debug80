import { describe, expect, it } from 'vitest';
import { resolveSetupCardState } from '../../../webview/common/setup-card-state';

describe('setup card state resolver', () => {
  it('returns open-folder action for missing workspace root', () => {
    const state = resolveSetupCardState(undefined, 0);
    expect(state.primaryAction).toBe('openWorkspaceFolder');
    expect(state.primaryLabel).toBe('Open Folder');
    expect(state.showSecondaryConfigure).toBe(false);
  });

  it('returns create-project action for uninitialized root', () => {
    const state = resolveSetupCardState(
      { name: 'demo', path: '/workspace/demo', hasProject: false },
      0
    );
    expect(state.primaryAction).toBe('createProject');
    expect(state.primaryLabel).toBe('Create Project');
  });

  it('returns configure action when configured root has no targets', () => {
    const state = resolveSetupCardState(
      { name: 'demo', path: '/workspace/demo', hasProject: true },
      0
    );
    expect(state.primaryAction).toBe('configureProject');
    expect(state.primaryLabel).toBe('Configure Project');
  });

  it('returns start-debug action with secondary configure for valid project', () => {
    const state = resolveSetupCardState(
      { name: 'demo', path: '/workspace/demo', hasProject: true },
      2
    );
    expect(state.primaryAction).toBe('startDebug');
    expect(state.primaryLabel).toBe('Start Debugging');
    expect(state.showSecondaryConfigure).toBe(true);
  });
});
