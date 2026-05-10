/**
 * @file Regression tests: shared restart control contract.
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

describe('shared restart control', () => {
  it.each(HTML_PATHS)('renders restart in the %s top bar', (_label, htmlPath) => {
    buildDom(htmlPath);
    const restartButton = document.getElementById('restartDebug') as HTMLButtonElement | null;
    const topBar = document.querySelector('.tabs, .debug80-toolbar');

    expect(topBar).not.toBeNull();
    expect(restartButton).not.toBeNull();
    if (!topBar || !restartButton) {
      throw new Error('restart button is missing');
    }
    expect(topBar.contains(restartButton)).toBe(true);
    const slot = document.querySelector('.tabs-status-slot, .debug80-status-slot');
    const stopOnEntry = document.getElementById('stopOnEntry') as HTMLInputElement | null;
    const stopOnEntryLabel = document.querySelector('.stop-on-entry-label');
    const projectHeader = document.getElementById('projectHeader');
    expect(slot).not.toBeNull();
    expect(slot?.contains(restartButton)).toBe(true);
    expect(stopOnEntry).not.toBeNull();
    expect(projectHeader?.contains(stopOnEntry)).toBe(true);
    expect(stopOnEntryLabel).not.toBeNull();
    expect(stopOnEntryLabel?.title).toBe(
      'Pause at the program entry point when starting or restarting debugging. Kept in the Debug80 panel for this VS Code window session only; not written to debug80.json.'
    );
    expect(restartButton?.textContent).toBe('Restart');
    expect(restartButton?.dataset.status).toBe('not-running');
    expect(restartButton?.disabled).toBe(false);
    expect(restartButton?.title).toBe(
      'Relaunch the current project and target using the current launch options'
    );
    expect(restartButton?.getAttribute('aria-label')).toBe(
      'Relaunch the current project and target using the current launch options'
    );
  });

  it.each(HTML_PATHS)('keeps restart explicit for %s session states', (_label, htmlPath) => {
    buildDom(htmlPath);
    const messages: PostedMessage[] = [];
    const controller = createSessionStatusController(
      createVscodeMock(messages),
      document.getElementById('restartDebug')
    );
    const restartButton = document.getElementById('restartDebug') as HTMLButtonElement | null;

    controller.setStatus('starting');
    expect(restartButton?.textContent).toBe('Restart');
    expect(restartButton?.dataset.status).toBe('starting');
    expect(restartButton?.disabled).toBe(true);

    controller.setStatus('running');
    expect(restartButton?.textContent).toBe('Restart');
    expect(restartButton?.dataset.status).toBe('running');
    expect(restartButton?.disabled).toBe(false);

    controller.setStatus('paused');
    expect(restartButton?.textContent).toBe('Restart');
    expect(restartButton?.dataset.status).toBe('paused');
    expect(restartButton?.disabled).toBe(false);

    controller.dispose();
  });

  it.each(HTML_PATHS)('restarts debugging when the %s control is clicked', (_label, htmlPath) => {
    buildDom(htmlPath);
    const messages: PostedMessage[] = [];
    createSessionStatusController(
      createVscodeMock(messages),
      document.getElementById('restartDebug')
    );

    const restartButton = document.getElementById('restartDebug') as HTMLButtonElement | null;
    restartButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(messages).toContainEqual({ type: 'restartDebug' });
  });
});
