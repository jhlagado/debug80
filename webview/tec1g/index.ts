/**
 * @file TEC-1G webview composition root: wires feature modules and extension messages.
 */

import { createDigit } from '../common/digits';
import { MemoryPanel } from '../common/memory-panel';
import { createSessionStatusController } from '../common/session-status';
import { acquireVscodeApi } from '../common/vscode';
import { createGlcdRenderer } from './glcd-renderer';
import { createLcdRenderer } from './lcd-renderer';
import { createMatrixUiController } from './matrix-ui';
import { wireTec1gSerialUi } from './serial-ui';
import { createVisibilityController } from './visibility-controller';
import type { IncomingMessage, Tec1gPanelTab, Tec1gSpeedMode, Tec1gUpdatePayload } from './entry-types';
import { TEC1G_DIGITS } from './keypad-layout';
import { createTec1gMemoryViews } from './tec1g-memory-views';
import { createTec1gAudio } from './tec1g-audio';
import { createTec1gKeypad, TEC1G_KEY_MAP } from './tec1g-keypad';
import { applyTec1gPlatformUpdate } from './tec1g-platform-update';
import { createTec1gProjectStatusUi } from './tec1g-project-status-ui';
import { createTec1gTabMemory } from './tec1g-tab-memory';

const vscode = acquireVscodeApi();

const DEFAULT_TAB: Tec1gPanelTab =
  document.body.dataset.activeTab === 'memory'
    ? 'memory'
    : 'ui';

const selectProjectButton = document.getElementById('selectProject') as HTMLButtonElement | null;
const createProjectButton = document.getElementById('createProject') as HTMLButtonElement | null;
const setupCard = document.getElementById('setupCard') as HTMLElement | null;
const setupCardText = document.getElementById('setupCardText') as HTMLElement | null;
const setupPrimaryAction = document.getElementById('setupPrimaryAction') as HTMLButtonElement | null;
const sessionStatusButton = document.getElementById('sessionStatus') as HTMLButtonElement | null;
const homeTargetSelect = document.getElementById('homeTargetSelect') as HTMLSelectElement | null;
const displayEl = document.getElementById('display') as HTMLElement;
const keypadEl = document.getElementById('keypad') as HTMLElement;
const speakerEl = document.getElementById('speaker') as HTMLElement;
const speakerLabel = document.getElementById('speakerLabel') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const muteEl = document.getElementById('mute') as HTMLElement;
const statusShadow = document.getElementById('statusShadow') as HTMLElement;
const statusProtect = document.getElementById('statusProtect') as HTMLElement;
const statusExpand = document.getElementById('statusExpand') as HTMLElement;
const statusCaps = document.getElementById('statusCaps') as HTMLElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const platformSelectEl = document.getElementById('platformSelect') as HTMLSelectElement | null;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanelEl = document.getElementById('memoryPanel') as HTMLElement;

const digitEls: HTMLElement[] = [];
for (let i = 0; i < TEC1G_DIGITS; i++) {
  const digit = createDigit();
  digitEls.push(digit);
  displayEl.appendChild(digit);
}

const sessionStatusController = createSessionStatusController(vscode, sessionStatusButton);

const glcdRenderer = createGlcdRenderer();
const lcdRenderer = createLcdRenderer();

let memoryPanelController: MemoryPanel | null = null;

const tabMemory = createTec1gTabMemory({
  vscode,
  tabButtons,
  panelUi,
  panelMemory,
  memoryPanel: memoryPanelEl,
  defaultTab: DEFAULT_TAB,
  getMemoryPanelController: () => memoryPanelController,
});

const matrixUi = createMatrixUiController(vscode, () => tabMemory.getActiveTab() === 'ui');
const visibilityController = createVisibilityController(vscode);

const projectStatusUi = createTec1gProjectStatusUi(vscode, {
  selectProjectButton,
  createProjectButton,
  setupCard,
  setupCardText,
  setupPrimaryAction,
  homeTargetSelect,
});

projectStatusUi.applyProjectStatus({});

const audio = createTec1gAudio({ muteEl, speakerEl, speakerLabel });
audio.wireMuteClick();

platformSelectEl?.addEventListener('change', () => {
  vscode.postMessage({ type: 'saveProjectConfig', platform: platformSelectEl.value });
});

let speedMode: Tec1gSpeedMode = 'fast';
function applySpeed(mode: Tec1gSpeedMode): void {
  speedMode = mode;
  speedEl.textContent = mode.toUpperCase();
  speedEl.classList.toggle('slow', mode === 'slow');
  speedEl.classList.toggle('fast', mode === 'fast');
}

const keypad = createTec1gKeypad(vscode, keypadEl, {
  statusShadow,
  statusProtect,
  statusExpand,
  statusCaps,
});

speedEl.addEventListener('click', () => {
  const next = speedMode === 'fast' ? 'slow' : 'fast';
  applySpeed(next);
  vscode.postMessage({ type: 'speed', mode: next });
});

let uiRevision = 0;

const platformUpdateDeps = {
  digitEls,
  audio,
  applySpeed,
  lcdRenderer,
  matrixUi,
  glcdRenderer,
  keypad,
};

function applyUpdateFromPayload(payload: Tec1gUpdatePayload | null | undefined): void {
  applyTec1gPlatformUpdate(platformUpdateDeps, payload);
}

const statusEl = document.getElementById('status');
const views = createTec1gMemoryViews();

memoryPanelController = new MemoryPanel({
  vscode,
  registerStrip,
  statusEl,
  views,
  getRowSize: () => tabMemory.getMemoryRowSize(),
  isActive: () => tabMemory.getActiveTab() === 'memory',
});
memoryPanelController.wire();

window.addEventListener('message', (event: MessageEvent<IncomingMessage | undefined>): void => {
  const message = event.data;
  if (!message) {
    return;
  }
  if (message.type === 'projectStatus') {
    projectStatusUi.applyProjectStatus(message);
    if (platformSelectEl && message.platform !== undefined) {
      platformSelectEl.value = message.platform;
    }
    return;
  }
  if (message.type === 'sessionStatus') {
    sessionStatusController.setStatus(message.status);
    return;
  }
  if (message.type === 'selectTab') {
    tabMemory.setTab(message.tab, false);
    return;
  }
  if (message.type === 'uiVisibility') {
    visibilityController.applyOverride(message.visibility, message.persist === true);
    return;
  }
  if (message.type === 'update') {
    if (typeof message.uiRevision === 'number') {
      if (message.uiRevision < uiRevision) {
        return;
      }
      uiRevision = message.uiRevision;
    }
    applyUpdateFromPayload(message);
    if (tabMemory.getActiveTab() === 'memory') {
      memoryPanelController?.requestSnapshot();
    }
    return;
  }
  if (message.type === 'snapshot') {
    memoryPanelController?.handleSnapshot(message);
    return;
  }
  if (message.type === 'snapshotError') {
    memoryPanelController?.handleSnapshotError(message.message);
  }
});

applySpeed(speedMode);
audio.applyMuteState();
matrixUi.init();
visibilityController.wire();
lcdRenderer.draw();
glcdRenderer.draw();
tabMemory.setTab(DEFAULT_TAB, false);
sessionStatusController.setStatus('not running');
window.addEventListener('resize', () => {
  tabMemory.scheduleMemoryResize();
});
tabMemory.updateMemoryLayout(false);
wireTec1gSerialUi(vscode);

window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }
  if (matrixUi.handleKeyEvent(event, true)) {
    event.preventDefault();
    return;
  }
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return;
  }
  if (target && target.isContentEditable) {
    return;
  }
  const key = event.key.toUpperCase();
  if (TEC1G_KEY_MAP[key] !== undefined) {
    keypad.sendKey(TEC1G_KEY_MAP[key]);
    event.preventDefault();
    return;
  }
  if (event.key === 'Enter') {
    keypad.sendKey(0x12);
    event.preventDefault();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    keypad.sendKey(0x11);
    event.preventDefault();
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    keypad.sendKey(0x10);
    event.preventDefault();
  } else if (event.key === 'Tab') {
    keypad.sendKey(0x13);
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => {
  if (matrixUi.handleKeyEvent(event, false)) {
    event.preventDefault();
  }
});
window.addEventListener('beforeunload', () => {
  sessionStatusController.dispose();
  projectStatusUi.dispose();
});
