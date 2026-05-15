import path from 'path';
import type { registerExtensionCommands as registerExtensionCommandsType } from '../../src/extension/commands';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const projectConfigPath = path.normalize('/workspace/tec1g-mon3/debug80.json');

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const registerCommand = vi.fn((name: string, callback: (...args: unknown[]) => unknown) => {
  registeredCommands.set(name, callback);
  return { dispose: vi.fn() };
});
const existsSync = vi.fn();
const readFileSync = vi.fn();
const writeFileSync = vi.fn();
const showInformationMessage = vi.fn();
const showErrorMessage = vi.fn();
const createWebviewPanel = vi.fn();
const startDebugging = vi.fn();
const stopDebugging = vi.fn();
const executeCommand = vi.fn();
const scaffoldProject = vi.fn();
const materializeBundledAsset = vi.fn();
const materializeBundledRom = vi.fn();
let workspaceFolders: Array<{ name: string; uri: { fsPath: string } }> | undefined;
let panelMessageHandler: ((msg: unknown) => void) | undefined;
let panelHtml = '';

vi.mock('fs', () => ({
  existsSync,
  readFileSync,
  writeFileSync,
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
    createWebviewPanel,
  },
  ViewColumn: {
    Active: 1,
  },
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
    getWorkspaceFolder: vi.fn(),
    updateWorkspaceFolders: vi.fn(() => true),
  },
}));

vi.mock('../../src/extension/project-scaffolding', () => ({
  scaffoldProject,
}));

vi.mock('../../src/extension/bundle-materialize', () => ({
  BUNDLED_MON1B_V1_REL: 'tec1/mon1b/v1',
  BUNDLED_MON3_V1_REL: 'tec1g/mon3/v1',
  materializeBundledAsset,
  materializeBundledRom,
}));

type ExtensionCommandOptions = Parameters<typeof registerExtensionCommandsType>[0];
type ExtensionCommandOverrides = Partial<
  Omit<
    ExtensionCommandOptions,
    'context' | 'platformViewProvider' | 'workspaceSelection' | 'targetSelection'
  >
> & {
  context?: Record<string, unknown>;
  platformViewProvider?: Record<string, unknown>;
  workspaceSelection?: Record<string, unknown>;
  targetSelection?: Record<string, unknown>;
};

describe('registerExtensionCommands', () => {
  const registerCommands = async (overrides: ExtensionCommandOverrides = {}) => {
    const { registerExtensionCommands } = await import('../../src/extension/commands');
    const { context, platformViewProvider, workspaceSelection, targetSelection, ...rest } =
      overrides;

    registerExtensionCommands({
      ...rest,
      context: { subscriptions: [], ...context } as never,
      platformViewProvider: {
        refreshIdleView: vi.fn(),
        ...platformViewProvider,
      } as never,
      sourceColumns: {} as never,
      terminalPanel: {} as never,
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
        ...workspaceSelection,
      } as never,
      targetSelection: {
        ...targetSelection,
      } as never,
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    registeredCommands.clear();
    workspaceFolders = [{ name: 'tec1g-mon3', uri: { fsPath: '/workspace/tec1g-mon3' }, index: 0 }];
    existsSync.mockImplementation((candidate: string) => {
      const n = path.normalize(candidate);
      if (n === projectConfigPath) {
        return true;
      }
      if (/\.(asm|zax)$/i.test(n)) {
        return true;
      }
      return false;
    });
    readFileSync.mockReturnValue(
      JSON.stringify({
        targets: {
          app: { sourceFile: 'src/main.asm' },
          serial: { sourceFile: 'src/serial.asm' },
        },
      })
    );
    panelMessageHandler = undefined;
    panelHtml = '';
    const vscode = await import('vscode');
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = undefined;
    createWebviewPanel.mockImplementation(() => {
      const webview = {
        cspSource: 'vscode-webview:',
        get html() {
          return panelHtml;
        },
        set html(value: string) {
          panelHtml = value;
        },
        onDidReceiveMessage: vi.fn((handler: (msg: unknown) => void) => {
          panelMessageHandler = handler;
          return { dispose: vi.fn() };
        }),
      };
      return {
        webview,
        onDidDispose: vi.fn((handler: () => void) => {
          void handler;
          return { dispose: vi.fn() };
        }),
      };
    });
  });

  it('starts debugging with the current project config instead of the selected launch config', async () => {
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const rememberWorkspace = vi.fn();
    const platformViewProvider = { refreshIdleView: vi.fn() };

    await registerCommands({
      platformViewProvider: platformViewProvider as never,
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace,
        selectWorkspaceFolder: vi.fn(),
      } as never,
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
      })
    );
    expect(executeCommand).not.toHaveBeenCalledWith('workbench.action.debug.start');
  }, 15000);

  it('starts debugging directly from a provided rootPath', async () => {
    const rememberWorkspace = vi.fn();
    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace,
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const startDebug = registeredCommands.get('debug80.startDebug');
    expect(startDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    const result = await startDebug?.({ rootPath: '/workspace/tec1g-mon3' });

    expect(result).toBe(true);
    expect(rememberWorkspace).toHaveBeenCalled();
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/tec1g-mon3' } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        name: 'Debug80: Current Project',
        projectConfig: projectConfigPath,
      })
    );
  });

  it('prompts for a configured project when a provided debug root is not a project', async () => {
    workspaceFolders = [
      { name: 'empty-root', uri: { fsPath: '/workspace/empty-root' }, index: 0 },
      { name: 'tec1g-mon3', uri: { fsPath: '/workspace/tec1g-mon3' }, index: 1 },
    ];
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue(workspaceFolders[1]);
    existsSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      return normalized === projectConfigPath || /\.(asm|zax)$/i.test(normalized);
    });

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const startDebug = registeredCommands.get('debug80.startDebug');
    expect(startDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    const result = await startDebug?.({ rootPath: '/workspace/empty-root' });

    expect(result).toBe(true);
    expect(resolveWorkspaceFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: true,
        requireProject: true,
        placeHolder: 'Select the Debug80 project folder to debug',
      })
    );
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/tec1g-mon3' } }),
      expect.objectContaining({ projectConfig: projectConfigPath })
    );
  });

  it('creates a project directly in an already-open empty workspace root', async () => {
    workspaceFolders = [{ name: 'empty-root', uri: { fsPath: '/workspace/empty-root' }, index: 0 }];
    const folder = {
      name: 'empty-root',
      uri: { fsPath: '/workspace/empty-root' },
      index: 0,
    };
    const rememberWorkspace = vi.fn();
    const refreshIdleView = vi.fn();
    const reveal = vi.fn();

    await registerCommands({
      platformViewProvider: { refreshIdleView, reveal } as never,
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace,
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const createProject = registeredCommands.get('debug80.createProject');
    expect(createProject).toBeTypeOf('function');

    scaffoldProject.mockResolvedValueOnce(true);
    const result = await createProject?.({ rootPath: folder.uri.fsPath, platform: 'tec1g' });

    expect(result).toBe(true);
    expect(rememberWorkspace).toHaveBeenCalledWith(folder);
    expect(refreshIdleView).toHaveBeenCalled();
    expect(reveal).toHaveBeenCalledWith(false);
    expect(scaffoldProject).toHaveBeenCalledWith(folder, false, undefined, 'tec1g');
  });

  it('reveals the Debug80 view through the dedicated command', async () => {
    const reveal = vi.fn();
    await registerCommands({
      platformViewProvider: { refreshIdleView: vi.fn(), reveal } as never,
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const openDebug80View = registeredCommands.get('debug80.openDebug80View');
    expect(openDebug80View).toBeTypeOf('function');

    const result = await openDebug80View?.();

    expect(result).toBe(true);
    expect(reveal).toHaveBeenCalledWith(true);
  });

  it('materializes manifest-backed bundled asset references from the project config', async () => {
    const vscode = await import('vscode');

    const folder = {
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    };
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue(folder);
    const showQuickPickMock = vscode.window.showQuickPick as ReturnType<typeof vi.fn>;
    showQuickPickMock.mockResolvedValueOnce({
      label: 'Skip existing files',
      value: false,
    });

    readFileSync.mockImplementationOnce(() =>
      JSON.stringify({
        defaultProfile: 'mon3',
        profiles: {
          mon3: {
            bundledAssets: {
              romHex: {
                bundleId: 'tec1g/mon3/v1',
                path: 'mon3.bin',
                destination: 'roms/tec1g/mon3/mon3.bin',
              },
              listing: {
                bundleId: 'tec1g/mon3/v1',
                path: 'mon3.lst',
                destination: 'roms/tec1g/mon3/mon3.lst',
              },
            },
          },
        },
        targets: {
          app: { sourceFile: 'src/main.asm', profile: 'mon3' },
        },
      })
    );
    materializeBundledAsset.mockImplementation(
      (_extensionUri: unknown, _workspaceRoot: string, reference: { destination?: string }) => ({
        ok: true,
        destinationRelative: reference.destination ?? 'roms/tec1g/mon3',
        materializedRelativePath: reference.destination ?? 'roms/tec1g/mon3',
      })
    );

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const materializeBundledRomCommand = registeredCommands.get('debug80.materializeBundledRom');
    expect(materializeBundledRomCommand).toBeTypeOf('function');

    const result = await materializeBundledRomCommand?.();

    expect(result).toBe(true);
    expect(materializeBundledAsset).toHaveBeenCalledTimes(2);
    expect(materializeBundledAsset).toHaveBeenNthCalledWith(
      1,
      undefined,
      '/workspace/tec1g-mon3',
      expect.objectContaining({
        bundleId: 'tec1g/mon3/v1',
        path: 'mon3.bin',
        destination: 'roms/tec1g/mon3/mon3.bin',
      }),
      { overwrite: false }
    );
    expect(materializeBundledAsset).toHaveBeenNthCalledWith(
      2,
      undefined,
      '/workspace/tec1g-mon3',
      expect.objectContaining({
        bundleId: 'tec1g/mon3/v1',
        path: 'mon3.lst',
        destination: 'roms/tec1g/mon3/mon3.lst',
      }),
      { overwrite: false }
    );
    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Installed bundled assets for profile:mon3')
    );
  });

  it('forces a prompt when selecting the active target', async () => {
    const vscode = await import('vscode');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const resolveTarget = vi.fn().mockResolvedValue('serial');

    await registerCommands({
      context: {
        subscriptions: [],
        workspaceState: { get: vi.fn(() => undefined), update: vi.fn() },
      } as never,
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
    const folder = {
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    };
    const selectWorkspaceFolder = vi.fn().mockResolvedValue(folder);
    const rememberWorkspace = vi.fn();
    const refreshIdleView = vi.fn();
    const reveal = vi.fn();

    await registerCommands({
      platformViewProvider: { refreshIdleView, reveal } as never,
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace,
        selectWorkspaceFolder,
      } as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    const result = await selectRoot?.();

    expect(result).toEqual(folder);
    expect(rememberWorkspace).toHaveBeenCalledWith(folder);
    expect(refreshIdleView).toHaveBeenCalled();
    expect(reveal).toHaveBeenCalledWith(false);
    expect(startDebugging).not.toHaveBeenCalled();
  });

  it('uses a direct root selection without prompting', async () => {
    const folder = {
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    };

    const refreshIdleView = vi.fn();
    const reveal = vi.fn();
    await registerCommands({
      platformViewProvider: { refreshIdleView, reveal } as never,
      workspaceState: { get: vi.fn(() => undefined), update: vi.fn() },
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    const result = await selectRoot?.({ rootPath: folder.uri.fsPath });

    expect(result).toEqual(folder);
    expect(refreshIdleView).toHaveBeenCalled();
    expect(reveal).toHaveBeenCalledWith(false);
    expect(startDebugging).not.toHaveBeenCalled();
  });

  it('restarts active z80 session when selected root changes platform', async () => {
    const vscode = await import('vscode');

    const oldRoot = '/workspace/tec1g-mon3';
    const newRoot = '/workspace/tec1-mon1';
    const oldConfigPath = path.normalize(`${oldRoot}/debug80.json`);
    const newConfigPath = path.normalize(`${newRoot}/debug80.json`);
    workspaceFolders = [
      { name: 'tec1g-mon3', uri: { fsPath: oldRoot }, index: 0 },
      { name: 'tec1-mon1', uri: { fsPath: newRoot }, index: 1 },
    ];
    existsSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      return normalized === oldConfigPath || normalized === newConfigPath;
    });
    readFileSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      if (normalized === oldConfigPath) {
        return JSON.stringify({
          projectPlatform: 'tec1g',
          targets: { app: { sourceFile: 'src/main.asm' } },
        });
      }
      if (normalized === newConfigPath) {
        return JSON.stringify({
          projectPlatform: 'tec1',
          targets: { app: { sourceFile: 'src/main.asm' } },
        });
      }
      return JSON.stringify({ targets: {} });
    });

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    stopDebugging.mockResolvedValueOnce(undefined);
    startDebugging.mockResolvedValueOnce(true);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-switch',
      configuration: { projectConfig: oldConfigPath },
      workspaceFolder: { uri: { fsPath: oldRoot } },
    };

    const result = await selectRoot?.({ rootPath: newRoot });

    expect(result).toEqual(expect.objectContaining({ uri: { fsPath: newRoot } }));
    expect(stopDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'z80', id: 'session-switch' })
    );
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: newRoot } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: newConfigPath,
      })
    );
  });

  it('restarts an active z80 session when selected root changes project but keeps the same platform', async () => {
    const vscode = await import('vscode');

    const rootA = '/workspace/tec1-mon1';
    const rootB = '/workspace/tec1-mon2';
    const configAPath = path.normalize(`${rootA}/debug80.json`);
    const configBPath = path.normalize(`${rootB}/debug80.json`);
    workspaceFolders = [
      { name: 'tec1-mon1', uri: { fsPath: rootA }, index: 0 },
      { name: 'tec1-mon2', uri: { fsPath: rootB }, index: 1 },
    ];
    existsSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      return normalized === configAPath || normalized === configBPath;
    });
    readFileSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      if (normalized === configAPath || normalized === configBPath) {
        return JSON.stringify({
          projectPlatform: 'tec1',
          targets: {
            app: { sourceFile: 'src/main.asm' },
            serial: { sourceFile: 'src/serial.asm' },
          },
        });
      }
      return JSON.stringify({ targets: {} });
    });

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    stopDebugging.mockResolvedValueOnce(undefined);
    startDebugging.mockResolvedValueOnce(true);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-root-change',
      configuration: { projectConfig: configAPath },
      workspaceFolder: { uri: { fsPath: rootA } },
    };

    const result = await selectRoot?.({ rootPath: rootB });

    expect(result).toEqual(expect.objectContaining({ uri: { fsPath: rootB } }));
    expect(stopDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'z80', id: 'session-root-change' })
    );
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: rootB } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: configBPath,
      })
    );
  });

  it('auto-starts when a selected root exposes exactly one target', async () => {
    readFileSync.mockReturnValueOnce(
      JSON.stringify({
        targets: {
          matrix: { sourceFile: 'src/matrix.zax' },
        },
      })
    );

    const folder = {
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    };
    const rememberWorkspace = vi.fn();
    const rememberTarget = vi.fn();

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace,
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {
        rememberTarget,
      } as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    const result = await selectRoot?.({ rootPath: folder.uri.fsPath });

    expect(result).toEqual(folder);
    expect(rememberWorkspace).toHaveBeenCalledWith(folder);
    expect(rememberTarget).toHaveBeenCalledWith(projectConfigPath, 'matrix');
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/tec1g-mon3' } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: projectConfigPath,
      })
    );
  });

  it('remembers a direct root selection even when no project config exists', async () => {
    const folder = {
      name: 'notes',
      uri: { fsPath: '/workspace/notes' },
      index: 0,
    };
    workspaceFolders = [folder];
    const rememberWorkspace = vi.fn();

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder: vi.fn(),
        rememberWorkspace,
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const selectRoot = registeredCommands.get('debug80.selectWorkspaceFolder');
    expect(selectRoot).toBeTypeOf('function');

    const result = await selectRoot?.({ rootPath: folder.uri.fsPath });

    expect(result).toEqual(folder);
    expect(rememberWorkspace).toHaveBeenCalledWith(folder);
    expect(startDebugging).not.toHaveBeenCalled();
  });

  it('keeps target changes pending while an active z80 session continues running', async () => {
    const vscode = await import('vscode');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const resolveTarget = vi.fn().mockResolvedValue('glcd-maze');

    await registerCommands({
      context: {
        subscriptions: [],
        workspaceState: { get: vi.fn(() => 'serial'), update: vi.fn() },
      } as never,
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

    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-2',
    };

    const result = await selectTarget?.();

    expect(result).toBe('glcd-maze');
    expect(stopDebugging).not.toHaveBeenCalled();
    expect(startDebugging).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Debug80: Selected target glcd-maze. Press Restart to apply it to the current session.'
    );
  });

  it('keeps target changes pending when no debug session is running', async () => {
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const resolveTarget = vi.fn().mockResolvedValue('serial');
    const rememberTarget = vi.fn();

    await registerCommands({
      context: {
        subscriptions: [],
        workspaceState: { get: vi.fn(() => 'app'), update: vi.fn() },
      } as never,
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: {
        resolveTarget,
        rememberTarget,
      } as never,
    });

    const selectTarget = registeredCommands.get('debug80.selectTarget');
    expect(selectTarget).toBeTypeOf('function');

    const result = await selectTarget?.();

    expect(result).toBe('serial');
    expect(rememberTarget).toHaveBeenCalledWith(projectConfigPath, 'serial');
    expect(startDebugging).not.toHaveBeenCalled();
    expect(stopDebugging).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith('Debug80: Selected target serial.');
  });

  it('uses a direct target selection without prompting', async () => {
    workspaceFolders = [
      {
        name: 'tec1g-mon3',
        uri: { fsPath: '/workspace/tec1g-mon3' },
        index: 0,
      },
    ];

    await registerCommands({
      context: {
        subscriptions: [],
        workspaceState: { get: vi.fn(() => undefined), update: vi.fn() },
      } as never,
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

    const result = await selectTarget?.({
      rootPath: '/workspace/tec1g-mon3',
      targetName: 'serial',
    });

    expect(result).toBe('serial');
  });

  it('reports an explicit target root that is not open without prompting', async () => {
    const resolveWorkspaceFolder = vi.fn();

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
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

    const result = await selectTarget?.({ rootPath: '/workspace/missing' });

    expect(result).toBeUndefined();
    expect(resolveWorkspaceFolder).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Debug80: The workspace root /workspace/missing is not open in this window.'
    );
  });

  it('configures target platform through debug80.configureProject', async () => {
    const vscode = await import('vscode');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const resolveTarget = vi.fn().mockResolvedValue('app');
    readFileSync.mockReturnValueOnce(
      JSON.stringify({
        targets: {
          app: { sourceFile: 'src/main.asm', platform: 'simple' },
        },
      })
    );
    const showQuickPickMock = vscode.window.showQuickPick as ReturnType<typeof vi.fn>;
    showQuickPickMock.mockResolvedValueOnce({
      label: 'Target Platform Override',
      value: 'targetPlatformOverride',
    });
    showQuickPickMock.mockResolvedValueOnce({ label: 'tec1g' });

    await registerCommands({
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

    const configureProject = registeredCommands.get('debug80.configureProject');
    expect(configureProject).toBeTypeOf('function');

    const result = await configureProject?.();

    expect(result).toBe('app');
    expect(writeFileSync).toHaveBeenCalled();
    const serialized = String(writeFileSync.mock.calls.at(-1)?.[1] ?? '');
    expect(serialized).toContain('"projectPlatform": "tec1g"');
    expect(serialized).toContain('"platform": "tec1g"');
  });

  it('does not overwrite projectPlatform when editing one target in multi-target config', async () => {
    const vscode = await import('vscode');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const resolveTarget = vi.fn().mockResolvedValue('app');
    readFileSync.mockReturnValueOnce(
      JSON.stringify({
        projectVersion: 1,
        projectPlatform: 'tec1',
        targets: {
          app: { sourceFile: 'src/main.asm', platform: 'simple' },
          other: { sourceFile: 'src/other.asm', platform: 'tec1g' },
        },
      })
    );
    const showQuickPickMock = vscode.window.showQuickPick as ReturnType<typeof vi.fn>;
    showQuickPickMock.mockResolvedValueOnce({
      label: 'Target Platform Override',
      value: 'targetPlatformOverride',
    });
    showQuickPickMock.mockResolvedValueOnce({ label: 'tec1g' });

    await registerCommands({
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

    const configureProject = registeredCommands.get('debug80.configureProject');
    expect(configureProject).toBeTypeOf('function');

    await configureProject?.();

    expect(writeFileSync).toHaveBeenCalled();
    const serialized = String(writeFileSync.mock.calls.at(-1)?.[1] ?? '');
    expect(serialized).toContain('"projectPlatform": "tec1"');
    expect(serialized).toContain('"app"');
    expect(serialized).toContain('"platform": "tec1g"');
  });

  it('renames target and updates target alias when config.target points to old name', async () => {
    const vscode = await import('vscode');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    const resolveTarget = vi.fn().mockResolvedValue('app');
    readFileSync.mockReturnValueOnce(
      JSON.stringify({
        target: 'app',
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/main.asm', platform: 'simple' },
        },
      })
    );
    const showQuickPickMock = vscode.window.showQuickPick as ReturnType<typeof vi.fn>;
    showQuickPickMock.mockResolvedValueOnce({ label: 'Target Name', value: 'targetName' });
    const showInputBoxMock = vscode.window.showInputBox as ReturnType<typeof vi.fn>;
    showInputBoxMock.mockResolvedValueOnce('renamed');

    await registerCommands({
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

    const configureProject = registeredCommands.get('debug80.configureProject');
    expect(configureProject).toBeTypeOf('function');

    const result = await configureProject?.();

    expect(result).toBe('renamed');
    expect(writeFileSync).toHaveBeenCalled();
    const serialized = String(writeFileSync.mock.calls.at(-1)?.[1] ?? '');
    expect(serialized).toContain('"target": "renamed"');
    expect(serialized).toContain('"defaultTarget": "renamed"');
    expect(serialized).toContain('"renamed"');
  });

  it('renders project config panel with manifest-selected defaults and CSP nonce', async () => {
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });
    readFileSync.mockReturnValueOnce(
      JSON.stringify({
        projectPlatform: 'tec1g',
        defaultTarget: 'serial',
        targets: {
          app: { sourceFile: 'src/main.asm', platform: 'tec1g' },
          serial: { sourceFile: 'src/serial.asm', platform: 'tec1g' },
        },
      })
    );

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: { resolveTarget: vi.fn(), rememberTarget: vi.fn() } as never,
    });

    const openPanel = registeredCommands.get('debug80.openProjectConfigPanel');
    expect(openPanel).toBeTypeOf('function');

    await openPanel?.();

    expect(createWebviewPanel).toHaveBeenCalled();
    expect(panelHtml).toContain('Content-Security-Policy');
    expect(panelHtml).toContain("script-src 'nonce-");
    expect(panelHtml).toContain('<option value="tec1g" selected>');
    expect(panelHtml).toContain('<option value="serial" selected>');
  });

  it('rejects invalid save payload in project config panel', async () => {
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: { resolveTarget: vi.fn(), rememberTarget: vi.fn() } as never,
    });

    const openPanel = registeredCommands.get('debug80.openProjectConfigPanel');
    expect(openPanel).toBeTypeOf('function');
    await openPanel?.();

    panelMessageHandler?.({
      type: 'saveProjectConfig',
      platform: 'bad-platform',
      defaultTarget: 'app',
    });

    expect(showErrorMessage).toHaveBeenCalledWith('Debug80: Invalid project configuration values.');
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('saves project config panel updates and refreshes idle view', async () => {
    const refreshIdleView = vi.fn();
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });

    await registerCommands({
      platformViewProvider: { refreshIdleView } as never,
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
      targetSelection: { resolveTarget: vi.fn(), rememberTarget: vi.fn() } as never,
    });

    const openPanel = registeredCommands.get('debug80.openProjectConfigPanel');
    expect(openPanel).toBeTypeOf('function');
    await openPanel?.();

    panelMessageHandler?.({
      type: 'saveProjectConfig',
      platform: 'tec1g',
      defaultTarget: 'serial',
    });

    expect(writeFileSync).toHaveBeenCalled();
    const serialized = String(writeFileSync.mock.calls.at(-1)?.[1] ?? '');
    expect(serialized).toContain('"projectPlatform": "tec1g"');
    expect(serialized).toContain('"defaultTarget": "serial"');
    expect(serialized).toContain('"target": "serial"');
    expect(refreshIdleView).toHaveBeenCalled();
  });

  it('restarts the active z80 session against the current project target', async () => {
    const vscode = await import('vscode');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
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
      })
    );
  });

  it('restarts the active z80 session from its session project without prompting for a project', async () => {
    const vscode = await import('vscode');

    const tetroRoot = '/workspace/tetro';
    const otherRoot = '/workspace/other';
    const tetroConfigPath = path.normalize(`${tetroRoot}/debug80.json`);
    workspaceFolders = [
      { name: 'other', uri: { fsPath: otherRoot }, index: 0 },
      { name: 'tetro', uri: { fsPath: tetroRoot }, index: 1 },
    ];
    existsSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      return (
        normalized === tetroConfigPath ||
        normalized === path.normalize(`${otherRoot}/debug80.json`) ||
        /\.(asm|zax)$/i.test(normalized)
      );
    });
    const resolveWorkspaceFolder = vi.fn();

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const restartDebug = registeredCommands.get('debug80.restartDebug');
    expect(restartDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    stopDebugging.mockResolvedValueOnce(undefined);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-tetro',
      configuration: { projectConfig: tetroConfigPath },
      workspaceFolder: { uri: { fsPath: tetroRoot } },
    };

    const result = await restartDebug?.();

    expect(result).toBe(true);
    expect(resolveWorkspaceFolder).not.toHaveBeenCalled();
    expect(stopDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'z80', id: 'session-tetro' })
    );
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: tetroRoot } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: tetroConfigPath,
      })
    );
  });

  it('recovers the restart project from open workspace folders when the active session folder is wrong', async () => {
    const vscode = await import('vscode');

    const staleRoot = '/workspace/stale';
    const tetroRoot = '/workspace/tetro';
    const tetroConfigPath = path.normalize(`${tetroRoot}/debug80.json`);
    workspaceFolders = [
      { name: 'stale', uri: { fsPath: staleRoot }, index: 0 },
      { name: 'tetro', uri: { fsPath: tetroRoot }, index: 1 },
    ];
    existsSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      return (
        normalized === tetroConfigPath ||
        normalized === path.normalize(`${staleRoot}/debug80.json`) ||
        /\.(asm|zax)$/i.test(normalized)
      );
    });
    const resolveWorkspaceFolder = vi.fn();

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const restartDebug = registeredCommands.get('debug80.restartDebug');
    expect(restartDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    stopDebugging.mockResolvedValueOnce(undefined);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-stale-folder',
      configuration: { projectConfig: tetroConfigPath },
      workspaceFolder: { uri: { fsPath: staleRoot } },
    };

    const result = await restartDebug?.();

    expect(result).toBe(true);
    expect(resolveWorkspaceFolder).not.toHaveBeenCalled();
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: tetroRoot } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: tetroConfigPath,
      })
    );
  });

  it('prompts on restart when an active z80 session has no project config and its folder is not a project', async () => {
    const vscode = await import('vscode');

    const artifactRoot = '/workspace/artifacts-only';
    const projectRoot = '/workspace/tetro';
    const projectConfig = path.normalize(`${projectRoot}/debug80.json`);
    workspaceFolders = [
      { name: 'artifacts-only', uri: { fsPath: artifactRoot }, index: 0 },
      { name: 'tetro', uri: { fsPath: projectRoot }, index: 1 },
    ];
    existsSync.mockImplementation(
      (candidate: string) => path.normalize(candidate) === projectConfig
    );
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue(workspaceFolders[1]);

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const restartDebug = registeredCommands.get('debug80.restartDebug');
    expect(restartDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    stopDebugging.mockResolvedValueOnce(undefined);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-no-project-config',
      configuration: { asm: 'standalone.asm' },
      workspaceFolder: { uri: { fsPath: artifactRoot } },
    };

    const result = await restartDebug?.();

    expect(result).toBe(true);
    expect(resolveWorkspaceFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: true,
        requireProject: true,
      })
    );
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: projectRoot } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig,
      })
    );
  });

  it('prompts on restart when an active z80 session folder has an invalid project config', async () => {
    const vscode = await import('vscode');

    const staleRoot = '/workspace/stale';
    const projectRoot = '/workspace/tetro';
    const staleConfig = path.normalize(`${staleRoot}/debug80.json`);
    const projectConfig = path.normalize(`${projectRoot}/debug80.json`);
    workspaceFolders = [
      { name: 'stale', uri: { fsPath: staleRoot }, index: 0 },
      { name: 'tetro', uri: { fsPath: projectRoot }, index: 1 },
    ];
    existsSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      return normalized === staleConfig || normalized === projectConfig;
    });
    readFileSync.mockImplementation((candidate: string) => {
      const normalized = path.normalize(candidate);
      if (normalized === staleConfig) {
        return JSON.stringify({ targets: {} });
      }
      if (normalized === projectConfig) {
        return JSON.stringify({ targets: { tetro: { sourceFile: 'src/tetro.asm' } } });
      }
      return JSON.stringify({ targets: {} });
    });
    const resolveWorkspaceFolder = vi.fn().mockResolvedValue(workspaceFolders[1]);

    await registerCommands({
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const restartDebug = registeredCommands.get('debug80.restartDebug');
    expect(restartDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    stopDebugging.mockResolvedValueOnce(undefined);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-invalid-config',
      configuration: { asm: 'standalone.asm' },
      workspaceFolder: { uri: { fsPath: staleRoot } },
    };

    const result = await restartDebug?.();

    expect(result).toBe(true);
    expect(resolveWorkspaceFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: true,
        requireProject: true,
      })
    );
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: projectRoot } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig,
      })
    );
  });

  it('restarts with the current stop-on-entry state', async () => {
    const vscode = await import('vscode');

    const resolveWorkspaceFolder = vi.fn().mockResolvedValue({
      name: 'tec1g-mon3',
      uri: { fsPath: '/workspace/tec1g-mon3' },
      index: 0,
    });

    await registerCommands({
      platformViewProvider: { refreshIdleView: vi.fn(), stopOnEntry: true } as never,
      workspaceSelection: {
        resolveWorkspaceFolder,
        rememberWorkspace: vi.fn(),
        selectWorkspaceFolder: vi.fn(),
      } as never,
    });

    const restartDebug = registeredCommands.get('debug80.restartDebug');
    expect(restartDebug).toBeTypeOf('function');

    startDebugging.mockResolvedValueOnce(true);
    stopDebugging.mockResolvedValueOnce(undefined);
    (vscode.debug as { activeDebugSession?: unknown }).activeDebugSession = {
      type: 'z80',
      id: 'session-stop-on-entry',
    };

    const result = await restartDebug?.();

    expect(result).toBe(true);
    expect(startDebugging).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/tec1g-mon3' } }),
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        projectConfig: projectConfigPath,
        stopOnEntry: true,
      })
    );
  });
});
