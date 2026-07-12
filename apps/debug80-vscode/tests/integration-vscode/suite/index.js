import assert from 'node:assert';

import * as vscode from 'vscode';

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

  await extension.activate();
  assert.strictEqual(extension.isActive, true, `${extension.id} should activate`);

  const registeredCommands = await vscode.commands.getCommands(true);
  for (const command of expectedCommands) {
    assert.ok(
      registeredCommands.includes(command),
      `Expected command to be registered: ${command}`,
    );
  }

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  assert.ok(workspaceFolders.length > 0, 'Expected fixture workspace folder to be visible');
  assert.strictEqual(workspaceFolders[0].name, 'vscode-smoke');
}
