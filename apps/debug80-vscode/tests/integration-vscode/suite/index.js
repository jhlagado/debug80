import assert from 'node:assert';
import { realpathSync } from 'node:fs';
import path from 'node:path';

import * as vscode from 'vscode';

import { runCpm22Pipeline } from './cpm22-pipeline.js';
import { runProjectPipeline } from './project-pipeline.js';

const extensionId = 'jhlagado.debug80';
const expectedCommands = [
  'debug80.createProject',
  'debug80.openDebug80View',
  'debug80.startDebug',
  'debug80.restartDebug',
];

export async function run() {
  const extension = vscode.extensions.getExtension(extensionId);

  assert.ok(extension, `Expected extension id to be present: ${extensionId}`);
  if (process.env.DEBUG80_INSTALLED_EXTENSIONS_DIR) {
    const installedRoot = realpathSync(process.env.DEBUG80_INSTALLED_EXTENSIONS_DIR);
    const extensionPath = realpathSync(extension.extensionPath);
    const relative = path.relative(installedRoot, extensionPath);
    assert.ok(
      relative !== '' &&
        !path.isAbsolute(relative) &&
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`),
      `Expected installed Debug80 under ${installedRoot}, got ${extensionPath}`
    );
  }

  await extension.activate();
  assert.strictEqual(extension.isActive, true, `${extension.id} should activate`);

  const registeredCommands = await vscode.commands.getCommands(true);
  for (const command of expectedCommands) {
    assert.ok(
      registeredCommands.includes(command),
      `Expected command to be registered: ${command}`
    );
  }

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  assert.ok(workspaceFolders.length > 0, 'Expected fixture workspace folder to be visible');
  assert.strictEqual(workspaceFolders[0].name, 'vscode-smoke');

  await runProjectPipeline();
  await runCpm22Pipeline(extension);
}
