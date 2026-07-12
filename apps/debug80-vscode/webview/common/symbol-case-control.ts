/**
 * @file Project-persisted AZM symbol case checkbox.
 */

import type { AzmSymbolCaseMode } from '../../src/contracts/platform-view';
import type { VscodeApi } from './vscode';

export type SymbolCaseControl = {
  applyProjectStatus: (payload: {
    hasProject?: boolean;
    azmSymbolCase?: AzmSymbolCaseMode;
  }) => void;
  dispose: () => void;
};

export function wireSymbolCaseControl(
  vscode: VscodeApi,
  input: HTMLInputElement | null
): SymbolCaseControl {
  if (input === null) {
    return {
      applyProjectStatus: () => undefined,
      dispose: () => undefined,
    };
  }

  const label = input.closest('label');
  let applying = false;

  const applyProjectStatus = (payload: {
    hasProject?: boolean;
    azmSymbolCase?: AzmSymbolCaseMode;
  }): void => {
    const hasProject = payload.hasProject === true;
    input.disabled = !hasProject;
    if (label instanceof HTMLElement) {
      label.hidden = !hasProject;
    }
    applying = true;
    input.checked = payload.azmSymbolCase !== 'insensitive';
    applying = false;
  };

  const onChange = (): void => {
    if (applying) {
      return;
    }
    vscode.postMessage({
      type: 'setAzmSymbolCase',
      symbolCase: input.checked ? 'strict' : 'insensitive',
    });
  };

  input.addEventListener('change', onChange);

  return {
    applyProjectStatus,
    dispose: () => input.removeEventListener('change', onChange),
  };
}
