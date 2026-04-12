import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const projectConfigPath = path.normalize('/workspace/tec1g-mon3/.vscode/debug80.json');

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const registerCommand = vi.fn((name: string, callback: (...args: unknown[]) => unknown) => {
  registeredCommands.set(name, callback);
  return { dispose: vi.fn() };
});
const existsSync = vi.fn();
const readFileSync = vi.fn();
const showInformationMessage = vi.fn();
const showErrorMessage = vi.fn();
const startDebugging = vi.fn();
const stopDebugging = vi.fn();
const executeCommand = vi.fn();

vi.mock('fs', () => ({
  existsSync,
  readFileSync,
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand,
    executeCommand,
  },
  debug: {
    startDebugging,
    stopDebugging,
    activeDebugSession: undefined,
  },
  window: {
    showInformationMessage,
    showErrorMessage,
    showQuickPick: vi.fn(),
    showOpenDialog: vi.fn(),
    showInputBox: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ name: 'tec1g-mon3', uri: { fsPath: '/workspace/tec1g-mon3' }, index: 0 }],
    getWorkspaceFolder: vi.fn(),
    updateWorkspaceFolders: vi.fn(() => true),
  },
}));

describe('registerExtensionCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredCommands.clear();
    existsSync.mockImplementation(
      (candidate: string) => path.normalize(candidate) === projectConfigPath
    );
    readFileSync.mockReturnValue(
      JSON.stringify({
        targets: {
          app: { sourceFile: 'src/main.asm' },
          serial: { sourceFile: 'src/serial.asm' },
        },
      })
    );
  });

  it('starts debugging with the current project config instead of the selected launch config', async () => {
    const { registerExtensionCommands } = await import('../../src/extension/commands');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const rememberWorkspace = vi.fn();
    const platformViewProvider = { refreshIdleView: vi.fn() };

    registerExtensionCommands({
      context: { subscriptions: [] } as never,
      platformViewProvider: platformViewProvider as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace,
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {} as never,
    });

    const startDebug = registeredCommands.get('debug80.startDebug');
    expect(startDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    const result = await startDebug?.();

    expect(result).toBe(true);
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/tec1g-mon3' } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        name: 'Debug80: Current Project',
        projectConfig: projectConfigPath,
        stopOnEntry: false,
      })
    );
    expect(executeCommand).not.toHaveBeenCalledWith('workbench.action.debug.start');
  });

  it('forces a prompt when selecting the active target', async () => {
    const vscode = await import('vscode');
    const { registerExtensionCommands } = await import('../../src/extension/commands');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const resolveTarget = vi.fn().mockResolvedValue('serial');

    registerExtensionCommands({
      context: {
        subscriptions: [],
        workspaceState: { get: vi.fn(() => undefined), update: vi.fn() },
      } as never,
      platformViewProvider: { refreshIdleView: vi.fn() } as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {
        resolveTarget,
        rememberTarget: vi.fn(),
      } as never,
    });

    const selectTarget = registeredCommands.get('debug80.selectTarget');
    expect(selectTarget).toBeTypeOf('function');

    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = undefined;
    await selectTarget?.();

    expect(resolveTarget).toHaveBeenCalledWith(projectConfigPath, {
      prompt: true,
      forcePrompt: true,
      placeHolder: 'Select the active Debug80 target',
    });
  });

  it('selects a configured root without starting debugging', async () => {
    const { registerExtensionCommands } = await import('../../src/extension/commands');

    const folder = {
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    };
    const selectWorkspaceFolder = vi.fn().mockResolvedValue(folder);
    const rememberWorkspace = vi.fn();
    const refreshIdleView = vi.fn();

    registerExtensionCommands({
      context: { subscriptions: [] } as never,
      platformViewProvider: { refreshIdleView } as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace,
        selectWorkspaceFolder,
      } as never,
      targetSelection: {} as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    const result = await selectRoot?.();

    expect(result).toEqual(folder);
    expect(rememberWorkspace).toHaveBeenCalledWith(folder);
    expect(refreshIdleView).toHaveBeenCalled();
    expect(startDebugging).not.toHaveBeenCalled();
  });

  it('uses a direct root selection without prompting', async () => {
    const { registerExtensionCommands } = await import('../../src/extension/commands');

    const folder = {
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    };

    registerExtensionCommands({
      context: { subscriptions: [] } as never,
      platformViewProvider: { refreshIdleView: vi.fn() } as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceState: { get: vi.fn(() => undefined), update: vi.fn() },
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {} as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    const result = await selectRoot?.({ rootPath: folder.uri.fsPath });

    expect(result).toEqual(folder);
    expect(startDebugging).not.toHaveBeenCalled();
  });

  it('remembers a direct root selection even when no project config exists', async () => {
    const { registerExtensionCommands } = await import('../../src/extension/commands');
    const vscode = await import('vscode');

    const folder = {
      name: 'notes',
      uri: { fsPath: '/workspace/notes' },
      index: 0,
    };
    (vscode.workspace as { workspaceFolders?: Array<{ name: string; uri: { fsPath: string }; index: number }> }).workspaceFolders = [folder];
    const rememberWorkspace = vi.fn();

    registerExtensionCommands({
      context: { subscriptions: [] } as never,
      platformViewProvider: { refreshIdleView: vi.fn() } as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace,
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {} as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    const result = await selectRoot?.({ rootPath: folder.uri.fsPath });

    expect(result).toEqual(folder);
    expect(rememberWorkspace).toHaveBeenCalledWith(folder);
    expect(startDebugging).not.toHaveBeenCalled();
  });

  it('auto-restarts an active z80 session after changing target', async () => {
    const vscode = await import('vscode');
    const { registerExtensionCommands } = await import('../../src/extension/commands');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const resolveTarget = vi.fn().mockResolvedValue('glcd-maze');

    registerExtensionCommands({
      context: {
        subscriptions: [],
        workspaceState: { get: vi.fn(() => 'serial'), update: vi.fn() },
      } as never,
      platformViewProvider: { refreshIdleView: vi.fn() } as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {
        resolveTarget,
        rememberTarget: vi.fn(),
      } as never,
    });

    const selectTarget = registeredCommands.get('debug80.selectTarget');
    expect(selectTarget).toBeTypeOf('function');

    stopDebugging.mockResolvedValueOnce(undefined);
    startDebugging.mockResolvedValueOnce(true);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-2',
    };

    const result = await selectTarget?.();

    expect(result).toBe('glcd-maze');
    expect(stopDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'z80', id: 'session-2' })
    );
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/tec1g-mon3' } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: projectConfigPath,
        stopOnEntry: false,
      })
    );
  });

  it('uses a direct target selection without prompting', async () => {
    const { registerExtensionCommands } = await import('../../src/extension/commands');
    const vscode = await import('vscode');
    (vscode.workspace as { workspaceFolders?: Array<{ name: string; uri: { fsPath: string }; index: number }> }).workspaceFolders = [
      {
        name: 'tec1g-mon3',
        uri: { fsPath: '/workspace/tec1g-mon3' },
        index: 0,
      },
    ];

    registerExtensionCommands({
      context: {
        subscriptions: [],
        workspaceState: { get: vi.fn(() => undefined), update: vi.fn() },
      } as never,
      platformViewProvider: { refreshIdleView: vi.fn() } as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {
        resolveTarget: vi.fn(),
        rememberTarget: vi.fn(),
      } as never,
    });

    const selectTarget = registeredCommands.get('debug80.selectTarget');
    expect(selectTarget).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    const result = await selectTarget?.({
      rootPath: '/workspace/tec1g-mon3',
      targetName: 'serial',
    });

    expect(result).toBe('serial');
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/tec1g-mon3' } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: projectConfigPath,
        stopOnEntry: false,
      })
    );
  });

  it('restarts the active z80 session against the current project target', async () => {
    const vscode = await import('vscode');
    const { registerExtensionCommands } = await import('../../src/extension/commands');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });

    registerExtensionCommands({
      context: { subscriptions: [] } as never,
      platformViewProvider: { refreshIdleView: vi.fn() } as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {} as never,
    });

    const restartDebug = registeredCommands.get('debug80.restartDebug');
    expect(restartDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    stopDebugging.mockResolvedValueOnce(undefined);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-1',
    };

    const result = await restartDebug?.();

    expect(result).toBe(true);
    expect(stopDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'z80', id: 'session-1' })
    );
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/tec1g-mon3' } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: projectConfigPath,
        stopOnEntry: false,
      })
    );
  });
});
