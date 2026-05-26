/**
 * @file AZM panel options: session-scoped launch and contract-update preferences.
 */

import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterCareMode,
  ProjectStatusPayload,
} from '../../src/contracts/platform-view';
import type { VscodeApi } from './vscode';

export type AzmOptionsControl = {
  applyProjectStatus: (
    payload: Pick<
      ProjectStatusPayload,
      'hasProject' | 'azmRegisterCareMode' | 'azmContractUpdateMode'
    >
  ) => void;
  dispose: () => void;
};

const REGISTER_CARE_MODES = new Set<AzmPanelRegisterCareMode>(['enforce', 'audit', 'off']);
const CONTRACT_UPDATE_MODES = new Set<AzmPanelContractUpdateMode>(['ask', 'auto', 'never']);

function registerCareModeFrom(value: string): AzmPanelRegisterCareMode {
  return REGISTER_CARE_MODES.has(value as AzmPanelRegisterCareMode)
    ? (value as AzmPanelRegisterCareMode)
    : 'enforce';
}

function contractUpdateModeFrom(value: string): AzmPanelContractUpdateMode {
  return CONTRACT_UPDATE_MODES.has(value as AzmPanelContractUpdateMode)
    ? (value as AzmPanelContractUpdateMode)
    : 'ask';
}

export function wireAzmOptionsControl(
  vscode: VscodeApi,
  registerCareSelect: HTMLSelectElement | null,
  contractUpdateSelect: HTMLSelectElement | null
): AzmOptionsControl {
  if (registerCareSelect === null || contractUpdateSelect === null) {
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
      type: 'setAzmOptions',
      registerCareMode: registerCareModeFrom(registerCareSelect.value),
      contractUpdateMode: contractUpdateModeFrom(contractUpdateSelect.value),
    });
  };

  const applyProjectStatus = (
    payload: Pick<
      ProjectStatusPayload,
      'hasProject' | 'azmRegisterCareMode' | 'azmContractUpdateMode'
    >
  ): void => {
    const hasProject = payload.hasProject === true;
    registerCareSelect.disabled = !hasProject;
    contractUpdateSelect.disabled = !hasProject;
    applying = true;
    registerCareSelect.value = payload.azmRegisterCareMode ?? 'enforce';
    contractUpdateSelect.value = payload.azmContractUpdateMode ?? 'ask';
    applying = false;
  };

  registerCareSelect.addEventListener('change', postCurrent);
  contractUpdateSelect.addEventListener('change', postCurrent);

  return {
    applyProjectStatus,
    dispose: () => {
      registerCareSelect.removeEventListener('change', postCurrent);
      contractUpdateSelect.removeEventListener('change', postCurrent);
    },
  };
}
