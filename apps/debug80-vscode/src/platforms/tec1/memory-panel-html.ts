/**
 * @file TEC-1 memory panel HTML template.
 */

import {
  TEC1_MEMORY_PANEL_AFTER_OPTIONS,
  TEC1_MEMORY_PANEL_VIEW_DEFINITIONS,
  TEC1_MEMORY_PANEL_VIEW_OPTIONS,
  getTec1MemoryPanelScript,
  type Tec1MemoryPanelViewDefinition,
  type Tec1MemoryPanelViewMode,
} from './memory-panel-browser';

/**
 * Snapshot payload posted from the TEC-1 memory webview controller.
 */
export interface Tec1MemorySnapshotPayload {
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

const TEC1_MEMORY_PANEL_STYLES = `
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
`;

/**
 *
 */
function renderSelectOptions(selectedValue: Tec1MemoryPanelViewMode): string {
  return TEC1_MEMORY_PANEL_VIEW_OPTIONS.map(({ value, label }) => {
    const selected = value === selectedValue ? ' selected' : '';
    return `            <option value="${value}"${selected}>${label}</option>`;
  }).join('\n');
}

/**
 *
 */
function renderAfterOptions(): string {
  return TEC1_MEMORY_PANEL_AFTER_OPTIONS.map((value) => {
    const selected = value === 16 ? ' selected' : '';
    return `            <option value="${value}"${selected}>${value}</option>`;
  }).join('\n');
}

/**
 *
 */
function renderMemorySection({ id, label, defaultView }: Tec1MemoryPanelViewDefinition): string {
  return `    <div class="section">
      <div class="section-header">
        <h2><span id="label-${id}">${label}</span> <span class="addr" id="addr-${id}">0x0000</span><span class="symbol" id="sym-${id}"></span></h2>
        <div class="controls">
          <select id="view-${id}">
${renderSelectOptions(defaultView)}
          </select>
          <input id="address-${id}" type="text" placeholder="0x0000" />
          <select id="after-${id}">
${renderAfterOptions()}
          </select>
        </div>
      </div>
      <div class="dump" id="dump-${id}"></div>
    </div>`;
}

/**
 * Builds HTML for the TEC-1 memory panel.
 */
export function getTec1MemoryHtml(): string {
  const sections = TEC1_MEMORY_PANEL_VIEW_DEFINITIONS.map(renderMemorySection).join('\n');
  const script = getTec1MemoryPanelScript(TEC1_MEMORY_PANEL_VIEW_DEFINITIONS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <style>
${TEC1_MEMORY_PANEL_STYLES}
  </style>
</head>
<body>
  <div class="status-line">
    <span class="status" id="status">Waiting for snapshot…</span>
  </div>
  <div class="shell">
    <h1>CPU Pointer View</h1>
${sections}
  </div>
  <script>
${script}
  </script>
</body>
</html>`;
}
