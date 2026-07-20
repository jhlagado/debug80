import type { VscodeApi } from './vscode';

export type SessionStatus = 'starting' | 'running' | 'paused' | 'not running';

export interface SessionStatusController {
  setStatus: (status: SessionStatus) => void;
  dispose: () => void;
}

const RESTART_LABEL = 'Run';
const RESTART_TITLE = 'Build the current target and run it in the emulator';
const BUILD_TITLE = 'Build the current target without launching the emulator';

function statusClass(status: SessionStatus): string {
  return `session-status status-${status.replace(/\s+/g, '-')}`;
}

export function createSessionStatusController(
  vscode: VscodeApi,
  element: HTMLButtonElement | null,
  buildElement?: HTMLButtonElement | null
): SessionStatusController {
  if (!element) {
    return {
      setStatus: () => undefined,
      dispose: () => undefined,
    };
  }

  let currentStatus: SessionStatus = 'not running';
  const handleClick = (): void => {
    if (currentStatus === 'starting') {
      return;
    }
    vscode.postMessage({ type: 'restartDebug' });
  };
  const handleBuildClick = (): void => {
    if (currentStatus === 'starting') {
      return;
    }
    vscode.postMessage({ type: 'buildTarget' });
  };

  const applyStatus = (status: SessionStatus): void => {
    currentStatus = status;
    element.textContent = RESTART_LABEL;
    element.dataset.status = status.replace(/\s+/g, '-');
    element.className = statusClass(status);
    element.title = RESTART_TITLE;
    element.setAttribute('aria-label', RESTART_TITLE);
    element.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-atomic', 'true');
    element.disabled = status === 'starting';
    if (buildElement) {
      buildElement.disabled = status === 'starting';
    }
  };

  element.type = 'button';
  element.addEventListener('click', handleClick);
  if (buildElement) {
    buildElement.type = 'button';
    buildElement.title = BUILD_TITLE;
    buildElement.setAttribute('aria-label', BUILD_TITLE);
    buildElement.addEventListener('click', handleBuildClick);
  }
  applyStatus('not running');

  return {
    setStatus: applyStatus,
    dispose: () => {
      element.removeEventListener('click', handleClick);
      buildElement?.removeEventListener('click', handleBuildClick);
    },
  };
}
