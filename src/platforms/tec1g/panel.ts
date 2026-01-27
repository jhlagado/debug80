import * as vscode from 'vscode';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';

type Tec1gPanelTab = 'ui' | 'memory';

export interface Tec1gPanelController {
  open(
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn; tab?: Tec1gPanelTab }
  ): void;
  update(payload: Tec1gUpdatePayload): void;
  appendSerial(text: string): void;
  clear(): void;
  handleSessionTerminated(sessionId: string): void;
}

export function createTec1gPanelController(
  getTargetColumn: () => vscode.ViewColumn,
  getFallbackSession: () => vscode.DebugSession | undefined
): Tec1gPanelController {
  let panel: vscode.WebviewPanel | undefined;
  let session: vscode.DebugSession | undefined;
  let digits = Array.from({ length: 6 }, () => 0);
  let matrix = Array.from({ length: 8 }, () => 0);
  let speaker = false;
  let speedMode: Tec1gSpeedMode = 'fast';
  let lcd = Array.from({ length: 80 }, () => 0x20);
  let serialBuffer = '';
  const serialMaxChars = 8000;
  let activeTab: Tec1gPanelTab = 'ui';
  const windowBefore = 16;
  const rowSize = 16;
  const viewModes: Record<string, string> = { a: 'pc', b: 'sp', c: 'hl', d: 'de' };
  const viewAfter: Record<string, number> = { a: 16, b: 16, c: 16, d: 16 };
  const viewAddress: Record<string, number | undefined> = {
    a: undefined,
    b: undefined,
    c: undefined,
    d: undefined,
  };
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let refreshInFlight = false;
  const autoRefreshMs = 150;

  const open = (
    targetSession?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn; tab?: Tec1gPanelTab }
  ): void => {
    const focus = options?.focus ?? false;
    const reveal = options?.reveal ?? true;
    const targetColumn = options?.column ?? getTargetColumn();
    if (options?.tab === 'ui' || options?.tab === 'memory') {
      activeTab = options.tab;
    }
    if (panel === undefined) {
      panel = vscode.window.createWebviewPanel(
        'debug80Tec1g',
        'Debug80 TEC-1G',
        targetColumn,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.onDidDispose(() => {
        stopAutoRefresh();
        panel = undefined;
        session = undefined;
        digits = Array.from({ length: 6 }, () => 0);
        matrix = Array.from({ length: 8 }, () => 0);
        speaker = false;
        speedMode = 'slow';
        lcd = Array.from({ length: 80 }, () => 0x20);
        activeTab = 'ui';
      });
      panel.onDidChangeViewState((event) => {
        if (!event.webviewPanel.visible) {
          stopAutoRefresh();
          return;
        }
        if (activeTab === 'memory') {
          startAutoRefresh();
          void refreshSnapshot(true);
        }
      });
      panel.webview.onDidReceiveMessage(
        async (msg: {
          type?: string;
          code?: number;
          mode?: Tec1gSpeedMode;
          text?: string;
          id?: string;
          tab?: string;
          views?: Array<{ id?: string; view?: string; after?: number; address?: number }>;
        }) => {
          if (msg.type === 'tab' && (msg.tab === 'ui' || msg.tab === 'memory')) {
            activeTab = msg.tab;
            if (panel?.visible === true && activeTab === 'memory') {
              startAutoRefresh();
              void refreshSnapshot(true);
            } else {
              stopAutoRefresh();
            }
            return;
          }
          if (msg.type === 'refresh' && Array.isArray(msg.views)) {
            applyMemoryViews(msg.views);
            void refreshSnapshot(true);
            return;
          }
          if (msg.type === 'key' && typeof msg.code === 'number') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1gKey', { code: msg.code });
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'reset') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1gReset', {});
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'speed' && (msg.mode === 'slow' || msg.mode === 'fast')) {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1gSpeed', { mode: msg.mode });
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'serialSend' && typeof msg.text === 'string') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1gSerialInput', { text: msg.text });
              } catch {
                /* ignore */
              }
            }
          }
        }
      );
    }
    if (targetSession !== undefined) {
      session = targetSession;
    }
    if (reveal) {
      panel.reveal(targetColumn, !focus);
    }
    panel.webview.html = getTec1gHtml(activeTab);
    update({ digits, matrix, speaker: speaker ? 1 : 0, speedMode, lcd });
    if (serialBuffer.length > 0) {
      void panel.webview.postMessage({ type: 'serialInit', text: serialBuffer });
    }
    void panel.webview.postMessage({ type: 'selectTab', tab: activeTab });
    if (activeTab === 'memory') {
      startAutoRefresh();
      void refreshSnapshot(true);
    } else {
      stopAutoRefresh();
    }
  };

  const update = (payload: Tec1gUpdatePayload): void => {
    digits = payload.digits.slice(0, 6);
    matrix = payload.matrix.slice(0, 8);
    speaker = payload.speaker === 1;
    speedMode = payload.speedMode;
    lcd = payload.lcd.slice(0, 80);
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'update',
        digits,
        matrix,
        speaker,
        speedMode,
        lcd,
        speakerHz: payload.speakerHz,
      });
    }
  };

  const appendSerial = (text: string): void => {
    if (text.length === 0) {
      return;
    }
    serialBuffer += text;
    if (serialBuffer.length > serialMaxChars) {
      serialBuffer = serialBuffer.slice(serialBuffer.length - serialMaxChars);
    }
    if (panel !== undefined) {
      void panel.webview.postMessage({ type: 'serial', text });
    }
  };

  const clear = (): void => {
    digits = Array.from({ length: 6 }, () => 0);
    matrix = Array.from({ length: 8 }, () => 0);
    speaker = false;
        lcd = Array.from({ length: 80 }, () => 0x20);
    serialBuffer = '';
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'update',
        digits,
        matrix,
        speaker: false,
        speedMode,
        lcd,
      });
      void panel.webview.postMessage({ type: 'serialClear' });
    }
  };

  const handleSessionTerminated = (sessionId: string): void => {
    if (session?.id === sessionId) {
      session = undefined;
      stopAutoRefresh();
      clear();
    }
  };

  return {
    open,
    update,
    appendSerial,
    clear,
    handleSessionTerminated,
  };

  function applyMemoryViews(
    views: Array<{ id?: string; view?: string; after?: number; address?: number }>
  ): void {
    for (const entry of views) {
      const id = typeof entry.id === 'string' ? entry.id : '';
      if (id !== 'a' && id !== 'b' && id !== 'c' && id !== 'd') {
        continue;
      }
      const currentAfter = viewAfter[id] ?? 16;
      const afterSize = Number.isFinite(entry.after) ? (entry.after as number) : currentAfter;
      viewAfter[id] = clampWindow(afterSize);
      const currentView = viewModes[id] ?? 'hl';
      viewModes[id] = typeof entry.view === 'string' ? entry.view : currentView;
      viewAddress[id] =
        typeof entry.address === 'number' && Number.isFinite(entry.address)
          ? (entry.address & 0xffff)
          : undefined;
    }
  }

  async function refreshSnapshot(allowErrors?: boolean): Promise<void> {
    if (panel === undefined) {
      return;
    }
    if (refreshInFlight) {
      return;
    }
    const target = session ?? getFallbackSession();
    if (!target || target.type !== 'z80') {
      if (allowErrors === true) {
        void panel.webview.postMessage({
          type: 'snapshotError',
          message: 'No active z80 session.',
        });
      }
      return;
    }
    refreshInFlight = true;
    try {
      const views = Object.keys(viewModes).map((id) => ({
        id,
        view: viewModes[id],
        after: viewAfter[id],
        address: viewModes[id] === 'absolute' ? viewAddress[id] : undefined,
      }));
      const payload = (await target.customRequest('debug80/tec1gMemorySnapshot', {
        before: windowBefore,
        rowSize,
        views,
      })) as unknown;
      if (payload === null || payload === undefined || typeof payload !== 'object') {
        void panel.webview.postMessage({
          type: 'snapshotError',
          message: 'Invalid snapshot payload.',
        });
        return;
      }
      void panel.webview.postMessage({ type: 'snapshot', ...(payload as SnapshotPayload) });
    } catch (err) {
      if (allowErrors === true) {
        void panel.webview.postMessage({
          type: 'snapshotError',
          message: `Failed to read memory: ${String(err)}`,
        });
      }
    } finally {
      refreshInFlight = false;
    }
  }

  function startAutoRefresh(): void {
    if (refreshTimer !== undefined) {
      return;
    }
    refreshTimer = setInterval(() => {
      void refreshSnapshot(false);
    }, autoRefreshMs);
  }

  function stopAutoRefresh(): void {
    if (refreshTimer !== undefined) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
  }
}

function getTec1gHtml(activeTab: Tec1gPanelTab): string {
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
    .layout {
      display: grid;
      grid-template-columns: auto 300px;
      gap: 16px;
      align-items: start;
    }
    .left-col,
    .right-col {
      display: flex;
      flex-direction: column;
      gap: 12px;
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
    .key.mute {
      padding: 4px 10px;
      font-size: 12px;
      letter-spacing: 0.08em;
      min-width: 80px;
    }
    .keypad {
      display: grid;
      grid-template-columns: 48px 56px repeat(4, 48px);
      grid-template-rows: repeat(4, 44px);
      gap: 8px;
      align-items: center;
      width: fit-content;
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
    .key.active {
      background: #505050;
      border-color: #6a6a6a;
    }
    .key.spacer {
      background: transparent;
      border-color: transparent;
      cursor: default;
    }
    .key.shift {
      letter-spacing: 0.08em;
    }
    .serial {
      margin-top: 16px;
      background: #101010;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .lcd {
      margin-top: 0;
      background: #0f1f13;
      border-radius: 8px;
      padding: 10px 12px;
      border: 1px solid #213826;
      width: fit-content;
    }
    .matrix {
      margin-top: 12px;
      background: #1b0b0b;
      border-radius: 8px;
      padding: 10px 12px;
      border: 1px solid #3b1212;
      width: fit-content;
    }
    .matrix-title {
      font-size: 12px;
      letter-spacing: 0.08em;
      color: #e0b0b0;
      margin-bottom: 8px;
    }
    .matrix-grid {
      display: grid;
      grid-template-columns: repeat(8, 18px);
      grid-template-rows: repeat(8, 18px);
      gap: 6px;
      background: #120707;
      padding: 8px;
      border-radius: 6px;
      border: 1px solid #2f1111;
    }
    .matrix-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #6b1515, #3a0a0a 70%);
      box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.6);
    }
    .matrix-dot.on {
      background: radial-gradient(circle at 30% 30%, #ff6b6b, #c01010 70%);
      box-shadow: 0 0 8px rgba(255, 60, 60, 0.6);
    }
    .lcd-title {
      font-size: 12px;
      letter-spacing: 0.08em;
      color: #9bbfa0;
      margin-bottom: 6px;
    }
    .lcd-canvas {
      display: block;
      background: #0b1a10;
      border-radius: 4px;
      image-rendering: pixelated;
    }
    .serial-title {
      font-size: 12px;
      letter-spacing: 0.08em;
      color: #c0c0c0;
      margin-bottom: 6px;
    }
    .serial-body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
        'Courier New', monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 160px;
      overflow-y: auto;
    }
    .serial-input {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .serial-input input {
      flex: 1;
      background: #0b0b0b;
      border: 1px solid #333;
      border-radius: 6px;
      color: #f0f0f0;
      padding: 6px 8px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
        'Courier New', monospace;
    }
    .serial-input input:focus {
      outline: 1px solid #555;
    }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .tab {
      background: #1f1f1f;
      border: 1px solid #333;
      color: #d0d0d0;
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 11px;
      letter-spacing: 0.12em;
      cursor: pointer;
    }
    .tab.active {
      background: #3a3a3a;
      color: #fff;
      border-color: #5a5a5a;
    }
    .panel {
      display: none;
    }
    .panel.active {
      display: block;
    }
    #memoryPanel {
      margin-top: 4px;
    }
    #memoryPanel .shell {
      border: 1px solid #2c2c2c;
      border-radius: 10px;
      padding: 12px;
      background: #121212;
    }
    #memoryPanel h1 {
      font-size: 16px;
      margin: 0 0 8px 0;
    }
    #memoryPanel .section {
      margin-top: 12px;
    }
    #memoryPanel .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    #memoryPanel .section h2 {
      font-size: 13px;
      margin: 0 0 6px 0;
      color: #d8d8d8;
    }
    #memoryPanel .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    #memoryPanel .controls label {
      font-size: 11px;
      color: #9aa0a6;
    }
    #memoryPanel .controls select,
    #memoryPanel .controls input {
      background: #1f1f1f;
      color: #f0f0f0;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
    }
    #memoryPanel .controls input {
      width: 100px;
    }
    #memoryPanel .addr {
      color: #7cc1ff;
      margin-left: 6px;
    }
    #memoryPanel .symbol {
      color: #9aa0a6;
      margin-left: 8px;
      font-size: 11px;
    }
    #memoryPanel .dump {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
      font-size: 11px;
      background: #0b0b0b;
      border: 1px solid #2c2c2c;
      border-radius: 8px;
      padding: 8px;
      overflow-x: auto;
      white-space: pre;
    }
    #memoryPanel .row {
      display: flex;
      gap: 10px;
      line-height: 1.6;
    }
    #memoryPanel .row .row-addr {
      width: 72px;
      color: #6aa6d6;
    }
    #memoryPanel .byte {
      display: inline-block;
      width: 22px;
      text-align: center;
    }
    #memoryPanel .byte.focus {
      color: #111;
      background: #ffd05c;
      border-radius: 4px;
    }
    #memoryPanel .ascii {
      margin-left: 12px;
      color: #cfcfcf;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div id="app" tabindex="0">
    <div class="tabs">
      <button class="tab" data-tab="ui">UI</button>
      <button class="tab" data-tab="memory">MEMORY</button>
    </div>
    <div class="panel panel-ui" id="panel-ui">
      <div class="layout">
        <div class="left-col">
          <div class="lcd">
            <div class="lcd-title">LCD (HD44780 A00)</div>
            <canvas class="lcd-canvas" id="lcdCanvas" width="224" height="40"></canvas>
          </div>
          <div class="display" id="display"></div>
          <div class="status">
            <div class="key speed" id="speed">SLOW</div>
            <div class="key mute" id="mute">MUTED</div>
            <div class="speaker" id="speaker">
              <span id="speakerLabel">SPEAKER</span>
            </div>
          </div>
        </div>
        <div class="right-col">
          <div class="keypad" id="keypad"></div>
          <div class="matrix">
            <div class="matrix-title">8x8 LED MATRIX</div>
            <div class="matrix-grid" id="matrixGrid"></div>
          </div>
        </div>
      </div>
      <div class="serial">
        <div class="serial-title">SERIAL (BIT 6)</div>
        <pre class="serial-body" id="serialOut"></pre>
        <div class="serial-input">
          <input id="serialInput" type="text" placeholder="Type and press Enter (CR)..." />
          <div class="key" id="serialSend">SEND</div>
        </div>
      </div>
    </div>
    <div class="panel panel-memory" id="panel-memory">
      <div class="memory-panel" id="memoryPanel">
        <div class="shell">
          <h1>CPU Pointer View</h1>
          <div class="section">
            <div class="section-header">
              <h2><span id="label-a">PC</span> <span class="addr" id="addr-a">0x0000</span><span class="symbol" id="sym-a"></span></h2>
              <div class="controls">
                <select id="view-a">
                  <option value="pc" selected>PC</option>
                  <option value="sp">SP</option>
                  <option value="bc">BC</option>
                  <option value="de">DE</option>
                  <option value="hl">HL</option>
                  <option value="ix">IX</option>
                  <option value="iy">IY</option>
                  <option value="absolute">Absolute</option>
                </select>
                <input id="address-a" type="text" placeholder="0x0000" />
                <select id="after-a">
                  <option value="16" selected>16</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                </select>
              </div>
            </div>
            <div class="dump" id="dump-a"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <h2><span id="label-b">SP</span> <span class="addr" id="addr-b">0x0000</span><span class="symbol" id="sym-b"></span></h2>
              <div class="controls">
                <select id="view-b">
                  <option value="pc">PC</option>
                  <option value="sp" selected>SP</option>
                  <option value="bc">BC</option>
                  <option value="de">DE</option>
                  <option value="hl">HL</option>
                  <option value="ix">IX</option>
                  <option value="iy">IY</option>
                  <option value="absolute">Absolute</option>
                </select>
                <input id="address-b" type="text" placeholder="0x0000" />
                <select id="after-b">
                  <option value="16" selected>16</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                </select>
              </div>
            </div>
            <div class="dump" id="dump-b"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <h2><span id="label-c">HL</span> <span class="addr" id="addr-c">0x0000</span><span class="symbol" id="sym-c"></span></h2>
              <div class="controls">
                <select id="view-c">
                  <option value="pc">PC</option>
                  <option value="sp">SP</option>
                  <option value="bc">BC</option>
                  <option value="de">DE</option>
                  <option value="hl" selected>HL</option>
                  <option value="ix">IX</option>
                  <option value="iy">IY</option>
                  <option value="absolute">Absolute</option>
                </select>
                <input id="address-c" type="text" placeholder="0x0000" />
                <select id="after-c">
                  <option value="16" selected>16</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                </select>
              </div>
            </div>
            <div class="dump" id="dump-c"></div>
          </div>
          <div class="section">
            <div class="section-header">
              <h2><span id="label-d">DE</span> <span class="addr" id="addr-d">0x0000</span><span class="symbol" id="sym-d"></span></h2>
              <div class="controls">
                <select id="view-d">
                  <option value="pc">PC</option>
                  <option value="sp">SP</option>
                  <option value="bc">BC</option>
                  <option value="de" selected>DE</option>
                  <option value="hl">HL</option>
                  <option value="ix">IX</option>
                  <option value="iy">IY</option>
                  <option value="absolute">Absolute</option>
                </select>
                <input id="address-d" type="text" placeholder="0x0000" />
                <select id="after-d">
                  <option value="16" selected>16</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                </select>
              </div>
            </div>
            <div class="dump" id="dump-d"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const DEFAULT_TAB = '${activeTab}';
    const displayEl = document.getElementById('display');
    const keypadEl = document.getElementById('keypad');
    const speakerEl = document.getElementById('speaker');
    const speakerLabel = document.getElementById('speakerLabel');
    const speedEl = document.getElementById('speed');
    const muteEl = document.getElementById('mute');
    const serialOutEl = document.getElementById('serialOut');
    const serialInputEl = document.getElementById('serialInput');
    const serialSendEl = document.getElementById('serialSend');
    const lcdCanvas = document.getElementById('lcdCanvas');
    const lcdCtx = lcdCanvas && lcdCanvas.getContext ? lcdCanvas.getContext('2d') : null;
    const matrixGrid = document.getElementById('matrixGrid');
    const tabButtons = Array.from(document.querySelectorAll('[data-tab]'));
    const panelUi = document.getElementById('panel-ui');
    const panelMemory = document.getElementById('panel-memory');
    const SERIAL_MAX = 8000;
    const SHIFT_BIT = 0x20;
    const DIGITS = 6;
    const LCD_COLS = 20;
    const LCD_ROWS = 4;
    const LCD_CELL_W = 12;
    const LCD_CELL_H = 18;
    const LCD_BYTES = LCD_COLS * LCD_ROWS;
    let lcdBytes = new Array(LCD_BYTES).fill(0x20);
    let matrixRows = new Array(8).fill(0);
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

    let activeTab = DEFAULT_TAB === 'memory' ? 'memory' : 'ui';

    function setTab(tab, notify) {
      activeTab = tab === 'memory' ? 'memory' : 'ui';
      if (panelUi) {
        panelUi.classList.toggle('active', activeTab === 'ui');
      }
      if (panelMemory) {
        panelMemory.classList.toggle('active', activeTab === 'memory');
      }
      tabButtons.forEach((button) => {
        const isActive = button.dataset.tab === activeTab;
        button.classList.toggle('active', isActive);
      });
      if (notify) {
        vscode.postMessage({ type: 'tab', tab: activeTab });
      }
      if (activeTab === 'memory') {
        requestSnapshot();
      }
    }

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (!tab) {
          return;
        }
        setTab(tab, true);
      });
    });

    const keyMap = {
      '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
      '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
      'A': 0x0A, 'B': 0x0B, 'C': 0x0C, 'D': 0x0D, 'E': 0x0E, 'F': 0x0F,
      'AD': 0x13, 'UP': 0x10, 'GO': 0x12, 'DOWN': 0x11
    };

    const controlOrder = ['AD', 'GO', 'DOWN', 'UP'];
    const hexOrder = [
      'C', 'D', 'E', 'F',
      '8', '9', 'A', 'B',
      '4', '5', '6', '7',
      '0', '1', '2', '3'
    ];

    let speedMode = 'fast';
    let muted = true;
    let lastSpeakerOn = false;
    let lastSpeakerHz = 0;
    let shiftLatched = false;
    let audioCtx = null;
    let osc = null;
    let gain = null;

    function applySpeed(mode) {
      speedMode = mode;
      speedEl.textContent = mode.toUpperCase();
      speedEl.classList.toggle('slow', mode === 'slow');
      speedEl.classList.toggle('fast', mode === 'fast');
    }

    function lcdByteToChar(value) {
      const code = value & 0xff;
      if (code === 0x5c) {
        return '¥';
      }
      if (code === 0x7e) {
        return '▶';
      }
      if (code === 0x7f) {
        return '◀';
      }
      if (code >= 0x20 && code <= 0x7e) {
        return String.fromCharCode(code);
      }
      return ' ';
    }

    function drawLcd() {
      if (!lcdCtx || !lcdCanvas) {
        return;
      }
      lcdCanvas.width = LCD_COLS * LCD_CELL_W;
      lcdCanvas.height = LCD_ROWS * LCD_CELL_H;
      lcdCtx.fillStyle = '#0b1a10';
      lcdCtx.fillRect(0, 0, lcdCanvas.width, lcdCanvas.height);
      lcdCtx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      lcdCtx.textBaseline = 'top';
      for (let row = 0; row < LCD_ROWS; row += 1) {
        for (let col = 0; col < LCD_COLS; col += 1) {
          const idx = row * LCD_COLS + col;
          const value = lcdBytes[idx] || 0x20;
          const char = lcdByteToChar(value);
          lcdCtx.fillStyle = '#b4f5b4';
          lcdCtx.fillText(char, col * LCD_CELL_W + 2, row * LCD_CELL_H + 2);
        }
      }
    }

    function buildMatrix() {
      if (!matrixGrid) return;
      matrixGrid.innerHTML = '';
      for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          const dot = document.createElement('div');
          dot.className = 'matrix-dot';
          dot.dataset.row = String(row);
          dot.dataset.col = String(col);
          matrixGrid.appendChild(dot);
        }
      }
    }

    function drawMatrix() {
      if (!matrixGrid) return;
      const dots = matrixGrid.querySelectorAll('.matrix-dot');
      dots.forEach(dot => {
        const row = parseInt(dot.dataset.row || '0', 10);
        const col = parseInt(dot.dataset.col || '0', 10);
        const mask = 1 << col;
        if (matrixRows[row] & mask) {
          dot.classList.add('on');
        } else {
          dot.classList.remove('on');
        }
      });
    }

    function setShiftLatched(value) {
      shiftLatched = value;
      shiftButton.classList.toggle('active', shiftLatched);
    }

    function ensureAudio() {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
        osc = audioCtx.createOscillator();
        osc.type = 'square';
        gain = audioCtx.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    }

    function updateAudio() {
      if (!gain || muted || lastSpeakerHz <= 0) {
        if (gain) {
          gain.gain.value = 0;
        }
        return;
      }
      osc.frequency.setValueAtTime(lastSpeakerHz, audioCtx.currentTime);
      gain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.01);
    }

    function applyMuteState() {
      muteEl.textContent = muted ? 'MUTED' : 'SOUND';
      if (muted && gain) {
        gain.gain.value = 0;
      }
      updateAudio();
    }

    function sendKey(code) {
      let adjusted = code;
      if (shiftLatched) {
        adjusted = code & ~SHIFT_BIT;
      } else {
        adjusted = code | SHIFT_BIT;
      }
      vscode.postMessage({ type: 'key', code: adjusted });
      if (shiftLatched) {
        setShiftLatched(false);
      }
    }

    function addButton(label, action, className, col, row) {
      const button = document.createElement('div');
      button.className = className ? 'key ' + className : 'key';
      button.textContent = label;
      if (col) {
        button.style.gridColumn = String(col);
      }
      if (row) {
        button.style.gridRow = String(row);
      }
      button.addEventListener('click', action);
      keypadEl.appendChild(button);
      return button;
    }

    addButton('RESET', () => {
      setShiftLatched(false);
      vscode.postMessage({ type: 'reset' });
    }, undefined, 1, 1);
    addButton('', () => {}, 'spacer', 1, 2);
    addButton('', () => {}, 'spacer', 1, 3);

    for (let row = 0; row < 4; row += 1) {
      const control = controlOrder[row];
      const rowNum = row + 1;
      addButton(control, () => sendKey(keyMap[control]), undefined, 2, rowNum);
      const rowStart = row * 4;
      for (let col = 0; col < 4; col += 1) {
        const label = hexOrder[rowStart + col];
        addButton(label, () => sendKey(keyMap[label]), undefined, 3 + col, rowNum);
      }
    }

    const shiftButton = addButton('FN', () => {
      setShiftLatched(!shiftLatched);
    }, 'shift', 1, 4);
    speedEl.addEventListener('click', () => {
      const next = speedMode === 'fast' ? 'slow' : 'fast';
      applySpeed(next);
      vscode.postMessage({ type: 'speed', mode: next });
    });
    muteEl.addEventListener('click', () => {
      muted = !muted;
      if (!muted) {
        ensureAudio();
      }
      applyMuteState();
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
      if (speakerLabel) {
        if (typeof payload.speakerHz === 'number' && payload.speakerHz > 0) {
          speakerLabel.textContent = payload.speakerHz + ' Hz';
          lastSpeakerHz = payload.speakerHz;
        } else {
          speakerLabel.textContent = 'SPEAKER';
          lastSpeakerHz = 0;
        }
      }
      lastSpeakerOn = !!payload.speaker;
      updateAudio();
      if (payload.speedMode === 'slow' || payload.speedMode === 'fast') {
        applySpeed(payload.speedMode);
      }
      if (Array.isArray(payload.lcd)) {
        lcdBytes = payload.lcd.slice(0, LCD_BYTES);
        while (lcdBytes.length < LCD_BYTES) {
          lcdBytes.push(0x20);
        }
        drawLcd();
      }
      if (Array.isArray(payload.matrix)) {
        matrixRows = payload.matrix.slice(0, 8);
        while (matrixRows.length < 8) {
          matrixRows.push(0);
        }
        drawMatrix();
      }
    }

    function appendSerial(text) {
      if (!text) return;
      const next = (serialOutEl.textContent || '') + text;
      if (next.length > SERIAL_MAX) {
        serialOutEl.textContent = next.slice(next.length - SERIAL_MAX);
      } else {
        serialOutEl.textContent = next;
      }
      serialOutEl.scrollTop = serialOutEl.scrollHeight;
    }

    function sendSerialInput() {
      const text = (serialInputEl.value || '').trimEnd();
      if (!text) return;
      vscode.postMessage({ type: 'serialSend', text: text + '\\r' });
      serialInputEl.value = '';
      serialInputEl.focus();
    }

    const statusEl = document.getElementById('status');
    const symbolMap = new Map();
    let symbolsKey = '';
    const views = [
      {
        id: 'a',
        view: document.getElementById('view-a'),
        address: document.getElementById('address-a'),
        after: document.getElementById('after-a'),
        label: document.getElementById('label-a'),
        addr: document.getElementById('addr-a'),
        symbol: document.getElementById('sym-a'),
        dump: document.getElementById('dump-a'),
      },
      {
        id: 'b',
        view: document.getElementById('view-b'),
        address: document.getElementById('address-b'),
        after: document.getElementById('after-b'),
        label: document.getElementById('label-b'),
        addr: document.getElementById('addr-b'),
        symbol: document.getElementById('sym-b'),
        dump: document.getElementById('dump-b'),
      },
      {
        id: 'c',
        view: document.getElementById('view-c'),
        address: document.getElementById('address-c'),
        after: document.getElementById('after-c'),
        label: document.getElementById('label-c'),
        addr: document.getElementById('addr-c'),
        symbol: document.getElementById('sym-c'),
        dump: document.getElementById('dump-c'),
      },
      {
        id: 'd',
        view: document.getElementById('view-d'),
        address: document.getElementById('address-d'),
        after: document.getElementById('after-d'),
        label: document.getElementById('label-d'),
        addr: document.getElementById('addr-d'),
        symbol: document.getElementById('sym-d'),
        dump: document.getElementById('dump-d'),
      },
    ];

    function formatHex(value, width) {
      return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
    }

    function renderDump(el, start, bytes, focusOffset, rowSize) {
      let html = '';
      for (let i = 0; i < bytes.length; i += rowSize) {
        const rowAddr = (start + i) & 0xFFFF;
        html += '<div class="row"><span class="row-addr">' + formatHex(rowAddr, 4) + '</span>';
        let ascii = '';
        for (let j = 0; j < rowSize && i + j < bytes.length; j++) {
          const idx = i + j;
          const value = bytes[idx];
          const cls = idx === focusOffset ? 'byte focus' : 'byte';
          html += '<span class="' + cls + '">' + value.toString(16).toUpperCase().padStart(2, '0') + '</span>';
          ascii += value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';
        }
        html += '<span class="ascii">' + ascii + '</span></div>';
      }
      el.innerHTML = html;
    }

    function parseAddress(text) {
      const trimmed = text.trim();
      if (!trimmed) return undefined;
      if (trimmed.startsWith('0x') || /[A-Fa-f]/.test(trimmed)) {
        const value = parseInt(trimmed.replace(/^0x/i, ''), 16);
        return Number.isFinite(value) ? value & 0xFFFF : undefined;
      }
      const value = parseInt(trimmed, 10);
      return Number.isFinite(value) ? value & 0xFFFF : undefined;
    }

    function updateSymbolOptions(symbols) {
      if (!Array.isArray(symbols)) {
        return;
      }
      const nextKey = symbols
        .map((sym) =>
          sym && typeof sym.name === 'string' ? sym.name + ':' + String(sym.address) : ''
        )
        .join('|');
      if (nextKey === symbolsKey) {
        return;
      }
      symbolsKey = nextKey;
      symbolMap.clear();
      symbols.forEach((sym) => {
        if (sym && typeof sym.name === 'string' && Number.isFinite(sym.address)) {
          symbolMap.set(sym.name, sym.address & 0xffff);
        }
      });
      views.forEach((entry) => {
        const existing = entry.view.querySelector('optgroup[data-symbols="true"]');
        if (existing) {
          existing.remove();
        }
        if (symbolMap.size === 0) {
          return;
        }
        const group = document.createElement('optgroup');
        group.label = 'Symbols';
        group.dataset.symbols = 'true';
        symbols.forEach((sym) => {
          if (!sym || typeof sym.name !== 'string' || !Number.isFinite(sym.address)) {
            return;
          }
          const option = document.createElement('option');
          option.value = 'symbol:' + sym.name;
          option.textContent = sym.name;
          group.appendChild(option);
        });
        entry.view.appendChild(group);
      });
    }

    function requestSnapshot() {
      if (activeTab !== 'memory') {
        return;
      }
      const rowSize = 16;
      const payloadViews = views.map((entry) => {
        const viewValue = entry.view.value;
        let viewMode = viewValue;
        let addressValue;
        if (viewValue.startsWith('symbol:')) {
          const name = viewValue.slice(7);
          const symAddress = symbolMap.get(name);
          if (symAddress !== undefined) {
            viewMode = 'absolute';
            addressValue = symAddress;
          }
        }
        if (viewMode === 'absolute' && addressValue === undefined) {
          addressValue = parseAddress(entry.address.value);
        }
        return {
          id: entry.id,
          view: viewMode,
          after: parseInt(entry.after.value, 10),
          address: addressValue,
        };
      });
      vscode.postMessage({
        type: 'refresh',
        rowSize,
        views: payloadViews,
      });
      if (statusEl) {
        statusEl.textContent = 'Refreshing…';
      }
    }

    views.forEach((entry) => {
      entry.after.addEventListener('change', requestSnapshot);
      entry.view.addEventListener('change', () => {
        if (entry.view.value.startsWith('symbol:')) {
          const name = entry.view.value.slice(7);
          const address = symbolMap.get(name);
          if (address !== undefined) {
            entry.address.value = formatHex(address, 4);
          }
        }
        requestSnapshot();
      });
      entry.address.addEventListener('change', requestSnapshot);
    });

    window.addEventListener('message', event => {
      if (!event.data) return;
      if (event.data.type === 'selectTab') {
        setTab(event.data.tab, false);
        return;
      }
      if (event.data.type === 'update') {
        applyUpdate(event.data);
        return;
      }
      if (event.data.type === 'serial') {
        appendSerial(event.data.text || '');
        return;
      }
      if (event.data.type === 'serialInit') {
        serialOutEl.textContent = event.data.text || '';
        return;
      }
      if (event.data.type === 'serialClear') {
        serialOutEl.textContent = '';
        return;
      }
      if (event.data.type === 'snapshot') {
        updateSymbolOptions(event.data.symbols);
        if (Array.isArray(event.data.views)) {
          event.data.views.forEach((entry) => {
            const target = views.find((view) => view.id === entry.id);
            if (!target) {
              return;
            }
            const labelValue = target.view.value.startsWith('symbol:')
              ? target.view.value.slice(7)
              : target.view.value.toUpperCase();
            target.label.textContent = labelValue;
            target.addr.textContent = formatHex(entry.address ?? 0, 4);
            renderDump(target.dump, entry.start, entry.bytes, entry.focus ?? 0, 16);
            if (entry.symbol) {
              if (entry.symbolOffset) {
                const offset = entry.symbolOffset.toString(16).toUpperCase();
                target.symbol.textContent = entry.symbol + ' + 0x' + offset;
              } else {
                target.symbol.textContent = entry.symbol;
              }
            } else {
              target.symbol.textContent = '';
            }
          });
        }
        if (statusEl) {
          statusEl.textContent = 'Updated';
        }
        return;
      }
      if (event.data.type === 'snapshotError') {
        if (statusEl) {
          statusEl.textContent = event.data.message || 'Snapshot failed';
        }
      }
    });

    applySpeed(speedMode);
    applyMuteState();
    drawLcd();
    buildMatrix();
    drawMatrix();
    setTab(DEFAULT_TAB, false);
    if (document.activeElement !== serialInputEl) {
      document.getElementById('app').focus();
    }

    serialSendEl.addEventListener('click', () => {
      sendSerialInput();
    });
    serialInputEl.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        sendSerialInput();
        event.preventDefault();
      }
    });

    window.addEventListener('keydown', event => {
      if (event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (target && target.isContentEditable) {
        return;
      }
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

function clampWindow(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 16;
  }
  return Math.min(1024, Math.max(1, Math.floor(value)));
}

interface SnapshotPayload {
  before: number;
  rowSize: number;
  views: Array<{
    id: string;
    view: string;
    address: number;
    start: number;
    bytes: number[];
    focus: number;
    after: number;
    symbol?: string | null;
    symbolOffset?: number | null;
  }>;
  symbols?: Array<{ name: string; address: number }>;
}
