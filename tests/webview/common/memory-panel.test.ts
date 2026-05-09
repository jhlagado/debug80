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

function createPanel(vscode: VscodeApi) {
  const registerStrip = createElement<HTMLDivElement>('div');
  const statusEl = createElement<HTMLDivElement>('div');
  const dump = createElement<HTMLDivElement>('div');
  const view = document.createElement('select');
  const address = document.createElement('input');
  const addr = createElement<HTMLSpanElement>('span');
  const symbol = createElement<HTMLSpanElement>('span');

  document.body.append(registerStrip, statusEl, dump, view, address, addr, symbol);

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

  return { panel, dump, registerStrip, statusEl };
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
});
