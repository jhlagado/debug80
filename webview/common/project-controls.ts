import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import { resolveProjectViewState } from './project-state';

export type SharedProjectControlElements = {
  appRoot?: HTMLElement | null;
  targetControl?: HTMLElement | null;
  platformControl?: HTMLElement | null;
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
  },
  elements: SharedProjectControlElements
): boolean {
  const projectViewState = resolveProjectViewState(payload);
  const initialized = projectViewState === 'initialized';

  document.body?.setAttribute('data-project-view-state', projectViewState);
  elements.appRoot?.setAttribute('data-project-view-state', projectViewState);

  elements.targetControl?.toggleAttribute('hidden', !initialized);
  elements.platformControl?.toggleAttribute('hidden', initialized);
  elements.stopOnEntryLabel?.toggleAttribute('hidden', !initialized);
  elements.restartButton?.toggleAttribute('hidden', !initialized);
  elements.tabs?.toggleAttribute('hidden', !initialized);
  elements.panelUi?.toggleAttribute('hidden', !initialized);
  elements.panelMemory?.toggleAttribute('hidden', !initialized);

  return initialized;
}
