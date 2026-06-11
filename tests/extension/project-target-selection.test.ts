import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFileSync = vi.fn();
const existsSync = vi.fn();
const readdirSync = vi.fn(() => []);
const showQuickPick = vi.fn();
const configPath = '/workspace/debug80/.vscode/debug80.json';
const projectConfigPath = '/workspace/p/.vscode/debug80.json';

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

function readConfig(value: object): void {
  readFileSync.mockReturnValue(JSON.stringify(value));
}

function sourceExistsExcept(missingSuffix: string): (p: unknown) => boolean {
  return (p) => !String(p).replace(/\\/g, '/').endsWith(missingSuffix);
}

async function createController(storedTarget?: string) {
  const { ProjectTargetSelectionController } =
    await import('../../src/extension/project-target-selection');

  const update = vi.fn();
  const controller = new ProjectTargetSelectionController({
    workspaceState: {
      get: vi.fn(() => storedTarget),
      update,
    },
  } as never);

  return { controller, update };
}

describe('ProjectTargetSelectionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
  });

  it('uses the remembered target when it is still valid', async () => {
    readConfig({
      defaultTarget: 'app',
      targets: {
        app: { sourceFile: 'src/main.asm' },
        serial: { sourceFile: 'src/serial.asm' },
      },
    });

    const { controller, update } = await createController('serial');
    const target = await controller.resolveTarget(configPath);

    expect(target).toBe('serial');
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      'debug80.selectedTarget:/workspace/debug80/.vscode/debug80.json',
      'serial'
    );
  });

  it('uses the default target when no remembered target exists', async () => {
    readConfig({
      defaultTarget: 'app',
      targets: {
        app: { sourceFile: 'src/main.asm' },
        serial: { sourceFile: 'src/serial.asm' },
      },
    });

    const { controller } = await createController();
    const target = await controller.resolveTarget(configPath);

    expect(target).toBe('app');
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('prompts when multiple targets exist without a remembered or default target', async () => {
    readConfig({
      targets: {
        app: { sourceFile: 'src/main.asm', platform: 'simple' },
        serial: { sourceFile: 'src/serial.asm', assembler: 'azm' },
      },
    });
    showQuickPick.mockResolvedValueOnce({
      label: 'serial',
      description: 'src/serial.asm',
      detail: 'src/serial.asm',
      targetName: 'serial',
    });

    const { controller } = await createController();
    const target = await controller.resolveTarget(configPath, {
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
    readConfig({
      defaultTarget: 'app',
      targets: {
        app: { sourceFile: 'src/main.asm', platform: 'simple' },
        serial: { sourceFile: 'src/serial.asm', platform: 'tec1g' },
      },
    });
    showQuickPick.mockResolvedValueOnce({
      label: 'serial',
      description: 'src/serial.asm • tec1g',
      detail: 'src/serial.asm',
      targetName: 'serial',
    });

    const { controller, update } = await createController();
    const target = await controller.resolveTarget(configPath, {
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
    const { resolveTargetNameForConfig } =
      await import('../../src/extension/project-target-selection');

    readConfig({
      defaultTarget: 'app',
      targets: {
        app: { sourceFile: 'src/a.asm' },
        other: { sourceFile: 'src/b.asm' },
      },
    });

    expect(resolveTargetNameForConfig(undefined, '/workspace/p/.vscode/debug80.json')).toBe('app');
  });

  it('resolveTargetNameForConfig returns the sole target when there is no default', async () => {
    const { resolveTargetNameForConfig } =
      await import('../../src/extension/project-target-selection');

    readConfig({
      targets: {
        only: { sourceFile: 'src/a.asm' },
      },
    });

    expect(resolveTargetNameForConfig(undefined, '/workspace/p/debug80.json')).toBe('only');
  });

  it('resolveTargetNameForConfig returns undefined when multiple targets lack a default', async () => {
    const { resolveTargetNameForConfig } =
      await import('../../src/extension/project-target-selection');

    readConfig({
      targets: {
        a: { sourceFile: 'src/a.asm' },
        b: { sourceFile: 'src/b.asm' },
      },
    });

    expect(resolveTargetNameForConfig(undefined, '/workspace/p/debug80.json')).toBeUndefined();
  });

  it('omits targets whose program file is missing on disk', async () => {
    const { listProjectTargetChoices } =
      await import('../../src/extension/project-target-selection');

    readConfig({
      defaultTarget: 'main',
      targets: {
        main: { sourceFile: 'src/main.asm' },
        matrix: { sourceFile: 'src/matrixdemo.asm' },
      },
    });
    existsSync.mockImplementation(sourceExistsExcept('/src/main.asm'));

    const choices = listProjectTargetChoices(projectConfigPath);
    expect(choices.map((c: { name: string }) => c.name)).toEqual(['matrix']);
  });

  it('ignores a remembered target when that target’s program file was removed', async () => {
    const { resolvePreferredTargetName } =
      await import('../../src/extension/project-target-selection');

    readConfig({
      defaultTarget: 'main',
      targets: {
        main: { sourceFile: 'src/main.asm' },
        matrix: { sourceFile: 'src/matrixdemo.asm' },
      },
    });
    existsSync.mockImplementation(sourceExistsExcept('/src/main.asm'));

    const memento = {
      get: vi.fn(() => 'main'),
      update: vi.fn(),
    } as never;

    expect(resolvePreferredTargetName(memento, projectConfigPath)).toBe('matrix');
  });
});
