import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveProjectStatusSummary } from '../../src/extension/project-status';

vi.mock('vscode', () => ({}));

describe('project-status', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('resolves the selected project target and program file', () => {
    const root = makeTempDir();
    writeProjectFile(root, 'src/main.asm');
    writeProjectFile(root, 'src/serial.asm');
    writeDebug80Config(root, {
      defaultTarget: 'app',
      targets: {
        app: { sourceFile: 'src/main.asm' },
        serial: { sourceFile: 'src/serial.asm' },
      },
    });

    const summary = resolveProjectStatusSummary(selectedTargetMemento(root, 'serial'), workspaceFolder(root));

    expect(summary).toEqual({
      projectName: 'demo',
      targetName: 'serial',
      entrySource: 'src/serial.asm',
    });
  });

  function makeTempDir(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-project-status-'));
    tempDirs.push(root);
    return root;
  }

  function writeProjectFile(root: string, relativePath: string, contents = 'nop\n'): void {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }

  function writeDebug80Config(root: string, config: unknown): void {
    writeProjectFile(root, 'debug80.json', JSON.stringify(config));
  }

  function selectedTargetMemento(root: string, targetName: string) {
    const configPath = path.join(root, 'debug80.json');
    return {
      get: vi.fn((key: string) => (key === `debug80.selectedTarget:${configPath}` ? targetName : undefined)),
      update: vi.fn(),
    } as never;
  }

  function workspaceFolder(root: string, name = 'demo') {
    return {
      name,
      uri: { fsPath: root },
    } as never;
  }
});
