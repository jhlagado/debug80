import type { VscodeApi } from './vscode';

export type SessionStatus = 'starting' | 'running' | 'paused' | 'not running';

export interface SessionStatusController {
  setStatus: (status: SessionStatus) => void;
  dispose: () => void;
}

const STATUS_LABELS: Record<SessionStatus, string> = {
  starting: 'Starting...',
  running: 'Running',
  paused: 'Paused',
  'not running': 'Not running',
};

const STATUS_TITLES: Record<SessionStatus, string> = {
  starting: 'Debugger session is starting',
  running: 'Debugger session is running',
  paused: 'Debugger session is paused',
  'not running': 'Click to start debugging',
};

function statusClass(status: SessionStatus): string {
  return `session-status status-${status.replace(/\s+/g, '-')}`;
}

export function createSessionStatusController(
  vscode: VscodeApi,
  element: HTMLButtonElement | null
): SessionStatusController {
  if (!element) {
    return {
      setStatus: () => undefined,
      dispose: () => undefined,
    };
  }

  let currentStatus: SessionStatus = 'not running';
  const handleClick = (): void => {
    if (currentStatus !== 'not running') {
      return;
    }
    vscode.postMessage({ type: 'startDebug' });
  };

  const applyStatus = (status: SessionStatus): void => {
    currentStatus = status;
    element.textContent = STATUS_LABELS[status];
    element.dataset.status = status.replace(/\s+/g, '-');
    element.className = statusClass(status);
    element.title = STATUS_TITLES[status];
    element.disabled = status !== 'not running';
  };

  element.type = 'button';
  element.addEventListener('click', handleClick);
  applyStatus('not running');

  return {
    setStatus: applyStatus,
    dispose: () => {
      element.removeEventListener('click', handleClick);
    },
  };
}
