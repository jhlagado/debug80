import type { VscodeApi } from './vscode';
import {
  formatHex,
  isMemoryByteInput,
  normalizeHexInput,
  parseAddress,
  registerAnchorFromText,
  renderDump,
  selectedOptionLabel,
} from './memory-panel-format';
import { RegisterPanel, type RegisterData } from './register-panel';

export type MemoryViewEntry = {
  id: string;
  view: HTMLSelectElement | null;
  address: HTMLInputElement | null;
  addr: HTMLElement | null;
  symbol: HTMLElement | null;
  dump: HTMLElement | null;
};

type SnapshotView = {
  id: string;
  address?: number;
  start: number;
  bytes: number[];
  writable?: boolean[];
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
  private readonly registerPanel: RegisterPanel;
  private symbolsKey = '';
  private editingEnabled = false;
  private allowReadOnlyWrites = false;

  constructor(private readonly options: MemoryPanelOptions) {
    this.registerPanel = new RegisterPanel({
      vscode: options.vscode,
      registerStrip: options.registerStrip,
      statusEl: options.statusEl,
    });
  }

  wire(): void {
    this.installReadOnlyToggle();
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
    this.postSnapshotRequest(this.buildMemoryViewRequests());
  }

  requestRegisterSnapshot(): void {
    this.postSnapshotRequest([]);
  }

  private buildMemoryViewRequests(): Array<{
    id: string;
    view: string;
    after: number;
    address: number | undefined;
  }> {
    return this.options.views.map((entry) => {
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
  }

  private postSnapshotRequest(
    payloadViews: Array<{
      id: string;
      view: string;
      after: number;
      address: number | undefined;
    }>
  ): void {
    const rowSize = this.options.getRowSize();
    this.options.vscode.postMessage({
      type: 'refresh',
      rowSize,
      views: payloadViews,
    });
    if (this.options.statusEl) {
      this.options.statusEl.textContent = 'Refreshing…';
    }
  }

  handleSnapshot(payload: {
    symbols?: Array<{ name: string; address: number }>;
    registers?: RegisterData;
    views?: SnapshotView[];
    running?: boolean;
  }): void {
    this.updateSymbols(payload.symbols || []);
    if (typeof payload.running === 'boolean') {
      this.setEditingEnabled(!payload.running);
    }
    if (payload.registers) {
      this.registerPanel.render(payload.registers);
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
    const raw = entry.view
      ? (this.pickerMap.get(entry.view)?.value.trim() ?? entry.view.value)
      : '';
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
      picker.value =
        anchor.view === 'absolute' && anchor.address !== undefined
          ? (this.findSymbolByAddress(anchor.address)?.name ?? formatHex(anchor.address, 4))
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

  private renderViews(views: SnapshotView[]): void {
    const rowSize = this.options.getRowSize();
    views.forEach((entry) => {
      const target = this.options.views.find((view) => view.id === entry.id);
      if (!target || !target.dump || !target.addr || !target.symbol) {
        return;
      }
      target.addr.textContent = formatHex(entry.address ?? 0, 4);
      if (!this.isEditingMemoryDump(target.dump)) {
        renderDump({
          el: target.dump,
          start: entry.start,
          bytes: entry.bytes,
          writable: entry.writable ?? [],
          focusOffset: entry.focus ?? 0,
          rowSize,
          editingEnabled: this.editingEnabled,
          allowReadOnlyWrites: this.allowReadOnlyWrites,
        });
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
      entry.dump?.querySelectorAll<HTMLInputElement>('input.memory-byte-input').forEach((input) => {
        input.disabled =
          !this.editingEnabled || (input.dataset.readOnly === 'true' && !this.allowReadOnlyWrites);
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
    const isReadOnly = input.dataset.readOnly === 'true';
    if (isReadOnly && !this.allowReadOnlyWrites) {
      input.value = previousValue;
      if (this.options.statusEl) {
        this.options.statusEl.textContent = 'Read-only memory locked';
      }
      return;
    }
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
      ...(isReadOnly && this.allowReadOnlyWrites ? { allowReadOnly: true } : {}),
    });
  }

  private installReadOnlyToggle(): void {
    const shell = this.options.views[0]?.dump?.closest('#memoryPanel .shell');
    if (!shell || shell.querySelector('.readonly-memory-toggle')) {
      return;
    }
    const label = document.createElement('label');
    label.className = 'readonly-memory-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.allowReadOnlyWrites;
    label.append(checkbox, document.createTextNode(' Unlock read-only memory'));
    checkbox.addEventListener('change', () => {
      this.allowReadOnlyWrites = checkbox.checked;
      this.updateMemoryInputsState();
      this.requestSnapshot();
    });
    shell.prepend(label);
  }
}
