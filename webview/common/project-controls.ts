import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import { createProjectPanelState } from './project-panel-state';

export type SharedProjectControlElements = {
  appRoot?: HTMLElement | null;
  projectHeader?: HTMLElement | null;
  targetControl?: HTMLElement | null;
  targetSelect?: HTMLSelectElement | null;
  platformControl?: HTMLElement | null;
  platformSelect?: HTMLSelectElement | null;
  platformInfoControl?: HTMLElement | null;
  platformValue?: HTMLElement | null;
  stopOnEntryLabel?: HTMLElement | null;
  restartButton?: HTMLElement | null;
  tabs?: HTMLElement | null;
  accordion?: HTMLElement | null;
  panelUi?: HTMLElement | null;
  panelRegisters?: HTMLElement | null;
  panelMemory?: HTMLElement | null;
};

function setHidden(element: HTMLElement | null | undefined, hidden: boolean): void {
  if (element) {
    element.hidden = hidden;
  }
}

function setSelectDisabled(element: HTMLSelectElement | null | undefined, disabled: boolean): void {
  if (element) {
    element.disabled = disabled;
  }
}

function setProjectViewState(elements: SharedProjectControlElements, value: string): void {
  document.body?.setAttribute('data-project-view-state', value);
  elements.appRoot?.setAttribute('data-project-view-state', value);
}

function syncTargetControls(
  elements: SharedProjectControlElements,
  initialized: boolean
): void {
  setHidden(elements.targetControl, !initialized);
  setSelectDisabled(elements.targetSelect, !initialized);
  if (!initialized && elements.targetSelect) {
    elements.targetSelect.value = '';
  }
}

function syncPlatformControls(
  elements: SharedProjectControlElements,
  uninitialized: boolean
): void {
  setHidden(elements.platformControl, !uninitialized);
  setSelectDisabled(elements.platformSelect, !uninitialized);
  setHidden(elements.platformInfoControl, true);
  if (elements.platformValue) {
    elements.platformValue.textContent = '';
  }
}

function syncRuntimeControls(
  elements: SharedProjectControlElements,
  initialized: boolean
): void {
  setHidden(elements.stopOnEntryLabel, !initialized);
  setHidden(elements.restartButton, !initialized);
  setHidden(elements.tabs, !initialized);
  setHidden(elements.panelUi, !initialized);
  setHidden(elements.panelRegisters, !initialized);
  setHidden(elements.panelMemory, !initialized);
}

function syncAccordion(elements: SharedProjectControlElements, initialized: boolean): void {
  if (elements.accordion) {
    elements.accordion.hidden =
      !initialized && !elements.accordion.classList.contains('has-project-panel');
  }
}

export function applyInitializedProjectControls(
  payload: {
    projectState?: ProjectStatusPayload['projectState'];
    rootPath?: ProjectStatusPayload['rootPath'];
    hasProject?: ProjectStatusPayload['hasProject'];
    platform?: ProjectStatusPayload['platform'];
  },
  elements: SharedProjectControlElements
): boolean {
  const state = createProjectPanelState(payload);
  const noWorkspace = state.kind === 'noWorkspace';
  const initialized = state.kind === 'initialized';
  const uninitialized = state.kind === 'uninitialized';

  setProjectViewState(elements, state.kind);
  // Keep the "no workspace" panel to a single empty-state card. Header controls only
  // appear once there is a workspace root to select or an actual project to run.
  setHidden(elements.projectHeader, noWorkspace);
  syncTargetControls(elements, initialized);
  syncPlatformControls(elements, uninitialized);
  syncRuntimeControls(elements, initialized);
  syncAccordion(elements, initialized);

  return initialized;
}
