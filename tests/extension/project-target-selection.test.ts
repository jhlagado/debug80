import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFileSync = vi.fn();
const existsSync = vi.fn();
const showQuickPick = vi.fn();

vi.mock('fs', () => ({
  readFileSync,
  existsSync,
}));

vi.mock('vscode', () => ({
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
      description: 'asm80',
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
      description: 'tec1g',
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
});