/**
 * Boots the actual CP/M platform through Debug80's public VS Code commands and
 * observes the same DAP events consumed by the terminal webview.
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as vscode from 'vscode';

const directory = path.dirname(fileURLToPath(import.meta.url));
const expectedTranscript = JSON.parse(
  fs.readFileSync(path.resolve(directory, '../expected/cpm22-transcript.json'), 'utf8')
);
const generated = ['debug80.json', '.gitignore', 'src', 'build'];
const timeoutMs = 20_000;

function cleanFixture(root) {
  for (const entry of generated) {
    fs.rmSync(path.join(root, entry), { recursive: true, force: true });
  }
}

async function waitFor(predicate, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function sendCommand(session, transcript, command, expected) {
  const start = transcript.value.length;
  await session.customRequest('debug80/terminalInput', { text: `${command}\r` });
  await waitFor(
    () => transcript.value.slice(start).endsWith('\r\nA>'),
    `${command} to return to the CCP prompt`
  );
  assert.strictEqual(transcript.value.slice(start), expected, `${command} transcript`);
}

export async function runCpm22Pipeline(extension) {
  const folder = (vscode.workspace.workspaceFolders ?? [])[0];
  assert.ok(folder, 'Expected a fixture workspace folder');
  const root = folder.uri.fsPath;
  const transcript = { value: '' };
  let platform;
  let status;
  let session;

  const eventSubscription = vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
    if (event.session.type !== 'z80') return;
    if (event.event === 'debug80/platform') {
      platform = event.body?.id;
      session = event.session;
    } else if (event.event === 'debug80/sessionStatus') {
      status = event.body?.status;
    } else if (event.event === 'debug80/terminalOutput') {
      transcript.value += event.body?.text ?? '';
    }
  });

  const biosPath = path.join(extension.extensionPath, 'roms', 'cpm22', 'bios.asm');
  const biosLines = fs.readFileSync(biosPath, 'utf8').split(/\r?\n/);
  const consoleOutputLine = biosLines.findIndex((line) => line.trim() === 'ConsoleOutput:');
  assert.notStrictEqual(consoleOutputLine, -1, 'BIOS source must contain ConsoleOutput');
  const breakpoint = new vscode.SourceBreakpoint(
    new vscode.Location(vscode.Uri.file(biosPath), new vscode.Position(consoleOutputLine, 0))
  );

  cleanFixture(root);
  vscode.debug.addBreakpoints([breakpoint]);
  try {
    const created = await vscode.commands.executeCommand('debug80.createProject', {
      rootPath: root,
      kit: 'cpm22/default',
      starter: 'asm',
    });
    assert.strictEqual(created, true, 'CP/M project creation should succeed');

    const config = JSON.parse(fs.readFileSync(path.join(root, 'debug80.json'), 'utf8'));
    assert.strictEqual(config.projectPlatform, 'cpm22');
    assert.strictEqual(config.targets.main.platform, 'cpm22');
    assert.deepStrictEqual(config.targets.main.cpm22, {
      writable: true,
      programName: 'MAIN.COM',
    });

    const built = await vscode.commands.executeCommand('debug80.buildTarget');
    assert.strictEqual(built, true, 'CP/M build should succeed');
    assert.deepStrictEqual(
      [...fs.readFileSync(path.join(root, 'build', 'main.com'))],
      [
        17, 9, 1, 14, 9, 205, 5, 0, 201, 72, 101, 108, 108, 111, 32, 102, 114, 111, 109, 32, 68,
        101, 98, 117, 103, 56, 48, 32, 67, 80, 47, 77, 13, 10, 36,
      ],
      'host .COM bytes'
    );

    const started = await vscode.commands.executeCommand('debug80.startDebug', { rootPath: root });
    assert.strictEqual(started, true, 'CP/M debug launch should succeed');

    await waitFor(() => platform === 'cpm22', 'the CP/M platform event');
    await waitFor(() => status === 'paused', 'the BIOS ConsoleOutput breakpoint');
    assert.ok(session, 'Expected the active CP/M debug session');

    const snapshot = await session.customRequest('debug80/memorySnapshot', {});
    assert.strictEqual(snapshot.registers.pc, 0xfada, 'breakpoint PC');
    assert.strictEqual(snapshot.registers.bc & 0xff, 13, 'BIOS ConsoleOutput byte in C');
    await waitFor(
      () =>
        vscode.window.tabGroups.all.some((group) =>
          group.tabs.some((tab) => tab.label === 'Debug80 Terminal')
        ),
      'the Debug80 terminal view'
    );

    vscode.debug.removeBreakpoints([breakpoint]);
    await vscode.commands.executeCommand('workbench.action.debug.continue');
    await waitFor(() => transcript.value.endsWith('A>'), 'the cold-boot CCP prompt');
    assert.strictEqual(transcript.value, expectedTranscript.boot, 'cold-boot transcript');

    await sendCommand(session, transcript, 'DIR', expectedTranscript.dir);
    await sendCommand(session, transcript, 'MAIN', expectedTranscript.main);
    await sendCommand(session, transcript, 'TYPE README.TXT', expectedTranscript.readme);
    await sendCommand(session, transcript, 'SMOKE', expectedTranscript.smoke);
    await sendCommand(session, transcript, 'TYPE RESULT.TXT', expectedTranscript.result);
    await sendCommand(session, transcript, 'ATOM', expectedTranscript.atom);
    await sendCommand(session, transcript, 'OUTPUT', expectedTranscript.output);
    await sendCommand(session, transcript, 'ATOM HELLO.ASM MADE.COM', expectedTranscript.namedAtom);
    await sendCommand(session, transcript, 'MADE', expectedTranscript.namedOutput);
  } finally {
    eventSubscription.dispose();
    vscode.debug.removeBreakpoints([breakpoint]);
    const sessionToStop = session ?? vscode.debug.activeDebugSession;
    if (sessionToStop?.type === 'z80') {
      await vscode.debug.stopDebugging(sessionToStop);
    }
    cleanFixture(root);
  }
}
