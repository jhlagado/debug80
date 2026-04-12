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

type RegisterItem = {
  label: string;
  value: string;
  width?: number;
  editable?: boolean;
  register?: string;
  flags?: boolean;
};

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
    const items: RegisterItem[] = [
      { label: 'BC', register: 'bc', value: formatRegisterHex((data.bc as number) || 0, 4), width: 4, editable: true },
      { label: 'DE', register: 'de', value: formatRegisterHex((data.de as number) || 0, 4), width: 4, editable: true },
      { label: 'HL', register: 'hl', value: formatRegisterHex((data.hl as number) || 0, 4), width: 4, editable: true },
      { label: "BC'", register: 'bcp', value: formatRegisterHex((data.bcp as number) || 0, 4), width: 4, editable: true },
      { label: "DE'", register: 'dep', value: formatRegisterHex((data.dep as number) || 0, 4), width: 4, editable: true },
      { label: "HL'", register: 'hlp', value: formatRegisterHex((data.hlp as number) || 0, 4), width: 4, editable: true },
      { label: 'PC', register: 'pc', value: formatRegisterHex((data.pc as number) || 0, 4), width: 4, editable: true },
      { label: 'SP', register: 'sp', value: formatRegisterHex((data.sp as number) || 0, 4), width: 4, editable: true },
      { label: 'IX', register: 'ix', value: formatRegisterHex((data.ix as number) || 0, 4), width: 4, editable: true },
      { label: 'IY', register: 'iy', value: formatRegisterHex((data.iy as number) || 0, 4), width: 4, editable: true },
      { label: 'AF', value: formatRegisterHex((data.af as number) || 0, 4), width: 4 },
      { label: "AF'", value: formatRegisterHex((data.afp as number) || 0, 4), width: 4 },
      { label: 'F', value: (data.flags as string) || '--', flags: true },
      { label: "F'", value: (data.flagsPrime as string) || '--', flags: true },
      { label: 'I', value: formatRegisterHex((data.i as number) || 0, 2), width: 2 },
      { label: 'R', value: formatRegisterHex((data.r as number) || 0, 2), width: 2 },
    ];
    this.options.registerStrip.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'register-item' + (item.editable ? ' editable' : '');
      const label = document.createElement('span');
      label.className = 'register-label';
      label.textContent = item.label;
      row.appendChild(label);
      if (item.editable && item.register !== undefined && item.width !== undefined) {
        const input = document.createElement('input');
        input.className = 'register-input';
        input.type = 'text';
        input.value = item.value;
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.inputMode = 'text';
        input.maxLength = item.width;
        input.dataset.register = item.register;
        input.dataset.width = String(item.width);
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            input.value = item.value;
            input.blur();
          }
        });
        input.addEventListener('blur', () => {
          void this.commitRegisterEdit(input, item.value);
        });
        row.appendChild(input);
      } else {
        const value = document.createElement('span');
        value.className = item.flags ? 'register-flags' : 'register-value';
        value.textContent = item.value;
        row.appendChild(value);
      }
      this.options.registerStrip?.appendChild(row);
    });
  }

  private commitRegisterEdit(input: HTMLInputElement, previousValue: string): void {
    const register = input.dataset.register;
    const width = Number.parseInt(input.dataset.width ?? '', 10);
    const value = normalizeHexInput(input.value, width);
    if (!register || value === null) {
      input.value = previousValue;
      if (this.options.statusEl) {
        this.options.statusEl.textContent = 'Register edit failed';
      }
      return;
    }
    if (value === previousValue) {
      return;
    }
    input.value = value;
    this.options.vscode.postMessage({
      type: 'registerEdit',
      register,
      value,
    });
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

function formatRegisterHex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function formatHex(value: number, width: number): string {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function normalizeHexInput(value: string, width: number): string | null {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0 || trimmed.startsWith('0X')) {
    return null;
  }
  if (!/^[0-9A-F]+$/.test(trimmed) || trimmed.length > width) {
    return null;
  }
  return trimmed.padStart(width, '0');
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
