/**
 * @file Regression tests for terminal panel HTML.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
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

  function createHarness(
    initialOutput = 'boot <ready>',
    mode: 'stream' | 'cpm22' = 'stream'
  ): TerminalHarness {
    const html = getTerminalHtml(initialOutput, extensionRoot, mode);

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
      if (mode === 'cpm22' && event.ctrlKey && !event.altKey && !event.metaKey) {
        const control: Record<string, string> = { s: '\u0013', q: '\u0011' };
        const text = control[event.key.toLowerCase()];
        if (text !== undefined) {
          event.preventDefault();
          vscode.postMessage({ type: 'input', text });
          return;
        }
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

  function requireHarness(): TerminalHarness {
    if (harness === null) {
      throw new Error('terminal harness not initialized');
    }
    return harness;
  }

  function createActualCpmHarness(initialOutput = ''): TerminalHarness {
    const html = getTerminalHtml(initialOutput, extensionRoot, 'cpm22');
    const script = html.match(/<script nonce="[^"]*">([\s\S]*)<\/script>/)?.[1];
    if (script === undefined) {
      throw new Error('terminal script not found');
    }
    document.documentElement.innerHTML = html.replace(
      /<script nonce="[^"]*">[\s\S]*<\/script>/,
      ''
    );
    const out = document.getElementById('out');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    if (
      !(out instanceof HTMLElement) ||
      !(input instanceof HTMLInputElement) ||
      !(send instanceof HTMLButtonElement)
    ) {
      throw new Error('actual terminal elements not found');
    }
    runInNewContext(script, {
      acquireVsCodeApi: () => ({
        postMessage: (message: TerminalMessage) => messages.push(message),
      }),
      document,
      window,
    });
    return { messages, out, input, send };
  }

  function dispatchOutput(text: string): void {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'output', text } }));
  }

  function dispatchClear(): void {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'clear' } }));
  }

  function clickSend(input: HTMLInputElement, send: HTMLButtonElement, value: string): void {
    input.value = value;
    send.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function pressCtrlC(input: HTMLInputElement): void {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
  }

  function pressControl(input: HTMLInputElement, key: string): boolean {
    return input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
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

  it('renders the CP/M terminal as an 80x24 screen and submits carriage return', () => {
    const html = getTerminalHtml('\r\nA>', extensionRoot, 'cpm22');

    expect(html).toContain("const terminalMode = 'cpm22'");
    expect(html).toContain('const columns = 80');
    expect(html).toContain('const rows = 24');
    expect(html).toContain("terminalMode === 'cpm22' ? '\\r' : '\\n'");
    expect(html).toContain("vscode.postMessage({ type: 'input', text: event.key })");
    expect(html).toContain("text: '\\u001b[' + suffix");
    expect(html).toContain("text: '\\b'");
    expect(html).toContain("text: '\\u007f'");
    expect(html).toContain("const control = { s: '\\u0013', q: '\\u0011' }");
    expect(html).toContain("else if (final === 'm') selectGraphicRendition(params)");
    expect(html).toContain("span.classList.add('terminal-reverse')");
    expect(html).toContain("event.clipboardData?.getData('text/plain')");
    expect(html).toContain('body.cpm22 #out');
  });

  it('sends CP/M save and quit controls as raw bytes without browser defaults', () => {
    harness = createHarness('', 'cpm22');
    const { input } = requireHarness();

    expect(pressControl(input, 's')).toBe(false);
    expect(pressControl(input, 'Q')).toBe(false);
    expect(messages).toEqual([
      { type: 'input', text: '\u0013' },
      { type: 'input', text: '\u0011' },
    ]);

    pressCtrlC(input);
    expect(messages).toContainEqual({ type: 'break' });
  });

  it('executes the CP/M webview parser with reverse rendition and raw controls', () => {
    harness = createActualCpmHarness();
    const { out, input } = requireHarness();

    dispatchOutput('\u001b[24;1H\u001b[7mSTATUS\u001b[0m\u001b[1;1H');
    expect(out.textContent?.split('\n')).toHaveLength(24);
    expect(out.querySelector('.terminal-reverse')?.textContent).toBe('STATUS');

    expect(pressControl(input, 'S')).toBe(false);
    expect(pressControl(input, 'q')).toBe(false);
    expect(messages).toEqual([
      { type: 'input', text: '\u0013' },
      { type: 'input', text: '\u0011' },
    ]);
  });

  it('preserves output, clear, input, and break handling', () => {
    const { out, input, send } = requireHarness();

    expect(out.textContent).toBe('boot <ready>');

    dispatchOutput('A');
    expect(out.textContent).toBe('boot <ready>A');

    clickSend(input, send, 'HELLO');
    expect(out.textContent).toBe('boot <ready>AHELLO\\n');
    expect(input.value).toBe('');
    expect(messages).toContainEqual({ type: 'input', text: 'HELLO\\n' });

    pressCtrlC(input);
    expect(messages).toContainEqual({ type: 'break' });

    dispatchClear();
    expect(out.textContent).toBe('');
  });
});
