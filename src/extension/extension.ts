import * as vscode from 'vscode';
import { Z80DebugAdapterFactory } from '../debug/adapter';
import * as fs from 'fs';
import * as path from 'path';
import { ensureDirExists, inferDefaultTarget } from '../debug/config-utils';

let terminalPanel: vscode.WebviewPanel | undefined;
let terminalBuffer = '';
let terminalSession: vscode.DebugSession | undefined;
let terminalAnsiCarry = '';
let terminalPendingOutput = '';
let terminalFlushTimer: ReturnType<typeof setTimeout> | undefined;
let terminalNeedsFullRefresh = false;
const TERMINAL_BUFFER_MAX = 50_000;
const TERMINAL_FLUSH_MS = 50;
let enforceSourceColumn = false;
let movingEditor = false;
const activeZ80Sessions = new Set<string>();

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
      const payload = input.endsWith('\n') ? input : `${input}\n`;
      try {
        await session.customRequest('debug80/terminalInput', { text: payload });
      } catch (err) {
        void vscode.window.showErrorMessage(`Debug80: Failed to send input: ${String(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTerminal', async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        openTerminalPanel(undefined, { focus: true });
        return;
      }
      openTerminalPanel(session, { focus: true });
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      if (session.type === 'z80') {
        activeZ80Sessions.add(session.id);
        enforceSourceColumn = true;
        openTerminalPanel(session, { focus: false });
        clearTerminal();
      }
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (terminalSession?.id === session.id) {
        terminalSession = undefined;
      }
      if (session.type === 'z80') {
        activeZ80Sessions.delete(session.id);
        if (activeZ80Sessions.size === 0) {
          enforceSourceColumn = false;
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidReceiveDebugSessionCustomEvent((evt) => {
      if (evt.session.type !== 'z80' || evt.event !== 'debug80/terminalOutput') {
        return;
      }
      const text = (evt.body as { text?: string } | undefined)?.text ?? '';
      if (terminalPanel === undefined) {
        openTerminalPanel(evt.session, { focus: false, reveal: true });
      }
      appendTerminalOutput(text);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!enforceSourceColumn || movingEditor || editor === undefined) {
        return;
      }
      if (!isSourceDocument(editor.document)) {
        return;
      }
      const primary = getPrimaryEditorColumn();
      const column = editor.viewColumn;
      if (column === undefined || column === primary) {
        return;
      }
      movingEditor = true;
      void vscode.window
        .showTextDocument(editor.document, {
          viewColumn: primary,
          preserveFocus: true,
          preview: false,
        })
        .then(() => closeDocumentTabsInOtherGroups(editor.document.uri, primary))
        .then(
          () => {
            movingEditor = false;
          },
          () => {
            movingEditor = false;
          }
        );
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

function getPrimaryEditorColumn(): vscode.ViewColumn {
  const columns = vscode.window.visibleTextEditors
    .map((editor) => editor.viewColumn)
    .filter((column): column is vscode.ViewColumn => column !== undefined);
  if (columns.length === 0) {
    return vscode.ViewColumn.One;
  }
  const first = columns[0];
  if (first === undefined) {
    return vscode.ViewColumn.One;
  }
  return columns.reduce((min, col) => (col < min ? col : min), first);
}

function getTerminalColumn(): vscode.ViewColumn {
  const primary = getPrimaryEditorColumn();
  const candidate = primary + 1;
  if (candidate <= vscode.ViewColumn.Nine) {
    return candidate as vscode.ViewColumn;
  }
  return vscode.ViewColumn.Beside;
}

function isSourceDocument(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== 'file') {
    return false;
  }
  const ext = path.extname(doc.fileName).toLowerCase();
  return ext === '.asm' || ext === '.lst';
}

function closeDocumentTabsInOtherGroups(
  uri: vscode.Uri,
  keepColumn: vscode.ViewColumn
): void {
  const target = uri.toString();
  for (const group of vscode.window.tabGroups.all) {
    if (group.viewColumn === keepColumn) {
      continue;
    }
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputText && input.uri.toString() === target) {
        void vscode.window.tabGroups.close(tab, true);
      }
    }
  }
}

function openTerminalPanel(
  session?: vscode.DebugSession,
  options?: { focus?: boolean; reveal?: boolean }
): void {
  const focus = options?.focus ?? false;
  const reveal = options?.reveal ?? true;
  const targetColumn = getTerminalColumn();
  if (terminalPanel === undefined) {
    terminalPanel = vscode.window.createWebviewPanel(
      'debug80Terminal',
      'Debug80 Terminal',
      targetColumn,
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
      if (msg.type === 'break') {
        const targetSession = terminalSession ?? vscode.debug.activeDebugSession;
        if (targetSession?.type === 'z80') {
          try {
            await targetSession.customRequest('debug80/terminalBreak', {});
          } catch {
            /* ignore */
          }
        }
      }
    });
  }
  if (session !== undefined) {
    terminalSession = session;
  }
  if (reveal) {
    terminalPanel.reveal(targetColumn, !focus);
  }
  terminalPanel.webview.html = getTerminalHtml(terminalBuffer);
  terminalPendingOutput = '';
  terminalNeedsFullRefresh = false;
}

function appendTerminalOutput(text: string): void {
  const { remaining, shouldClear } = stripAndDetectClear(text);
  if (shouldClear) {
    clearTerminal();
  }
  if (remaining.length === 0) {
    return;
  }
  terminalBuffer += remaining;
  if (terminalBuffer.length > TERMINAL_BUFFER_MAX) {
    terminalBuffer = terminalBuffer.slice(terminalBuffer.length - TERMINAL_BUFFER_MAX);
    terminalNeedsFullRefresh = true;
    terminalPendingOutput = '';
  }
  if (terminalPanel !== undefined) {
    if (terminalNeedsFullRefresh) {
      scheduleTerminalFlush();
      return;
    }
    terminalPendingOutput += remaining;
    scheduleTerminalFlush();
  }
}

function clearTerminal(): void {
  terminalBuffer = '';
  terminalPendingOutput = '';
  terminalNeedsFullRefresh = false;
  if (terminalFlushTimer !== undefined) {
    clearTimeout(terminalFlushTimer);
    terminalFlushTimer = undefined;
  }
  if (terminalPanel !== undefined) {
    terminalPanel.webview.postMessage({ type: 'clear' });
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
      if (msg.type === 'clear') {
        out.textContent = '';
        return;
      }
      if (msg.type === 'output' && typeof msg.text === 'string') {
        out.textContent += msg.text;
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
    function sendInput() {
      const text = input.value;
      const payload = text + "\\n";
      out.textContent += text.length === 0 ? "\\n" : text;
      window.scrollTo(0, document.body.scrollHeight);
      vscode.postMessage({ type: 'input', text: payload });
      input.value = '';
      input.focus();
    }
    send.addEventListener('click', sendInput);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        sendInput();
      } else if (e.key === 'c' && e.ctrlKey) {
        vscode.postMessage({ type: 'break' });
      }
    });
    input.focus();
  </script>
</body>
</html>`;
}

function scheduleTerminalFlush(): void {
  if (terminalFlushTimer !== undefined) {
    return;
  }
  terminalFlushTimer = setTimeout(() => {
    terminalFlushTimer = undefined;
    if (terminalPanel === undefined) {
      return;
    }
    if (terminalNeedsFullRefresh) {
      terminalPanel.webview.postMessage({ type: 'clear' });
      terminalPanel.webview.postMessage({ type: 'output', text: terminalBuffer });
      terminalNeedsFullRefresh = false;
      terminalPendingOutput = '';
      return;
    }
    if (terminalPendingOutput.length > 0) {
      terminalPanel.webview.postMessage({ type: 'output', text: terminalPendingOutput });
      terminalPendingOutput = '';
    }
  }, TERMINAL_FLUSH_MS);
}

function stripAndDetectClear(text: string): { remaining: string; shouldClear: boolean } {
  // The adapter emits terminal output a byte at a time, so ANSI escape sequences
  // (e.g. ESC[2J ESC[H) can arrive split across multiple events. Track a small
  // carry buffer so we can correctly consume them.
  const input = terminalAnsiCarry + text;
  terminalAnsiCarry = '';

  let remaining = '';
  let shouldClear = false;

  let esc = '';
  const flushEscAsText = (): void => {
    remaining += esc;
    esc = '';
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? '';

    if (esc.length === 0) {
      if (ch === '\u001b') {
        esc = ch;
      } else {
        remaining += ch;
      }
      continue;
    }

    esc += ch;

    // Support CSI sequences: ESC [ params letter
    if (esc.length === 2) {
      // If it's not CSI, treat it as text and move on.
      if (esc[1] !== '[') {
        flushEscAsText();
      }
      continue;
    }

    const final = esc[esc.length - 1] ?? '';
    const isFinal = /^[A-Za-z]$/.test(final);
    if (!isFinal) {
      // Bound the maximum length we will buffer for an ANSI sequence.
      if (esc.length > 32) {
        flushEscAsText();
      }
      continue;
    }

    // We have a complete CSI sequence; decide whether to clear.
    if (final === 'J') {
      shouldClear = true;
    }

    // Consume the escape sequence (do not emit).
    esc = '';
  }

  // If we ended mid-escape, carry it to the next chunk.
  if (esc.length > 0) {
    terminalAnsiCarry = esc;
  }

  return { remaining, shouldClear };
}
