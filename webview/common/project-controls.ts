import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import { resolveProjectViewState } from './project-state';

export type SharedProjectControlElements = {
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
  const viewState = resolveProjectViewState(payload);
  const initialized = viewState === 'initialized';
  const uninitialized = viewState === 'uninitialized';

  elements.targetControl?.toggleAttribute('hidden', !initialized);
  elements.platformControl?.toggleAttribute('hidden', !uninitialized);
  elements.platformInfoControl?.toggleAttribute('hidden', !initialized);
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
