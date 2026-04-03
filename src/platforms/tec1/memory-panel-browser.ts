/**
 * @file Browser-side script and shared view definitions for the TEC-1 memory panel.
 */

export type Tec1MemoryPanelViewId = 'a' | 'b' | 'c' | 'd';

export type Tec1MemoryPanelViewMode =
  | 'pc'
  | 'sp'
  | 'bc'
  | 'de'
  | 'hl'
  | 'ix'
  | 'iy'
  | 'absolute';

export interface Tec1MemoryPanelViewDefinition {
  id: Tec1MemoryPanelViewId;
  label: string;
  defaultView: Tec1MemoryPanelViewMode;
}

export const TEC1_MEMORY_PANEL_VIEW_DEFINITIONS: readonly Tec1MemoryPanelViewDefinition[] = [
  { id: 'a', label: 'PC', defaultView: 'pc' },
  { id: 'b', label: 'SP', defaultView: 'sp' },
  { id: 'c', label: 'HL', defaultView: 'hl' },
  { id: 'd', label: 'DE', defaultView: 'de' },
];

export const TEC1_MEMORY_PANEL_VIEW_OPTIONS: ReadonlyArray<{
  value: Tec1MemoryPanelViewMode;
  label: string;
}> = [
  { value: 'pc', label: 'PC' },
  { value: 'sp', label: 'SP' },
  { value: 'bc', label: 'BC' },
  { value: 'de', label: 'DE' },
  { value: 'hl', label: 'HL' },
  { value: 'ix', label: 'IX' },
  { value: 'iy', label: 'IY' },
  { value: 'absolute', label: 'Absolute' },
];

export const TEC1_MEMORY_PANEL_AFTER_OPTIONS = [16, 32, 64, 128, 256, 512, 1024] as const;

/**
 * Builds the browser-side script embedded in the TEC-1 memory panel.
 */
export function getTec1MemoryPanelScript(
  viewDefinitions: readonly Tec1MemoryPanelViewDefinition[] = TEC1_MEMORY_PANEL_VIEW_DEFINITIONS,
): string {
  const viewIds = viewDefinitions.map(({ id }) => id);

  return `
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById('status');
    const symbolMap = new Map();
    let symbolsKey = '';
    const views = ${JSON.stringify(viewIds)}.map((id) => ({
      id,
      view: document.getElementById('view-' + id),
      address: document.getElementById('address-' + id),
      after: document.getElementById('after-' + id),
      label: document.getElementById('label-' + id),
      addr: document.getElementById('addr-' + id),
      symbol: document.getElementById('sym-' + id),
      dump: document.getElementById('dump-' + id),
    }));

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
  `;
}