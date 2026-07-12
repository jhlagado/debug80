import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(__dirname, '../../../..');

type LaunchConfiguration = {
  name?: string;
  type?: string;
  request?: string;
  args?: string[];
  outFiles?: string[];
  preLaunchTask?: string;
};

type LaunchFile = {
  configurations?: LaunchConfiguration[];
};

type Task = {
  label?: string;
  type?: string;
  command?: string;
  options?: { cwd?: string };
};

type TasksFile = {
  tasks?: Task[];
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')) as T;
}

describe('monorepo Debug80 launch configuration', () => {
  it('launches the app package with the simple fixture and generated source maps', () => {
    const launch = readJson<LaunchFile>('.vscode/launch.json');
    const configuration = launch.configurations?.find(({ name }) => name === 'Debug80 Extension');

    expect(configuration).toMatchObject({
      type: 'extensionHost',
      request: 'launch',
      preLaunchTask: 'debug80: build',
    });
    expect(configuration?.args).toContain(
      '--extensionDevelopmentPath=${workspaceFolder}/apps/debug80-vscode'
    );
    expect(configuration?.args).toContain(
      '${workspaceFolder}/apps/debug80-vscode/tests/e2e/fixtures/simple'
    );
    expect(configuration?.outFiles).toContain(
      '${workspaceFolder}/apps/debug80-vscode/out/extension/**/*.js'
    );
  });

  it('builds Debug80 through the root npm workspace', () => {
    const tasks = readJson<TasksFile>('.vscode/tasks.json');
    const task = tasks.tasks?.find(({ label }) => label === 'debug80: build');

    expect(task).toMatchObject({
      type: 'shell',
      command: 'npm run build -w debug80',
      options: { cwd: '${workspaceFolder}' },
    });
  });
});
