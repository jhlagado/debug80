const assert = require('assert');
const vscode = require('vscode');

const extensionIds = ['jhlagado.debug80', 'jhlagado.z80-debugger'];
const expectedCommands = [
  'debug80.createProject',
  'debug80.openDebug80View',
  'debug80.startDebug',
  'debug80.restartDebug',
];

async function run() {
  const extension = extensionIds
    .map((id) => vscode.extensions.getExtension(id))
    .find(Boolean);

  assert.ok(
    extension,
    `Expected one of these extension ids to be present: ${extensionIds.join(', ')}`,
  );

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

module.exports = { run };
