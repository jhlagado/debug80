import { beforeEach, describe, expect, it, vi } from 'vitest';

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

let workspaceFolders: Array<{ name: string; uri: { fsPath: string } }> | undefined;

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

const folder = (name: string, fsPath: string) => ({ name, uri: { fsPath } });

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

    expect(resolvePlatformViewWorkspace({ selectedWorkspace: selected }, openFolders)).toBe(
      selected
    );
    expect(resolveRememberedWorkspaceFolder).not.toHaveBeenCalled();
  });

  it('falls back to remembered workspace before single-folder fallback', () => {
    const remembered = folder('project', '/workspace/project');
    const workspaceState = { get: vi.fn(), update: vi.fn() };
    resolveRememberedWorkspaceFolder.mockReturnValue(remembered);

    expect(resolvePlatformViewWorkspace({ workspaceState: workspaceState as never }, [])).toBe(
      remembered
    );
    expect(resolveRememberedWorkspaceFolder).toHaveBeenCalledWith(workspaceState, []);
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
        { selectedWorkspace: openFolder, currentPlatform: 'tec1', stopOnEntry: false },
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
