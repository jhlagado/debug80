import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

const {
  findProjectConfigPath,
  readProjectConfig,
  resolveProjectPlatform,
  listProjectTargetChoices,
  resolveProjectStatusSummary,
  resolveRememberedWorkspaceFolder,
} = vi.hoisted(() => ({
  findProjectConfigPath: vi.fn(),
  readProjectConfig: vi.fn(),
  resolveProjectPlatform: vi.fn(),
  listProjectTargetChoices: vi.fn(),
  resolveProjectStatusSummary: vi.fn(),
  resolveRememberedWorkspaceFolder: vi.fn(),
}));

let workspaceFolders: vscode.WorkspaceFolder[] | undefined;

vi.mock('vscode', () => ({
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
  },
}));

vi.mock('../../src/extension/project-config', () => ({
  findProjectConfigPath,
  readProjectConfig,
  resolveProjectPlatform,
}));

vi.mock('../../src/extension/project-target-selection', () => ({
  listProjectTargetChoices,
}));

vi.mock('../../src/extension/project-status', () => ({
  resolveProjectStatusSummary,
}));

vi.mock('../../src/extension/workspace-selection', () => ({
  resolveRememberedWorkspaceFolder,
}));

import {
  buildPlatformViewProjectStatus,
  resolvePlatformViewWorkspace,
} from '../../src/extension/platform-view-project-status';

const folder = (name: string, fsPath: string, index = 0): vscode.WorkspaceFolder =>
  ({ name, index, uri: { fsPath } }) as vscode.WorkspaceFolder;

describe('platform-view-project-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceFolders = undefined;
    findProjectConfigPath.mockImplementation((target: { uri: { fsPath: string } }) =>
      target.uri.fsPath.includes('project') ? `${target.uri.fsPath}/debug80.json` : undefined
    );
    readProjectConfig.mockReturnValue({ projectPlatform: 'tec1g', targets: {} });
    resolveProjectPlatform.mockReturnValue('tec1g');
    listProjectTargetChoices.mockReturnValue([
      { name: 'app', description: 'src/main.asm', detail: 'src/main.asm' },
    ]);
    resolveProjectStatusSummary.mockReturnValue({
      projectName: 'project',
      targetName: 'app',
      entrySource: 'src/main.asm',
    });
    resolveRememberedWorkspaceFolder.mockReturnValue(undefined);
  });

  it('uses the selected workspace when it is still open', () => {
    const selected = folder('project', '/workspace/project');
    const openFolders = [folder('other', '/workspace/other'), selected];

    expect(
      resolvePlatformViewWorkspace(
        { workspaceState: undefined, selectedWorkspace: selected },
        openFolders
      )
    ).toBe(selected);
    expect(resolveRememberedWorkspaceFolder).not.toHaveBeenCalled();
  });

  it('falls back to remembered workspace before single-folder fallback', () => {
    const remembered = folder('project', '/workspace/project');
    const singleFolder = folder('fallback', '/workspace/fallback');
    const workspaceState = { get: vi.fn(), update: vi.fn() };
    resolveRememberedWorkspaceFolder.mockReturnValue(remembered);

    expect(
      resolvePlatformViewWorkspace(
        { workspaceState: workspaceState as never, selectedWorkspace: undefined },
        [singleFolder]
      )
    ).toBe(remembered);
    expect(resolveRememberedWorkspaceFolder).toHaveBeenCalledWith(workspaceState, [singleFolder]);
  });

  it('builds a no-workspace project status payload when no folders are open', () => {
    expect(
      buildPlatformViewProjectStatus({
        workspaceState: undefined,
        selectedWorkspace: undefined,
        currentPlatform: undefined,
        stopOnEntry: false,
      })
    ).toEqual({
      roots: [],
      targets: [],
      projectState: 'noWorkspace',
      hasProject: false,
      platform: 'simple',
      stopOnEntry: false,
    });
  });

  it('builds an initialized project status payload with target and entry source', () => {
    const project = folder('project', '/workspace/project');

    expect(
      buildPlatformViewProjectStatus(
        {
          workspaceState: { get: vi.fn(), update: vi.fn() } as never,
          selectedWorkspace: project,
          currentPlatform: 'simple',
          stopOnEntry: true,
        },
        [project]
      )
    ).toEqual({
      roots: [{ name: 'project', path: '/workspace/project', hasProject: true }],
      targets: [{ name: 'app', description: 'src/main.asm', detail: 'src/main.asm' }],
      rootName: 'project',
      rootPath: '/workspace/project',
      projectState: 'initialized',
      hasProject: true,
      platform: 'tec1g',
      stopOnEntry: true,
      targetName: 'app',
      entrySource: 'src/main.asm',
    });
  });

  it('builds an uninitialized status for a selected folder without a project', () => {
    const openFolder = folder('scratch', '/workspace/scratch');

    expect(
      buildPlatformViewProjectStatus(
        {
          workspaceState: undefined,
          selectedWorkspace: openFolder,
          currentPlatform: 'tec1',
          stopOnEntry: false,
        },
        [openFolder]
      )
    ).toMatchObject({
      rootName: 'scratch',
      rootPath: '/workspace/scratch',
      projectState: 'uninitialized',
      hasProject: false,
      platform: 'tec1',
      targets: [],
    });
  });
});
