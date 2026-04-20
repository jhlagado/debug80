/**
 * @file Project header, target dropdown, and setup card wiring for the TEC-1G webview.
 */

import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import type { VscodeApi } from '../common/vscode';
import { createProjectRootButtonController } from '../common/project-root-button';
import { resolveProjectViewState } from '../common/project-state';
import { resolveSetupCardState } from '../common/setup-card-state';
import { sendCreateProject } from '../common/create-project';

export type Tec1gProjectStatusElements = {
  selectProjectButton: HTMLButtonElement | null;
  setupCard: HTMLElement | null;
  setupCardText: HTMLElement | null;
  setupPrimaryAction: HTMLButtonElement | null;
  platformInitButton: HTMLButtonElement | null;
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
    platformInitButton,
    homeTargetSelect,
    getPlatform,
  } = elements;

  let currentRootPath = '';
  let currentRoots: Array<{ name: string; path: string; hasProject: boolean }> = [];
  let setupPrimaryActionType: 'openWorkspaceFolder' | 'selectProject' | 'createProject' =
    'openWorkspaceFolder';

  const projectRootController = createProjectRootButtonController(vscode, selectProjectButton);

  setupPrimaryAction?.addEventListener('click', () => {
    if (setupPrimaryActionType === 'openWorkspaceFolder') {
      vscode.postMessage({ type: 'openWorkspaceFolder' });
      return;
    }
    if (setupPrimaryActionType === 'selectProject') {
      vscode.postMessage({ type: 'selectProject' });
      return;
    }
    sendCreateProject(vscode, getPlatform?.() ?? 'tec1g');
  });

  platformInitButton?.addEventListener('click', () => {
    sendCreateProject(vscode, getPlatform?.() ?? 'tec1g');
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
    const projectState = resolveProjectViewState(payload);
    const initializedProject = projectState === 'initialized';
    currentRootPath = payload.rootPath ?? '';
    currentRoots = payload.roots ?? [];
    projectRootController.applyProjectStatus({
      rootPath: payload.rootPath,
      roots: payload.roots ?? [],
      targetCount: payload.targets?.length ?? 0,
    });
    if (homeTargetSelect) {
      setTargetOptions(
        homeTargetSelect,
        initializedProject ? (payload.targets ?? []) : [],
        payload.targetName
      );
    }
    const selected = currentRoots.find((root) => root.path === currentRootPath) ?? currentRoots[0];
    const targetCount = payload.targets?.length ?? 0;
    if (!setupCard || !setupCardText || !setupPrimaryAction) {
      return;
    }
    const setupState = resolveSetupCardState(
      selected,
      projectState,
      targetCount,
      currentRoots.length
    );
    if (setupState === null) {
      setupCard.hidden = true;
      return;
    }
    setupCard.hidden = false;
    setupPrimaryActionType = setupState.primaryAction;
    setupCardText.textContent = setupState.text;
    // When createProject is the pending action, platformInitButton is the primary CTA;
    // hide the setup card button to avoid showing two equivalent "Initialize" actions.
    const isCreateProject = setupState.primaryAction === 'createProject';
    setupPrimaryAction.hidden = isCreateProject;
    setupPrimaryAction.textContent = isCreateProject ? '' : setupState.primaryLabel;
  }

  return {
    applyProjectStatus,
    dispose: () => {
      projectRootController.dispose();
    },
  };
}
