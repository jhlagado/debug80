/**
 * @file Project-persisted AZM symbol case control tests.
 */

import { describe, expect, it } from 'vitest';
import { wireSymbolCaseControl } from '../../../webview/common/symbol-case-control';
import type { VscodeApi } from '../../../webview/common/vscode';

describe('symbol case control', () => {
  it('defaults to checked and posts the legacy compatibility mode when cleared', () => {
    const messages: unknown[] = [];
    const vscode = {
      postMessage: (message: unknown) => messages.push(message),
      getState: () => null,
      setState: () => undefined,
    } satisfies VscodeApi;
    const label = document.createElement('label');
    label.hidden = true;
    const input = document.createElement('input');
    input.type = 'checkbox';
    label.appendChild(input);

    const control = wireSymbolCaseControl(vscode, input);
    control.applyProjectStatus({ hasProject: true, azmSymbolCase: 'strict' });

    expect(label.hidden).toBe(false);
    expect(input.disabled).toBe(false);
    expect(input.checked).toBe(true);
    expect(messages).toEqual([]);

    input.checked = false;
    input.dispatchEvent(new Event('change'));

    expect(messages).toEqual([{ type: 'setAzmSymbolCase', symbolCase: 'insensitive' }]);
    control.dispose();
  });

  it('shows an existing insensitive project as unchecked', () => {
    const vscode = {
      postMessage: () => undefined,
      getState: () => null,
      setState: () => undefined,
    } satisfies VscodeApi;
    const label = document.createElement('label');
    const input = document.createElement('input');
    label.appendChild(input);

    const control = wireSymbolCaseControl(vscode, input);
    control.applyProjectStatus({ hasProject: true, azmSymbolCase: 'insensitive' });

    expect(input.checked).toBe(false);
  });
});
