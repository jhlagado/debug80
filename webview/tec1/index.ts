import { createDigit } from '../common/digits';
import { MemoryPanel } from '../common/memory-panel';
import { acquireVscodeApi } from '../common/vscode';
import { createAudioController } from './audio';
import { createLcdRenderer } from './lcd-renderer';
import { createMatrixRenderer } from './matrix-renderer';
import { createPanelLayoutController, type PanelTab } from './panel-layout';
import { wireTec1SerialUi } from './serial-ui';

const vscode = acquireVscodeApi();
const DEFAULT_TAB: PanelTab =
  document.body.dataset.activeTab === 'memory'
    ? 'memory'
    : document.body.dataset.activeTab === 'ui'
      ? 'ui'
      : 'home';
const homeRootSelect = document.getElementById('homeRootSelect') as HTMLSelectElement | null;
const homeTargetSelect = document.getElementById('homeTargetSelect') as HTMLSelectElement | null;
const homeRootName = document.getElementById('homeRootName') as HTMLElement | null;
const homeProjectState = document.getElementById('homeProjectState') as HTMLElement | null;
const homeTargetName = document.getElementById('homeTargetName') as HTMLElement | null;
const homeEntrySource = document.getElementById('homeEntrySource') as HTMLElement | null;
const displayEl = document.getElementById('display') as HTMLElement;
const keypadEl = document.getElementById('keypad') as HTMLElement;
const speakerEl = document.getElementById('speaker') as HTMLElement;
const speakerHzEl = document.getElementById('speakerHz') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const muteEl = document.getElementById('mute') as HTMLElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
const panelHome = document.getElementById('panel-home') as HTMLElement;
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanel = document.getElementById('memoryPanel') as HTMLElement;
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
  panelHome,
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
let shiftLatched = false;
let currentRootPath = '';
const audio = createAudioController(muteEl);
const lcdRenderer = createLcdRenderer();
const matrixRenderer = createMatrixRenderer();

homeRootSelect?.addEventListener('change', () => {
  const rootPath = homeRootSelect.value;
  if (!rootPath) {
    return;
  }
  vscode.postMessage({ type: 'selectProject', rootPath });
});

homeTargetSelect?.addEventListener('change', () => {
  const targetName = homeTargetSelect.value;
  if (!targetName) {
    return;
  }
  vscode.postMessage({
    type: 'selectTarget',
    rootPath: currentRootPath,
    targetName,
  });
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

function setRootOptions(options: Array<{ name: string; path: string; hasProject: boolean }>, selectedRootPath?: string): void {
  if (!homeRootSelect) {
    return;
  }
  clearSelectOptions(homeRootSelect);
  if (options.length === 0) {
    setSelectPlaceholder(homeRootSelect, 'No workspace roots available');
    homeRootSelect.disabled = true;
    return;
  }
  setSelectPlaceholder(homeRootSelect, 'Select root...');
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.path;
    el.textContent = `${option.name} — ${option.path}`;
    el.title = option.hasProject ? 'Configured Debug80 project' : 'No Debug80 project config';
    homeRootSelect.appendChild(el);
  }
  homeRootSelect.disabled = false;
  homeRootSelect.value = selectedRootPath ?? '';
}

function setTargetOptions(options: Array<{ name: string; description?: string; detail?: string }>, selectedTargetName?: string): void {
  if (!homeTargetSelect) {
    return;
  }
  clearSelectOptions(homeTargetSelect);
  if (options.length === 0) {
    setSelectPlaceholder(homeTargetSelect, currentRootPath ? 'No targets available' : 'Select root first');
    homeTargetSelect.disabled = true;
    return;
  }
  setSelectPlaceholder(homeTargetSelect, 'Select target...');
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.name;
    el.textContent = option.description ? `${option.name} — ${option.description}` : option.name;
    el.title = option.detail ?? option.description ?? option.name;
    homeTargetSelect.appendChild(el);
  }
  homeTargetSelect.disabled = false;
  homeTargetSelect.value = selectedTargetName ?? '';
}

function setHomeValue(node: HTMLElement | null, value: string | undefined, fallback: string): void {
  if (!node) {
    return;
  }
  node.textContent = value !== undefined && value !== '' ? value : fallback;
}

function applyProjectStatus(payload: {
  rootName?: string;
  rootPath?: string;
  hasProject?: boolean;
  targetName?: string;
  entrySource?: string;
  roots?: Array<{ name: string; path: string; hasProject: boolean }>;
  targets?: Array<{ name: string; description?: string; detail?: string }>;
}): void {
  currentRootPath = payload.rootPath ?? '';
  setRootOptions(payload.roots ?? [], currentRootPath);
  setTargetOptions(payload.targets ?? [], payload.targetName);
  setHomeValue(homeRootName, payload.rootName, 'No root selected');
  setHomeValue(
    homeProjectState,
    payload.hasProject ? 'Configured Debug80 project' : undefined,
    payload.rootName ? 'No Debug80 project in this root' : 'No root selected'
  );
  setHomeValue(homeTargetName, payload.targetName, 'No target selected');
  setHomeValue(homeEntrySource, payload.entrySource, 'No program file selected');
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
window.addEventListener('resize', () => panelLayout.scheduleMemoryResize());
panelLayout.updateMemoryLayout(false);

window.addEventListener('keydown', event => {
  if (event.repeat) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return;
  }
  if (target && target.isContentEditable) {
    return;
  }
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
});
  
