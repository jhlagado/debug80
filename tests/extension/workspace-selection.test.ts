import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showQuickPick = vi.fn();
const executeCommand = vi.fn();
const existsSync = vi.fn();

let workspaceFolders: Array<{ name: string; uri: { fsPath: string } }> | undefined;
let storedPath: string | undefined;

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
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
  },
}));

describe('WorkspaceSelectionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceFolders = undefined;
    storedPath = undefined;
  });

  it('reuses the remembered workspace without prompting', async () => {
    workspaceFolders = [
      { name: 'debug80', uri: { fsPath: '/workspace/debug80' } },
      { name: 'caverns80', uri: { fsPath: '/workspace/caverns80' } },
    ];

    const { WorkspaceSelectionController } = await import(
      '../../src/extension/workspace-selection'
    );
    const update = vi.fn();
    const platformViewProvider = {
      setSelectedWorkspace: vi.fn(),
      setHasProject: vi.fn(),
    };

    storedPath = '/workspace/caverns80';
    const controller = new WorkspaceSelectionController(
      {
        workspaceState: { get: vi.fn(() => storedPath), update },
      } as never,
      platformViewProvider as never
    );

    const folder = await controller.resolveWorkspaceFolder({ prompt: true });

    expect(folder?.uri.fsPath).toBe('/workspace/caverns80');
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('debug80.selectedWorkspace', '/workspace/caverns80');
  });

  it('prefers the only configured project folder when debugging', async () => {
    workspaceFolders = [
      { name: 'debug80', uri: { fsPath: '/workspace/debug80' } },
      { name: 'caverns80', uri: { fsPath: '/workspace/caverns80' } },
    ];
    existsSync.mockImplementation(
      (candidate: string) =>
        path.normalize(candidate) === path.normalize('/workspace/caverns80/.vscode/debug80.json')
    );

    const { WorkspaceSelectionController } = await import(
      '../../src/extension/workspace-selection'
    );
    const update = vi.fn();
    const platformViewProvider = {
      setSelectedWorkspace: vi.fn(),
      setHasProject: vi.fn(),
    };

    const controller = new WorkspaceSelectionController(
      {
        workspaceState: { get: vi.fn(() => storedPath), update },
      } as never,
      platformViewProvider as never
    );

    const folder = await controller.resolveWorkspaceFolder({ requireProject: true });

    expect(folder?.uri.fsPath).toBe('/workspace/caverns80');
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('debug80.selectedWorkspace', '/workspace/caverns80');
  });

  it('prompts when multiple project folders are configured', async () => {
    workspaceFolders = [
      { name: 'debug80', uri: { fsPath: '/workspace/debug80' } },
      { name: 'caverns80', uri: { fsPath: '/workspace/caverns80' } },
    ];
    existsSync.mockImplementation(
      (candidate: string) =>
        path.normalize(candidate) === path.normalize('/workspace/debug80/.vscode/debug80.json') ||
        path.normalize(candidate) === path.normalize('/workspace/caverns80/.vscode/debug80.json')
    );
    showQuickPick.mockResolvedValueOnce({
      label: 'caverns80',
      description: '/workspace/caverns80',
      folder: workspaceFolders[1],
    });

    const { WorkspaceSelectionController } = await import(
      '../../src/extension/workspace-selection'
    );
    const update = vi.fn();
    const platformViewProvider = {
      setSelectedWorkspace: vi.fn(),
      setHasProject: vi.fn(),
    };

    const controller = new WorkspaceSelectionController(
      {
        workspaceState: { get: vi.fn(() => storedPath), update },
      } as never,
      platformViewProvider as never
    );

    const folder = await controller.resolveWorkspaceFolder({
      prompt: true,
      requireProject: true,
      placeHolder: 'Select the Debug80 project folder to debug',
    });

    expect(folder?.uri.fsPath).toBe('/workspace/caverns80');
    expect(showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: 'debug80' }),
        expect.objectContaining({ label: 'caverns80' }),
      ]),
      expect.objectContaining({ placeHolder: 'Select the Debug80 project folder to debug' })
    );
    expect(update).toHaveBeenCalledWith('debug80.selectedWorkspace', '/workspace/caverns80');
  });
});