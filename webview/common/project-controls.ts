import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import { resolveProjectViewState } from './project-state';

export type SharedProjectControlElements = {
  appRoot?: HTMLElement | null;
  targetControl?: HTMLElement | null;
  platformControl?: HTMLElement | null;
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
  const initialized = projectViewState === 'initialized';
  const uninitialized = projectViewState === 'uninitialized';

  document.body?.setAttribute('data-project-view-state', projectViewState);
  elements.appRoot?.setAttribute('data-project-view-state', projectViewState);

  elements.targetControl?.toggleAttribute('hidden', !initialized);
  // Force the platform controls through a single exclusive path on every update.
  elements.platformControl?.setAttribute('hidden', '');
  elements.platformInfoControl?.setAttribute('hidden', '');
  if (uninitialized) {
    elements.platformControl?.removeAttribute('hidden');
  } else if (initialized) {
    elements.platformInfoControl?.removeAttribute('hidden');
  }
  if (elements.platformValue) {
    elements.platformValue.textContent = initialized
      ? formatPlatformLabel(payload.platform)
      : '';
  }
  elements.stopOnEntryLabel?.toggleAttribute('hidden', !initialized);
  elements.restartButton?.toggleAttribute('hidden', !initialized);
  elements.tabs?.toggleAttribute('hidden', !initialized);
  elements.panelUi?.toggleAttribute('hidden', !initialized);
  elements.panelMemory?.toggleAttribute('hidden', !initialized);

  return initialized;
}
