/**
 * @file Shared project header, target dropdown, and setup card wiring for Debug80 webviews.
 */

import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import type { VscodeApi } from '../common/vscode';
import { createProjectRootButtonController } from '../common/project-root-button';
import {
  createProjectAction,
  createProjectPanelState,
  selectTargetAction,
  sendHexAction,
  setupCardForProjectPanel,
  setupPrimaryAction as createSetupPrimaryAction,
  type ProjectPanelAction,
  type ProjectPanelState,
} from '../common/project-panel-state';
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

type ApplyProjectStatusPayload = {
  rootPath?: ProjectStatusPayload['rootPath'];
  roots?: ProjectStatusPayload['roots'];
  targets?: ProjectStatusPayload['targets'];
  targetName?: ProjectStatusPayload['targetName'];
  projectState?: ProjectStatusPayload['projectState'];
  platform?: ProjectStatusPayload['platform'];
  coolTermAvailable?: ProjectStatusPayload['coolTermAvailable'];
  coolTermHexPath?: ProjectStatusPayload['coolTermHexPath'];
  hardwareStatusText?: ProjectStatusPayload['hardwareStatusText'];
  hardwareStatusState?: ProjectStatusPayload['hardwareStatusState'];
  sourceMapStatusText?: ProjectStatusPayload['sourceMapStatusText'];
  sourceMapStatusState?: ProjectStatusPayload['sourceMapStatusState'];
};

export type ProjectStatusUi = {
  applyProjectStatus: (payload: ApplyProjectStatusPayload) => void;
  dispose: () => void;
};

function applyTargetOptions(
  targetSelect: HTMLSelectElement | null,
  state: ProjectPanelState
): void {
  if (targetSelect) {
    setTargetOptions(
      targetSelect,
      state.kind === 'initialized' ? state.targets : [],
      state.targetName
    );
  }
}

function updateSendHexButton(
  button: HTMLButtonElement | null | undefined,
  state: ProjectPanelState
): void {
  if (!button) {
    return;
  }
  const initializedProject = state.kind === 'initialized';
  const canSend = initializedProject && Boolean(state.targetName) && Boolean(state.coolTermHexPath);
  button.hidden = !initializedProject;
  button.disabled = !canSend;
  button.textContent = sendButtonLabel(state.platform);
  button.title =
    state.coolTermHexPath !== undefined
      ? `Send ${state.coolTermHexPath} to the board via CoolTerm`
      : 'Build the selected target before sending to the board';
}

function updateInitializedButton(
  button: HTMLButtonElement | null | undefined,
  initialized: boolean
): void {
  if (button) {
    button.hidden = !initialized;
    button.disabled = !initialized;
  }
}

function updateStatusLine(
  line: HTMLElement | null | undefined,
  text: string,
  visible: boolean
): void {
  if (line) {
    line.textContent = text;
    line.hidden = !visible || text.length === 0;
  }
}

function updateHardwareStatusLine(
  line: HTMLElement | null | undefined,
  state: ProjectPanelState,
  initialized: boolean
): void {
  if (line) {
    line.dataset.hardwareStatus = state.hardwareStatusState;
  }
  updateStatusLine(line, state.hardwareStatusText, initialized);
}

function updateSourceMapStatusLine(
  line: HTMLElement | null | undefined,
  state: ProjectPanelState,
  initialized: boolean
): void {
  if (line) {
    line.dataset.sourceMapStatus = state.sourceMapStatusState;
  }
  updateStatusLine(line, state.sourceMapStatusText, initialized);
}

function updateSetupCard(
  setupCard: HTMLElement | null,
  setupCardText: HTMLElement | null,
  setupPrimaryAction: HTMLButtonElement | null,
  state: ProjectPanelState
): void {
  if (!setupCard || !setupCardText || !setupPrimaryAction) {
    return;
  }
  const setupState = setupCardForProjectPanel(state);
  if (setupState === null) {
    setupCard.hidden = true;
    return;
  }
  setupCard.hidden = false;
  setupCardText.textContent = setupState.text;
  // When createProject is the pending action, platformInitButton is the primary CTA;
  // hide the setup card button to avoid showing two equivalent "Initialize" actions.
  const isCreateProject = setupState.primaryAction === 'createProject';
  setupPrimaryAction.hidden = isCreateProject;
  setupPrimaryAction.textContent = isCreateProject ? '' : setupState.primaryLabel;
}

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

  let currentState: ProjectPanelState = createProjectPanelState({ projectState: 'noWorkspace' });

  function postProjectAction(action: ProjectPanelAction | undefined): void {
    if (action !== undefined) {
      vscode.postMessage(action);
    }
  }

  function selectedPlatform(): string {
    return getPlatform?.() ?? platform;
  }

  const projectRootController = createProjectRootButtonController(
    {
      postMessage(message) {
        vscode.postMessage(
          message.type === 'selectProject' ? { ...message, platform: selectedPlatform() } : message
        );
      },
    },
    selectProjectButton
  );

  setupPrimaryAction?.addEventListener('click', () => {
    postProjectAction(createSetupPrimaryAction(currentState, selectedPlatform()));
  });

  platformInitButton?.addEventListener('click', () => {
    postProjectAction(createProjectAction(currentState, selectedPlatform()));
  });

  homeTargetSelect?.addEventListener('change', () => {
    postProjectAction(selectTargetAction(currentState, homeTargetSelect.value));
  });

  sendHexToBoardButton?.addEventListener('click', () => {
    postProjectAction(sendHexAction(currentState, homeTargetSelect?.value));
  });

  testCoolTermButton?.addEventListener('click', () => {
    vscode.postMessage({ type: 'testCoolTermConnection' });
  });

  function applyProjectStatus(payload: ApplyProjectStatusPayload): void {
    currentState = createProjectPanelState(payload);
    const initializedProject = currentState.kind === 'initialized';
    projectRootController.applyProjectStatus({
      rootPath: payload.rootPath,
      roots: currentState.roots,
      targetCount: currentState.targets.length,
    });
    applyTargetOptions(homeTargetSelect, currentState);
    updateSendHexButton(sendHexToBoardButton, currentState);
    updateInitializedButton(testCoolTermButton, initializedProject);
    updateHardwareStatusLine(hardwareStatusLine, currentState, initializedProject);
    updateSourceMapStatusLine(sourceMapStatusLine, currentState, initializedProject);
    updateSetupCard(setupCard, setupCardText, setupPrimaryAction, currentState);
  }

  return {
    applyProjectStatus,
    dispose: () => {
      projectRootController.dispose();
    },
  };
}
