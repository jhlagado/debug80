/**
 * @file AZM panel options: session-scoped launch and contract-update preferences.
 */

import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterContractsMode,
  ProjectStatusPayload,
} from '../../src/contracts/platform-view';
import type { VscodeApi } from './vscode';

export type AzmOptionsControl = {
  applyProjectStatus: (
    payload: Pick<
      ProjectStatusPayload,
      'hasProject' | 'azmRegisterContractsMode' | 'azmContractUpdateMode'
    >
  ) => void;
  dispose: () => void;
};

const REGISTER_CONTRACTS_MODES = new Set<AzmPanelRegisterContractsMode>([
  'enforce',
  'audit',
  'off',
]);
const CONTRACT_UPDATE_MODES = new Set<AzmPanelContractUpdateMode>(['ask', 'auto', 'never']);

function registerContractsModeFrom(value: string): AzmPanelRegisterContractsMode {
  return REGISTER_CONTRACTS_MODES.has(value as AzmPanelRegisterContractsMode)
    ? (value as AzmPanelRegisterContractsMode)
    : 'enforce';
}

function contractUpdateModeFrom(value: string): AzmPanelContractUpdateMode {
  return CONTRACT_UPDATE_MODES.has(value as AzmPanelContractUpdateMode)
    ? (value as AzmPanelContractUpdateMode)
    : 'ask';
}

export function wireAzmOptionsControl(
  vscode: VscodeApi,
  registerContractsSelect: HTMLSelectElement | null,
  contractUpdateSelect: HTMLSelectElement | null
): AzmOptionsControl {
  if (registerContractsSelect === null || contractUpdateSelect === null) {
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
      registerContractsMode: registerContractsModeFrom(registerContractsSelect.value),
      contractUpdateMode: contractUpdateModeFrom(contractUpdateSelect.value),
    });
  };

  const applyProjectStatus = (
    payload: Pick<
      ProjectStatusPayload,
      'hasProject' | 'azmRegisterContractsMode' | 'azmContractUpdateMode'
    >
  ): void => {
    const hasProject = payload.hasProject === true;
    registerContractsSelect.disabled = !hasProject;
    contractUpdateSelect.disabled = !hasProject;
    applying = true;
    registerContractsSelect.value = payload.azmRegisterContractsMode ?? 'enforce';
    contractUpdateSelect.value = payload.azmContractUpdateMode ?? 'ask';
    applying = false;
  };

  registerContractsSelect.addEventListener('change', postCurrent);
  contractUpdateSelect.addEventListener('change', postCurrent);

  return {
    applyProjectStatus,
    dispose: () => {
      registerContractsSelect.removeEventListener('change', postCurrent);
      contractUpdateSelect.removeEventListener('change', postCurrent);
    },
  };
}
