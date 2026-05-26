/**
 * @file AZM register-care panel toggles: session-scoped launch options.
 */

import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import type { VscodeApi } from './vscode';

export type AzmRegisterCareControl = {
  applyProjectStatus: (
    payload: Pick<
      ProjectStatusPayload,
      'hasProject' | 'azmRegisterCareAudit' | 'azmRegisterCareEnforce'
    >
  ) => void;
  dispose: () => void;
};

export function wireAzmRegisterCareControl(
  vscode: VscodeApi,
  auditInput: HTMLInputElement | null,
  enforceInput: HTMLInputElement | null
): AzmRegisterCareControl {
  if (auditInput === null || enforceInput === null) {
    return {
      applyProjectStatus: () => undefined,
      dispose: () => undefined,
    };
  }

  let applying = false;

  const postCurrent = (): void => {
    if (applying) {
      return;
    }
    vscode.postMessage({
      type: 'setAzmRegisterCare',
      audit: auditInput.checked,
      enforce: enforceInput.checked,
    });
  };

  const applyProjectStatus = (
    payload: Pick<
      ProjectStatusPayload,
      'hasProject' | 'azmRegisterCareAudit' | 'azmRegisterCareEnforce'
    >
  ): void => {
    const hasProject = payload.hasProject === true;
    auditInput.disabled = !hasProject;
    enforceInput.disabled = !hasProject;
    applying = true;
    auditInput.checked = payload.azmRegisterCareAudit === true;
    enforceInput.checked = payload.azmRegisterCareEnforce === true;
    applying = false;
  };

  auditInput.addEventListener('change', postCurrent);
  enforceInput.addEventListener('change', postCurrent);

  return {
    applyProjectStatus,
    dispose: () => {
      auditInput.removeEventListener('change', postCurrent);
      enforceInput.removeEventListener('change', postCurrent);
    },
  };
}
