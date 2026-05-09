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

type MemoryAnchor = {
  view: string;
  address?: number;
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
  private readonly pickerMap = new Map<HTMLSelectElement, HTMLInputElement>();
  private symbolsKey = '';
  private editingEnabled = false;

  constructor(private readonly options: MemoryPanelOptions) {}

  wire(): void {
    this.options.views.forEach((entry) => {
      this.createAnchorPicker(entry);
      entry.view?.addEventListener('change', () => {
        this.syncPickerFromSelect(entry);
        this.requestSnapshot();
      });
      entry.address?.addEventListener('change', () => this.requestSnapshot());
      entry.dump?.addEventListener('keydown', (event) => {
        const input = event.target;
        if (!isMemoryByteInput(input)) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          const previousValue = input.dataset.previous ?? input.value;
          input.value = previousValue;
          input.blur();
        }
      });
      entry.dump?.addEventListener('focusout', (event) => {
        const input = event.target;
        if (!isMemoryByteInput(input)) {
          return;
        }
        void this.commitMemoryEdit(input);
      });
    });
  }

  setEditingEnabled(enabled: boolean): void {
    if (this.editingEnabled === enabled) {
      return;
    }
    this.editingEnabled = enabled;
    this.updateMemoryInputsState();
  }

  requestSnapshot(): void {
    if (!this.options.isActive()) {
      return;
    }
    const rowSize = this.options.getRowSize();
    const payloadViews = this.options.views.map((entry) => {
      const anchor = this.resolveAnchor(entry);
      const viewMode = anchor.view;
      let addressValue = anchor.address;
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

  handleSnapshot(
    payload: {
      symbols?: Array<{ name: string; address: number }>;
      registers?: RegisterData;
      views?: SnapshotView[];
      running?: boolean;
    }
  ): void {
    this.updateSymbols(payload.symbols || []);
    if (typeof payload.running === 'boolean') {
      this.setEditingEnabled(!payload.running);
    }
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

  private createAnchorPicker(entry: MemoryViewEntry): void {
    if (!entry.view || this.pickerMap.has(entry.view)) {
      return;
    }
    const select = entry.view;
    const input = document.createElement('input');
    const list = document.createElement('datalist');
    const listId = 'memory-anchor-list-' + entry.id;
    list.id = listId;
    input.className = 'memory-anchor-picker';
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('list', listId);
    input.value = selectedOptionLabel(select);
    input.setAttribute('aria-label', 'Memory anchor ' + entry.id.toUpperCase());
    select.hidden = true;
    select.after(input, list);
    this.pickerMap.set(select, input);
    this.populateAnchorList(list);
    const commit = (): void => {
      const anchor = this.resolveAnchor(entry);
      this.applyAnchor(entry, anchor);
      this.requestSnapshot();
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.syncPickerFromSelect(entry);
        input.blur();
      }
    });
  }

  private syncPickerFromSelect(entry: MemoryViewEntry): void {
    if (!entry.view) {
      return;
    }
    const picker = this.pickerMap.get(entry.view);
    if (picker) {
      picker.value = selectedOptionLabel(entry.view);
    }
  }

  private resolveAnchor(entry: MemoryViewEntry): MemoryAnchor {
    const raw = entry.view ? this.pickerMap.get(entry.view)?.value.trim() ?? entry.view.value : '';
    const lower = raw.toLowerCase();
    const register = registerAnchorFromText(lower);
    if (register !== null) {
      return { view: register };
    }
    const parsed = parseAddress(raw);
    if (lower === 'absolute' || lower === 'abs' || parsed !== undefined) {
      if (parsed !== undefined && entry.address) {
        entry.address.value = formatHex(parsed, 4);
      }
      return { view: 'absolute', address: parsed };
    }
    const symbol = this.findSymbol(raw);
    if (symbol !== null) {
      if (entry.address) {
        entry.address.value = formatHex(symbol.address, 4);
      }
      return { view: 'absolute', address: symbol.address };
    }
    return { view: entry.view?.value ?? 'pc' };
  }

  private applyAnchor(entry: MemoryViewEntry, anchor: MemoryAnchor): void {
    if (!entry.view) {
      return;
    }
    entry.view.value = anchor.view;
    const picker = this.pickerMap.get(entry.view);
    if (picker) {
      picker.value = anchor.view === 'absolute' && anchor.address !== undefined
        ? this.findSymbolByAddress(anchor.address)?.name ?? formatHex(anchor.address, 4)
        : selectedOptionLabel(entry.view);
    }
  }

  private findSymbol(query: string): { name: string; address: number } | null {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
      return null;
    }
    for (const [name, address] of this.symbolMap) {
      if (name.toLowerCase() === normalized) {
        return { name, address };
      }
    }
    for (const [name, address] of this.symbolMap) {
      if (name.toLowerCase().includes(normalized)) {
        return { name, address };
      }
    }
    return null;
  }

  private findSymbolByAddress(address: number): { name: string; address: number } | null {
    for (const [name, symAddress] of this.symbolMap) {
      if (symAddress === (address & 0xffff)) {
        return { name, address: symAddress };
      }
    }
    return null;
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
    this.options.views.forEach((entry) => this.updatePickerList(entry));
  }

  private updatePickerList(entry: MemoryViewEntry): void {
    if (!entry.view) {
      return;
    }
    const picker = this.pickerMap.get(entry.view);
    const list = picker?.list;
    if (list) {
      this.populateAnchorList(list);
    }
  }

  private populateAnchorList(list: HTMLDataListElement): void {
    list.innerHTML = '';
    for (const option of ['PC', 'SP', 'BC', 'DE', 'HL', 'IX', 'IY', 'Absolute']) {
      const element = document.createElement('option');
      element.value = option;
      list.appendChild(element);
    }
    for (const name of this.symbolMap.keys()) {
      const element = document.createElement('option');
      element.value = name;
      list.appendChild(element);
    }
  }

  private renderRegisters(data: RegisterData): void {
    if (!this.options.registerStrip || !data) {
      return;
    }
    if (this.isEditingRegister()) {
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
      { label: 'AF', register: 'af', value: formatRegisterHex((data.af as number) || 0, 4), width: 4, editable: true },
      { label: "AF'", register: 'afp', value: formatRegisterHex((data.afp as number) || 0, 4), width: 4, editable: true },
      { label: 'I', value: formatRegisterHex((data.i as number) || 0, 2), width: 2 },
      { label: 'R', value: formatRegisterHex((data.r as number) || 0, 2), width: 2 },
      { label: 'Flags', register: 'flags', value: (data.flags as string) || '--------', editable: true, flags: true },
      { label: "Flags'", register: 'flagsp', value: (data.flagsPrime as string) || '--------', editable: true, flags: true },
    ];
    this.options.registerStrip.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'register-item' + (item.editable ? ' editable' : '');
      row.classList.toggle('flag-register', item.flags === true);
      const label = document.createElement('span');
      label.className = 'register-label';
      label.textContent = item.label;
      row.appendChild(label);
      if (item.editable && item.register !== undefined) {
        const input = document.createElement('input');
        input.className = item.flags ? 'register-input register-flags' : 'register-input';
        input.type = 'text';
        input.value = item.value;
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.inputMode = 'text';
        if (item.width !== undefined) {
          input.maxLength = item.width;
        }
        input.dataset.register = item.register;
        if (item.width !== undefined) {
          input.dataset.width = String(item.width);
        }
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

  private isEditingRegister(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement
      && active.classList.contains('register-input')
      && this.options.registerStrip?.contains(active) === true;
  }

  private commitRegisterEdit(input: HTMLInputElement, previousValue: string): void {
    const register = input.dataset.register;
    const width = Number.parseInt(input.dataset.width ?? '', 10);
    const value = register === 'flags' || register === 'flagsp'
      ? input.value.trim()
      : normalizeHexInput(input.value, width);
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
      if (!this.isEditingMemoryDump(target.dump)) {
        renderDump(target.dump, entry.start, entry.bytes, entry.focus ?? 0, rowSize, this.editingEnabled);
      }
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

  private updateMemoryInputsState(): void {
    this.options.views.forEach((entry) => {
      entry.dump
        ?.querySelectorAll<HTMLInputElement>('input.memory-byte-input')
        .forEach((input) => {
          input.disabled = !this.editingEnabled;
        });
    });
  }

  private isEditingMemoryDump(dump: HTMLElement): boolean {
    const active = document.activeElement;
    return isMemoryByteInput(active) && dump.contains(active);
  }

  private commitMemoryEdit(input: HTMLInputElement): void {
    const address = Number.parseInt(input.dataset.address ?? '', 16);
    const previousValue = input.dataset.previous ?? input.value;
    const value = normalizeHexInput(input.value, 2);
    if (!Number.isFinite(address) || value === null) {
      input.value = previousValue;
      if (this.options.statusEl) {
        this.options.statusEl.textContent = 'Memory edit failed';
      }
      return;
    }
    if (value === previousValue) {
      return;
    }
    input.value = value;
    input.dataset.previous = value;
    this.options.vscode.postMessage({
      type: 'memoryEdit',
      address: address & 0xffff,
      value,
    });
  }
}

function formatRegisterHex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function formatHex(value: number, width: number): string {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function selectedOptionLabel(select: HTMLSelectElement): string {
  return select.selectedOptions[0]?.textContent?.trim() || select.value.toUpperCase();
}

function registerAnchorFromText(value: string): string | null {
  switch (value) {
    case 'pc':
    case 'sp':
    case 'bc':
    case 'de':
    case 'hl':
    case 'ix':
    case 'iy':
      return value;
    default:
      return null;
  }
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
  rowSize: number,
  editingEnabled: boolean
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
      const byteValue = formatByteHex(value);
      html +=
        '<input class="' +
        cls +
        ' memory-byte-input" type="text" spellcheck="false" autocomplete="off" inputmode="text" maxlength="2" data-address="' +
        formatByteHex((rowAddr + j) & 0xffff, 4) +
        '" data-previous="' +
        byteValue +
        '" value="' +
        byteValue +
        '"' +
        (editingEnabled ? '' : ' disabled') +
        ' />';
      ascii += value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';
    }
    html += '<span class="ascii">' + ascii + '</span></div>';
  }
  el.innerHTML = html;
}

function isMemoryByteInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.classList.contains('memory-byte-input');
}

function formatByteHex(value: number, width = 2): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
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
