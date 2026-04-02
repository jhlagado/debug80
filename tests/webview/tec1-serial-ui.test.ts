/**
 * @file Regression test: TEC-1 serial UI contract.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { wireTec1SerialUi } from '../../webview/tec1/serial-ui';

const HTML_PATH = path.resolve(__dirname, '../../webview/tec1/index.html');

type PostedMessage = { type: string; text?: string };

function buildDom(): Document {
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/\{\{\w+\}\}/g, '');
  document.documentElement.innerHTML = html;
  return document;
}

function createVscodeMock(messages: PostedMessage[]) {
  return {
    postMessage: (message: unknown) => {
      messages.push(message as PostedMessage);
    },
    getState: () => null,
    setState: () => {},
  };
}

describe('tec1 serial UI', () => {
  let doc: Document;
  let messages: PostedMessage[];
  let controller: { dispose: () => void } | null;

  beforeEach(() => {
    doc = buildDom();
    messages = [];
    controller = wireTec1SerialUi(createVscodeMock(messages));
  });

  it('routes serial messages into the output panel', () => {
    const serialOut = doc.getElementById('serialOut') as HTMLElement;

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'serial', text: 'abc' } }));
    expect(serialOut.textContent).toBe('abc');

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'serialInit', text: 'boot' } })
    );
    expect(serialOut.textContent).toBe('boot');

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'serialClear' } }));
    expect(serialOut.textContent).toBe('');
  });

  it('preserves the serial send/save/clear postMessage contract', () => {
    const serialOut = doc.getElementById('serialOut') as HTMLElement;
    const serialInput = doc.getElementById('serialInput') as HTMLInputElement;
    const serialSend = doc.getElementById('serialSend') as HTMLElement;
    const serialSendFile = doc.getElementById('serialSendFile') as HTMLElement;
    const serialSave = doc.getElementById('serialSave') as HTMLElement;
    const serialClear = doc.getElementById('serialClear') as HTMLElement;

    serialInput.value = 'HELLO  ';
    serialSend.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(messages).toContainEqual({ type: 'serialSend', text: 'HELLO\r' });
    expect(serialInput.value).toBe('');

    serialOut.textContent = 'log line';
    serialSendFile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(messages).toContainEqual({ type: 'serialSendFile' });

    serialSave.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(messages).toContainEqual({ type: 'serialSave', text: 'log line' });

    serialClear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(serialOut.textContent).toBe('');
    expect(messages).toContainEqual({ type: 'serialClear' });
  });

  afterEach(() => {
    controller?.dispose();
    controller = null;
  });
});
