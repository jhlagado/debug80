import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFileSync = vi.fn();
const existsSync = vi.fn();
const readdirSync = vi.fn(() => []);
const showQuickPick = vi.fn();

vi.mock('fs', () => ({
  readFileSync,
  existsSync,
  readdirSync,
}));

vi.mock('vscode', () => ({
  QuickPickItemKind: {
    Separator: -1,
    Default: 0,
  },
  window: {
    showQuickPick,
  },
}));

describe('ProjectTargetSelectionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
  });

  it('uses the remembered target when it is still valid', async () => {
    const { ProjectTargetSelectionController } = await import(
      '../../src/extension/project-target-selection'
    );

    readFileSync.mockReturnValue(
      JSON.stringify({
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/main.asm' },
          serial: { sourceFile: 'src/serial.asm' },
        },
      })
    );

    const update = vi.fn();
    const controller = new ProjectTargetSelectionController({
      workspaceState: {
        get: vi.fn(() => 'serial'),
        update,
      },
    } as never);

    const target = await controller.resolveTarget('/workspace/debug80/.vscode/debug80.json');

    expect(target).toBe('serial');
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      'debug80.selectedTarget:/workspace/debug80/.vscode/debug80.json',
      'serial'
    );
  });

  it('uses the default target when no remembered target exists', async () => {
    const { ProjectTargetSelectionController } = await import(
      '../../src/extension/project-target-selection'
    );

    readFileSync.mockReturnValue(
      JSON.stringify({
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/main.asm' },
          serial: { sourceFile: 'src/serial.asm' },
        },
      })
    );

    const update = vi.fn();
    const controller = new ProjectTargetSelectionController({
      workspaceState: {
        get: vi.fn(() => undefined),
        update,
      },
    } as never);

    const target = await controller.resolveTarget('/workspace/debug80/.vscode/debug80.json');

    expect(target).toBe('app');
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('prompts when multiple targets exist without a remembered or default target', async () => {
    const { ProjectTargetSelectionController } = await import(
      '../../src/extension/project-target-selection'
    );

    readFileSync.mockReturnValue(
      JSON.stringify({
        targets: {
          app: { sourceFile: 'src/main.asm', platform: 'simple' },
          serial: { sourceFile: 'src/serial.asm', assembler: 'asm80' },
        },
      })
    );
    showQuickPick.mockResolvedValueOnce({
      label: 'serial',
      description: 'src/serial.asm',
      detail: 'src/serial.asm',
      targetName: 'serial',
    });

    const update = vi.fn();
    const controller = new ProjectTargetSelectionController({
      workspaceState: {
        get: vi.fn(() => undefined),
        update,
      },
    } as never);

    const target = await controller.resolveTarget('/workspace/debug80/.vscode/debug80.json', {
      prompt: true,
      placeHolder: 'Select the Debug80 target to debug',
    });

    expect(target).toBe('serial');
    expect(showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: 'app' }),
        expect.objectContaining({ label: 'serial' }),
      ]),
      expect.objectContaining({ placeHolder: 'Select the Debug80 target to debug' })
    );
  });

  it('prompts even when a default target exists if forcePrompt is enabled', async () => {
    const { ProjectTargetSelectionController } = await import(
      '../../src/extension/project-target-selection'
    );

    readFileSync.mockReturnValue(
      JSON.stringify({
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/main.asm', platform: 'simple' },
          serial: { sourceFile: 'src/serial.asm', platform: 'tec1g' },
        },
      })
    );
    showQuickPick.mockResolvedValueOnce({
      label: 'serial',
      description: 'src/serial.asm • tec1g',
      detail: 'src/serial.asm',
      targetName: 'serial',
    });

    const update = vi.fn();
    const controller = new ProjectTargetSelectionController({
      workspaceState: {
        get: vi.fn(() => undefined),
        update,
      },
    } as never);

    const target = await controller.resolveTarget('/workspace/debug80/.vscode/debug80.json', {
      prompt: true,
      forcePrompt: true,
      placeHolder: 'Select the active Debug80 target',
    });

    expect(target).toBe('serial');
    expect(showQuickPick).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      'debug80.selectedTarget:/workspace/debug80/.vscode/debug80.json',
      'serial'
    );
  });

  it('resolveTargetNameForConfig uses defaultTarget when workspace memento is absent', async () => {
    const { resolveTargetNameForConfig } = await import('../../src/extension/project-target-selection');

    readFileSync.mockReturnValue(
      JSON.stringify({
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/a.asm' },
          other: { sourceFile: 'src/b.asm' },
        },
      })
    );

    expect(resolveTargetNameForConfig(undefined, '/workspace/p/.vscode/debug80.json')).toBe('app');
  });

  it('resolveTargetNameForConfig returns the sole target when there is no default', async () => {
    const { resolveTargetNameForConfig } = await import('../../src/extension/project-target-selection');

    readFileSync.mockReturnValue(
      JSON.stringify({
        targets: {
          only: { sourceFile: 'src/a.asm' },
        },
      })
    );

    expect(resolveTargetNameForConfig(undefined, '/workspace/p/debug80.json')).toBe('only');
  });

  it('resolveTargetNameForConfig returns undefined when multiple targets lack a default', async () => {
    const { resolveTargetNameForConfig } = await import('../../src/extension/project-target-selection');

    readFileSync.mockReturnValue(
      JSON.stringify({
        targets: {
          a: { sourceFile: 'src/a.asm' },
          b: { sourceFile: 'src/b.asm' },
        },
      })
    );

    expect(resolveTargetNameForConfig(undefined, '/workspace/p/debug80.json')).toBeUndefined();
  });
});