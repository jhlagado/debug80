export function formatRegisterHex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

export function formatHex(value: number, width: number): string {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

export function selectedOptionLabel(select: HTMLSelectElement): string {
  return select.selectedOptions[0]?.textContent?.trim() || select.value.toUpperCase();
}

export function registerAnchorFromText(value: string): string | null {
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

export function normalizeHexInput(value: string, width: number): string | null {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0 || trimmed.startsWith('0X')) {
    return null;
  }
  if (!/^[0-9A-F]+$/.test(trimmed) || trimmed.length > width) {
    return null;
  }
  return trimmed.padStart(width, '0');
}

export function renderDump(options: {
  el: HTMLElement;
  start: number;
  bytes: number[];
  writable: boolean[];
  focusOffset: number;
  rowSize: number;
  editingEnabled: boolean;
  allowReadOnlyWrites: boolean;
}): void {
  let html = '';
  for (let i = 0; i < options.bytes.length; i += options.rowSize) {
    const rowAddr = (options.start + i) & 0xffff;
    html += '<div class="row"><span class="row-addr">' + formatHex(rowAddr, 4) + '</span>';
    let ascii = '';
    for (let j = 0; j < options.rowSize && i + j < options.bytes.length; j++) {
      const idx = i + j;
      const value = options.bytes[idx] ?? 0;
      const isWritable = options.writable[idx] !== false;
      const cls =
        'byte' +
        (idx === options.focusOffset ? ' focus' : '') +
        (!isWritable ? ' read-only-memory-byte' : '');
      const byteValue = formatByteHex(value);
      html +=
        '<input class="' +
        cls +
        ' memory-byte-input" type="text" spellcheck="false" autocomplete="off" inputmode="text" maxlength="2" data-address="' +
        formatByteHex((rowAddr + j) & 0xffff, 4) +
        '" data-previous="' +
        byteValue +
        '" data-read-only="' +
        (!isWritable ? 'true' : 'false') +
        '" value="' +
        byteValue +
        '"' +
        (options.editingEnabled && (isWritable || options.allowReadOnlyWrites) ? '' : ' disabled') +
        ' />';
      ascii += value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';
    }
    html += '<span class="ascii">' + ascii + '</span></div>';
  }
  options.el.innerHTML = html;
}

export function isMemoryByteInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.classList.contains('memory-byte-input');
}

export function parseAddress(text: string): number | undefined {
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

function formatByteHex(value: number, width = 2): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}
