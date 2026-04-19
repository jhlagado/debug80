import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import { resolveProjectViewState } from './project-state';

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
  panelUi?: HTMLElement | null;
  panelMemory?: HTMLElement | null;
};


export function applyInitializedProjectControls(
  payload: {
    projectState?: ProjectStatusPayload['projectState'];
    rootPath?: ProjectStatusPayload['rootPath'];
    hasProject?: ProjectStatusPayload['hasProject'];
    platform?: ProjectStatusPayload['platform'];
  },
  elements: SharedProjectControlElements
): boolean {
  const projectViewState = resolveProjectViewState(payload);
  const noWorkspace = projectViewState === 'noWorkspace';
  const initialized = projectViewState === 'initialized';
  const uninitialized = projectViewState === 'uninitialized';

  document.body?.setAttribute('data-project-view-state', projectViewState);
  elements.appRoot?.setAttribute('data-project-view-state', projectViewState);
  if (elements.projectHeader) {
    // Keep the "no workspace" panel to a single empty-state card. Header controls only
    // appear once there is a workspace root to select or an actual project to run.
    elements.projectHeader.hidden = noWorkspace;
  }

  if (elements.targetControl) {
    elements.targetControl.hidden = !initialized;
  }
  if (elements.targetSelect) {
    elements.targetSelect.disabled = !initialized;
    if (!initialized) {
      elements.targetSelect.value = '';
    }
  }
  // Platform selector: visible only when uninitialized (choosing platform before first init).
  // platformInfoControl (read-only label) is never shown — platform is implicit once initialized.
  if (elements.platformControl) {
    elements.platformControl.hidden = !uninitialized;
  }
  if (elements.platformSelect) {
    elements.platformSelect.disabled = !uninitialized;
  }
  if (elements.platformInfoControl) {
    elements.platformInfoControl.hidden = true;
  }
  if (elements.platformValue) {
    elements.platformValue.textContent = '';
  }
  if (elements.stopOnEntryLabel) {
    elements.stopOnEntryLabel.hidden = !initialized;
  }
  if (elements.restartButton) {
    elements.restartButton.hidden = !initialized;
  }
  if (elements.tabs) {
    elements.tabs.hidden = !initialized;
  }
  if (elements.panelUi) {
    elements.panelUi.hidden = !initialized;
  }
  if (elements.panelMemory) {
    elements.panelMemory.hidden = !initialized;
  }

  return initialized;
}
