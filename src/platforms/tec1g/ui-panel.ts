import * as vscode from 'vscode';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';
import { getHD44780A00RomData } from './hd44780-a00';
import { getST7920FontData } from './st7920-font';

type Tec1gPanelTab = 'ui' | 'memory';

export interface Tec1gPanelController {
  open(
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn; tab?: Tec1gPanelTab }
  ): void;
  update(payload: Tec1gUpdatePayload): void;
  appendSerial(text: string): void;
  setUiVisibility(visibility: Record<string, boolean> | undefined, persist?: boolean): void;
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
  let glcd = Array.from({ length: 1024 }, () => 0);
  let glcdDdram = Array.from({ length: 64 }, () => 0x20);
  let glcdState = {
    displayOn: true,
    graphicsOn: true,
    cursorOn: false,
    cursorBlink: false,
    blinkVisible: true,
    ddramAddr: 0x80,
    ddramPhase: 0,
    textShift: 0,
    scroll: 0,
    reverseMask: 0,
  };
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
  let uiVisibilityOverride: Record<string, boolean> | undefined;

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
        glcd = Array.from({ length: 1024 }, () => 0);
        glcdDdram = Array.from({ length: 64 }, () => 0x20);
        glcdState = {
          displayOn: true,
          graphicsOn: true,
          cursorOn: false,
          cursorBlink: false,
          blinkVisible: true,
          ddramAddr: 0x80,
          ddramPhase: 0,
          textShift: 0,
          scroll: 0,
          reverseMask: 0,
        };
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
    update({
      digits,
      matrix,
      glcd,
      glcdDdram,
      glcdState,
      speaker: speaker ? 1 : 0,
      speedMode,
      lcd,
    });
    if (uiVisibilityOverride) {
      void panel.webview.postMessage({
        type: 'uiVisibility',
        visibility: uiVisibilityOverride,
        persist: false,
      });
    }
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
    glcd = payload.glcd.slice(0, 1024);
    if (Array.isArray(payload.glcdDdram)) {
      glcdDdram = payload.glcdDdram.slice(0, 64);
      while (glcdDdram.length < 64) {
        glcdDdram.push(0x20);
      }
    }
    if (payload.glcdState && typeof payload.glcdState === 'object') {
      glcdState = {
        displayOn: payload.glcdState.displayOn ?? glcdState.displayOn,
        graphicsOn: payload.glcdState.graphicsOn ?? glcdState.graphicsOn,
        cursorOn: payload.glcdState.cursorOn ?? glcdState.cursorOn,
        cursorBlink: payload.glcdState.cursorBlink ?? glcdState.cursorBlink,
        blinkVisible: payload.glcdState.blinkVisible ?? glcdState.blinkVisible,
        ddramAddr: payload.glcdState.ddramAddr ?? glcdState.ddramAddr,
        ddramPhase: payload.glcdState.ddramPhase ?? glcdState.ddramPhase,
        textShift: payload.glcdState.textShift ?? glcdState.textShift,
        scroll: payload.glcdState.scroll ?? glcdState.scroll,
        reverseMask: payload.glcdState.reverseMask ?? glcdState.reverseMask,
      };
    }
    speaker = payload.speaker === 1;
    speedMode = payload.speedMode;
    lcd = payload.lcd.slice(0, 80);
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'update',
        digits,
        matrix,
        glcd,
        glcdDdram,
        glcdState,
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

  const setUiVisibility = (
    visibility: Record<string, boolean> | undefined,
    persist = false
  ): void => {
    if (!visibility) {
      return;
    }
    uiVisibilityOverride = { ...visibility };
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'uiVisibility',
        visibility: uiVisibilityOverride,
        persist,
      });
    }
  };

  const clear = (): void => {
    digits = Array.from({ length: 6 }, () => 0);
    matrix = Array.from({ length: 8 }, () => 0);
    glcd = Array.from({ length: 1024 }, () => 0);
    speaker = false;
    lcd = Array.from({ length: 80 }, () => 0x20);
    serialBuffer = '';
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'update',
        digits,
        matrix,
        glcd,
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
    setUiVisibility,
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
      justify-items: start;
      justify-content: start;
      width: fit-content;
      max-width: 100%;
    }
    .left-col,
    .right-col {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .right-col {
      align-items: stretch;
      --keypad-width: 282px;
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
      grid-template-columns: repeat(6, 42px);
      grid-template-rows: repeat(4, 42px);
      gap: 2px;
      align-items: center;
      width: var(--keypad-width);
      background: #1c1c1c;
      padding: 10px;
      border-radius: 6px;
    }
    .keycap {
      width: 42px;
      height: 42px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      cursor: pointer;
      user-select: none;
      box-shadow:
        0 4px 0 #0a0a0a,
        0 4px 2px rgba(0, 0, 0, 0.6);
    }
    .keycap::before {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 10px;
      background: linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0.5) 0%,
        rgba(255, 255, 255, 0.1) 50%,
        rgba(0, 0, 0, 0.1) 100%
      );
      box-shadow:
        inset 0 2px 4px rgba(255, 255, 255, 0.5),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
    }
    .keycap:active {
      transform: translateY(2px);
      box-shadow:
        0 2px 0 #0a0a0a,
        0 2px 1px rgba(0, 0, 0, 0.6);
    }
    .keycap .label {
      position: relative;
      font-family: system-ui, sans-serif;
      font-weight: 700;
      color: #444;
      user-select: none;
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
    }
    .keycap .label.short {
      font-size: 20px;
    }
    .keycap .label.long {
      font-size: 11px;
      letter-spacing: 0.06em;
    }
    .keycap-light {
      background: linear-gradient(to bottom, #d8dce0 0%, #b8bcc0 100%);
    }
    .keycap-cream {
      background: linear-gradient(to bottom, #efe4d0 0%, #d4c9b5 100%);
    }
    .keycap.spacer {
      background: transparent;
      box-shadow: none;
      cursor: default;
    }
    .keycap.spacer::before {
      display: none;
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
    .glcd {
      margin-top: 0;
      background: #2f6b4a;
      border-radius: 8px;
      padding: 10px 12px;
      border: 1px solid #243528;
      width: var(--keypad-width);
    }
    .glcd-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #7fb88a;
      margin-bottom: 6px;
    }
    .glcd-canvas {
      display: block;
      border: 1px solid #274334;
      border-radius: 6px;
      background: #9eb663;
      image-rendering: pixelated;
      width: 100%;
      height: auto;
      box-shadow: inset 0 0 10px rgba(10, 20, 10, 0.5);
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
    .ui-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      margin-bottom: 14px;
      padding: 8px 10px;
      background: #121212;
      border: 1px solid #2c2c2c;
      border-radius: 10px;
      font-size: 12px;
      color: #d6d6d6;
    }
    .ui-controls label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      user-select: none;
    }
    .ui-controls input {
      accent-color: #9acbff;
    }
    .ui-hidden {
      display: none !important;
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
      <div class="ui-controls" id="uiControls">
        <label><input type="checkbox" data-section="lcd" checked /> LCD</label>
        <label><input type="checkbox" data-section="display" checked /> 7-SEG</label>
        <label><input type="checkbox" data-section="keypad" checked /> KEYPAD</label>
        <label><input type="checkbox" data-section="matrix" /> 8x8 MATRIX</label>
        <label><input type="checkbox" data-section="glcd" /> GLCD</label>
        <label><input type="checkbox" data-section="serial" checked /> SERIAL</label>
      </div>
      <div class="layout">
        <div class="left-col">
          <div class="lcd ui-section" data-section="lcd">
            <div class="lcd-title">LCD (HD44780 A00)</div>
            <canvas class="lcd-canvas" id="lcdCanvas" width="224" height="40"></canvas>
          </div>
          <div class="display-block ui-section" data-section="display">
            <div class="display" id="display"></div>
            <div class="status">
              <div class="key speed" id="speed">SLOW</div>
              <div class="key mute" id="mute">MUTED</div>
              <div class="speaker" id="speaker">
                <span id="speakerLabel">SPEAKER</span>
              </div>
            </div>
          </div>
        </div>
        <div class="right-col">
          <div class="glcd ui-section" data-section="glcd">
            <div class="glcd-title">GLCD (128x64)</div>
            <canvas class="glcd-canvas" id="glcdCanvas" width="320" height="160"></canvas>
          </div>
          <div class="keypad ui-section" id="keypad" data-section="keypad"></div>
          <div class="matrix ui-section" data-section="matrix">
            <div class="matrix-title">8x8 LED MATRIX</div>
            <div class="matrix-grid" id="matrixGrid"></div>
          </div>
        </div>
      </div>
      <div class="serial ui-section" data-section="serial">
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
    const glcdCanvas = document.getElementById('glcdCanvas');
    const glcdCtx = glcdCanvas && glcdCanvas.getContext ? glcdCanvas.getContext('2d') : null;
    const glcdBaseCanvas = glcdCtx ? document.createElement('canvas') : null;
    const glcdBaseCtx = glcdBaseCanvas ? glcdBaseCanvas.getContext('2d') : null;
    const matrixGrid = document.getElementById('matrixGrid');
    const tabButtons = Array.from(document.querySelectorAll('[data-tab]'));
    const panelUi = document.getElementById('panel-ui');
    const panelMemory = document.getElementById('panel-memory');
    const uiControls = document.getElementById('uiControls');
    const uiSectionNodes = Array.from(document.querySelectorAll('.ui-section'));
    const SERIAL_MAX = 8000;
    const SHIFT_BIT = 0x20;
    const DIGITS = 6;
    const LCD_COLS = 20;
    const LCD_ROWS = 4;
    const LCD_BYTES = LCD_COLS * LCD_ROWS;
    const GLCD_WIDTH = 128;
    const GLCD_HEIGHT = 64;
    const GLCD_BYTES = 1024;
    let lcdBytes = new Array(LCD_BYTES).fill(0x20);
    ${getHD44780A00RomData()}
    ${getST7920FontData()}
    const GLCD_DDRAM_SIZE = 64;
    const GLCD_TEXT_COLS = 16;
    const GLCD_TEXT_ROWS = 4;
    let glcdDdram = new Array(GLCD_DDRAM_SIZE).fill(0x20);
    let glcdDisplayOn = true;
    let glcdGraphicsOn = true;
    let glcdCursorOn = false;
    let glcdCursorBlink = false;
    let glcdCursorAddr = 0x80;
    let glcdCursorPhase = 0;
    let glcdTextShift = 0;
    let glcdScroll = 0;
    let glcdReverseMask = 0;
    let glcdBlinkVisible = true;
    let glcdBytes = new Array(GLCD_BYTES).fill(0x00);
    if (glcdBaseCanvas) {
      glcdBaseCanvas.width = GLCD_WIDTH;
      glcdBaseCanvas.height = GLCD_HEIGHT;
    }
    const glcdImageData =
      glcdBaseCtx && glcdBaseCanvas
        ? glcdBaseCtx.createImageData(GLCD_WIDTH, GLCD_HEIGHT)
        : null;
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

    const defaultVisibility = {
      lcd: true,
      display: true,
      keypad: true,
      matrix: false,
      glcd: false,
      serial: true,
    };

    function applyVisibility(visibility) {
      uiSectionNodes.forEach((node) => {
        const key = node.dataset.section;
        if (!key) {
          return;
        }
        const enabled = visibility[key] !== false;
        node.classList.toggle('ui-hidden', !enabled);
      });
      if (uiControls) {
        uiControls
          .querySelectorAll('input[type="checkbox"][data-section]')
          .forEach((input) => {
            const key = input.dataset.section;
            if (!key) {
              return;
            }
            input.checked = visibility[key] !== false;
          });
      }
    }

    function loadVisibility() {
      const stored = vscode.getState();
      const visibility = {
        ...defaultVisibility,
        ...(stored && stored.uiVisibility ? stored.uiVisibility : {}),
      };
      applyVisibility(visibility);
      return visibility;
    }

    function saveVisibility(visibility) {
      const stored = vscode.getState() || {};
      vscode.setState({ ...stored, uiVisibility: visibility });
    }

    function applyVisibilityOverride(visibility, persist) {
      if (!visibility || typeof visibility !== 'object') {
        return;
      }
      uiVisibility = { ...defaultVisibility, ...visibility };
      applyVisibility(uiVisibility);
      if (persist) {
        saveVisibility(uiVisibility);
      }
    }

    let uiVisibility = loadVisibility();

    if (uiControls) {
      uiControls.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        const key = target.dataset.section;
        if (!key) {
          return;
        }
        uiVisibility = { ...uiVisibility, [key]: target.checked };
        applyVisibility(uiVisibility);
        saveVisibility(uiVisibility);
      });
    }

    const keyMap = {
      '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
      '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
      'A': 0x0A, 'B': 0x0B, 'C': 0x0C, 'D': 0x0D, 'E': 0x0E, 'F': 0x0F,
      'AD': 0x13, 'UP': 0x10, 'GO': 0x12, 'DOWN': 0x11
    };

    const controlOrder = ['AD', 'GO', 'DOWN', 'UP'];
    const controlLabels = {
      AD: '△',
      GO: '▶',
      DOWN: 'DOWN',
      UP: 'UP',
    };
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

    function drawLcd() {
      drawLcdBitmap();
    }

    function drawLcdBitmap() {
      if (!lcdCtx || !lcdCanvas) {
        return;
      }
      const dot = 2;
      const cellW = 5 * dot + 2;
      const cellH = 8 * dot + 2;
      const w = LCD_COLS * cellW;
      const h = LCD_ROWS * cellH;
      lcdCanvas.width = w;
      lcdCanvas.height = h;
      lcdCanvas.style.width = '';
      lcdCanvas.style.height = '';
      const img = lcdCtx.createImageData(w, h);
      const d = img.data;
      const bgR = 11, bgG = 26, bgB = 16;
      const onR = 180, onG = 245, onB = 180;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = bgR; d[i + 1] = bgG; d[i + 2] = bgB; d[i + 3] = 255;
      }
      for (let row = 0; row < LCD_ROWS; row++) {
        for (let col = 0; col < LCD_COLS; col++) {
          const charCode = (lcdBytes[row * LCD_COLS + col] || 0x20) & 0xFF;
          const romBase = charCode * 8;
          const ox = col * cellW + 1;
          const oy = row * cellH + 1;
          for (let dy = 0; dy < 8; dy++) {
            const bits = A00[romBase + dy] || 0;
            for (let dx = 0; dx < 5; dx++) {
              if (bits & (0x10 >> dx)) {
                const sx = ox + dx * dot;
                const sy = oy + dy * dot;
                for (let py = 0; py < dot; py++) {
                  for (let px = 0; px < dot; px++) {
                    const idx = ((sy + py) * w + (sx + px)) * 4;
                    if (idx >= 0 && idx < d.length - 3) {
                      d[idx] = onR;
                      d[idx + 1] = onG;
                      d[idx + 2] = onB;
                    }
                  }
                }
              }
            }
          }
        }
      }
      lcdCtx.putImageData(img, 0, 0);
    }

    function drawGlcd() {
      if (!glcdCtx || !glcdCanvas || !glcdBaseCtx || !glcdBaseCanvas || !glcdImageData) {
        return;
      }
      const data = glcdImageData.data;
      const onR = 32;
      const onG = 58;
      const onB = 22;
      const offR = 158;
      const offG = 182;
      const offB = 99;
      const scroll = glcdScroll & 0x3f;
      const shift = Math.max(-15, Math.min(15, Math.trunc(glcdTextShift || 0)));
      let ptr = 0;
      if (!glcdDisplayOn) {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = offR;
          data[i + 1] = offG;
          data[i + 2] = offB;
          data[i + 3] = 255;
        }
      } else {
        if (glcdGraphicsOn) {
          for (let row = 0; row < GLCD_HEIGHT; row += 1) {
            const srcRow = (row + scroll) & 0x3f;
            for (let colByte = 0; colByte < 16; colByte += 1) {
              const value = glcdBytes[srcRow * 16 + colByte] || 0;
              for (let bit = 0; bit < 8; bit += 1) {
                const on = (value & (0x80 >> bit)) !== 0;
                data[ptr++] = on ? onR : offR;
                data[ptr++] = on ? onG : offG;
                data[ptr++] = on ? onB : offB;
                data[ptr++] = 255;
              }
            }
          }
        } else {
          for (let i = 0; i < data.length; i += 4) {
            data[i] = offR;
            data[i + 1] = offG;
            data[i + 2] = offB;
            data[i + 3] = 255;
          }
        }
        // Overlay DDRAM text layer using ST7920 half-height font (8x16, 16 cols x 4 rows)
        for (let tRow = 0; tRow < GLCD_TEXT_ROWS; tRow++) {
          for (let tCol = 0; tCol < GLCD_TEXT_COLS; tCol++) {
            const memCol = tCol + shift;
            if (memCol < 0 || memCol >= GLCD_TEXT_COLS) {
              continue;
            }
            const ch = glcdDdram[tRow * GLCD_TEXT_COLS + memCol] || 0x20;
            if (ch === 0x20 || ch === 0x00) continue; // skip spaces
            const romBase = (ch & 0x7F) * 16;
            const px0 = tCol * 8;
            const py0 = tRow * 16;
            for (let dy = 0; dy < 16; dy++) {
              const bits = ST7920_FONT[romBase + dy] || 0;
              if (bits === 0) continue;
              for (let dx = 0; dx < 8; dx++) {
                if (bits & (0x80 >> dx)) {
                  const px = px0 + dx;
                  const py = (py0 + dy - scroll + GLCD_HEIGHT) & 0x3f;
                  if (px < GLCD_WIDTH && py < GLCD_HEIGHT) {
                    const idx = (py * GLCD_WIDTH + px) * 4;
                    data[idx] = onR;
                    data[idx + 1] = onG;
                    data[idx + 2] = onB;
                  }
                }
              }
            }
          }
        }
        if (glcdReverseMask) {
          for (let tRow = 0; tRow < GLCD_TEXT_ROWS; tRow++) {
            if ((glcdReverseMask & (1 << tRow)) === 0) continue;
            for (let dy = 0; dy < 16; dy++) {
              const py = (tRow * 16 + dy - scroll + GLCD_HEIGHT) & 0x3f;
              for (let px = 0; px < GLCD_WIDTH; px++) {
                const idx = (py * GLCD_WIDTH + px) * 4;
                const isOn = data[idx] === onR && data[idx + 1] === onG && data[idx + 2] === onB;
                data[idx] = isOn ? offR : onR;
                data[idx + 1] = isOn ? offG : onG;
                data[idx + 2] = isOn ? offB : onB;
              }
            }
          }
        }
        const cursorVisible = glcdCursorOn || (glcdCursorBlink && glcdBlinkVisible);
        if (cursorVisible) {
          const addr = glcdCursorAddr & 0x7f;
          const row = ((addr & 0x10) >> 4) | ((addr & 0x08) >> 2);
          const col = addr & 0x07;
          const memCol = col * 2 + (glcdCursorPhase ? 1 : 0);
          const dispCol = memCol - shift;
          if (dispCol >= 0 && dispCol < GLCD_TEXT_COLS) {
            const px0 = dispCol * 8;
            const py0 = (row * 16 - scroll + GLCD_HEIGHT) & 0x3f;
            const underlineY = (py0 + 15) & 0x3f;
            for (let dx = 0; dx < 8; dx++) {
              const px = px0 + dx;
              if (px >= GLCD_WIDTH) continue;
              const idx = (underlineY * GLCD_WIDTH + px) * 4;
              data[idx] = onR;
              data[idx + 1] = onG;
              data[idx + 2] = onB;
            }
          }
        }
      }
      glcdBaseCtx.putImageData(glcdImageData, 0, 0);
      glcdCtx.imageSmoothingEnabled = false;
      glcdCtx.clearRect(0, 0, glcdCanvas.width, glcdCanvas.height);
      glcdCtx.drawImage(glcdBaseCanvas, 0, 0, glcdCanvas.width, glcdCanvas.height);
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

    function addButton(label, action, className, col, row, isLongLabel) {
      const button = document.createElement('div');
      button.className = className ? 'keycap ' + className : 'keycap';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'label ' + (isLongLabel ? 'long' : 'short');
      labelSpan.textContent = label;
      button.appendChild(labelSpan);
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

    addButton('HOME', () => {
      setShiftLatched(false);
      vscode.postMessage({ type: 'reset' });
    }, 'keycap-light', 1, 1, true);
    addButton('', () => {}, 'spacer', 1, 2, true);
    addButton('', () => {}, 'spacer', 1, 3, true);

    for (let row = 0; row < 4; row += 1) {
      const control = controlOrder[row];
      const rowNum = row + 1;
      const controlLabel = controlLabels[control] ?? control;
      const isLong = controlLabel.length > 1;
      addButton(controlLabel, () => sendKey(keyMap[control]), 'keycap-light', 2, rowNum, isLong);
      const rowStart = row * 4;
      for (let col = 0; col < 4; col += 1) {
        const label = hexOrder[rowStart + col];
        addButton(label, () => sendKey(keyMap[label]), 'keycap-cream', 3 + col, rowNum, false);
      }
    }

    const shiftButton = addButton('FN', () => {
      setShiftLatched(!shiftLatched);
    }, 'keycap-light', 1, 4, true);
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
      if (!payload || typeof payload !== 'object') {
        return;
      }
      const data = payload;
      const digits = Array.isArray(data.digits) ? data.digits : [];
      digitEls.forEach((el, idx) => {
        updateDigit(el, digits[idx] || 0);
      });
      if (data.speaker) {
        speakerEl.classList.add('on');
      } else {
        speakerEl.classList.remove('on');
      }
      if (speakerLabel) {
        if (typeof data.speakerHz === 'number' && data.speakerHz > 0) {
          speakerLabel.textContent = data.speakerHz + ' Hz';
          lastSpeakerHz = data.speakerHz;
        } else {
          speakerLabel.textContent = 'SPEAKER';
          lastSpeakerHz = 0;
        }
      }
      lastSpeakerOn = !!data.speaker;
      updateAudio();
      if (data.speedMode === 'slow' || data.speedMode === 'fast') {
        applySpeed(data.speedMode);
      }
      if (Array.isArray(data.lcd)) {
        lcdBytes = data.lcd.slice(0, LCD_BYTES);
        while (lcdBytes.length < LCD_BYTES) {
          lcdBytes.push(0x20);
        }
        drawLcd();
      }
      if (Array.isArray(data.matrix)) {
        matrixRows = data.matrix.slice(0, 8);
        while (matrixRows.length < 8) {
          matrixRows.push(0);
        }
        drawMatrix();
      }
      if (Array.isArray(data.glcdDdram)) {
        glcdDdram = data.glcdDdram.slice(0, GLCD_DDRAM_SIZE);
        while (glcdDdram.length < GLCD_DDRAM_SIZE) {
          glcdDdram.push(0x20);
        }
      }
      if (data.glcdState && typeof data.glcdState === 'object') {
        if (typeof data.glcdState.displayOn === 'boolean') {
          glcdDisplayOn = data.glcdState.displayOn;
        }
        if (typeof data.glcdState.graphicsOn === 'boolean') {
          glcdGraphicsOn = data.glcdState.graphicsOn;
        }
        if (typeof data.glcdState.cursorOn === 'boolean') {
          glcdCursorOn = data.glcdState.cursorOn;
        }
        if (typeof data.glcdState.cursorBlink === 'boolean') {
          glcdCursorBlink = data.glcdState.cursorBlink;
        }
        if (typeof data.glcdState.blinkVisible === 'boolean') {
          glcdBlinkVisible = data.glcdState.blinkVisible;
        }
        if (typeof data.glcdState.ddramAddr === 'number') {
          glcdCursorAddr = data.glcdState.ddramAddr & 0xFF;
        }
        if (typeof data.glcdState.ddramPhase === 'number') {
          glcdCursorPhase = data.glcdState.ddramPhase ? 1 : 0;
        }
        if (typeof data.glcdState.textShift === 'number') {
          glcdTextShift = data.glcdState.textShift;
        }
        if (typeof data.glcdState.scroll === 'number') {
          glcdScroll = data.glcdState.scroll & 0x3F;
        }
        if (typeof data.glcdState.reverseMask === 'number') {
          glcdReverseMask = data.glcdState.reverseMask & 0x0F;
        }
      }
      if (Array.isArray(data.glcd)) {
        glcdBytes = data.glcd.slice(0, GLCD_BYTES);
        while (glcdBytes.length < GLCD_BYTES) {
          glcdBytes.push(0);
        }
      }
      drawGlcd();
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
      const lower = trimmed.toLowerCase();
      if (lower.startsWith('d:')) {
        const value = parseInt(lower.slice(2), 10);
        return Number.isFinite(value) ? value & 0xFFFF : undefined;
      }
      const hexText = lower.startsWith('0x')
        ? lower.slice(2)
        : lower.endsWith('h')
          ? lower.slice(0, -1)
          : lower;
      const value = parseInt(hexText, 16);
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
      if (event.data.type === 'uiVisibility') {
        applyVisibilityOverride(event.data.visibility, event.data.persist === true);
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
    drawGlcd();
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
