import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debug80ConfigurationProvider as Debug80ConfigurationProviderType } from '../../src/extension/debug-configuration-provider';

const cavernsProjectConfigPath = path.normalize('/workspace/caverns80/debug80.json');
const debug80ProjectConfigPath = path.normalize('/workspace/debug80/debug80.json');
const debug80WorkspaceFolder = { name: 'debug80', uri: { fsPath: '/workspace/debug80' } };
const cavernsWorkspaceFolder = { name: 'caverns80', uri: { fsPath: '/workspace/caverns80' } };

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

async function createProvider({
  rememberWorkspace = vi.fn(),
  resolveWorkspaceFolder = vi.fn(),
  resolveTarget = vi.fn(),
}: {
  rememberWorkspace?: ReturnType<typeof vi.fn>;
  resolveWorkspaceFolder?: ReturnType<typeof vi.fn>;
  resolveTarget?: ReturnType<typeof vi.fn>;
} = {}): Promise<Debug80ConfigurationProviderType> {
  const providerModule: typeof import('../../src/extension/debug-configuration-provider') =
    await import('../../src/extension/debug-configuration-provider');

  return new providerModule.Debug80ConfigurationProvider(
    {
      rememberWorkspace,
      resolveWorkspaceFolder,
    } as never,
    {
      resolveTarget,
    } as never
  );
}

describe('Debug80ConfigurationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceFolders = undefined;
  });

  it('injects projectConfig from the resolved project folder', async () => {
    existsSync.mockImplementation(
      (candidate: string) => path.normalize(candidate) === cavernsProjectConfigPath
    );

    const rememberWorkspace = vi.fn();
    const provider = await createProvider({
      rememberWorkspace,
      resolveWorkspaceFolder: vi.fn().mockResolvedValue(cavernsWorkspaceFolder),
    });

    const resolved = await provider.resolveDebugConfiguration(undefined, {});

    expect(resolved).toEqual(
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        name: 'Debug80: Current Project',
        projectConfig: cavernsProjectConfigPath,
      })
    );
    expect(rememberWorkspace).toHaveBeenCalledWith(expect.objectContaining(cavernsWorkspaceFolder));
  });

  it('offers project creation when no configured project exists', async () => {
    workspaceFolders = [debug80WorkspaceFolder];
    existsSync.mockImplementation(
      (candidate: string) => path.normalize(candidate) === debug80ProjectConfigPath
    );
    showInformationMessage.mockResolvedValueOnce('Create Project');
    executeCommand.mockResolvedValueOnce(true);

    const rememberWorkspace = vi.fn();
    const resolveWorkspaceFolder = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(debug80WorkspaceFolder);
    const provider = await createProvider({
      rememberWorkspace,
      resolveWorkspaceFolder,
    });

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
    const rememberWorkspace = vi.fn();
    const provider = await createProvider({ rememberWorkspace });

    const resolved = await provider.resolveDebugConfiguration(debug80WorkspaceFolder as never, {
      asm: 'src/main.asm',
      stopOnEntry: false,
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        asm: 'src/main.asm',
        stopOnEntry: false,
      })
    );
    expect(rememberWorkspace).toHaveBeenCalledWith(expect.objectContaining(debug80WorkspaceFolder));
  });

  it('injects the selected target after variable substitution', async () => {
    const rememberWorkspace = vi.fn();
    const resolveTarget = vi.fn().mockResolvedValue('serial');
    const provider = await createProvider({ rememberWorkspace, resolveTarget });

    const resolved = await provider.resolveDebugConfigurationWithSubstitutedVariables(
      debug80WorkspaceFolder as never,
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

  it('provides a generic current-project launch configuration', async () => {
    const provider = await createProvider();

    expect(provider.provideDebugConfigurations?.(undefined)).toEqual([
      expect.objectContaining({
        type: 'z80',
        request: 'launch',
        name: 'Debug80: Current Project',
      }),
    ]);
  });
});
