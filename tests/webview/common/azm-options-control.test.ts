/**
 * @file AZM options project-control tests.
 */

import { describe, expect, it } from 'vitest';
import { wireAzmOptionsControl } from '../../../webview/common/azm-options-control';
import type { VscodeApi } from '../../../webview/common/vscode';

function selectWith(values: string[]): HTMLSelectElement {
  const select = document.createElement('select');
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  return select;
}

describe('azm options controls', () => {
  it('reflects project status and posts changed AZM options', () => {
    const messages: unknown[] = [];
    const vscode = {
      postMessage: (message: unknown) => messages.push(message),
      getState: () => null,
      setState: () => undefined,
    } satisfies VscodeApi;
    const registerCare = selectWith(['enforce', 'audit', 'off']);
    const contractUpdates = selectWith(['ask', 'auto', 'never']);

    const control = wireAzmOptionsControl(vscode, registerCare, contractUpdates);
    control.applyProjectStatus({
      hasProject: true,
      azmRegisterCareMode: 'audit',
      azmContractUpdateMode: 'never',
    });

    expect(registerCare.disabled).toBe(false);
    expect(contractUpdates.disabled).toBe(false);
    expect(registerCare.value).toBe('audit');
    expect(contractUpdates.value).toBe('never');
    expect(messages).toEqual([]);

    registerCare.value = 'enforce';
    contractUpdates.value = 'ask';
    registerCare.dispatchEvent(new Event('change'));

    expect(messages).toEqual([
      {
        type: 'setAzmOptions',
        registerCareMode: 'enforce',
        contractUpdateMode: 'ask',
      },
    ]);
    control.dispose();
  });

  it('defaults to enforce and ask while disabled before project initialization', () => {
    const vscode = {
      postMessage: () => undefined,
      getState: () => null,
      setState: () => undefined,
    } satisfies VscodeApi;
    const registerCare = selectWith(['enforce', 'audit', 'off']);
    const contractUpdates = selectWith(['ask', 'auto', 'never']);

    const control = wireAzmOptionsControl(vscode, registerCare, contractUpdates);
    control.applyProjectStatus({ hasProject: false });

    expect(registerCare.disabled).toBe(true);
    expect(contractUpdates.disabled).toBe(true);
    expect(registerCare.value).toBe('enforce');
    expect(contractUpdates.value).toBe('ask');
  });
});
