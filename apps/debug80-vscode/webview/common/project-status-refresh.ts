import type { VscodeApi } from './vscode';

export function requestProjectStatus(vscode: VscodeApi): void {
  vscode.postMessage({ type: 'requestProjectStatus' });
}

export function wireProjectStatusRefresh(vscode: VscodeApi): { dispose: () => void } {
  const handleFocus = (): void => {
    requestProjectStatus(vscode);
  };
  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      requestProjectStatus(vscode);
    }
  };

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    dispose() {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    },
  };
}
