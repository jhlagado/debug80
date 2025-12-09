import * as vscode from 'vscode';
import { Z80DebugAdapterFactory } from './adapter';
import * as fs from 'fs';
import * as path from 'path';
import { ensureDirExists, inferDefaultTarget } from './config-utils';

let terminalPanel: vscode.WebviewPanel | undefined;
let terminalBuffer = '';
let terminalSession: vscode.DebugSession | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const factory = new Z80DebugAdapterFactory();

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('z80', factory)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.createProject', async () => {
      return scaffoldProject(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.terminalInput', async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        void vscode.window.showErrorMessage('Debug80: No active z80 debug session.');
        return;
      }
      const input = await vscode.window.showInputBox({
        prompt: 'Enter text to send to the target terminal',
        placeHolder: 'text',
      });
      if (input === undefined) {
        return;
      }
      try {
        await session.customRequest('debug80/terminalInput', { text: input });
      } catch (err) {
        void vscode.window.showErrorMessage(`Debug80: Failed to send input: ${String(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTerminal', async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        void vscode.window.showErrorMessage('Debug80: No active z80 debug session.');
        return;
      }
      openTerminalPanel(session);
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidReceiveDebugSessionCustomEvent((evt) => {
      if (evt.session.type !== 'z80' || evt.event !== 'debug80/terminalOutput') {
        return;
      }
      const text = (evt.body as { text?: string } | undefined)?.text ?? '';
      openTerminalPanel(evt.session);
      appendTerminalOutput(text);
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up
}

async function scaffoldProject(includeLaunch: boolean): Promise<boolean> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showErrorMessage('Debug80: No workspace folder open.');
    return false;
  }

  const workspaceRoot = folder.uri.fsPath;
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const configPath = path.join(vscodeDir, 'debug80.json');
  const launchPath = path.join(vscodeDir, 'launch.json');
  const configExists = fs.existsSync(configPath);

  const inferred = inferDefaultTarget(workspaceRoot);

  let proceed = true;
  if (!configExists) {
    const choice = await vscode.window.showInformationMessage(
      inferred.found
        ? `Debug80: Create .vscode/debug80.json targeting ${inferred.sourceFile}?`
        : `Debug80: Create .vscode/debug80.json targeting ${inferred.sourceFile}? (file not found yet)`,
      { modal: true },
      'Create'
    );
    proceed = choice === 'Create';
  }

  if (!proceed) {
    return false;
  }

  ensureDirExists(path.join(workspaceRoot, path.dirname(inferred.sourceFile)));
  ensureDirExists(path.join(workspaceRoot, inferred.outputDir));
  ensureDirExists(vscodeDir);
  if (includeLaunch) {
    ensureDirExists(vscodeDir);
  }

  let created = false;

  if (!configExists) {
    const defaultConfig = {
      defaultTarget: 'app',
      targets: {
        app: {
          sourceFile: inferred.sourceFile,
          outputDir: inferred.outputDir,
          artifactBase: inferred.artifactBase,
          entry: 0,
        },
      },
    };

    try {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      void vscode.window.showInformationMessage(
        `Debug80: Created .vscode/debug80.json targeting ${inferred.sourceFile}.`
      );
      created = true;
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Debug80: Failed to write .vscode/debug80.json: ${String(err)}`
      );
      return false;
    }
  } else if (!includeLaunch) {
    void vscode.window.showInformationMessage('.vscode/debug80.json already exists.');
  }

  if (includeLaunch) {
    if (!fs.existsSync(launchPath)) {
      const launchConfig = {
        version: '0.2.0',
        configurations: [
          {
            name: 'Debug (debug80)',
            type: 'z80',
            request: 'launch',
            projectConfig: '${workspaceFolder}/.vscode/debug80.json',
            target: 'app',
            stopOnEntry: true,
          },
        ],
      };
      try {
        fs.writeFileSync(launchPath, JSON.stringify(launchConfig, null, 2));
        void vscode.window.showInformationMessage(
          'Debug80: Created .vscode/launch.json for debug80.'
        );
        created = true;
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Debug80: Failed to write .vscode/launch.json: ${String(err)}`
        );
        return created;
      }
    } else {
      void vscode.window.showInformationMessage(
        'Debug80: .vscode/launch.json already exists; not overwriting.'
      );
    }
  }

  return created;
}

function openTerminalPanel(session: vscode.DebugSession): void {
  if (terminalPanel === undefined) {
    terminalPanel = vscode.window.createWebviewPanel(
      'debug80Terminal',
      'Debug80 Terminal',
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    terminalPanel.onDidDispose(() => {
      terminalPanel = undefined;
      terminalSession = undefined;
      terminalBuffer = '';
    });
    terminalPanel.webview.onDidReceiveMessage(async (msg: { type?: string; text?: string }) => {
      if (msg.type === 'input' && typeof msg.text === 'string') {
        const targetSession = terminalSession ?? vscode.debug.activeDebugSession;
        if (targetSession?.type === 'z80') {
          try {
            // Log to extension host console for verification
            console.log(`[debug80] terminal input -> "${msg.text}"`);
            await targetSession.customRequest('debug80/terminalInput', { text: msg.text });
          } catch {
            // ignore
          }
        }
      }
    });
  }
  terminalSession = session;
  terminalPanel.webview.html = getTerminalHtml(terminalBuffer);
}

function appendTerminalOutput(text: string): void {
  terminalBuffer += text;
  if (terminalPanel !== undefined) {
    terminalPanel.webview.postMessage({ type: 'output', text });
  }
}

function getTerminalHtml(initial: string): string {
  const escaped = initial.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family: monospace; padding: 8px;">
  <pre id="out" style="white-space: pre-wrap; word-break: break-word;">${escaped}</pre>
  <div style="margin-top:8px;">
    <input id="input" type="text" style="width:80%;" placeholder="Type and press Enter"/>
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const out = document.getElementById('out');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'output' && typeof msg.text === 'string') {
        out.textContent += msg.text;
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
    function sendInput() {
      const text = input.value;
      if (text.length === 0) return;
      vscode.postMessage({ type: 'input', text });
      input.value = '';
    }
    send.addEventListener('click', sendInput);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        sendInput();
      }
    });
  </script>
</body>
</html>`;
}
