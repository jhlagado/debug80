import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { TEC1G_DEFAULT_PANEL_VISIBILITY } from '../../src/tec1g/visibility-defaults';
import { TEC1G_UI_VISIBILITY_MEMENTO_KEY } from '../../src/extension/tec1g-ui-visibility-memento';

const { findProjectConfigPath, resolveProjectStatusSummary } = vi.hoisted(() => ({
  findProjectConfigPath: vi.fn(),
  resolveProjectStatusSummary: vi.fn(),
}));

vi.mock('../../src/extension/project-config', () => ({
  findProjectConfigPath,
}));

vi.mock('../../src/extension/project-status', () => ({
  resolveProjectStatusSummary,
}));

import {
  buildTec1gVisibilityMessage,
  readTec1gPanelVisibilityMemento,
  saveTec1gPanelVisibility,
} from '../../src/extension/platform-view-tec1g-visibility';

const folder = (name: string, fsPath: string, index = 0): vscode.WorkspaceFolder =>
  ({ name, index, uri: { fsPath } }) as vscode.WorkspaceFolder;

function createWorkspaceState(initial?: unknown): {
  workspaceState: vscode.Memento;
  update: ReturnType<typeof vi.fn>;
} {
  let stored = initial;
  const update = vi.fn((_key: string, value: unknown) => {
    stored = value;
    return Promise.resolve();
  });
  return {
    workspaceState: {
      get: vi.fn(() => stored),
      update,
    },
    update,
  };
}

describe('platform-view-tec1g-visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findProjectConfigPath.mockImplementation(
      (target: vscode.WorkspaceFolder) => `${target.uri.fsPath}/debug80.json`
    );
    resolveProjectStatusSummary.mockReturnValue({ targetName: 'app' });
  });

  it('builds the uiVisibility message by merging defaults, adapter config, and memento', () => {
    const { workspaceState } = createWorkspaceState({ app: { glcd: true, serial: false } });
    const project = folder('project', '/workspace/project');

    expect(
      buildTec1gVisibilityMessage(
        { glcd: false, matrix: true },
        { workspaceState, resolveWorkspace: () => project }
      )
    ).toEqual({
      type: 'uiVisibility',
      visibility: {
        ...TEC1G_DEFAULT_PANEL_VISIBILITY,
        glcd: true,
        matrix: true,
        serial: false,
      },
      persist: true,
    });
  });

  it('returns undefined memento when workspace state, workspace, or project config is unavailable', () => {
    const project = folder('project', '/workspace/project');

    expect(
      readTec1gPanelVisibilityMemento({
        workspaceState: undefined,
        resolveWorkspace: () => project,
      })
    ).toBeUndefined();
    const missingWorkspace = createWorkspaceState();
    expect(
      readTec1gPanelVisibilityMemento({
        workspaceState: missingWorkspace.workspaceState,
        resolveWorkspace: () => undefined,
      })
    ).toBeUndefined();

    findProjectConfigPath.mockReturnValue(undefined);
    const missingProject = createWorkspaceState();
    expect(
      readTec1gPanelVisibilityMemento({
        workspaceState: missingProject.workspaceState,
        resolveWorkspace: () => project,
      })
    ).toBeUndefined();
  });

  it('saves visibility under the target supplied by the webview', () => {
    const { workspaceState, update } = createWorkspaceState({ app: { glcd: false } });
    const project = folder('project', '/workspace/project');

    saveTec1gPanelVisibility({ lcd: false }, 'serial', {
      workspaceState,
      resolveWorkspace: () => project,
    });

    expect(update).toHaveBeenCalledWith(TEC1G_UI_VISIBILITY_MEMENTO_KEY, {
      app: { glcd: false },
      serial: { lcd: false },
    });
    expect(resolveProjectStatusSummary).not.toHaveBeenCalled();
  });

  it('falls back to resolved project status target when webview target is absent', () => {
    const { workspaceState, update } = createWorkspaceState();
    const project = folder('project', '/workspace/project');

    saveTec1gPanelVisibility({ lcd: false }, undefined, {
      workspaceState,
      resolveWorkspace: () => project,
    });

    expect(resolveProjectStatusSummary).toHaveBeenCalledWith(workspaceState, project);
    expect(update).toHaveBeenCalledWith(TEC1G_UI_VISIBILITY_MEMENTO_KEY, {
      app: { lcd: false },
    });
  });

  it('does not save visibility without workspace state, workspace, or project config', () => {
    const { workspaceState, update } = createWorkspaceState();
    const project = folder('project', '/workspace/project');

    saveTec1gPanelVisibility({ lcd: false }, 'app', {
      workspaceState: undefined,
      resolveWorkspace: () => project,
    });
    saveTec1gPanelVisibility({ lcd: false }, 'app', {
      workspaceState,
      resolveWorkspace: () => undefined,
    });

    findProjectConfigPath.mockReturnValue(undefined);
    saveTec1gPanelVisibility({ lcd: false }, 'app', {
      workspaceState,
      resolveWorkspace: () => project,
    });

    expect(update).not.toHaveBeenCalled();
  });
});
