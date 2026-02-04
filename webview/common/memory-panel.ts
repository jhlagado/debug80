import type { VscodeApi } from './vscode';

export type MemoryViewEntry = {
  id: string;
  view: HTMLSelectElement | null;
  address: HTMLInputElement | null;
  addr: HTMLElement | null;
  symbol: HTMLElement | null;
  dump: HTMLElement | null;
};

type RegisterData = Record<string, number | string | undefined>;

type SnapshotView = {
  id: string;
  address?: number;
  start: number;
  bytes: number[];
  focus?: number;
  symbol?: string;
  symbolOffset?: number;
};

type MemoryPanelOptions = {
  vscode: VscodeApi;
  registerStrip: HTMLElement | null;
  statusEl: HTMLElement | null;
  views: MemoryViewEntry[];
  getRowSize: () => number;
  isActive: () => boolean;
};

export class MemoryPanel {
  private readonly symbolMap = new Map<string, number>();
  private symbolsKey = '';

  constructor(private readonly options: MemoryPanelOptions) {}

  wire(): void {
    this.options.views.forEach((entry) => {
      entry.view?.addEventListener('change', () => {
        const value = entry.view?.value ?? '';
        if (value.startsWith('symbol:')) {
          const name = value.slice(7);
          const address = this.symbolMap.get(name);
          if (address !== undefined && entry.address) {
            entry.address.value = formatHex(address, 4);
          }
        }
        this.requestSnapshot();
      });
      entry.address?.addEventListener('change', () => this.requestSnapshot());
    });
  }

  requestSnapshot(): void {
    if (!this.options.isActive()) {
      return;
    }
    const rowSize = this.options.getRowSize();
    const payloadViews = this.options.views.map((entry) => {
      const viewValue = entry.view?.value ?? '';
      let viewMode = viewValue;
      let addressValue: number | undefined;
      if (viewValue.startsWith('symbol:')) {
        const name = viewValue.slice(7);
        const symAddress = this.symbolMap.get(name);
        if (symAddress !== undefined) {
          viewMode = 'absolute';
          addressValue = symAddress;
        }
      }
      if (viewMode === 'absolute' && addressValue === undefined) {
        addressValue = parseAddress(entry.address?.value ?? '');
      }
      const showAddress = viewMode === 'absolute';
      if (entry.address) {
        entry.address.style.display = showAddress ? 'inline-flex' : 'none';
      }
      return {
        id: entry.id,
        view: viewMode,
        after: 16,
        address: addressValue,
      };
    });
    this.options.vscode.postMessage({
      type: 'refresh',
      rowSize,
      views: payloadViews,
    });
    if (this.options.statusEl) {
      this.options.statusEl.textContent = 'Refreshing…';
    }
  }

  handleSnapshot(payload: { symbols?: Array<{ name: string; address: number }>; registers?: RegisterData; views?: SnapshotView[] }): void {
    this.updateSymbols(payload.symbols || []);
    if (payload.registers) {
      this.renderRegisters(payload.registers);
    }
    if (Array.isArray(payload.views)) {
      this.renderViews(payload.views);
    }
    if (this.options.statusEl) {
      this.options.statusEl.textContent = 'Updated';
    }
  }

  handleSnapshotError(message?: string): void {
    if (this.options.statusEl) {
      this.options.statusEl.textContent = message || 'Snapshot failed';
    }
  }

  private updateSymbols(symbols: Array<{ name: string; address: number }>): void {
    const nextKey = symbols
      .map((sym) =>
        sym && typeof sym.name === 'string' ? sym.name + ':' + String(sym.address) : ''
      )
      .join('|');
    if (nextKey === this.symbolsKey) {
      return;
    }
    this.symbolsKey = nextKey;
    this.symbolMap.clear();
    symbols.forEach((sym) => {
      if (sym && typeof sym.name === 'string' && Number.isFinite(sym.address)) {
        this.symbolMap.set(sym.name, sym.address & 0xffff);
      }
    });
    this.options.views.forEach((entry) => {
      const select = entry.view;
      if (!select) {
        return;
      }
      const existing = select.querySelector('optgroup[data-symbols="true"]');
      if (existing) {
        existing.remove();
      }
      if (this.symbolMap.size === 0) {
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
      select.appendChild(group);
    });
  }

  private renderRegisters(data: RegisterData): void {
    if (!this.options.registerStrip || !data) {
      return;
    }
    const items = [
      { label: 'AF', value: formatHex((data.af as number) || 0, 4) },
      { label: 'BC', value: formatHex((data.bc as number) || 0, 4) },
      { label: 'DE', value: formatHex((data.de as number) || 0, 4) },
      { label: 'HL', value: formatHex((data.hl as number) || 0, 4) },
      { label: "AF'", value: formatHex((data.afp as number) || 0, 4) },
      { label: "BC'", value: formatHex((data.bcp as number) || 0, 4) },
      { label: "DE'", value: formatHex((data.dep as number) || 0, 4) },
      { label: "HL'", value: formatHex((data.hlp as number) || 0, 4) },
      { label: 'PC', value: formatHex((data.pc as number) || 0, 4) },
      { label: 'SP', value: formatHex((data.sp as number) || 0, 4) },
      { label: 'IX', value: formatHex((data.ix as number) || 0, 4) },
      { label: 'IY', value: formatHex((data.iy as number) || 0, 4) },
      { label: 'F', value: (data.flags as string) || '--', flags: true },
      { label: "F'", value: (data.flagsPrime as string) || '--', flags: true },
      { label: 'I', value: formatHex((data.i as number) || 0, 2) },
      { label: 'R', value: formatHex((data.r as number) || 0, 2) },
    ];
    this.options.registerStrip.innerHTML = items
      .map((item) => {
        const valueClass = item.flags ? 'register-flags' : 'register-value';
        return (
          '<div class="register-item"><span class="register-label">' +
          item.label +
          '</span><span class="' +
          valueClass +
          '">' +
          item.value +
          '</span></div>'
        );
      })
      .join('');
  }

  private renderViews(views: SnapshotView[]): void {
    const rowSize = this.options.getRowSize();
    views.forEach((entry) => {
      const target = this.options.views.find((view) => view.id === entry.id);
      if (!target || !target.dump || !target.addr || !target.symbol) {
        return;
      }
      target.addr.textContent = formatHex(entry.address ?? 0, 4);
      renderDump(target.dump, entry.start, entry.bytes, entry.focus ?? 0, rowSize);
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
}

function formatHex(value: number, width: number): string {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function renderDump(
  el: HTMLElement,
  start: number,
  bytes: number[],
  focusOffset: number,
  rowSize: number
): void {
  let html = '';
  for (let i = 0; i < bytes.length; i += rowSize) {
    const rowAddr = (start + i) & 0xffff;
    html += '<div class="row"><span class="row-addr">' + formatHex(rowAddr, 4) + '</span>';
    let ascii = '';
    for (let j = 0; j < rowSize && i + j < bytes.length; j++) {
      const idx = i + j;
      const value = bytes[idx];
      const cls = idx === focusOffset ? 'byte focus' : 'byte';
      html +=
        '<span class="' +
        cls +
        '">' +
        value.toString(16).toUpperCase().padStart(2, '0') +
        '</span>';
      ascii += value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';
    }
    html += '<span class="ascii">' + ascii + '</span></div>';
  }
  el.innerHTML = html;
}

function parseAddress(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('d:')) {
    const value = parseInt(lower.slice(2), 10);
    return Number.isFinite(value) ? value & 0xffff : undefined;
  }
  const hexText = lower.startsWith('0x')
    ? lower.slice(2)
    : lower.endsWith('h')
      ? lower.slice(0, -1)
      : lower;
  const value = parseInt(hexText, 16);
  return Number.isFinite(value) ? value & 0xffff : undefined;
}
