import { describe, expect, it } from 'vitest';
import {
  getOptionalElementById,
  getOptionalElementBySelector,
  getRequiredElementById,
  getRequiredElementBySelector,
} from '../../../webview/common/dom-elements';

describe('webview DOM element helpers', () => {
  it('returns typed optional elements and null for missing or mismatched ids', () => {
    document.body.innerHTML = `
      <button id="action"></button>
      <div id="status"></div>
    `;

    expect(getOptionalElementById(document, 'action', HTMLButtonElement)?.id).toBe('action');
    expect(getOptionalElementById(document, 'missing', HTMLButtonElement)).toBeNull();
    expect(getOptionalElementById(document, 'status', HTMLButtonElement)).toBeNull();
  });

  it('throws a useful error for missing or mismatched required ids', () => {
    document.body.innerHTML = `<div id="status"></div>`;

    expect(() => getRequiredElementById(document, 'missing', HTMLElement)).toThrow(
      'Missing required webview element "#missing"'
    );
    expect(() => getRequiredElementById(document, 'status', HTMLButtonElement)).toThrow(
      'Expected webview element "#status" to be HTMLButtonElement'
    );
  });

  it('supports selector-based lookup for class and data-attribute handles', () => {
    document.body.innerHTML = `
      <div class="toolbar"></div>
      <button data-command="run"></button>
    `;

    expect(getOptionalElementBySelector(document, '.toolbar', HTMLElement)?.className).toBe(
      'toolbar'
    );
    expect(
      getRequiredElementBySelector(document, '[data-command="run"]', HTMLButtonElement).dataset
        .command
    ).toBe('run');
  });
});
