/**
 * @file Regression tests for terminal panel HTML.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTerminalHtml } from '../../src/extension/terminal-panel-html';

type TerminalMessage = { type: string; text?: string };

type TerminalVscodeApi = {
  postMessage: (message: TerminalMessage) => void;
};

type TerminalHarness = {
  messages: TerminalMessage[];
  out: HTMLElement;
  input: HTMLInputElement;
  send: HTMLButtonElement;
};

describe('terminal panel html', () => {
  const extensionRoot = { fsPath: process.cwd() };
  let messages: TerminalMessage[] = [];
  let harness: TerminalHarness | null = null;

  function createHarness(initialOutput = 'boot <ready>'): TerminalHarness {
    const html = getTerminalHtml(initialOutput, extensionRoot);

    document.documentElement.innerHTML = html.replace(
      /<script nonce="[^"]*">[\s\S]*<\/script>/,
      ''
    );

    const out = document.getElementById('out');
    const input = document.getElementById('input');
    const send = document.getElementById('send');

    if (!(out instanceof HTMLElement)) {
      throw new Error('terminal output element not found');
    }
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('terminal input element not found');
    }
    if (!(send instanceof HTMLButtonElement)) {
      throw new Error('terminal send button not found');
    }

    const vscode: TerminalVscodeApi = {
      postMessage: (message: TerminalMessage) => {
        messages.push(message);
      },
    };

    window.scrollTo = vi.fn();

    const sendInput = (): void => {
      const payload = `${input.value}\\n`;
      out.textContent = `${out.textContent ?? ''}${payload}`;
      window.scrollTo(0, document.body.scrollHeight);
      vscode.postMessage({ type: 'input', text: payload });
      input.value = '';
      input.focus();
    };

    window.addEventListener('message', (event) => {
      const msg = event.data as TerminalMessage;
      if (msg.type === 'clear') {
        out.textContent = '';
        return;
      }
      if (msg.type === 'output' && typeof msg.text === 'string') {
        out.textContent = `${out.textContent ?? ''}${msg.text}`;
        window.scrollTo(0, document.body.scrollHeight);
      }
    });

    send.addEventListener('click', () => {
      sendInput();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendInput();
        return;
      }
      if (event.key === 'c' && event.ctrlKey) {
        vscode.postMessage({ type: 'break' });
      }
    });

    input.focus();

    return {
      messages,
      out,
      input,
      send,
    };
  }

  beforeEach(() => {
    messages = [];
    harness = createHarness();
  });

  afterEach(() => {
    document.documentElement.innerHTML = '';
    harness = null;
    vi.restoreAllMocks();
  });

  it('renders escaped initial output with a nonce-protected script', () => {
    const html = getTerminalHtml('boot <ready>', extensionRoot);

    expect(html).toContain("script-src 'nonce-");
    expect(html).toContain('boot &lt;ready&gt;');
    expect(html).not.toContain('boot <ready>');
  });

  it('preserves output, clear, input, and break handling', () => {
    if (harness === null) {
      throw new Error('terminal harness not initialized');
    }

    const { out, input, send } = harness;

    expect(out.textContent).toBe('boot <ready>');

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'output', text: 'A' } }));
    expect(out.textContent).toBe('boot <ready>A');

    input.value = 'HELLO';
    send.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(out.textContent).toBe('boot <ready>AHELLO\\n');
    expect(input.value).toBe('');
    expect(messages).toContainEqual({ type: 'input', text: 'HELLO\\n' });

    input.value = 'CTRL';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(messages).toContainEqual({ type: 'break' });

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'clear' } }));
    expect(out.textContent).toBe('');
  });
});
