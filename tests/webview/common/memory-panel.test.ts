/**
 * @file Shared memory panel editing tests.
 */

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryPanel } from '../../../webview/common/memory-panel';
import type { VscodeApi } from '../../../webview/common/vscode';

function createElement<T extends HTMLElement>(
  tagName: string,
  className?: string
): T {
  const element = document.createElement(tagName) as T;
  if (className !== undefined) {
    element.className = className;
  }
  return element;
}

function createPanel(vscode: VscodeApi, options: { withShell?: boolean } = {}) {
  const registerStrip = createElement<HTMLDivElement>('div');
  const statusEl = createElement<HTMLDivElement>('div');
  const dump = createElement<HTMLDivElement>('div');
  const view = document.createElement('select');
  for (const [value, label] of [
    ['pc', 'PC'],
    ['sp', 'SP'],
    ['bc', 'BC'],
    ['de', 'DE'],
    ['hl', 'HL'],
    ['ix', 'IX'],
    ['iy', 'IY'],
    ['absolute', 'Absolute'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    view.appendChild(option);
  }
  const address = document.createElement('input');
  const addr = createElement<HTMLSpanElement>('span');
  const symbol = createElement<HTMLSpanElement>('span');

  if (options.withShell === true) {
    const panelRoot = createElement<HTMLDivElement>('div');
    panelRoot.id = 'memoryPanel';
    const shell = createElement<HTMLDivElement>('div', 'shell');
    shell.append(dump);
    panelRoot.append(shell);
    document.body.append(registerStrip, statusEl, panelRoot, view, address, addr, symbol);
  } else {
    document.body.append(registerStrip, statusEl, dump, view, address, addr, symbol);
  }

  const panel = new MemoryPanel({
    vscode,
    registerStrip,
    statusEl,
    views: [
      {
        id: 'a',
        view,
        address,
        addr,
        symbol,
        dump,
      },
    ],
    getRowSize: () => 8,
    isActive: () => true,
  });

  panel.wire();

  return { panel, dump, registerStrip, statusEl, view, address };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('shared memory panel', () => {
  it('renders editable byte inputs and posts plain-hex memory edits', () => {
    const postMessage = vi.fn();
    const { panel, dump } = createPanel({
      postMessage,
      getState: vi.fn(),
      setState: vi.fn(),
    });

    panel.handleSnapshot({
      running: false,
      views: [
        {
          id: 'a',
          address: 0x1000,
          start: 0x1000,
          bytes: [0x41, 0x42, 0x43, 0x44],
          focus: 1,
        },
      ],
    });

    const inputs = dump.querySelectorAll<HTMLInputElement>('input.memory-byte-input');
    expect(inputs).toHaveLength(4);
    expect(inputs[0]?.disabled).toBe(false);
    expect(inputs[0]?.value).toBe('41');

    if (!inputs[0]) {
      throw new Error('first memory input missing');
    }

    inputs[0].value = 'ab';
    inputs[0].dispatchEvent(new Event('focusout', { bubbles: true }));

    expect(inputs[0].value).toBe('AB');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'memoryEdit',
      address: 0x1000,
      value: 'AB',
    });
  });

  it('uses searchable memory anchors for register, absolute, and partial symbol matches', () => {
    const postMessage = vi.fn();
    const { panel, view, address } = createPanel({
      postMessage,
      getState: vi.fn(),
      setState: vi.fn(),
    });

    panel.handleSnapshot({
      running: false,
      symbols: [
        { name: 'LCD_TEXT_TETRO_RUNNING', address: 0x4567 },
      ],
    });

    const picker = document.querySelector<HTMLInputElement>('.memory-anchor-picker');
    expect(picker).not.toBeNull();
    if (!picker) {
      throw new Error('memory anchor picker missing');
    }

    picker.value = 'running';
    picker.dispatchEvent(new Event('change'));
    expect(view.value).toBe('absolute');
    expect(address.value).toBe('0x4567');
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'refresh',
      rowSize: 8,
      views: [{ id: 'a', view: 'absolute', after: 16, address: 0x4567 }],
    });

    picker.value = 'EF80';
    picker.dispatchEvent(new Event('change'));
    expect(view.value).toBe('absolute');
    expect(address.value).toBe('0xEF80');
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'refresh',
      rowSize: 8,
      views: [{ id: 'a', view: 'absolute', after: 16, address: 0xef80 }],
    });

    picker.value = 'sp';
    picker.dispatchEvent(new Event('change'));
    expect(view.value).toBe('sp');
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'refresh',
      rowSize: 8,
      views: [{ id: 'a', view: 'sp', after: 16, address: undefined }],
    });
  });

  it('does not replace a focused memory byte input during snapshot refresh', () => {
    const { panel, dump } = createPanel({
      postMessage: vi.fn(),
      getState: vi.fn(),
      setState: vi.fn(),
    });

    panel.handleSnapshot({
      running: false,
      views: [
        {
          id: 'a',
          address: 0x1000,
          start: 0x1000,
          bytes: [0x41, 0x42, 0x43, 0x44],
          focus: 1,
        },
      ],
    });

    const input = dump.querySelector<HTMLInputElement>('input[data-address="1001"]');
    expect(input).not.toBeNull();
    if (!input) {
      throw new Error('memory byte input missing');
    }

    input.focus();
    input.value = 'ab';

    panel.handleSnapshot({
      running: false,
      views: [
        {
          id: 'a',
          address: 0x1000,
          start: 0x1000,
          bytes: [0xff, 0xee, 0xdd, 0xcc],
          focus: 0,
        },
      ],
    });

    expect(document.activeElement).toBe(input);
    expect(dump.querySelector<HTMLInputElement>('input[data-address="1001"]')).toBe(input);
    expect(input.value).toBe('ab');
  });

  it('disables byte inputs while the runtime is running', () => {
    const { panel, dump } = createPanel({
      postMessage: vi.fn(),
      getState: vi.fn(),
      setState: vi.fn(),
    });

    panel.handleSnapshot({
      running: true,
      views: [
        {
          id: 'a',
          address: 0x2000,
          start: 0x2000,
          bytes: [0x10, 0x20],
          focus: 0,
        },
      ],
    });

    const inputs = dump.querySelectorAll<HTMLInputElement>('input.memory-byte-input');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.disabled).toBe(true);
    expect(inputs[1]?.disabled).toBe(true);
  });

  it('marks read-only bytes and requires the unlock toggle before editing them', () => {
    const postMessage = vi.fn();
    const { panel, dump } = createPanel({
      postMessage,
      getState: vi.fn(),
      setState: vi.fn(),
    }, { withShell: true });

    panel.handleSnapshot({
      running: false,
      views: [
        {
          id: 'a',
          address: 0x3000,
          start: 0x3000,
          bytes: [0xaa, 0xbb],
          writable: [false, true],
          focus: 0,
        },
      ],
    });

    const inputs = dump.querySelectorAll<HTMLInputElement>('input.memory-byte-input');
    expect(inputs[0]?.disabled).toBe(true);
    expect(inputs[0]?.classList.contains('read-only-memory-byte')).toBe(true);
    expect(inputs[1]?.disabled).toBe(false);

    const toggle = document.querySelector<HTMLInputElement>('.readonly-memory-toggle input');
    expect(toggle).not.toBeNull();
    if (!toggle || !inputs[0]) {
      throw new Error('read-only toggle or memory byte missing');
    }
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(inputs[0].disabled).toBe(false);
    inputs[0].value = 'cc';
    inputs[0].dispatchEvent(new Event('focusout', { bubbles: true }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'memoryEdit',
      address: 0x3000,
      value: 'CC',
      allowReadOnly: true,
    });
  });

  it('does not replace a focused register input during snapshot refresh', () => {
    const postMessage = vi.fn();
    const { panel, registerStrip } = createPanel({
      postMessage,
      getState: vi.fn(),
      setState: vi.fn(),
    });

    panel.handleSnapshot({
      running: false,
      registers: {
        bc: 0x1234,
      },
    });

    const input = registerStrip.querySelector<HTMLInputElement>('input[data-register="bc"]');
    expect(input).not.toBeNull();
    if (!input) {
      throw new Error('BC register input missing');
    }

    input.focus();
    input.value = 'ABCD';

    panel.handleSnapshot({
      running: false,
      registers: {
        bc: 0x5678,
      },
    });

    expect(document.activeElement).toBe(input);
    expect(registerStrip.querySelector<HTMLInputElement>('input[data-register="bc"]')).toBe(input);
    expect(input.value).toBe('ABCD');
  });

  it('renders AF and alternate AF as editable register inputs', () => {
    const postMessage = vi.fn();
    const { panel, registerStrip } = createPanel({
      postMessage,
      getState: vi.fn(),
      setState: vi.fn(),
    });

    panel.handleSnapshot({
      running: false,
      registers: {
        af: 0xa5c3,
        afp: 0x5a3c,
      },
    });

    const af = registerStrip.querySelector<HTMLInputElement>('input[data-register="af"]');
    const afp = registerStrip.querySelector<HTMLInputElement>('input[data-register="afp"]');
    expect(af).not.toBeNull();
    expect(afp).not.toBeNull();
    expect(af?.value).toBe('A5C3');
    expect(afp?.value).toBe('5A3C');
    expect(af?.closest('.register-item')?.classList.contains('editable')).toBe(true);
    expect(afp?.closest('.register-item')?.classList.contains('editable')).toBe(true);
  });

  it('renders Flags and alternate Flags as editable register inputs', () => {
    const postMessage = vi.fn();
    const { panel, registerStrip } = createPanel({
      postMessage,
      getState: vi.fn(),
      setState: vi.fn(),
    });

    panel.handleSnapshot({
      running: false,
      registers: {
        flags: 'SzYhXpNc',
        flagsPrime: 'sZyHxPnC',
      },
    });

    const flags = registerStrip.querySelector<HTMLInputElement>('input[data-register="flags"]');
    const flagsPrime = registerStrip.querySelector<HTMLInputElement>('input[data-register="flagsp"]');
    expect(flags).not.toBeNull();
    expect(flagsPrime).not.toBeNull();
    expect(flags?.value).toBe('SzYhXpNc');
    expect(flagsPrime?.value).toBe('sZyHxPnC');

    flags!.value = 'CSz';
    flags!.dispatchEvent(new Event('blur'));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'registerEdit',
      register: 'flags',
      value: 'CSz',
    });
  });
});
