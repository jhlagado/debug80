/**
 * @file Simple platform webview entry — project header, session status, terminal, CPU memory viewer.
 */

import { appendSerialText } from '../common/serial';
import { MemoryPanel } from '../common/memory-panel';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { createProjectRootButtonController } from '../common/project-root-button';
import { resolveProjectViewState } from '../common/project-state';
import { resolveSetupCardState } from '../common/setup-card-state';
import { acquireVscodeApi } from '../common/vscode';
import type { ProjectStatusPayload } from '../../src/contracts/platform-view';

const TERMINAL_MAX = 8000;

const vscode = acquireVscodeApi();

const selectProjectButton = document.getElementById('selectProject') as HTMLButtonElement | null;
const setupCard = document.getElementById('setupCard') as HTMLElement | null;
const setupCardText = document.getElementById('setupCardText') as HTMLElement | null;
const setupPrimaryAction = document.getElementById('setupPrimaryAction') as HTMLButtonElement | null;
const sessionStatusButton = document.getElementById('sessionStatus') as HTMLButtonElement | null;
const stopOnEntryInput = document.getElementById('stopOnEntry') as HTMLInputElement | null;
const homeTargetSelect = document.getElementById('homeTargetSelect') as HTMLSelectElement | null;
const platformSelectEl = document.getElementById('platformSelect') as HTMLSelectElement | null;
const targetControl = homeTargetSelect?.closest('.project-control') as HTMLElement | null;
const platformControl = platformSelectEl?.closest('.project-control') as HTMLElement | null;
const tabsEl = document.querySelector('.tabs') as HTMLElement | null;
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanelEl = document.getElementById('memoryPanel') as HTMLElement;
const terminalOutEl = document.getElementById('terminalOut') as HTMLElement | null;
const terminalClearEl = document.getElementById('terminalClear') as HTMLElement | null;

let activeTab: 'ui' | 'memory' = 'ui';
let currentRootPath = '';
let currentRoots: Array<{ name: string; path: string; hasProject: boolean }> = [];
let setupPrimaryActionType: 'openWorkspaceFolder' | 'createProject' = 'openWorkspaceFolder';
let memoryRowSize = 16;
let resizeTimer: number | null = null;

const sessionStatusController = createSessionStatusController(vscode, sessionStatusButton);
const stopOnEntryControl = wireStopOnEntryControl(vscode, stopOnEntryInput);
const projectRootController = createProjectRootButtonController(vscode, selectProjectButton);

platformSelectEl?.addEventListener('change', () => {
  vscode.postMessage({ type: 'saveProjectConfig', platform: platformSelectEl.value });
});

setupPrimaryAction?.addEventListener('click', () => {
  const selected = currentRoots.find((r) => r.path === currentRootPath) ?? currentRoots[0];
  if (setupPrimaryActionType === 'openWorkspaceFolder') {
    vscode.postMessage({ type: 'openWorkspaceFolder' });
    return;
  }
  if (selected !== undefined) {
    vscode.postMessage({ type: 'createProject', rootPath: selected.path, platform: platformSelectEl?.value });
  }
});

homeTargetSelect?.addEventListener('change', () => {
  const targetName = homeTargetSelect.value;
  if (!targetName) {
    return;
  }
  vscode.postMessage({ type: 'selectTarget', rootPath: currentRootPath, targetName });
});

terminalClearEl?.addEventListener('click', () => {
  if (terminalOutEl) {
    terminalOutEl.textContent = '';
  }
  vscode.postMessage({ type: 'serialClear' });
});

function clearSelectOptions(select: HTMLSelectElement): void {
  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }
}

function setSelectPlaceholder(select: HTMLSelectElement, label: string): void {
  const option = document.createElement('option');
  option.value = '';
  option.textContent = label;
  option.disabled = true;
  option.selected = true;
  select.appendChild(option);
}

function setTargetOptions(
  options: Array<{ name: string; description?: string; detail?: string }>,
  selectedTargetName?: string
): void {
  if (!homeTargetSelect) {
    return;
  }
  clearSelectOptions(homeTargetSelect);
  if (options.length === 0) {
    setSelectPlaceholder(homeTargetSelect, 'No targets available');
    homeTargetSelect.disabled = true;
    return;
  }
  setSelectPlaceholder(homeTargetSelect, 'Select target...');
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.name;
    el.textContent = option.name;
    el.title = option.detail ?? option.description ?? option.name;
    homeTargetSelect.appendChild(el);
  }
  homeTargetSelect.disabled = false;
  homeTargetSelect.value = selectedTargetName ?? '';
}

function applyProjectStatus(payload: {
  rootPath?: ProjectStatusPayload['rootPath'];
  roots?: ProjectStatusPayload['roots'];
  targets?: ProjectStatusPayload['targets'];
  targetName?: ProjectStatusPayload['targetName'];
  projectState?: ProjectStatusPayload['projectState'];
  platform?: string;
  hasProject?: ProjectStatusPayload['hasProject'];
  stopOnEntry?: ProjectStatusPayload['stopOnEntry'];
}): void {
  const projectState = resolveProjectViewState(payload);
  const initialized = projectState === 'initialized';
  currentRootPath = payload.rootPath ?? '';
  currentRoots = payload.roots ?? [];
  projectRootController.applyProjectStatus({
    rootPath: payload.rootPath,
    roots: payload.roots ?? [],
    targetCount: payload.targets?.length ?? 0,
  });
  setTargetOptions(payload.targets ?? [], payload.targetName);
  if (targetControl) {
    targetControl.hidden = !initialized;
  }
  if (platformSelectEl && payload.platform !== undefined) {
    platformSelectEl.value = payload.platform;
  }
  if (platformControl) {
    platformControl.hidden = initialized;
  }
  stopOnEntryControl.applyProjectStatus({
    hasProject: initialized,
    stopOnEntry: payload.stopOnEntry,
  });
  if (stopOnEntryInput?.parentElement) {
    stopOnEntryInput.parentElement.hidden = !initialized;
  }
  if (sessionStatusButton) {
    sessionStatusButton.hidden = !initialized;
  }
  if (tabsEl) {
    tabsEl.hidden = !initialized;
  }
  panelUi.hidden = !initialized;
  panelMemory.hidden = !initialized;
  const selected = currentRoots.find((r) => r.path === currentRootPath) ?? currentRoots[0];
  const targetCount = payload.targets?.length ?? 0;
  if (!setupCard || !setupCardText || !setupPrimaryAction) {
    return;
  }
  const setupState = resolveSetupCardState(selected, projectState, targetCount);
  if (setupState === null) {
    setupCard.hidden = true;
    return;
  }
  setupCard.hidden = false;
  setupPrimaryActionType = setupState.primaryAction;
  setupCardText.textContent = setupState.text;
  setupPrimaryAction.textContent = setupState.primaryLabel;
}

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

const views = [
  {
    id: 'a',
    view: document.getElementById('view-a'),
    address: document.getElementById('address-a'),
    addr: document.getElementById('addr-a'),
    symbol: document.getElementById('sym-a'),
    dump: document.getElementById('dump-a'),
  },
  {
    id: 'b',
    view: document.getElementById('view-b'),
    address: document.getElementById('address-b'),
    addr: document.getElementById('addr-b'),
    symbol: document.getElementById('sym-b'),
    dump: document.getElementById('dump-b'),
  },
  {
    id: 'c',
    view: document.getElementById('view-c'),
    address: document.getElementById('address-c'),
    addr: document.getElementById('addr-c'),
    symbol: document.getElementById('sym-c'),
    dump: document.getElementById('dump-c'),
  },
  {
    id: 'd',
    view: document.getElementById('view-d'),
    address: document.getElementById('address-d'),
    addr: document.getElementById('addr-d'),
    symbol: document.getElementById('sym-d'),
    dump: document.getElementById('dump-d'),
  },
];

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
sessionStatusController.setStatus('not running');
window.addEventListener('resize', () => scheduleMemoryResize());

window.addEventListener('beforeunload', () => {
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  projectRootController.dispose();
});
