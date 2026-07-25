/**
 * Drives the whole project pipeline through commands only, with no panel
 * interaction and no quick picks. This is the contract the documentation
 * tooling depends on: if any of these calls starts prompting, the test hangs
 * and CI fails, which is exactly the signal we want.
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

/** Files and directories scaffolding may create inside the fixture. */
const GENERATED = ['debug80.json', '.gitignore', 'src', 'build'];

function cleanFixture(root) {
  for (const entry of GENERATED) {
    fs.rmSync(path.join(root, entry), { recursive: true, force: true });
  }
}

export async function runProjectPipeline() {
  const folder = (vscode.workspace.workspaceFolders ?? [])[0];
  assert.ok(folder, 'Expected a fixture workspace folder');
  const root = folder.uri.fsPath;

  cleanFixture(root);
  try {
    // 1. Scaffold with every choice supplied, so no quick pick can appear.
    const created = await vscode.commands.executeCommand('debug80.createProject', {
      rootPath: root,
      kit: 'tec1g/mon3',
      starter: 'asm',
    });
    assert.strictEqual(created, true, 'createProject should report success');

    const configPath = path.join(root, 'debug80.json');
    assert.ok(fs.existsSync(configPath), 'debug80.json should exist');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(config.projectPlatform, 'tec1g');
    assert.strictEqual(config.defaultTarget, 'main');
    assert.ok(fs.existsSync(path.join(root, 'src', 'main.asm')), 'starter source should exist');

    // 2. Build through the command layer.
    await vscode.commands.executeCommand('debug80.buildTarget');
    const hexPath = path.join(root, 'build', 'main.hex');
    const mapPath = path.join(root, 'build', 'main.d8.json');
    assert.ok(fs.existsSync(hexPath), 'build should produce main.hex');
    assert.ok(fs.existsSync(mapPath), 'build should produce main.d8.json');

    // 3. Read state back as data rather than off the rendered panel.
    const status = await vscode.commands.executeCommand('debug80.getStatus', { quiet: true });
    assert.ok(status, 'getStatus should return a payload');
    assert.strictEqual(status.projectState, 'initialized');
    assert.strictEqual(status.hasProject, true);
    assert.ok(
      (status.targets ?? []).some((target) => target.name === 'main'),
      'status should list the main target'
    );
  } finally {
    cleanFixture(root);
  }
}
