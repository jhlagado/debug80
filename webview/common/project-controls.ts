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

function formatPlatformLabel(platform?: string): string {
  const normalized = platform?.trim().toLowerCase();
  if (normalized === 'simple') {
    return 'Simple';
  }
  if (normalized === 'tec1') {
    return 'TEC-1';
  }
  if (normalized === 'tec1g') {
    return 'TEC-1G';
  }
  return platform && platform.length > 0 ? platform : 'Unknown';
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
  if (elements.platformControl) {
    elements.platformControl.hidden = !uninitialized;
  }
  if (elements.platformSelect) {
    elements.platformSelect.disabled = !uninitialized;
  }
  // Force the platform controls through a single exclusive path on every update.
  if (elements.platformControl) {
    elements.platformControl.hidden = true;
  }
  if (elements.platformInfoControl) {
    elements.platformInfoControl.hidden = true;
  }
  if (uninitialized && elements.platformControl) {
    elements.platformControl.hidden = false;
  } else if (initialized && elements.platformInfoControl) {
    elements.platformInfoControl.hidden = false;
  }
  if (elements.platformValue) {
    elements.platformValue.textContent = initialized
      ? formatPlatformLabel(payload.platform)
      : '';
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
