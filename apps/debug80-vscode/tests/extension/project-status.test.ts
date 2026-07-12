import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveProjectStatusSummary } from '../../src/extension/project-status';

vi.mock('vscode', () => ({}));

describe('project-status', () => {
  const fixture = createProjectStatusFixture();

  afterEach(() => {
    fixture.cleanup();
  });

  it('resolves the selected project target and program file', () => {
    const project = fixture.createProject({
      files: ['src/main.asm', 'src/serial.asm'],
      selectedTarget: 'serial',
      config: {
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/main.asm' },
          serial: { sourceFile: 'src/serial.asm' },
        },
      },
    });

    const summary = resolveProjectStatusSummary(
      project.selectedTargetMemento,
      project.workspaceFolder
    );

    expect(summary).toEqual({
      projectName: 'demo',
      targetName: 'serial',
      entrySource: 'src/serial.asm',
    });
  });
});

type ProjectStatusFixture = {
  cleanup(): void;
  createProject(options: { files: string[]; selectedTarget: string; config: unknown }): {
    selectedTargetMemento: never;
    workspaceFolder: never;
  };
};

function createProjectStatusFixture(): ProjectStatusFixture {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-project-status-'));
    tempDirs.push(root);
    return root;
  }

  return {
    cleanup(): void {
      for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },

    createProject(options: { files: string[]; selectedTarget: string; config: unknown }): {
      selectedTargetMemento: never;
      workspaceFolder: never;
    } {
      const root = makeTempDir();
      for (const file of options.files) {
        writeProjectFile(root, file);
      }
      writeDebug80Config(root, options.config);
      return {
        selectedTargetMemento: selectedTargetMemento(root, options.selectedTarget),
        workspaceFolder: workspaceFolder(root),
      };
    },
  };
}

function writeProjectFile(root: string, relativePath: string, contents = 'nop\n'): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeDebug80Config(root: string, config: unknown): void {
  writeProjectFile(root, 'debug80.json', JSON.stringify(config));
}

function selectedTargetMemento(root: string, targetName: string): never {
  const configPath = path.join(root, 'debug80.json');
  return {
    get: vi.fn((key: string) =>
      key === `debug80.selectedTarget:${configPath}` ? targetName : undefined
    ),
    update: vi.fn(),
  } as never;
}

function workspaceFolder(root: string, name = 'demo'): never {
  return {
    name,
    uri: { fsPath: root },
  } as never;
}
