import type { MemoryPanel } from '../common/memory-panel';
import type { SessionStatusController } from '../common/session-status';
import type { AccordionLayoutController } from '../common/accordion-layout';
import type { IncomingMessage, Tec1gUpdatePayload } from './entry-types';

export interface Tec1gMessageRouter {
  dispose(): void;
}

export function wireTec1gMessageRouter(options: {
  panelLayout: AccordionLayoutController;
  sessionStatusController: SessionStatusController;
  memoryPanel: MemoryPanel;
  applyProjectStatus: (message: Extract<IncomingMessage, { type: 'projectStatus' }>) => void;
  applyPlatformUpdate: (payload: Tec1gUpdatePayload) => void;
  reassertMatrixKeyboardOpenState: () => void;
}): Tec1gMessageRouter {
  let uiRevision = 0;

  function onMessage(event: MessageEvent<IncomingMessage | undefined>): void {
    const message = event.data;
    if (!message) return;
    if (message.type === 'projectStatus') {
      options.applyProjectStatus(message);
      return;
    }
    if (message.type === 'sessionStatus') {
      options.sessionStatusController.setStatus(message.status);
      const active = message.status === 'running' || message.status === 'paused';
      options.panelLayout.setRegisterRefreshActive(active);
      if (active) options.reassertMatrixKeyboardOpenState();
      return;
    }
    if (message.type === 'selectTab') {
      options.panelLayout.setProviderTab(message.tab, false);
      return;
    }
    if (message.type === 'resetPanelLayout') {
      options.panelLayout.resetPanelLayout();
      return;
    }
    if (message.type === 'update') {
      if (typeof message.uiRevision === 'number') {
        if (message.uiRevision < uiRevision) return;
        uiRevision = message.uiRevision;
      }
      options.applyPlatformUpdate(message);
      if (message.matrixMode === false) options.reassertMatrixKeyboardOpenState();
      return;
    }
    if (message.type === 'snapshot') {
      options.memoryPanel.handleSnapshot(message);
      return;
    }
    if (message.type === 'snapshotError') {
      options.memoryPanel.handleSnapshotError(message.message);
    }
  }

  window.addEventListener('message', onMessage);
  return {
    dispose() {
      window.removeEventListener('message', onMessage);
    },
  };
}
