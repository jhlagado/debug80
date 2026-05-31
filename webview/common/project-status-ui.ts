/**
 * @file Shared project header, target dropdown, and setup card wiring for Debug80 webviews.
 */

import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import type { VscodeApi } from '../common/vscode';
import { createProjectRootButtonController } from '../common/project-root-button';
import { resolveProjectViewState } from '../common/project-state';
import { resolveSetupCardState } from '../common/setup-card-state';
import { sendCreateProject } from '../common/create-project';
import { sendButtonLabel, setTargetOptions } from './project-status-targets';

export type ProjectStatusUiElements = {
  selectProjectButton: HTMLButtonElement | null;
  setupCard: HTMLElement | null;
  setupCardText: HTMLElement | null;
  setupPrimaryAction: HTMLButtonElement | null;
  platformInitButton: HTMLButtonElement | null;
  testCoolTermButton?: HTMLButtonElement | null;
  sendHexToBoardButton?: HTMLButtonElement | null;
  hardwareStatusLine?: HTMLElement | null;
  sourceMapStatusLine?: HTMLElement | null;
  homeTargetSelect: HTMLSelectElement | null;
  getPlatform?: () => string | undefined;
};

export type ProjectStatusUi = {
  applyProjectStatus: (payload: {
    rootPath?: ProjectStatusPayload['rootPath'];
    roots?: ProjectStatusPayload['roots'];
    targets?: ProjectStatusPayload['targets'];
    targetName?: ProjectStatusPayload['targetName'];
    projectState?: ProjectStatusPayload['projectState'];
    sourceMapStatusText?: ProjectStatusPayload['sourceMapStatusText'];
    sourceMapStatusState?: ProjectStatusPayload['sourceMapStatusState'];
  }) => void;
  dispose: () => void;
};

/**
 * Wires workspace/target controls and returns `applyProjectStatus` for extension messages.
 * The `platform` parameter is used as the default platform string for createProject messages;
 * if the elements include a `getPlatform` function, its return value takes precedence.
 */
export function createProjectStatusUi(
  vscode: VscodeApi,
  elements: ProjectStatusUiElements,
  platform: string
): ProjectStatusUi {
  const {
    selectProjectButton,
    setupCard,
    setupCardText,
    setupPrimaryAction,
    platformInitButton,
    testCoolTermButton,
    sendHexToBoardButton,
    hardwareStatusLine,
    sourceMapStatusLine,
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
    sendCreateProject(vscode, getPlatform?.() ?? platform);
  });

  platformInitButton?.addEventListener('click', () => {
    sendCreateProject(vscode, getPlatform?.() ?? platform);
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

  sendHexToBoardButton?.addEventListener('click', () => {
    vscode.postMessage({
      type: 'sendHexViaCoolTerm',
      rootPath: currentRootPath,
      targetName: homeTargetSelect?.value || undefined,
    });
  });

  testCoolTermButton?.addEventListener('click', () => {
    vscode.postMessage({ type: 'testCoolTermConnection' });
  });

  function applyProjectStatus(payload: {
    rootPath?: ProjectStatusPayload['rootPath'];
    roots?: ProjectStatusPayload['roots'];
    targets?: ProjectStatusPayload['targets'];
    targetName?: ProjectStatusPayload['targetName'];
    projectState?: ProjectStatusPayload['projectState'];
    platform?: ProjectStatusPayload['platform'];
    coolTermAvailable?: ProjectStatusPayload['coolTermAvailable'];
    coolTermHexPath?: ProjectStatusPayload['coolTermHexPath'];
    hardwareStatusText?: ProjectStatusPayload['hardwareStatusText'];
    sourceMapStatusText?: ProjectStatusPayload['sourceMapStatusText'];
    sourceMapStatusState?: ProjectStatusPayload['sourceMapStatusState'];
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
    if (sendHexToBoardButton) {
      const canSend =
        initializedProject &&
        Boolean(payload.targetName) &&
        Boolean(payload.coolTermHexPath);
      sendHexToBoardButton.hidden = !initializedProject;
      sendHexToBoardButton.disabled = !canSend;
      sendHexToBoardButton.textContent = sendButtonLabel(payload.platform);
      sendHexToBoardButton.title =
        payload.coolTermHexPath !== undefined
          ? `Send ${payload.coolTermHexPath} to the board via CoolTerm`
          : 'Build the selected target before sending to the board';
    }
    if (testCoolTermButton) {
      testCoolTermButton.hidden = !initializedProject;
      testCoolTermButton.disabled = !initializedProject;
    }
    if (hardwareStatusLine) {
      const text = payload.hardwareStatusText ?? '';
      hardwareStatusLine.textContent = text;
      hardwareStatusLine.hidden = !initializedProject || text.length === 0;
    }
    if (sourceMapStatusLine) {
      const text = payload.sourceMapStatusText ?? '';
      sourceMapStatusLine.textContent = text;
      sourceMapStatusLine.dataset.sourceMapStatus = payload.sourceMapStatusState ?? '';
      sourceMapStatusLine.hidden = !initializedProject || text.length === 0;
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
