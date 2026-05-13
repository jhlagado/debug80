/**
 * @file Stop-on-entry checkbox: syncs with projectStatus; changes post setStopOnEntry (panel session state).
 */

import type { VscodeApi } from './vscode';

export type StopOnEntryControl = {
  applyProjectStatus: (payload: { hasProject?: boolean; stopOnEntry?: boolean }) => void;
  dispose: () => void;
};

export function wireStopOnEntryControl(
  vscode: VscodeApi,
  input: HTMLInputElement | null
): StopOnEntryControl {
  if (input === null) {
    return {
      applyProjectStatus: () => undefined,
      dispose: () => undefined,
    };
  }

  let applying = false;

  const applyProjectStatus = (payload: { hasProject?: boolean; stopOnEntry?: boolean }): void => {
    const hasProject = payload.hasProject === true;
    input.disabled = !hasProject;
    applying = true;
    input.checked = payload.stopOnEntry === true;
    applying = false;
  };

  const onChange = (): void => {
    if (applying) {
      return;
    }
    vscode.postMessage({ type: 'setStopOnEntry', stopOnEntry: input.checked });
  };

  input.addEventListener('change', onChange);

  return {
    applyProjectStatus,
    dispose: () => {
      input.removeEventListener('change', onChange);
    },
  };
}
