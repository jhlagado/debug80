import { createDigit } from '../common/digits';
import { applyInitializedProjectControls } from '../common/project-controls';
import { MemoryPanel } from '../common/memory-panel';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { createProjectStatusUi } from '../common/project-status-ui';
import { acquireVscodeApi } from '../common/vscode';
import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import { createAudioController } from './audio';
import { createLcdRenderer } from './lcd-renderer';
import { createMatrixRenderer } from './matrix-renderer';
import { createPanelLayoutController, type PanelTab } from './panel-layout';
import { wireTec1SerialUi } from './serial-ui';

const vscode = acquireVscodeApi();
const DEFAULT_TAB: PanelTab =
  document.body.dataset.activeTab === 'memory'
    ? 'memory'
    : 'ui';
const selectProjectButton = document.getElementById('selectProject') as HTMLButtonElement | null;
const addWorkspaceFolderButton = document.getElementById('addWorkspaceFolder') as HTMLButtonElement | null;
const appRoot = document.getElementById('app') as HTMLElement | null;
const projectHeader = document.getElementById('projectHeader') as HTMLElement | null;
const setupCard = document.getElementById('setupCard') as HTMLElement | null;
const setupCardText = document.getElementById('setupCardText') as HTMLElement | null;
const setupPrimaryAction = document.getElementById('setupPrimaryAction') as HTMLButtonElement | null;
const platformInitButton = document.getElementById('platformInitButton') as HTMLButtonElement | null;
const restartDebugButton = document.getElementById('restartDebug') as HTMLButtonElement | null;
const stopOnEntryInput = document.getElementById('stopOnEntry') as HTMLInputElement | null;
const homeTargetSelect = document.getElementById('homeTargetSelect') as HTMLSelectElement | null;
const targetControl = homeTargetSelect?.closest('.project-control') as HTMLElement | null;
const displayEl = document.getElementById('display') as HTMLElement;
const keypadEl = document.getElementById('keypad') as HTMLElement;
keypadEl.tabIndex = 0;
const speakerEl = document.getElementById('speaker') as HTMLElement;
const speakerHzEl = document.getElementById('speakerHz') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const muteEl = document.getElementById('mute') as HTMLElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const platformSelectEl = document.getElementById('platformSelect') as HTMLSelectElement | null;
const platformControl = platformSelectEl?.closest('.project-control') as HTMLElement | null;
const platformInfoControl = document.getElementById('platformInfoControl') as HTMLElement | null;
const platformValueEl = document.getElementById('platformValue') as HTMLElement | null;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanel = document.getElementById('memoryPanel') as HTMLElement;
const tabsEl = document.querySelector('.tabs') as HTMLElement | null;
const stopOnEntryLabel = stopOnEntryInput?.closest('.stop-on-entry-label') as HTMLElement | null;
const SHIFT_BIT = 0x20;
const DIGITS = 6;
const digitEls = [];
for (let i = 0; i < DIGITS; i++) {
  const digit = createDigit();
  digitEls.push(digit);
  displayEl.appendChild(digit);
}

let memoryPanelController: MemoryPanel | null = null;
const panelLayout = createPanelLayoutController({
  defaultTab: DEFAULT_TAB,
  memoryPanel,
  panelMemory,
  panelUi,
  postMessage: (message) => vscode.postMessage(message),
  requestSnapshot: () => memoryPanelController?.requestSnapshot(),
  tabButtons,
});
panelLayout.wireTabButtons();

const keyMap = {
  '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
  '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
  'A': 0x0A, 'B': 0x0B, 'C': 0x0C, 'D': 0x0D, 'E': 0x0E, 'F': 0x0F,
  'AD': 0x13, 'UP': 0x10, 'GO': 0x12, 'DOWN': 0x11
};

const controlOrder = ['AD', 'GO', 'UP', 'DOWN'];
const hexOrder = [
  'F', 'E', 'D', 'C',
  'B', 'A', '9', '8',
  '7', '6', '5', '4',
  '3', '2', '1', '0'
];

let speedMode = 'fast';
let uiRevision = 0;
let projectIsInitialized = false;
let shiftLatched = false;

const audio = createAudioController(muteEl);

addWorkspaceFolderButton?.addEventListener('click', () => {
  vscode.postMessage({ type: 'openWorkspaceFolder' });
});

platformSelectEl?.addEventListener('change', () => {
  if (projectIsInitialized) {
    vscode.postMessage({ type: 'saveProjectConfig', platform: platformSelectEl.value });
  }
});
const lcdRenderer = createLcdRenderer();
const matrixRenderer = createMatrixRenderer();
const sessionStatusController = createSessionStatusController(vscode, restartDebugButton);
const stopOnEntryControl = wireStopOnEntryControl(vscode, stopOnEntryInput);
const projectStatusUi = createProjectStatusUi(vscode, {
  selectProjectButton,
  setupCard,
  setupCardText,
  setupPrimaryAction,
  platformInitButton,
  homeTargetSelect,
}, 'tec1');

function applyProjectStatus(payload: {
  rootPath?: ProjectStatusPayload['rootPath'];
  roots?: ProjectStatusPayload['roots'];
  targets?: ProjectStatusPayload['targets'];
  targetName?: ProjectStatusPayload['targetName'];
  projectState?: ProjectStatusPayload['projectState'];
  platform?: ProjectStatusPayload['platform'];
  hasProject?: ProjectStatusPayload['hasProject'];
  stopOnEntry?: ProjectStatusPayload['stopOnEntry'];
}): void {
  projectStatusUi.applyProjectStatus(payload);
  if (platformSelectEl && payload.platform !== undefined) {
    platformSelectEl.value = payload.platform;
  }
  const initialized = applyInitializedProjectControls(payload, {
    appRoot,
    projectHeader,
    targetControl,
    targetSelect: homeTargetSelect,
    platformControl,
    platformSelect: platformSelectEl,
    platformInfoControl,
    platformValue: platformValueEl,
    stopOnEntryLabel,
    restartButton: restartDebugButton,
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

function applySpeed(mode: string): void {
  speedMode = mode;
  speedEl.textContent = mode.toUpperCase();
  speedEl.classList.toggle('slow', mode === 'slow');
  speedEl.classList.toggle('fast', mode === 'fast');
}

function setShiftLatched(value: boolean): void {
  shiftLatched = value;
  shiftButton.classList.toggle('active', shiftLatched);
}

function sendKey(code: number): void {
  let adjusted = code;
  if (shiftLatched) {
    adjusted = code & ~SHIFT_BIT;
  } else {
    adjusted = code | SHIFT_BIT;
  }
  vscode.postMessage({ type: 'key', code: adjusted });
  if (shiftLatched) {
    setShiftLatched(false);
  }
}

function addButton(label: string, action: () => void, className?: string): HTMLElement {
  const button = document.createElement('div');
  button.className = className ? 'key ' + className : 'key';
  button.textContent = label;
  button.addEventListener('click', action);
  button.addEventListener('mousedown', (e) => {
    e.preventDefault(); // retain keypad focus when clicking keys
  });
  keypadEl.appendChild(button);
  return button;
}

addButton('RST', () => {
  setShiftLatched(false);
  vscode.postMessage({ type: 'reset' });
});
for (let i = 0; i < 4; i += 1) {
  addButton('', () => {}, 'spacer');
}

for (let row = 0; row < 4; row += 1) {
  const control = controlOrder[row];
  addButton(control, () => sendKey(keyMap[control]));
  const rowStart = row * 4;
  for (let col = 0; col < 4; col += 1) {
    const label = hexOrder[rowStart + col];
    addButton(label, () => sendKey(keyMap[label]));
  }
}

const shiftButton = addButton('SHIFT', () => {
  setShiftLatched(!shiftLatched);
}, 'shift');
speedEl.addEventListener('click', () => {
  const next = speedMode === 'fast' ? 'slow' : 'fast';
  applySpeed(next);
  vscode.postMessage({ type: 'speed', mode: next });
});
muteEl.addEventListener('click', () => {
  audio.toggleMute();
});

function updateDigit(el: Element, value: number): void {
  const segments = el.querySelectorAll('[data-mask]');
  segments.forEach(seg => {
    const mask = parseInt(seg.dataset.mask || '0', 10);
    if (value & mask) {
      seg.classList.add('on');
    } else {
      seg.classList.remove('on');
    }
  });
}

function applyUpdate(payload: {
  digits?: number[];
  matrix?: number[];
  speaker?: boolean;
  speedMode?: string;
  lcd?: number[];
  speakerHz?: number;
}): void {
  const digits = payload.digits || [];
  digitEls.forEach((el, idx) => {
    updateDigit(el, digits[idx] || 0);
  });
  if (payload.speaker) {
    speakerEl.classList.add('on');
  } else {
    speakerEl.classList.remove('on');
  }
  if (speakerHzEl && typeof payload.speakerHz === 'number') {
    if (payload.speakerHz > 0) {
      speakerHzEl.textContent = payload.speakerHz + ' Hz';
      audio.setSpeakerHz(payload.speakerHz);
    } else {
      speakerHzEl.textContent = '';
      audio.setSpeakerHz(0);
    }
  }
  audio.updateAudio();
  if (payload.speedMode === 'slow' || payload.speedMode === 'fast') {
    applySpeed(payload.speedMode);
  }
  lcdRenderer.applyLcdUpdate(payload);
  matrixRenderer.applyMatrixUpdate(payload);
}

const statusEl = document.getElementById('status');
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

memoryPanelController = new MemoryPanel({
  vscode,
  registerStrip,
  statusEl,
  views,
  getRowSize: () => panelLayout.getMemoryRowSize(),
  isActive: () => panelLayout.getActiveTab() === 'memory',
});
memoryPanelController.wire();
const serialUi = wireTec1SerialUi(vscode);

window.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'projectStatus') {
    applyProjectStatus(event.data);
    return;
  }
  if (event.data.type === 'sessionStatus') {
    sessionStatusController.setStatus(event.data.status);
    return;
  }
  if (event.data.type === 'selectTab') {
    panelLayout.setTab(event.data.tab, false);
    return;
  }
  if (event.data.type === 'update') {
    if (typeof event.data.uiRevision === 'number') {
      if (event.data.uiRevision < uiRevision) {
        return;
      }
      uiRevision = event.data.uiRevision;
    }
    applyUpdate(event.data);
    if (panelLayout.getActiveTab() === 'memory') {
      memoryPanelController?.requestSnapshot();
    }
    return;
  }
  if (event.data.type === 'snapshot') {
    memoryPanelController?.handleSnapshot(event.data);
    return;
  }
  if (event.data.type === 'snapshotError') {
    memoryPanelController?.handleSnapshotError(event.data.message);
  }
});

applySpeed(speedMode);
audio.applyMuteState();
lcdRenderer.draw();
matrixRenderer.build();
matrixRenderer.draw();
panelLayout.setTab(DEFAULT_TAB, false);
keypadEl.focus();
sessionStatusController.setStatus('not running');
window.addEventListener('resize', () => panelLayout.scheduleMemoryResize());
panelLayout.updateMemoryLayout(false);

keypadEl.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const key = event.key.toUpperCase();
  if (keyMap[key] !== undefined) {
    sendKey(keyMap[key]);
    event.preventDefault();
    return;
  }
  if (event.key === 'Enter') {
    sendKey(0x12);
    event.preventDefault();
  } else if (event.key === 'ArrowUp') {
    sendKey(0x10);
    event.preventDefault();
  } else if (event.key === 'ArrowDown') {
    sendKey(0x11);
    event.preventDefault();
  } else if (event.key === 'Tab') {
    sendKey(0x13);
    event.preventDefault();
  }
});

window.addEventListener('beforeunload', () => {
  serialUi.dispose();
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  projectStatusUi.dispose();
});
  
