/**
 * @file Simple platform webview entry — project header, session status, terminal, CPU memory viewer.
 */

import { appendSerialText } from '../common/serial';
import { MemoryPanel } from '../common/memory-panel';
import { createMemoryViewEntries } from '../common/memory-view-elements';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { createProjectStatusUi } from '../common/project-status-ui';
import { requestProjectStatus, wireProjectStatusRefresh } from '../common/project-status-refresh';
import { acquireVscodeApi } from '../common/vscode';
import {
  applyProjectPanelStatusControls,
  getProjectPanelElements,
  wireProjectPanelPlatformControls,
} from '../common/project-panel-elements';
import type { ProjectStatusPayload } from '../../src/contracts/platform-view';

const TERMINAL_MAX = 8000;

const vscode = acquireVscodeApi();
const projectElements = getProjectPanelElements(document);

const tabsEl = document.querySelector('.tabs') as HTMLElement | null;
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanelEl = document.getElementById('memoryPanel') as HTMLElement;
const terminalOutEl = document.getElementById('terminalOut') as HTMLElement | null;
const terminalClearEl = document.getElementById('terminalClear') as HTMLElement | null;

let activeTab: 'ui' | 'memory' = 'ui';
let projectIsInitialized = false;
let memoryRowSize = 16;
let resizeTimer: number | null = null;

const sessionStatusController = createSessionStatusController(
  vscode,
  projectElements.restartButton
);
const stopOnEntryControl = wireStopOnEntryControl(vscode, projectElements.stopOnEntryInput);
const projectStatusUi = createProjectStatusUi(
  vscode,
  projectElements.projectStatus,
  'simple'
);
const projectStatusRefresh = wireProjectStatusRefresh(vscode);

wireProjectPanelPlatformControls(vscode, projectElements, 'simple', () => projectIsInitialized);

terminalClearEl?.addEventListener('click', () => {
  if (terminalOutEl) {
    terminalOutEl.textContent = '';
  }
  vscode.postMessage({ type: 'serialClear' });
});

function applyProjectStatus(payload: {
  rootPath?: ProjectStatusPayload['rootPath'];
  roots?: ProjectStatusPayload['roots'];
  targets?: ProjectStatusPayload['targets'];
  targetName?: ProjectStatusPayload['targetName'];
  projectState?: ProjectStatusPayload['projectState'];
  platform?: string;
  hasProject?: ProjectStatusPayload['hasProject'];
  stopOnEntry?: ProjectStatusPayload['stopOnEntry'];
  sourceMapStatusText?: ProjectStatusPayload['sourceMapStatusText'];
  sourceMapStatusState?: ProjectStatusPayload['sourceMapStatusState'];
}): void {
  projectStatusUi.applyProjectStatus(payload);
  const initialized = applyProjectPanelStatusControls(payload, projectElements, {
    tabs: tabsEl,
    panelUi,
    panelMemory,
  });
  projectIsInitialized = initialized;
  stopOnEntryControl.applyProjectStatus({
    hasProject: initialized,
    stopOnEntry: payload.stopOnEntry,
  });
}

applyProjectStatus({});

function setTab(tab: 'ui' | 'memory'): void {
  activeTab = tab;
  panelUi.classList.toggle('active', tab === 'ui');
  panelMemory.classList.toggle('active', tab === 'memory');
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab as 'ui' | 'memory';
    setTab(tab);
    vscode.postMessage({ type: 'tab', tab });
  });
});

const views = createMemoryViewEntries(document);

const statusEl = document.getElementById('status');
const memoryPanelController = new MemoryPanel({
  vscode,
  registerStrip,
  statusEl,
  views,
  getRowSize: () => memoryRowSize,
  isActive: () => activeTab === 'memory',
});
memoryPanelController.wire();

function scheduleMemoryResize(): void {
  if (resizeTimer !== null) {
    clearTimeout(resizeTimer);
  }
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    const width = memoryPanelEl.clientWidth;
    const next = width <= 480 ? 8 : width >= 520 ? 16 : memoryRowSize;
    if (next !== memoryRowSize) {
      memoryRowSize = next;
      memoryPanelController.requestSnapshot();
    }
  }, 150);
}

window.addEventListener('message', (event: MessageEvent): void => {
  if (!event.data) {
    return;
  }
  if (event.data.type === 'projectStatus') {
    applyProjectStatus(event.data);
    return;
  }
  if (event.data.type === 'sessionStatus') {
    sessionStatusController.setStatus(event.data.status);
    return;
  }
  if (event.data.type === 'selectTab') {
    const tab = event.data.tab as string;
    if (tab === 'ui' || tab === 'memory') {
      setTab(tab);
    }
    return;
  }
  if (event.data.type === 'serial') {
    if (terminalOutEl) {
      appendSerialText(terminalOutEl, event.data.text || '', TERMINAL_MAX);
    }
    return;
  }
  if (event.data.type === 'serialInit') {
    if (terminalOutEl) {
      terminalOutEl.textContent = event.data.text || '';
    }
    return;
  }
  if (event.data.type === 'serialClear') {
    if (terminalOutEl) {
      terminalOutEl.textContent = '';
    }
    return;
  }
  if (event.data.type === 'snapshot') {
    memoryPanelController.handleSnapshot(event.data);
    return;
  }
  if (event.data.type === 'snapshotError') {
    memoryPanelController.handleSnapshotError(event.data.message);
  }
});

setTab('ui');
applyProjectStatus({});
requestProjectStatus(vscode);
sessionStatusController.setStatus('not running');
window.addEventListener('resize', () => scheduleMemoryResize());

window.addEventListener('beforeunload', () => {
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  projectStatusUi.dispose();
  projectStatusRefresh.dispose();
});
