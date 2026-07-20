import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import type { SharedProjectControlElements } from './project-controls';
import { applyInitializedProjectControls } from './project-controls';
import type { ProjectStatusUiElements } from './project-status-ui';
import type { VscodeApi } from './vscode';

export type ProjectPanelElements = {
  addWorkspaceFolderButton: HTMLButtonElement | null;
  platformSelect: HTMLSelectElement | null;
  restartButton: HTMLButtonElement | null;
  buildButton: HTMLButtonElement | null;
  stopOnEntryInput: HTMLInputElement | null;
  toolbar: HTMLElement | null;
  projectStatus: ProjectStatusUiElements;
  initializedControls: SharedProjectControlElements;
};

function byId<T extends HTMLElement>(root: ParentNode, id: string): T | null {
  const element = root.querySelector(`#${id}`);
  return element instanceof HTMLElement ? (element as T) : null;
}

function closestControl(element: HTMLElement | null): HTMLElement | null {
  const control = element?.closest('.project-control');
  return control instanceof HTMLElement ? control : null;
}

export function getProjectPanelElements(root: ParentNode = document): ProjectPanelElements {
  const appRoot = byId<HTMLElement>(root, 'app');
  const projectHeader = byId<HTMLElement>(root, 'projectHeader');
  const selectProjectButton = byId<HTMLButtonElement>(root, 'selectProject');
  const addWorkspaceFolderButton = byId<HTMLButtonElement>(root, 'addWorkspaceFolder');
  const removeWorkspaceFolderButton = byId<HTMLButtonElement>(root, 'removeWorkspaceFolder');
  const setupCard = byId<HTMLElement>(root, 'setupCard');
  const setupCardText = byId<HTMLElement>(root, 'setupCardText');
  const setupPrimaryAction = byId<HTMLButtonElement>(root, 'setupPrimaryAction');
  const platformInitButton = byId<HTMLButtonElement>(root, 'platformInitButton');
  const addTargetButton = byId<HTMLButtonElement>(root, 'addTarget');
  const removeTargetButton = byId<HTMLButtonElement>(root, 'removeTarget');
  const testCoolTermButton = byId<HTMLButtonElement>(root, 'testCoolTerm');
  const sendHexToBoardButton = byId<HTMLButtonElement>(root, 'sendHexToBoard');
  const buildResultIndicator = byId<HTMLElement>(root, 'buildResultIndicator');
  const buildStatusLine = byId<HTMLElement>(root, 'buildStatusLine');
  const hardwareStatusLine = byId<HTMLElement>(root, 'hardwareStatusLine');
  const sourceMapStatusLine = byId<HTMLElement>(root, 'sourceMapStatusLine');
  const stopOnEntryInput = byId<HTMLInputElement>(root, 'stopOnEntry');
  const homeTargetSelect = byId<HTMLSelectElement>(root, 'homeTargetSelect');
  const platformSelect = byId<HTMLSelectElement>(root, 'platformSelect');
  const platformInfoControl = byId<HTMLElement>(root, 'platformInfoControl');
  const platformValue = byId<HTMLElement>(root, 'platformValue');
  const restartButton = byId<HTMLButtonElement>(root, 'restartDebug');
  const buildButton = byId<HTMLButtonElement>(root, 'buildTarget');
  const tabs = byId<HTMLElement>(root, 'tabs');
  const accordion = byId<HTMLElement>(root, 'debug80Accordion');
  const panelUi = byId<HTMLElement>(root, 'panel-ui');
  const panelRegisters = byId<HTMLElement>(root, 'panel-registers');
  const panelMemory = byId<HTMLElement>(root, 'panel-memory');
  const stopOnEntryLabelElement = stopOnEntryInput?.closest('.stop-on-entry-label');
  const stopOnEntryLabel =
    stopOnEntryLabelElement instanceof HTMLElement ? stopOnEntryLabelElement : null;
  const toolbarElement = root.querySelector('.debug80-toolbar');
  const toolbar = toolbarElement instanceof HTMLElement ? toolbarElement : null;

  return {
    addWorkspaceFolderButton,
    platformSelect,
    restartButton,
    buildButton,
    stopOnEntryInput,
    toolbar,
    projectStatus: {
      selectProjectButton,
      setupCard,
      setupCardText,
      setupPrimaryAction,
      platformInitButton,
      removeWorkspaceFolderButton,
      addTargetButton,
      removeTargetButton,
      testCoolTermButton,
      sendHexToBoardButton,
      buildResultIndicator,
      buildStatusLine,
      hardwareStatusLine,
      sourceMapStatusLine,
      homeTargetSelect,
    },
    initializedControls: {
      appRoot,
      projectHeader,
      targetControl: closestControl(homeTargetSelect),
      targetSelect: homeTargetSelect,
      platformControl: closestControl(platformSelect),
      platformSelect,
      platformInfoControl,
      platformValue,
      stopOnEntryLabel,
      restartButton,
      buildButton,
      tabs,
      accordion,
      panelUi,
      panelRegisters,
      panelMemory,
    },
  };
}

export function wireProjectPanelPlatformControls(
  vscode: Pick<VscodeApi, 'postMessage'>,
  elements: ProjectPanelElements,
  defaultPlatform: string,
  isProjectInitialized: () => boolean
): void {
  elements.addWorkspaceFolderButton?.addEventListener('click', () => {
    vscode.postMessage({
      type: 'openWorkspaceFolder',
      platform: elements.platformSelect?.value ?? defaultPlatform,
    });
  });

  elements.platformSelect?.addEventListener('change', () => {
    const platformSelect = elements.platformSelect;
    if (isProjectInitialized() && platformSelect) {
      vscode.postMessage({
        type: 'saveProjectConfig',
        platform: platformSelect.value,
      });
    }
  });
}

export function applyProjectPanelStatusControls(
  payload: {
    projectState?: ProjectStatusPayload['projectState'];
    rootPath?: ProjectStatusPayload['rootPath'];
    hasProject?: ProjectStatusPayload['hasProject'];
    platform?: ProjectStatusPayload['platform'];
  },
  elements: ProjectPanelElements,
  overrides: Partial<SharedProjectControlElements> = {}
): boolean {
  if (elements.platformSelect && payload.platform !== undefined) {
    elements.platformSelect.value = payload.platform;
  }
  return applyInitializedProjectControls(payload, {
    ...elements.initializedControls,
    ...overrides,
  });
}
