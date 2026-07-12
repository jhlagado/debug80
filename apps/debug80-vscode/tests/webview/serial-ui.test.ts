/**
 * @file Regression tests: shared serial UI contracts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { wireSerialUi, type SerialUiOptions } from '../../webview/common/serial-ui';

type PostedMessage = { type: string; text?: string };

type SerialFixture = {
  name: string;
  htmlPath: string;
  options?: SerialUiOptions;
  outputId: string;
  clearId: string;
  hasFullControls: boolean;
};

const fixtures: SerialFixture[] = [
  {
    name: 'simple terminal',
    htmlPath: path.resolve(__dirname, '../../webview/simple/index.html'),
    options: { outputId: 'terminalOut', clearId: 'terminalClear' },
    outputId: 'terminalOut',
    clearId: 'terminalClear',
    hasFullControls: false,
  },
  {
    name: 'TEC-1 serial panel',
    htmlPath: path.resolve(__dirname, '../../webview/tec1/index.html'),
    outputId: 'serialOut',
    clearId: 'serialClear',
    hasFullControls: true,
  },
  {
    name: 'TEC-1G serial panel',
    htmlPath: path.resolve(__dirname, '../../webview/tec1g/index.html'),
    outputId: 'serialOut',
    clearId: 'serialClear',
    hasFullControls: true,
  },
];

describe.each(fixtures)('$name', (fixture) => {
  let doc: Document;
  let messages: PostedMessage[];
  let controller: { dispose: () => void } | null;

  beforeEach(() => {
    document.documentElement.innerHTML = fs
      .readFileSync(fixture.htmlPath, 'utf8')
      .replace(/\{\{\w+\}\}/g, '');
    doc = document;
    messages = [];
    controller = wireSerialUi(
      {
        postMessage: (message: unknown) => {
          messages.push(message as PostedMessage);
        },
        getState: () => null,
        setState: () => {},
      },
      fixture.options
    );
  });

  it('routes serial messages into the output panel', () => {
    const output = doc.getElementById(fixture.outputId) as HTMLElement;

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'serial', text: 'abc' } }));
    expect(output.textContent).toBe('abc');

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'serialInit', text: 'boot' } })
    );
    expect(output.textContent).toBe('boot');

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'serialClear' } }));
    expect(output.textContent).toBe('');
  });

  it('clears the output panel and posts serialClear', () => {
    const output = doc.getElementById(fixture.outputId) as HTMLElement;
    const clear = doc.getElementById(fixture.clearId) as HTMLElement;

    output.textContent = 'log line';
    clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(output.textContent).toBe('');
    expect(messages).toContainEqual({ type: 'serialClear' });
  });

  it.runIf(fixture.hasFullControls)('preserves full serial postMessage controls', () => {
    const output = doc.getElementById(fixture.outputId) as HTMLElement;
    const input = doc.getElementById('serialInput') as HTMLInputElement;
    const send = doc.getElementById('serialSend') as HTMLElement;
    const sendFile = doc.getElementById('serialSendFile') as HTMLElement;
    const save = doc.getElementById('serialSave') as HTMLElement;

    input.value = 'HELLO  ';
    send.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(messages).toContainEqual({ type: 'serialSend', text: 'HELLO\r' });
    expect(input.value).toBe('');

    output.textContent = 'log line';
    sendFile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(messages).toContainEqual({ type: 'serialSendFile' });

    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(messages).toContainEqual({ type: 'serialSave', text: 'log line' });
  });

  afterEach(() => {
    controller?.dispose();
    controller = null;
  });
});
