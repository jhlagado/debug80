/**
 * @file Simple platform webview entry — project header, session status, terminal, CPU memory viewer.
 */

import { MemoryPanel } from '../common/memory-panel';
import { handleMemoryPanelMessage } from '../common/memory-panel-messages';
import { createMemoryViewEntries } from '../common/memory-view-elements';
import { wireSerialUi } from '../common/serial-ui';
import { createSessionStatusController } from '../common/session-status';
import type { SessionStatus } from '../common/session-status';
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

type SimpleMessage = {
  type?: unknown;
  status?: unknown;
  tab?: unknown;
  message?: unknown;
} & Partial<ProjectStatusPayload>;

type SimpleMessageHandler = (data: SimpleMessage) => boolean;

const vscode = acquireVscodeApi();
const projectElements = getProjectPanelElements(document);

const tabsEl = document.querySelector('.tabs') as HTMLElement | null;
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanelEl = document.getElementById('memoryPanel') as HTMLElement;

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

function setKnownTab(tab: unknown): boolean {
  if (tab !== 'ui' && tab !== 'memory') {
    return false;
  }
  setTab(tab);
  return true;
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
const serialUi = wireSerialUi(vscode, {
  outputId: 'terminalOut',
  clearId: 'terminalClear',
});

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

function isSimpleMessage(data: unknown): data is SimpleMessage {
  return typeof data === 'object' && data !== null;
}

function handleSimpleProjectMessage(data: SimpleMessage): boolean {
  if (data.type !== 'projectStatus') {
    return false;
  }
  applyProjectStatus(data);
  return true;
}

function isSessionStatus(status: unknown): status is SessionStatus {
  return (
    status === 'starting' ||
    status === 'running' ||
    status === 'paused' ||
    status === 'not running'
  );
}

function handleSimpleSessionMessage(data: SimpleMessage): boolean {
  if (data.type !== 'sessionStatus') {
    return false;
  }
  if (isSessionStatus(data.status)) {
    sessionStatusController.setStatus(data.status);
  }
  return true;
}

function handleSimpleTabMessage(data: SimpleMessage): boolean {
  if (data.type !== 'selectTab') {
    return false;
  }
  setKnownTab(data.tab);
  return true;
}

const simpleMessageHandlers: SimpleMessageHandler[] = [
  handleSimpleProjectMessage,
  handleSimpleSessionMessage,
  handleSimpleTabMessage,
  (data) => handleMemoryPanelMessage(data, memoryPanelController),
];

function handleSimpleMessage(data: unknown): void {
  if (!isSimpleMessage(data)) {
    return;
  }
  simpleMessageHandlers.some((handler) => handler(data));
}

window.addEventListener('message', (event: MessageEvent): void => {
  handleSimpleMessage(event.data);
});

setTab('ui');
applyProjectStatus({});
requestProjectStatus(vscode);
sessionStatusController.setStatus('not running');
window.addEventListener('resize', () => scheduleMemoryResize());

window.addEventListener('beforeunload', () => {
  serialUi.dispose();
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  projectStatusUi.dispose();
  projectStatusRefresh.dispose();
});
