/**
 * @file Project header, target dropdown, and setup card wiring for the TEC-1G webview.
 */

import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import type { VscodeApi } from '../common/vscode';
import { createProjectRootButtonController } from '../common/project-root-button';
import { resolveProjectViewState } from '../common/project-state';
import { resolveSetupCardState } from '../common/setup-card-state';

export type Tec1gProjectStatusElements = {
  selectProjectButton: HTMLButtonElement | null;
  setupCard: HTMLElement | null;
  setupCardText: HTMLElement | null;
  setupPrimaryAction: HTMLButtonElement | null;
  homeTargetSelect: HTMLSelectElement | null;
  getPlatform?: () => string | undefined;
};

export type Tec1gProjectStatusUi = {
  applyProjectStatus: (payload: {
    rootPath?: ProjectStatusPayload['rootPath'];
    roots?: ProjectStatusPayload['roots'];
    targets?: ProjectStatusPayload['targets'];
    targetName?: ProjectStatusPayload['targetName'];
    projectState?: ProjectStatusPayload['projectState'];
  }) => void;
  dispose: () => void;
};

function clearSelectOptions(select: HTMLSelectElement): void {
  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }
}

function setSelectPlaceholder(select: HTMLSelectElement, label: string): void {
  const option = document.createElement('option');
  option.value = '';
  option.textContent = label;
  option.disabled = true;
  option.selected = true;
  select.appendChild(option);
}

function setTargetOptions(
  homeTargetSelect: HTMLSelectElement,
  options: ProjectStatusPayload['targets'],
  selectedTargetName?: string
): void {
  clearSelectOptions(homeTargetSelect);
  if (options.length === 0) {
    setSelectPlaceholder(homeTargetSelect, 'No targets available');
    homeTargetSelect.disabled = true;
    return;
  }
  setSelectPlaceholder(homeTargetSelect, 'Select target...');
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.name;
    el.textContent = option.name;
    el.title = option.detail ?? option.description ?? option.name;
    homeTargetSelect.appendChild(el);
  }
  homeTargetSelect.disabled = false;
  homeTargetSelect.value = selectedTargetName ?? '';
}

/**
 * Wires workspace/target controls and returns `applyProjectStatus` for extension messages.
 */
export function createTec1gProjectStatusUi(
  vscode: VscodeApi,
  elements: Tec1gProjectStatusElements
): Tec1gProjectStatusUi {
  const {
    selectProjectButton,
    setupCard,
    setupCardText,
    setupPrimaryAction,
    homeTargetSelect,
    getPlatform,
  } = elements;

  let currentRootPath = '';
  let currentRoots: Array<{ name: string; path: string; hasProject: boolean }> = [];
  let setupPrimaryActionType: 'openWorkspaceFolder' | 'createProject' = 'openWorkspaceFolder';

  const projectRootController = createProjectRootButtonController(vscode, selectProjectButton);

  setupPrimaryAction?.addEventListener('click', () => {
    const selected = currentRoots.find((root) => root.path === currentRootPath) ?? currentRoots[0];
    if (setupPrimaryActionType === 'openWorkspaceFolder') {
      vscode.postMessage({ type: 'openWorkspaceFolder' });
      return;
    }
    if (selected !== undefined) {
      vscode.postMessage({ type: 'createProject', rootPath: selected.path, platform: getPlatform?.() });
    }
  });

  homeTargetSelect?.addEventListener('change', () => {
    const targetName = homeTargetSelect.value;
    if (!targetName) {
      return;
    }
    vscode.postMessage({
      type: 'selectTarget',
      rootPath: currentRootPath,
      targetName,
    });
  });

  function applyProjectStatus(payload: {
    rootPath?: ProjectStatusPayload['rootPath'];
    roots?: ProjectStatusPayload['roots'];
    targets?: ProjectStatusPayload['targets'];
    targetName?: ProjectStatusPayload['targetName'];
    projectState?: ProjectStatusPayload['projectState'];
  }): void {
    currentRootPath = payload.rootPath ?? '';
    currentRoots = payload.roots ?? [];
    projectRootController.applyProjectStatus({
      rootPath: payload.rootPath,
      roots: payload.roots ?? [],
      targetCount: payload.targets?.length ?? 0,
    });
    if (homeTargetSelect) {
      setTargetOptions(homeTargetSelect, payload.targets ?? [], payload.targetName);
    }
    const selected = currentRoots.find((root) => root.path === currentRootPath) ?? currentRoots[0];
    const targetCount = payload.targets?.length ?? 0;
    if (!setupCard || !setupCardText || !setupPrimaryAction) {
      return;
    }
    const projectState = resolveProjectViewState(payload);
    const setupState = resolveSetupCardState(selected, projectState, targetCount);
    if (setupState === null) {
      setupCard.hidden = true;
      return;
    }
    setupCard.hidden = false;
    setupPrimaryActionType = setupState.primaryAction;
    setupCardText.textContent = setupState.text;
    setupPrimaryAction.textContent = setupState.primaryLabel;
  }

  return {
    applyProjectStatus,
    dispose: () => {
      projectRootController.dispose();
    },
  };
}
