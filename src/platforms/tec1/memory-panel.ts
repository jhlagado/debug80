import * as vscode from 'vscode';

export interface Tec1MemoryPanelController {
  open(session?: vscode.DebugSession, options?: { focus?: boolean; reveal?: boolean }): void;
  handleSessionTerminated(sessionId: string): void;
}

export function createTec1MemoryPanelController(
  getTargetColumn: () => vscode.ViewColumn,
  getFallbackSession: () => vscode.DebugSession | undefined
): Tec1MemoryPanelController {
  let panel: vscode.WebviewPanel | undefined;
  let session: vscode.DebugSession | undefined;
  const windowBefore = 16;
  let windowAfter = 16;
  const rowSize = 16;
  let viewMode = 'hl';
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let refreshInFlight = false;
  const autoRefreshMs = 150;

  const open = (
    targetSession?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean }
  ): void => {
    const focus = options?.focus ?? false;
    const reveal = options?.reveal ?? true;
    const targetColumn = getTargetColumn();
    if (panel === undefined) {
      panel = vscode.window.createWebviewPanel(
        'debug80Tec1Memory',
        'Debug80 TEC-1 Memory',
        targetColumn,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.onDidDispose(() => {
        stopAutoRefresh();
        panel = undefined;
        session = undefined;
      });
      panel.onDidChangeViewState((event) => {
        if (event.webviewPanel.visible) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }
      });
      panel.webview.onDidReceiveMessage(
        (msg: {
          type?: string;
          after?: number;
          rowSize?: number;
          view?: string;
          address?: number;
        }) => {
          if (msg.type === 'refresh') {
            const afterSize = Number.isFinite(msg.after) ? (msg.after as number) : windowAfter;
            windowAfter = clampWindow(afterSize);
            viewMode = typeof msg.view === 'string' ? msg.view : viewMode;
            void refreshSnapshot(msg.address, true);
          }
        }
      );
    }
    if (targetSession !== undefined) {
      session = targetSession;
    } else if (session === undefined) {
      session = getFallbackSession();
    }
    if (reveal) {
      panel.reveal(targetColumn, !focus);
    }
    panel.webview.html = getTec1MemoryHtml();
    void refreshSnapshot(undefined, true);
    startAutoRefresh();
  };

  const handleSessionTerminated = (sessionId: string): void => {
    if (session?.id === sessionId) {
      session = undefined;
    }
  };

  return {
    open,
    handleSessionTerminated,
  };

  async function refreshSnapshot(address?: number, allowErrors?: boolean): Promise<void> {
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
      const payload = (await target.customRequest('debug80/tec1MemorySnapshot', {
        before: windowBefore,
        after: windowAfter,
        rowSize,
        view: viewMode,
        address,
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
      void refreshSnapshot(undefined, false);
    }, autoRefreshMs);
  }

  function stopAutoRefresh(): void {
    if (refreshTimer !== undefined) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
  }
}

function getTec1MemoryHtml(): string {
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
    .status-line {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }
    .shell {
      border: 1px solid #2c2c2c;
      border-radius: 10px;
      padding: 12px;
      background: #121212;
    }
    h1 {
      font-size: 16px;
      margin: 0 0 8px 0;
    }
    .section {
      margin-top: 12px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .section h2 {
      font-size: 13px;
      margin: 0 0 6px 0;
      color: #d8d8d8;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .controls label {
      font-size: 11px;
      color: #9aa0a6;
    }
    .controls select,
    .controls input {
      background: #1f1f1f;
      color: #f0f0f0;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
    }
    .controls input {
      width: 100px;
    }
    .addr {
      color: #7cc1ff;
      margin-left: 6px;
    }
    .dump {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
        "Courier New", monospace;
      font-size: 11px;
      background: #0b0b0b;
      border: 1px solid #2c2c2c;
      border-radius: 8px;
      padding: 8px;
      overflow-x: auto;
      white-space: pre;
    }
    .row {
      display: flex;
      gap: 10px;
      line-height: 1.6;
    }
    .row .row-addr {
      width: 72px;
      color: #6aa6d6;
    }
    .byte {
      display: inline-block;
      width: 22px;
      text-align: center;
    }
    .byte.focus {
      color: #111;
      background: #ffd05c;
      border-radius: 4px;
    }
    .ascii {
      margin-left: 12px;
      color: #cfcfcf;
      letter-spacing: 1px;
    }
    .status {
      font-size: 12px;
      color: #a0a0a0;
    }
  </style>
</head>
<body>
  <div class="status-line">
    <span class="status" id="status">Waiting for snapshot…</span>
  </div>
  <div class="shell">
    <h1>CPU Pointer View</h1>
    <div class="section">
      <h2>PC <span class="addr" id="pc-addr">0x0000</span></h2>
      <div class="dump" id="pc-dump"></div>
    </div>
    <div class="section">
      <h2>SP <span class="addr" id="sp-addr">0x0000</span></h2>
      <div class="dump" id="sp-dump"></div>
    </div>
    <div class="section">
      <div class="section-header">
        <h2><span id="main-label">View (HL)</span> <span class="addr" id="main-addr">0x0000</span></h2>
        <div class="controls">
          <select id="view">
            <option value="bc">BC</option>
            <option value="de">DE</option>
            <option value="hl" selected>HL</option>
            <option value="ix">IX</option>
            <option value="iy">IY</option>
            <option value="absolute">Absolute</option>
          </select>
          <input id="address" type="text" placeholder="0x8000" />
          <label for="after">Ahead</label>
          <select id="after">
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
      <div class="dump" id="main-dump"></div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById('status');
    const afterSelect = document.getElementById('after');
    const viewSelect = document.getElementById('view');
    const addressInput = document.getElementById('address');
    const pcAddr = document.getElementById('pc-addr');
    const spAddr = document.getElementById('sp-addr');
    const mainAddr = document.getElementById('main-addr');
    const mainLabel = document.getElementById('main-label');
    const pcDump = document.getElementById('pc-dump');
    const spDump = document.getElementById('sp-dump');
    const mainDump = document.getElementById('main-dump');

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

    function requestSnapshot() {
      const afterSize = parseInt(afterSelect.value, 10);
      const rowSize = 16;
      const view = viewSelect.value;
      const address = view === 'absolute' ? parseAddress(addressInput.value) : undefined;
      vscode.postMessage({
        type: 'refresh',
        after: afterSize,
        rowSize,
        view,
        address,
      });
      statusEl.textContent = 'Refreshing…';
    }

    afterSelect.addEventListener('change', requestSnapshot);
    viewSelect.addEventListener('change', requestSnapshot);
    addressInput.addEventListener('change', requestSnapshot);

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'snapshot') {
        pcAddr.textContent = formatHex(msg.pc, 4);
        spAddr.textContent = formatHex(msg.sp, 4);
        renderDump(pcDump, msg.pcStart, msg.pcBytes, msg.pcFocus, 16);
        renderDump(spDump, msg.spStart, msg.spBytes, msg.spFocus, 16);
        if (msg.mainStart !== undefined && msg.mainBytes) {
          const viewLabel = viewSelect.value.toUpperCase();
          mainLabel.textContent = 'View (' + viewLabel + ')';
          mainAddr.textContent = formatHex(msg.mainAddress ?? 0, 4);
          renderDump(mainDump, msg.mainStart, msg.mainBytes, msg.mainFocus ?? 0, 16);
        }
        statusEl.textContent = 'Updated';
      }
      if (msg.type === 'snapshotError') {
        statusEl.textContent = msg.message || 'Snapshot failed';
      }
    });

    requestSnapshot();
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
  pc: number;
  sp: number;
  pcStart: number;
  pcBytes: number[];
  pcFocus: number;
  spStart: number;
  spBytes: number[];
  spFocus: number;
  mainAddress?: number;
  mainStart?: number;
  mainBytes?: number[];
  mainFocus?: number;
}
