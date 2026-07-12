import { describe, expect, it, vi } from 'vitest';
import { createRegisterItems, RegisterPanel } from '../../../webview/common/register-panel';
import type { VscodeApi } from '../../../webview/common/vscode';

function createVscodeMock(postMessage = vi.fn()): VscodeApi {
  return {
    postMessage,
    getState: () => undefined,
    setState: () => undefined,
  };
}

describe('register panel', () => {
  it('builds the Z80 register strip model from a snapshot', () => {
    const items = createRegisterItems({
      bc: 0x1234,
      de: 0xabcd,
      i: 0x7f,
      r: 0x80,
      flags: 'SzYhXpNc',
      flagsPrime: 'sZyHxPnC',
    });

    expect(items.find((item) => item.register === 'bc')).toMatchObject({
      label: 'BC',
      value: '1234',
      width: 4,
      editable: true,
    });
    const iRegister = items.find((item) => item.label === 'I');
    expect(iRegister).toMatchObject({
      value: '7F',
      width: 2,
    });
    expect(iRegister).not.toHaveProperty('editable');
    expect(items.find((item) => item.register === 'flags')).toMatchObject({
      value: 'SzYhXpNc',
      flags: true,
    });
    expect(items.find((item) => item.register === 'flagsp')).toMatchObject({
      value: 'sZyHxPnC',
      flags: true,
    });
  });

  it('renders editable register inputs and posts normalized register edits', () => {
    const postMessage = vi.fn();
    const registerStrip = document.createElement('div');
    const statusEl = document.createElement('div');
    const panel = new RegisterPanel({
      vscode: createVscodeMock(postMessage),
      registerStrip,
      statusEl,
    });

    panel.render({ bc: 0x1234, flags: '--------' });
    const bc = registerStrip.querySelector<HTMLInputElement>('input[data-register="bc"]');
    const flags = registerStrip.querySelector<HTMLInputElement>('input[data-register="flags"]');
    expect(bc).not.toBeNull();
    expect(flags).not.toBeNull();

    bc!.value = 'abcd';
    bc!.dispatchEvent(new Event('blur'));
    flags!.value = 'SZ';
    flags!.dispatchEvent(new Event('blur'));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'registerEdit',
      register: 'bc',
      value: 'ABCD',
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'registerEdit',
      register: 'flags',
      value: 'SZ',
    });
  });

  it('does not replace a focused register input during refresh', () => {
    const registerStrip = document.createElement('div');
    document.body.appendChild(registerStrip);
    const panel = new RegisterPanel({
      vscode: createVscodeMock(),
      registerStrip,
      statusEl: null,
    });

    panel.render({ bc: 0x1234 });
    const input = registerStrip.querySelector<HTMLInputElement>('input[data-register="bc"]');
    expect(input).not.toBeNull();
    input!.focus();
    input!.value = 'ABCD';
    panel.render({ bc: 0x5678 });

    expect(document.activeElement).toBe(input);
    expect(registerStrip.querySelector<HTMLInputElement>('input[data-register="bc"]')).toBe(input);
    expect(input!.value).toBe('ABCD');
  });

  it('reports invalid register edits without posting a message', () => {
    const postMessage = vi.fn();
    const registerStrip = document.createElement('div');
    const statusEl = document.createElement('div');
    const panel = new RegisterPanel({
      vscode: createVscodeMock(postMessage),
      registerStrip,
      statusEl,
    });

    panel.render({ bc: 0x1234 });
    const bc = registerStrip.querySelector<HTMLInputElement>('input[data-register="bc"]');
    bc!.value = 'not-hex';
    bc!.dispatchEvent(new Event('blur'));

    expect(bc!.value).toBe('1234');
    expect(statusEl.textContent).toBe('Register edit failed');
    expect(postMessage).not.toHaveBeenCalled();
  });
});
