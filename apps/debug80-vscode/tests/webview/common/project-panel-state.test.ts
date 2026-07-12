import { describe, expect, it } from 'vitest';
import {
  createProjectAction,
  createProjectPanelState,
  selectTargetAction,
  sendHexAction,
  setupCardForProjectPanel,
  setupPrimaryAction,
} from '../../../webview/common/project-panel-state';

describe('project panel state', () => {
  it('normalizes no-workspace payloads', () => {
    const state = createProjectPanelState({ projectState: 'noWorkspace', roots: [] });

    expect(state.kind).toBe('noWorkspace');
    expect(state.selectedRoot).toBeUndefined();
    expect(setupCardForProjectPanel(state)).toEqual({
      text: 'Add projects or folders to the workspace to start with Debug80.',
      primaryLabel: 'Open Folder',
      primaryAction: 'openWorkspaceFolder',
    });
    expect(setupPrimaryAction(state, 'tec1g')).toEqual({
      type: 'openWorkspaceFolder',
      platform: 'tec1g',
    });
  });

  it('normalizes an uninitialized selected root and keeps create-project actions explicit', () => {
    const state = createProjectPanelState({
      projectState: 'uninitialized',
      rootPath: '/workspace/new-project',
      roots: [
        { name: 'old-project', path: '/workspace/old-project', hasProject: true },
        { name: 'new-project', path: '/workspace/new-project', hasProject: false },
      ],
    });

    expect(state.kind).toBe('uninitialized');
    expect(state.selectedRoot?.path).toBe('/workspace/new-project');
    expect(setupCardForProjectPanel(state)?.primaryAction).toBe('createProject');
    expect(createProjectAction(state, 'tec1g')).toEqual({
      type: 'createProject',
      platform: 'tec1g',
      rootPath: '/workspace/new-project',
    });
    expect(setupPrimaryAction(state, 'tec1g')).toEqual({
      type: 'createProject',
      platform: 'tec1g',
      rootPath: '/workspace/new-project',
    });
  });

  it('does not invent a selected root when roots exist but no root is selected', () => {
    const state = createProjectPanelState({
      projectState: 'uninitialized',
      roots: [
        { name: 'alpha', path: '/workspace/alpha', hasProject: false },
        { name: 'beta', path: '/workspace/beta', hasProject: true },
      ],
    });

    expect(state.kind).toBe('uninitialized');
    expect(state.selectedRoot).toBeUndefined();
    expect(setupCardForProjectPanel(state)?.primaryAction).toBe('selectProject');
    expect(createProjectAction(state, 'tec1g')).toBeUndefined();
    expect(setupPrimaryAction(state, 'tec1g')).toEqual({
      type: 'selectProject',
      platform: 'tec1g',
    });
  });

  it('normalizes ready projects and derives target/send actions from selected root', () => {
    const state = createProjectPanelState({
      projectState: 'initialized',
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: true }],
      targets: [{ name: 'app' }],
      targetName: 'app',
      coolTermHexPath: '/workspace/debug80/build/app.hex',
    });

    expect(state.kind).toBe('initialized');
    expect(state.targets).toEqual([{ name: 'app' }]);
    expect(setupCardForProjectPanel(state)).toBeNull();
    expect(selectTargetAction(state, 'app')).toEqual({
      type: 'selectTarget',
      rootPath: '/workspace/debug80',
      targetName: 'app',
    });
    expect(sendHexAction(state)).toEqual({
      type: 'sendHexViaCoolTerm',
      rootPath: '/workspace/debug80',
      targetName: 'app',
    });
    expect(sendHexAction(state, 'tests')).toEqual({
      type: 'sendHexViaCoolTerm',
      rootPath: '/workspace/debug80',
      targetName: 'tests',
    });
  });

  it('preserves legacy payload fallback in one place for older messages', () => {
    expect(
      createProjectPanelState({
        rootPath: '/workspace/demo',
        hasProject: false,
        roots: [{ name: 'demo', path: '/workspace/demo', hasProject: false }],
      }).kind
    ).toBe('uninitialized');
    expect(
      createProjectPanelState({
        rootPath: '/workspace/demo',
        hasProject: true,
        roots: [{ name: 'demo', path: '/workspace/demo', hasProject: true }],
      }).kind
    ).toBe('initialized');
  });

  it('synthesizes the selected root for compact control payloads without roots', () => {
    const state = createProjectPanelState({
      projectState: 'initialized',
      rootPath: '/workspace/debug80',
      hasProject: true,
    });

    expect(state.kind).toBe('initialized');
    expect(state.selectedRoot.path).toBe('/workspace/debug80');
    expect(state.selectedRoot.name).toBe('debug80');
  });
});
