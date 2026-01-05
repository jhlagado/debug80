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
let tec1Panel: vscode.WebviewPanel | undefined;
let tec1Session: vscode.DebugSession | undefined;
let tec1Digits = Array.from({ length: 6 }, () => 0);
let tec1Speaker = false;
let tec1SpeedMode: 'slow' | 'fast' = 'slow';
let enforceSourceColumn = false;
let movingEditor = false;
const activeZ80Sessions = new Set<string>();
const sessionPlatforms = new Map<string, string>();

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
    vscode.commands.registerCommand('debug80.openTec1', async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        openTec1Panel(undefined, { focus: true });
        return;
      }
      openTec1Panel(session, { focus: true });
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      if (session.type === 'z80') {
        activeZ80Sessions.add(session.id);
        enforceSourceColumn = true;
        clearTerminal();
        clearTec1Display();
        sessionPlatforms.delete(session.id);
      }
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (terminalSession?.id === session.id) {
        terminalSession = undefined;
      }
      if (tec1Session?.id === session.id) {
        tec1Session = undefined;
      }
      if (session.type === 'z80') {
        activeZ80Sessions.delete(session.id);
        sessionPlatforms.delete(session.id);
        if (activeZ80Sessions.size === 0) {
          enforceSourceColumn = false;
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidReceiveDebugSessionCustomEvent((evt) => {
      if (evt.session.type !== 'z80') {
        return;
      }
      if (evt.event === 'debug80/platform') {
        const id = (evt.body as { id?: string } | undefined)?.id;
        if (id) {
          sessionPlatforms.set(evt.session.id, id);
        }
        if (id === 'tec1') {
          openTec1Panel(evt.session, { focus: false, reveal: true });
        } else {
          openTerminalPanel(evt.session, { focus: false, reveal: true });
        }
        return;
      }
      if (evt.event === 'debug80/terminalOutput') {
        const text = (evt.body as { text?: string } | undefined)?.text ?? '';
        if (terminalPanel === undefined) {
          openTerminalPanel(evt.session, { focus: false, reveal: true });
        }
        appendTerminalOutput(text);
        return;
      }
      if (evt.event === 'debug80/tec1Update') {
        const payload = evt.body as {
          digits?: number[];
          speaker?: number;
          speakerHz?: number;
          speedMode?: 'slow' | 'fast';
        } | undefined;
        if (!payload?.digits) {
          return;
        }
        updateTec1Display(
          payload.digits,
          payload.speaker === 1,
          payload.speedMode,
          payload.speakerHz
        );
      }
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
          platform: 'simple',
          simple: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 65535, kind: 'ram' },
            ],
            appStart: 0x0900,
            entry: 0,
          },
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

function openTec1Panel(
  session?: vscode.DebugSession,
  options?: { focus?: boolean; reveal?: boolean }
): void {
  const focus = options?.focus ?? false;
  const reveal = options?.reveal ?? true;
  const targetColumn = getTerminalColumn();
  if (tec1Panel === undefined) {
    tec1Panel = vscode.window.createWebviewPanel(
      'debug80Tec1',
      'Debug80 TEC-1',
      targetColumn,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    tec1Panel.onDidDispose(() => {
      tec1Panel = undefined;
      tec1Session = undefined;
      tec1Digits = Array.from({ length: 6 }, () => 0);
      tec1Speaker = false;
      tec1SpeedMode = 'fast';
    });
    tec1Panel.webview.onDidReceiveMessage(
      async (msg: { type?: string; code?: number; mode?: 'slow' | 'fast' }) => {
      if (msg.type === 'key' && typeof msg.code === 'number') {
        const targetSession = tec1Session ?? vscode.debug.activeDebugSession;
        if (targetSession?.type === 'z80') {
          try {
            await targetSession.customRequest('debug80/tec1Key', { code: msg.code });
          } catch {
            /* ignore */
          }
        }
      }
      if (msg.type === 'reset') {
        const targetSession = tec1Session ?? vscode.debug.activeDebugSession;
        if (targetSession?.type === 'z80') {
          try {
            await targetSession.customRequest('debug80/tec1Reset', {});
          } catch {
            /* ignore */
          }
        }
      }
      if (msg.type === 'speed' && (msg.mode === 'slow' || msg.mode === 'fast')) {
        const targetSession = tec1Session ?? vscode.debug.activeDebugSession;
        if (targetSession?.type === 'z80') {
          try {
            await targetSession.customRequest('debug80/tec1Speed', { mode: msg.mode });
          } catch {
            /* ignore */
          }
        }
      }
    });
  }
  if (session !== undefined) {
    tec1Session = session;
  }
  if (reveal) {
    tec1Panel.reveal(targetColumn, !focus);
  }
  tec1Panel.webview.html = getTec1Html();
  updateTec1Display(tec1Digits, tec1Speaker);
}

function updateTec1Display(
  digits: number[],
  speaker: boolean,
  speedMode?: 'slow' | 'fast',
  speakerHz?: number
): void {
  tec1Digits = digits.slice(0, 6);
  tec1Speaker = speaker;
  if (speedMode) {
    tec1SpeedMode = speedMode;
  }
  if (tec1Panel !== undefined) {
    tec1Panel.webview.postMessage({
      type: 'update',
      digits: tec1Digits,
      speaker: tec1Speaker,
      speedMode: tec1SpeedMode,
      speakerHz,
    });
  }
}

function clearTec1Display(): void {
  tec1Digits = Array.from({ length: 6 }, () => 0);
  tec1Speaker = false;
  if (tec1Panel !== undefined) {
    tec1Panel.webview.postMessage({
      type: 'update',
      digits: tec1Digits,
      speaker: false,
      speedMode: tec1SpeedMode,
    });
  }
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
      out.textContent += payload;
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

function getTec1Html(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, sans-serif;
      background: #1c1c1c;
      color: #f0f0f0;
    }
    #app {
      outline: none;
    }
    .display {
      display: flex;
      flex-direction: row-reverse;
      gap: 10px;
      padding: 12px;
      background: #101010;
      border-radius: 8px;
      width: fit-content;
    }
    .digit svg {
      width: 36px;
      height: 60px;
    }
    .seg {
      fill: #320000;
    }
    .seg.on {
      fill: #ff3b3b;
    }
    .speaker {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      background: #333;
      font-size: 12px;
      letter-spacing: 0.08em;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .speaker.on {
      background: #ffb000;
      color: #000;
    }
    .status {
      margin-top: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .key.speed {
      padding: 4px 10px;
      font-size: 12px;
      letter-spacing: 0.08em;
      min-width: 60px;
    }
    .keypad {
      margin-top: 16px;
      display: grid;
      grid-template-columns: 56px repeat(4, 48px);
      gap: 8px;
      align-items: center;
    }
    .controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-right: 8px;
    }
    .key {
      background: #2b2b2b;
      border: 1px solid #444;
      border-radius: 6px;
      color: #fff;
      padding: 6px 0;
      text-align: center;
      cursor: pointer;
      user-select: none;
      font-size: 12px;
    }
    .key:active {
      background: #3a3a3a;
    }
  </style>
</head>
<body>
  <div id="app" tabindex="0">
    <div class="display" id="display"></div>
    <div class="status">
      <div class="speaker" id="speaker">
        <span>SPEAKER</span>
        <span id="speakerHz"></span>
      </div>
      <div class="key speed" id="speed">FAST</div>
    </div>
    <div class="keypad" id="keypad"></div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const displayEl = document.getElementById('display');
    const keypadEl = document.getElementById('keypad');
    const speakerEl = document.getElementById('speaker');
    const speakerHzEl = document.getElementById('speakerHz');
    const speedEl = document.getElementById('speed');
    const DIGITS = 6;
    const SEGMENTS = [
      { mask: 0x01, points: '1,1 2,0 8,0 9,1 8,2 2,2' },
      { mask: 0x08, points: '9,1 10,2 10,8 9,9 8,8 8,2' },
      { mask: 0x20, points: '9,9 10,10 10,16 9,17 8,16 8,10' },
      { mask: 0x80, points: '9,17 8,18 2,18 1,17 2,16 8,16' },
      { mask: 0x40, points: '1,17 0,16 0,10 1,9 2,10 2,16' },
      { mask: 0x02, points: '1,9 0,8 0,2 1,1 2,2 2,8' },
      { mask: 0x04, points: '1,9 2,8 8,8 9,9 8,10 2,10' },
    ];

    function createDigit() {
      const wrapper = document.createElement('div');
      wrapper.className = 'digit';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 -1 12 20');
      SEGMENTS.forEach(seg => {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', seg.points);
        poly.dataset.mask = String(seg.mask);
        poly.classList.add('seg');
        svg.appendChild(poly);
      });
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', '11');
      dot.setAttribute('cy', '17');
      dot.setAttribute('r', '1');
      dot.dataset.mask = '16';
      dot.classList.add('seg');
      svg.appendChild(dot);
      wrapper.appendChild(svg);
      return wrapper;
    }

    const digitEls = [];
    for (let i = 0; i < DIGITS; i++) {
      const digit = createDigit();
      digitEls.push(digit);
      displayEl.appendChild(digit);
    }

    const keyMap = {
      '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
      '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
      'A': 0x0A, 'B': 0x0B, 'C': 0x0C, 'D': 0x0D, 'E': 0x0E, 'F': 0x0F,
      'AD': 0x13, 'UP': 0x10, 'GO': 0x12, 'DOWN': 0x11
    };

    const controlOrder = ['AD', 'GO', 'UP', 'DOWN'];
    const hexOrder = [
      'F', 'E', 'D', 'C',
      'B', 'A', '9', '8',
      '7', '6', '5', '4',
      '3', '2', '1', '0'
    ];

    let speedMode = 'fast';

    function applySpeed(mode) {
      speedMode = mode;
      speedEl.textContent = mode.toUpperCase();
      speedEl.classList.toggle('slow', mode === 'slow');
      speedEl.classList.toggle('fast', mode === 'fast');
    }

    function sendKey(code) {
      vscode.postMessage({ type: 'key', code });
    }

    function addButton(label, action) {
      const button = document.createElement('div');
      button.className = 'key';
      button.textContent = label;
      button.addEventListener('click', action);
      keypadEl.appendChild(button);
    }

    for (let row = 0; row < 4; row += 1) {
      const control = controlOrder[row];
      addButton(control, () => sendKey(keyMap[control]));
      const rowStart = row * 4;
      for (let col = 0; col < 4; col += 1) {
        const label = hexOrder[rowStart + col];
        addButton(label, () => sendKey(keyMap[label]));
      }
    }

    addButton('RST', () => vscode.postMessage({ type: 'reset' }));
    speedEl.addEventListener('click', () => {
      const next = speedMode === 'fast' ? 'slow' : 'fast';
      applySpeed(next);
      vscode.postMessage({ type: 'speed', mode: next });
    });

    function updateDigit(el, value) {
      const segments = el.querySelectorAll('[data-mask]');
      segments.forEach(seg => {
        const mask = parseInt(seg.dataset.mask || '0', 10);
        if (value & mask) {
          seg.classList.add('on');
        } else {
          seg.classList.remove('on');
        }
      });
    }

    function applyUpdate(payload) {
      const digits = payload.digits || [];
      digitEls.forEach((el, idx) => {
        updateDigit(el, digits[idx] || 0);
      });
      if (payload.speaker) {
        speakerEl.classList.add('on');
      } else {
        speakerEl.classList.remove('on');
      }
      if (speakerHzEl) {
        if (typeof payload.speakerHz === 'number' && payload.speakerHz > 0) {
          speakerHzEl.textContent = payload.speakerHz + ' Hz';
        } else {
          speakerHzEl.textContent = '';
        }
      }
      if (payload.speedMode === 'slow' || payload.speedMode === 'fast') {
        applySpeed(payload.speedMode);
      }
    }

    window.addEventListener('message', event => {
      if (event.data && event.data.type === 'update') {
        applyUpdate(event.data);
      }
    });

    document.getElementById('app').focus();

    window.addEventListener('keydown', event => {
      if (event.repeat) return;
      const key = event.key.toUpperCase();
      if (keyMap[key] !== undefined) {
        sendKey(keyMap[key]);
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter') {
        sendKey(0x12);
        event.preventDefault();
      } else if (event.key === 'ArrowUp') {
        sendKey(0x10);
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        sendKey(0x11);
        event.preventDefault();
      } else if (event.key === 'Tab') {
        sendKey(0x13);
        event.preventDefault();
      }
    });
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
