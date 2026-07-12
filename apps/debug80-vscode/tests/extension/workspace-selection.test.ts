import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showQuickPick = vi.fn();
const executeCommand = vi.fn();
const existsSync = vi.fn();
const startDebugging = vi.fn();
const resolvePreferredTargetName = vi.fn();

let workspaceFolders: Array<{ name: string; uri: { fsPath: string } }> | undefined;
let storedPath: string | undefined;

const selectedWorkspaceKey = 'debug80.selectedWorkspace';

vi.mock('fs', () => ({
  existsSync,
}));

vi.mock('vscode', () => ({
  window: {
    showQuickPick,
    showInformationMessage: vi.fn(),
  },
  commands: {
    executeCommand,
  },
  debug: {
    activeDebugSession: undefined,
    startDebugging,
  },
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
    })),
    onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));

vi.mock('../../src/extension/project-target-selection', () => ({
  resolvePreferredTargetName,
}));

function workspacePath(name: string): string {
  return `/workspace/${name}`;
}

function projectConfigPath(name: string): string {
  return path.normalize(`${workspacePath(name)}/debug80.json`);
}

function workspaceFolder(name: string): { name: string; uri: { fsPath: string } } {
  return { name, uri: { fsPath: workspacePath(name) } };
}

function setWorkspaceFolderNames(...names: string[]): void {
  workspaceFolders = names.map(workspaceFolder);
}

function projectConfigExistsFor(...names: string[]): void {
  const projectConfigPaths = new Set(names.map(projectConfigPath));
  existsSync.mockImplementation((candidate: string) =>
    projectConfigPaths.has(path.normalize(candidate))
  );
}

function selectWorkspaceFolder(index: number): void {
  const folder = workspaceFolders?.[index];
  if (!folder) {
    throw new Error(`No workspace folder at index ${index}`);
  }
  showQuickPick.mockResolvedValueOnce({
    label: folder.name,
    description: folder.uri.fsPath,
    folder,
  });
}

async function createController(options: { withSubscriptions?: boolean } = {}) {
  const { WorkspaceSelectionController } = await import('../../src/extension/workspace-selection');
  const update = vi.fn();
  const platformViewProvider = {
    setSelectedWorkspace: vi.fn(),
    setHasProject: vi.fn(),
  };

  const context = {
    ...(options.withSubscriptions === true ? { subscriptions: [] } : {}),
    workspaceState: { get: vi.fn(() => storedPath), update },
  };

  const controller = new WorkspaceSelectionController(
    context as never,
    platformViewProvider as never
  );

  return { controller, update, platformViewProvider };
}

describe('WorkspaceSelectionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceFolders = undefined;
    storedPath = undefined;
    resolvePreferredTargetName.mockReturnValue(undefined);
  });

  it('reuses the remembered workspace without prompting', async () => {
    setWorkspaceFolderNames('debug80', 'caverns80');
    storedPath = '/workspace/caverns80';

    const { controller, update } = await createController();
    const folder = await controller.resolveWorkspaceFolder({ prompt: true });

    expect(folder?.uri.fsPath).toBe(workspacePath('caverns80'));
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(selectedWorkspaceKey, workspacePath('caverns80'));
  });

  it('prefers the only configured project folder when debugging', async () => {
    setWorkspaceFolderNames('debug80', 'caverns80');
    projectConfigExistsFor('caverns80');

    const { controller, update } = await createController();
    const folder = await controller.resolveWorkspaceFolder({ requireProject: true });

    expect(folder?.uri.fsPath).toBe(workspacePath('caverns80'));
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(selectedWorkspaceKey, workspacePath('caverns80'));
  });

  it('prompts when multiple project folders are configured', async () => {
    setWorkspaceFolderNames('debug80', 'caverns80');
    projectConfigExistsFor('debug80', 'caverns80');
    selectWorkspaceFolder(1);

    const { controller, update } = await createController();
    const folder = await controller.resolveWorkspaceFolder({
      prompt: true,
      requireProject: true,
      placeHolder: 'Select the Debug80 project folder to debug',
    });

    expect(folder?.uri.fsPath).toBe(workspacePath('caverns80'));
    expect(showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: 'debug80' }),
        expect.objectContaining({ label: 'caverns80' }),
      ]),
      expect.objectContaining({ placeHolder: 'Select the Debug80 project folder to debug' })
    );
    expect(update).toHaveBeenCalledWith(selectedWorkspaceKey, workspacePath('caverns80'));
  });

  it('auto-starts the remembered project on startup when a preferred target exists', async () => {
    setWorkspaceFolderNames('caverns80');
    storedPath = '/workspace/caverns80';
    projectConfigExistsFor('caverns80');
    resolvePreferredTargetName.mockReturnValue('app');

    const { controller } = await createController({ withSubscriptions: true });
    controller.registerInfrastructure();

    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: workspacePath('caverns80') } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        name: 'Debug80: Current Project',
        projectConfig: projectConfigPath('caverns80'),
      })
    );
  });
});
