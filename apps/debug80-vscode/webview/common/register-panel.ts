import type { VscodeApi } from './vscode';
import { formatRegisterHex, normalizeHexInput } from './memory-panel-format';

export type RegisterData = Record<string, number | string | undefined>;

export type RegisterItem = {
  label: string;
  value: string;
  width?: number;
  editable?: boolean;
  register?: string;
  flags?: boolean;
};

type RegisterPanelOptions = {
  vscode: VscodeApi;
  registerStrip: HTMLElement | null;
  statusEl: HTMLElement | null;
};

const WORD_REGISTERS: Array<{ label: string; register: string; source: string }> = [
  { label: 'BC', register: 'bc', source: 'bc' },
  { label: 'DE', register: 'de', source: 'de' },
  { label: 'HL', register: 'hl', source: 'hl' },
  { label: "BC'", register: 'bcp', source: 'bcp' },
  { label: "DE'", register: 'dep', source: 'dep' },
  { label: "HL'", register: 'hlp', source: 'hlp' },
  { label: 'PC', register: 'pc', source: 'pc' },
  { label: 'SP', register: 'sp', source: 'sp' },
  { label: 'IX', register: 'ix', source: 'ix' },
  { label: 'IY', register: 'iy', source: 'iy' },
  { label: 'AF', register: 'af', source: 'af' },
  { label: "AF'", register: 'afp', source: 'afp' },
];

function numericRegisterValue(data: RegisterData, source: string, width: number): string {
  return formatRegisterHex((data[source] as number) || 0, width);
}

function createEditableWordItems(data: RegisterData): RegisterItem[] {
  return WORD_REGISTERS.map(({ label, register, source }) => ({
    label,
    register,
    value: numericRegisterValue(data, source, 4),
    width: 4,
    editable: true,
  }));
}

export function createRegisterItems(data: RegisterData): RegisterItem[] {
  return [
    ...createEditableWordItems(data),
    { label: 'I', value: numericRegisterValue(data, 'i', 2), width: 2 },
    { label: 'R', value: numericRegisterValue(data, 'r', 2), width: 2 },
    {
      label: 'Flags',
      register: 'flags',
      value: (data.flags as string) || '--------',
      editable: true,
      flags: true,
    },
    {
      label: "Flags'",
      register: 'flagsp',
      value: (data.flagsPrime as string) || '--------',
      editable: true,
      flags: true,
    },
  ];
}

function isEditableRegisterInput(
  element: Element | null,
  registerStrip: HTMLElement | null
): element is HTMLInputElement {
  return (
    element instanceof HTMLInputElement &&
    element.classList.contains('register-input') &&
    registerStrip?.contains(element) === true
  );
}

export class RegisterPanel {
  constructor(private readonly options: RegisterPanelOptions) {}

  render(data: RegisterData): void {
    if (!this.options.registerStrip || this.isEditingRegister()) {
      return;
    }
    this.options.registerStrip.innerHTML = '';
    for (const item of createRegisterItems(data)) {
      this.options.registerStrip.appendChild(this.createRegisterRow(item));
    }
  }

  private isEditingRegister(): boolean {
    return isEditableRegisterInput(document.activeElement, this.options.registerStrip);
  }

  private createRegisterRow(item: RegisterItem): HTMLElement {
    const row = document.createElement('div');
    row.className = 'register-item' + (item.editable ? ' editable' : '');
    row.classList.toggle('flag-register', item.flags === true);
    row.appendChild(this.createLabel(item.label));
    row.appendChild(
      item.editable && item.register !== undefined
        ? this.createInput(item)
        : this.createReadonlyValue(item)
    );
    return row;
  }

  private createLabel(text: string): HTMLElement {
    const label = document.createElement('span');
    label.className = 'register-label';
    label.textContent = text;
    return label;
  }

  private createReadonlyValue(item: RegisterItem): HTMLElement {
    const value = document.createElement('span');
    value.className = item.flags ? 'register-flags' : 'register-value';
    value.textContent = item.value;
    return value;
  }

  private createInput(item: RegisterItem): HTMLInputElement {
    const input = document.createElement('input');
    input.className = item.flags ? 'register-input register-flags' : 'register-input';
    input.type = 'text';
    input.value = item.value;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.inputMode = 'text';
    input.dataset.register = item.register;
    if (item.width !== undefined) {
      input.maxLength = item.width;
      input.dataset.width = String(item.width);
    }
    input.addEventListener('keydown', (event) => this.handleInputKeydown(event, input, item.value));
    input.addEventListener('blur', () => {
      this.commitRegisterEdit(input, item.value);
    });
    return input;
  }

  private handleInputKeydown(
    event: KeyboardEvent,
    input: HTMLInputElement,
    previousValue: string
  ): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      input.value = previousValue;
      input.blur();
    }
  }

  private commitRegisterEdit(input: HTMLInputElement, previousValue: string): void {
    const register = input.dataset.register;
    const width = Number.parseInt(input.dataset.width ?? '', 10);
    const value =
      register === 'flags' || register === 'flagsp'
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
}
