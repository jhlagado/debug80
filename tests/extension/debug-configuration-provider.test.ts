import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cavernsProjectConfigPath = path.normalize('/workspace/caverns80/.vscode/debug80.json');
const debug80ProjectConfigPath = path.normalize('/workspace/debug80/.vscode/debug80.json');

const executeCommand = vi.fn();
const showInformationMessage = vi.fn();
const showErrorMessage = vi.fn();
const existsSync = vi.fn();

let workspaceFolders: Array<{ name: string; uri: { fsPath: string } }> | undefined;

vi.mock('fs', () => ({
  existsSync,
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand,
  },
  window: {
    showInformationMessage,
    showErrorMessage,
  },
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
  },
}));

describe('Debug80ConfigurationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceFolders = undefined;
  });

  it('injects projectConfig from the resolved project folder', async () => {
    const { Debug80ConfigurationProvider } = await import(
      '../../src/extension/debug-configuration-provider'
    );

    existsSync.mockImplementation(
      (candidate: string) => path.normalize(candidate) === cavernsProjectConfigPath
    );

    const rememberWorkspace = vi.fn();
    const provider = new Debug80ConfigurationProvider({
      rememberWorkspace,
      resolveWorkspaceFolder: vi.fn().mockResolvedValue({
        name: 'caverns80',
        uri: { fsPath: '/workspace/caverns80' },
      }),
    } as never, {
      resolveTarget: vi.fn(),
    } as never);

    const resolved = await provider.resolveDebugConfiguration(undefined, {});

    expect(resolved).toEqual(
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        name: 'Debug Z80 (current project)',
        projectConfig: cavernsProjectConfigPath,
        stopOnEntry: true,
      })
    );
    expect(rememberWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/caverns80' } })
    );
  });

  it('offers project creation when no configured project exists', async () => {
    const { Debug80ConfigurationProvider } = await import(
      '../../src/extension/debug-configuration-provider'
    );

    workspaceFolders = [{ name: 'debug80', uri: { fsPath: '/workspace/debug80' } }];
    existsSync.mockImplementation(
      (candidate: string) => path.normalize(candidate) === debug80ProjectConfigPath
    );
    showInformationMessage.mockResolvedValueOnce('Create Project');
    executeCommand.mockResolvedValueOnce(true);

    const rememberWorkspace = vi.fn();
    const resolveWorkspaceFolder = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        name: 'debug80',
        uri: { fsPath: '/workspace/debug80' },
      });
    const provider = new Debug80ConfigurationProvider({
      rememberWorkspace,
      resolveWorkspaceFolder,
    } as never, {
      resolveTarget: vi.fn(),
    } as never);

    const resolved = await provider.resolveDebugConfiguration(undefined, {});

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Debug80: No configured Debug80 project found. Create one now?',
      'Create Project'
    );
    expect(executeCommand).toHaveBeenCalledWith('debug80.createProject');
    expect(resolved).toEqual(
      expect.objectContaining({
        projectConfig: debug80ProjectConfigPath,
      })
    );
  });

  it('leaves explicit launch inputs alone', async () => {
    const { Debug80ConfigurationProvider } = await import(
      '../../src/extension/debug-configuration-provider'
    );

    const rememberWorkspace = vi.fn();
    const provider = new Debug80ConfigurationProvider({
      rememberWorkspace,
      resolveWorkspaceFolder: vi.fn(),
    } as never, {
      resolveTarget: vi.fn(),
    } as never);

    const resolved = await provider.resolveDebugConfiguration(
      { name: 'debug80', uri: { fsPath: '/workspace/debug80' } } as never,
      { asm: 'src/main.asm', stopOnEntry: false }
    );

    expect(resolved).toEqual(
      expect.objectContaining({
        asm: 'src/main.asm',
        stopOnEntry: false,
      })
    );
    expect(rememberWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/debug80' } })
    );
  });

  it('injects the selected target after variable substitution', async () => {
    const { Debug80ConfigurationProvider } = await import(
      '../../src/extension/debug-configuration-provider'
    );

    const rememberWorkspace = vi.fn();
    const resolveTarget = vi.fn().mockResolvedValue('serial');
    const provider = new Debug80ConfigurationProvider(
      {
        rememberWorkspace,
        resolveWorkspaceFolder: vi.fn(),
      } as never,
      {
        resolveTarget,
      } as never
    );

    const resolved = await provider.resolveDebugConfigurationWithSubstitutedVariables(
      { name: 'debug80', uri: { fsPath: '/workspace/debug80' } } as never,
      { projectConfig: debug80ProjectConfigPath }
    );

    expect(resolveTarget).toHaveBeenCalledWith(debug80ProjectConfigPath, {
      prompt: true,
      placeHolder: 'Select the Debug80 target to debug',
    });
    expect(resolved).toEqual(
      expect.objectContaining({
        projectConfig: debug80ProjectConfigPath,
        target: 'serial',
      })
    );
  });
});