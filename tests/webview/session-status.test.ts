/**
 * @file Regression tests: debugger session status badge contract.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createSessionStatusController } from '../../webview/common/session-status';

const HTML_PATHS = [
  ['simple', path.resolve(__dirname, '../../webview/simple/index.html')],
  ['tec1', path.resolve(__dirname, '../../webview/tec1/index.html')],
  ['tec1g', path.resolve(__dirname, '../../webview/tec1g/index.html')],
] as const;

type PostedMessage = { type: string; [key: string]: unknown };

function buildDom(htmlPath: string): Document {
  const html = fs.readFileSync(htmlPath, 'utf8').replace(/\{\{\w+\}\}/g, '');
  document.documentElement.innerHTML = html;
  return document;
}

function createVscodeMock(messages: PostedMessage[]) {
  return {
    postMessage: (message: PostedMessage) => {
      messages.push(message);
    },
    getState: () => null,
    setState: () => {},
  };
}

describe('debugger session status badge', () => {
  it.each(HTML_PATHS)('renders the badge in the %s top bar', (_label, htmlPath) => {
    buildDom(htmlPath);
    const badge = document.getElementById('sessionStatus') as HTMLButtonElement | null;
    const tabs = document.querySelector('.tabs');

    expect(tabs).not.toBeNull();
    expect(badge).not.toBeNull();
    if (!tabs || !badge) {
      throw new Error('session status badge is missing');
    }
    expect(tabs.contains(badge)).toBe(true);
    const slot = document.querySelector('.tabs-status-slot');
    const stopOnEntry = document.getElementById('stopOnEntry') as HTMLInputElement | null;
    expect(slot).not.toBeNull();
    expect(slot?.contains(badge)).toBe(true);
    expect(stopOnEntry).not.toBeNull();
    expect(slot?.contains(stopOnEntry)).toBe(true);
    expect(badge?.textContent).toBe('Not running');
    expect(badge?.dataset.status).toBe('not-running');
    expect(badge?.disabled).toBe(false);
    expect(badge?.title).toBe('Click to start debugging');
    expect(badge?.getAttribute('aria-label')).toBe(
      'Not running. Click to start debugging'
    );
  });

  it.each(HTML_PATHS)('updates the badge text for %s session states', (_label, htmlPath) => {
    buildDom(htmlPath);
    const messages: PostedMessage[] = [];
    const controller = createSessionStatusController(
      createVscodeMock(messages),
      document.getElementById('sessionStatus')
    );
    const badge = document.getElementById('sessionStatus') as HTMLButtonElement | null;

    controller.setStatus('starting');
    expect(badge?.textContent).toBe('Starting...');
    expect(badge?.dataset.status).toBe('starting');
    expect(badge?.disabled).toBe(true);
    expect(badge?.title).toBe('Debugger session is starting');

    controller.setStatus('running');
    expect(badge?.textContent).toBe('Running');
    expect(badge?.dataset.status).toBe('running');
    expect(badge?.title).toBe('Debugger session is running');

    controller.setStatus('paused');
    expect(badge?.textContent).toBe('Paused');
    expect(badge?.dataset.status).toBe('paused');
    expect(badge?.title).toBe('Debugger session is paused');

    controller.dispose();
  });

  it.each(HTML_PATHS)('starts debugging when the %s badge is clicked in the idle state', (_label, htmlPath) => {
    buildDom(htmlPath);
    const messages: PostedMessage[] = [];
    createSessionStatusController(
      createVscodeMock(messages),
      document.getElementById('sessionStatus')
    );

    const badge = document.getElementById('sessionStatus') as HTMLButtonElement | null;
    badge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(messages).toContainEqual({ type: 'startDebug' });
  });
});
