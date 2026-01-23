import * as vscode from 'vscode';

export interface Tec1gMemoryPanelController {
  open(session?: vscode.DebugSession, options?: { focus?: boolean; reveal?: boolean }): void;
  handleSessionTerminated(sessionId: string): void;
}

export function createTec1gMemoryPanelController(
  getTargetColumn: () => vscode.ViewColumn,
  getFallbackSession: () => vscode.DebugSession | undefined
): Tec1gMemoryPanelController {
  let panel: vscode.WebviewPanel | undefined;
  let session: vscode.DebugSession | undefined;
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
    options?: { focus?: boolean; reveal?: boolean }
  ): void => {
    const focus = options?.focus ?? false;
    const reveal = options?.reveal ?? true;
    const targetColumn = getTargetColumn();
    if (panel === undefined) {
      panel = vscode.window.createWebviewPanel(
        'debug80Tec1gMemory',
        'Debug80 TEC-1G Memory',
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
          views?: Array<{ id?: string; view?: string; after?: number; address?: number }>;
        }) => {
          if (msg.type === 'refresh') {
            if (Array.isArray(msg.views)) {
              for (const entry of msg.views) {
                const id = typeof entry.id === 'string' ? entry.id : '';
                if (id !== 'a' && id !== 'b' && id !== 'c' && id !== 'd') {
                  continue;
                }
                const currentAfter = viewAfter[id] ?? 16;
                const afterSize = Number.isFinite(entry.after)
                  ? (entry.after as number)
                  : currentAfter;
                viewAfter[id] = clampWindow(afterSize);
                const currentView = viewModes[id] ?? 'hl';
                viewModes[id] = typeof entry.view === 'string' ? entry.view : currentView;
                viewAddress[id] =
                  typeof entry.address === 'number' && Number.isFinite(entry.address)
                    ? (entry.address & 0xffff)
                    : undefined;
              }
            }
            void refreshSnapshot(true);
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
    panel.webview.html = getTec1gMemoryHtml();
    void refreshSnapshot(true);
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

function getTec1gMemoryHtml(): string {
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
    .symbol {
      color: #9aa0a6;
      margin-left: 8px;
      font-size: 11px;
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
  <script>
    const vscode = acquireVsCodeApi();
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
      statusEl.textContent = 'Refreshing…';
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

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'snapshot') {
        updateSymbolOptions(msg.symbols);
        if (Array.isArray(msg.views)) {
          msg.views.forEach((entry) => {
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
