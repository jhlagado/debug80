/**
 * @file Regression tests: TEC-1G visibility controller contract.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createVisibilityController } from '../../webview/tec1g/visibility-controller';

const HTML_PATH = path.resolve(__dirname, '../../webview/tec1g/index.html');

function buildDom(): Document {
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/\{\{\w+\}\}/g, '');
  document.documentElement.innerHTML = html;
  return document;
}

describe('tec1g visibility controller', () => {
  beforeEach(() => {
    buildDom();
  });

  it('loads persisted visibility state into the DOM and checkboxes', () => {
    const controller = createVisibilityController({
      getState: () => ({ uiVisibility: { glcd: true, serial: false } }),
      postMessage: () => undefined,
      setState: () => undefined,
    });

    controller.wire();

    expect(
      document.querySelector('.ui-section[data-section="glcd"]')?.classList.contains('ui-hidden')
    ).toBe(false);
    expect(
      document.querySelector('.ui-section[data-section="serial"]')?.classList.contains('ui-hidden')
    ).toBe(true);
    expect(
      (document.querySelector('[data-section="glcd"]') as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (document.querySelector('[data-section="serial"]') as HTMLInputElement).checked
    ).toBe(false);
  });

  it('persists overrides and checkbox changes through vscode state', () => {
    const setState = vi.fn<(state: { uiVisibility?: Record<string, boolean> }) => void>();
    const controller = createVisibilityController({
      getState: () => null,
      postMessage: () => undefined,
      setState,
    });
    const glcdCheckbox = document.querySelector(
      '#uiControls input[data-section="glcd"]'
    ) as HTMLInputElement;

    controller.wire();
    controller.applyOverride({ glcd: true }, true);
    glcdCheckbox.checked = false;
    glcdCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    const firstState = setState.mock.calls[0]?.[0] as { uiVisibility?: Record<string, boolean> };
    const lastState = setState.mock.calls.at(-1)?.[0] as { uiVisibility?: Record<string, boolean> };

    expect(firstState.uiVisibility?.glcd).toBe(true);
    expect(lastState.uiVisibility?.glcd).toBe(false);
    expect(document.querySelector('.glcd')?.classList.contains('ui-hidden')).toBe(true);
  });
});
