import type * as vscode from 'vscode';
import type { UiPerformanceMonitor } from './ui-performance-monitor';

export interface PlatformViewMessageTransport {
  nextRevision(): number;
  post(payload: Record<string, unknown>): void;
  requestPanelLayoutReset(): void;
  postPendingPanelLayoutReset(): void;
}

export function createPlatformViewMessageTransport(options: {
  getView: () => vscode.WebviewView | undefined;
  performanceMonitor: UiPerformanceMonitor;
}): PlatformViewMessageTransport {
  let uiRevision = 0;
  let panelLayoutResetPending = false;

  function post(payload: Record<string, unknown>): void {
    const view = options.getView();
    if (view === undefined) {
      return;
    }
    options.performanceMonitor.recordMessage(String(payload.type ?? 'unknown'), payload);
    void view.webview.postMessage(payload);
  }

  function postPendingPanelLayoutReset(): void {
    if (!panelLayoutResetPending || options.getView() === undefined) {
      return;
    }
    panelLayoutResetPending = false;
    post({ type: 'resetPanelLayout' });
  }

  return {
    post,
    postPendingPanelLayoutReset,
    requestPanelLayoutReset(): void {
      panelLayoutResetPending = true;
    },
    nextRevision(): number {
      uiRevision += 1;
      return uiRevision;
    },
  };
}
