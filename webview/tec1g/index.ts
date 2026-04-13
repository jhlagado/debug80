import { createDigit } from '../common/digits';
import { MemoryPanel } from '../common/memory-panel';
import { createSessionStatusController, type SessionStatus } from '../common/session-status';
import { createProjectRootButtonController } from '../common/project-root-button';
import { acquireVscodeApi } from '../common/vscode';
import { createGlcdRenderer } from './glcd-renderer';
import { createLcdRenderer } from './lcd-renderer';
import { createMatrixUiController } from './matrix-ui';
import { wireTec1gSerialUi } from './serial-ui';
import { createVisibilityController } from './visibility-controller';

type PanelTab = 'ui' | 'memory';
type SpeedMode = 'slow' | 'fast';
type AudioContextCtor = typeof AudioContext;

type Tec1gUpdatePayload = {
  digits?: number[];
  matrix?: number[];
  matrixGreen?: number[];
  matrixBlue?: number[];
  matrixBrightness?: number[];
  matrixBrightnessG?: number[];
  matrixBrightnessB?: number[];
  matrixMode?: boolean;
  glcd?: number[];
  glcdDdram?: number[];
  glcdState?: {
    displayOn?: boolean;
    graphicsOn?: boolean;
    cursorOn?: boolean;
    cursorBlink?: boolean;
    blinkVisible?: boolean;
    ddramAddr?: number;
    ddramPhase?: number;
    textShift?: number;
    scroll?: number;
    reverseMask?: number;
  };
  speaker?: boolean | number;
  speakerHz?: number;
  speedMode?: SpeedMode;
  sysCtrl?: number;
  bankA14?: boolean;
  capsLock?: boolean;
  lcdState?: {
    displayOn?: boolean;
    cursorOn?: boolean;
    cursorBlink?: boolean;
    cursorAddr?: number;
    displayShift?: number;
  };
  lcdCgram?: number[];
  lcd?: number[];
};

type MemorySnapshotPayload = {
  symbols?: Array<{ name: string; address: number }>;
  registers?: Record<string, number | string | undefined>;
  running?: boolean;
  views?: Array<{
    id: string;
    address?: number;
    start: number;
    bytes: number[];
    focus?: number;
    symbol?: string;
    symbolOffset?: number;
  }>;
};

type ProjectRootOption = {
  name: string;
  path: string;
  hasProject: boolean;
};

type ProjectTargetOption = {
  name: string;
  description?: string;
  detail?: string;
};

type IncomingMessage =
  | { type: 'selectTab'; tab: string }
  | { type: 'sessionStatus'; status: SessionStatus }
  | {
      type: 'projectStatus';
      rootName?: string;
      rootPath?: string;
      hasProject?: boolean;
      targetName?: string;
      entrySource?: string;
      roots: ProjectRootOption[];
      targets: ProjectTargetOption[];
    }
  | { type: 'uiVisibility'; visibility: Record<string, boolean>; persist?: boolean }
  | ({ type: 'update'; uiRevision?: number } & Tec1gUpdatePayload)
  | ({ type: 'snapshot' } & MemorySnapshotPayload)
  | { type: 'snapshotError'; message?: string };

const vscode = acquireVscodeApi();
const DEFAULT_TAB: PanelTab =
  document.body.dataset.activeTab === 'memory'
    ? 'memory'
    : 'ui';
const selectProjectButton = document.getElementById('selectProject') as HTMLButtonElement | null;
const createProjectButton = document.getElementById('createProject') as HTMLButtonElement | null;
const configureProjectButton = document.getElementById('configureProject') as HTMLButtonElement | null;
const setupCard = document.getElementById('setupCard') as HTMLElement | null;
const setupCardText = document.getElementById('setupCardText') as HTMLElement | null;
const setupPrimaryAction = document.getElementById('setupPrimaryAction') as HTMLButtonElement | null;
const setupSecondaryAction = document.getElementById('setupSecondaryAction') as HTMLButtonElement | null;
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
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanel = document.getElementById('memoryPanel') as HTMLElement;
const SHIFT_BIT = 0x20;
const DIGITS = 6;
let sysCtrlSegs: HTMLElement[] = [];
let sysCtrlValue = 0;
let currentRootPath = '';
let currentRoots: Array<{ name: string; path: string; hasProject: boolean }> = [];
let currentTargetCount = 0;
const digitEls: HTMLElement[] = [];
const sessionStatusController = createSessionStatusController(vscode, sessionStatusButton);
for (let i = 0; i < DIGITS; i++) {
  const digit = createDigit();
  digitEls.push(digit);
  displayEl.appendChild(digit);
}

let activeTab: PanelTab =
  DEFAULT_TAB === 'memory' ? 'memory' : 'ui';
const glcdRenderer = createGlcdRenderer();
const lcdRenderer = createLcdRenderer();
const matrixUi = createMatrixUiController(vscode, () => activeTab === 'ui');
const visibilityController = createVisibilityController(vscode);
let memoryRowSize = 16;
let resizeTimer: number | null = null;
let memoryPanelController: MemoryPanel | null = null;
const MEMORY_NARROW_MAX = 480;
const MEMORY_WIDE_MIN = 520;

function resolveMemoryRowSize(width: number): number {
  if (!Number.isFinite(width)) {
    return memoryRowSize;
  }
  if (width <= MEMORY_NARROW_MAX) {
    return 8;
  }
  if (width >= MEMORY_WIDE_MIN) {
    return 16;
  }
  return memoryRowSize;
}

function updateMemoryLayout(forceRefresh: boolean): void {
  if (activeTab !== 'memory') {
    return;
  }
  if (!memoryPanel) {
    return;
  }
  const next = resolveMemoryRowSize(memoryPanel.clientWidth);
  if (next !== memoryRowSize) {
    memoryRowSize = next;
    memoryPanelController?.requestSnapshot();
    return;
  }
  if (forceRefresh) {
    memoryPanelController?.requestSnapshot();
  }
}

function scheduleMemoryResize(): void {
  if (resizeTimer !== null) {
    clearTimeout(resizeTimer);
  }
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    updateMemoryLayout(false);
  }, 150);
}

function setTab(tab: string, notify: boolean): void {
  activeTab = tab === 'memory' ? 'memory' : 'ui';
  if (panelUi) {
    panelUi.classList.toggle('active', activeTab === 'ui');
  }
  if (panelMemory) {
    panelMemory.classList.toggle('active', activeTab === 'memory');
  }
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle('active', isActive);
  });
  if (notify) {
    vscode.postMessage({ type: 'tab', tab: activeTab });
  }
  if (activeTab === 'memory') {
    updateMemoryLayout(true);
  }
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    if (!tab) {
      return;
    }
    setTab(tab, true);
  });
});

const keyMap = {
  '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
  '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
  'A': 0x0A, 'B': 0x0B, 'C': 0x0C, 'D': 0x0D, 'E': 0x0E, 'F': 0x0F,
  'AD': 0x13, 'RIGHT': 0x10, 'GO': 0x12, 'LEFT': 0x11
};

const controlOrder = ['AD', 'GO', 'LEFT', 'RIGHT'];
const controlLabels = {
  AD: 'AD',
  GO: 'GO',
  LEFT: '◀',
  RIGHT: '▶',
};
const hexOrder = [
  'C', 'D', 'E', 'F',
  '8', '9', 'A', 'B',
  '4', '5', '6', '7',
  '0', '1', '2', '3'
];

let speedMode: SpeedMode = 'fast';
let uiRevision = 0;
let muted = true;
let lastSpeakerOn = false;
let lastSpeakerHz = 0;
let shiftLatched = false;
let audioCtx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;
const projectRootController = createProjectRootButtonController(
  vscode,
  selectProjectButton,
  createProjectButton
);

configureProjectButton?.addEventListener('click', () => {
  vscode.postMessage({ type: 'configureProject' });
});

setupPrimaryAction?.addEventListener('click', () => {
  const selected = currentRoots.find((root) => root.path === currentRootPath) ?? currentRoots[0];
  if (selected === undefined) {
    vscode.postMessage({ type: 'openWorkspaceFolder' });
    return;
  }
  if (!selected.hasProject) {
    vscode.postMessage({ type: 'createProject', rootPath: selected.path });
    return;
  }
  if (currentTargetCount === 0) {
    vscode.postMessage({ type: 'configureProject' });
    return;
  }
  vscode.postMessage({ type: 'startDebug' });
});

setupSecondaryAction?.addEventListener('click', () => {
  vscode.postMessage({ type: 'configureProject' });
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

function setTargetOptions(options: ProjectTargetOption[], selectedTargetName?: string): void {
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
  rootPath?: string;
  roots?: ProjectRootOption[];
  targets?: ProjectTargetOption[];
  targetName?: string;
}): void {
  currentRootPath = payload.rootPath ?? '';
  currentRoots = payload.roots ?? [];
  projectRootController.applyProjectStatus({
    rootPath: payload.rootPath,
    roots: payload.roots ?? [],
    targetCount: payload.targets?.length ?? 0,
  });
  setTargetOptions(payload.targets ?? [], payload.targetName);
  const selected = currentRoots.find((root) => root.path === currentRootPath) ?? currentRoots[0];
  const targetCount = payload.targets?.length ?? 0;
  currentTargetCount = targetCount;
  if (configureProjectButton) {
    configureProjectButton.hidden = selected?.hasProject !== true;
  }
  if (!setupCard || !setupCardText || !setupPrimaryAction || !setupSecondaryAction) {
    return;
  }
  setupCard.hidden = false;
  if (selected === undefined) {
    setupCardText.textContent = 'No workspace folder is open. Open a folder to start with Debug80.';
    setupPrimaryAction.textContent = 'Open Folder';
    setupSecondaryAction.hidden = true;
    return;
  }
  if (!selected.hasProject) {
    setupCardText.textContent = `No Debug80 project found in ${selected.name}.`;
    setupPrimaryAction.textContent = 'Create Project';
    setupSecondaryAction.hidden = true;
    return;
  }
  if (targetCount === 0) {
    setupCardText.textContent = 'Project has no targets configured yet.';
    setupPrimaryAction.textContent = 'Configure Project';
    setupSecondaryAction.hidden = true;
    return;
  }
  setupCardText.textContent = 'Project is configured. Start debugging or adjust settings.';
  setupPrimaryAction.textContent = 'Start Debugging';
  setupSecondaryAction.hidden = false;
  setupSecondaryAction.textContent = 'Configure';
}

applyProjectStatus({});

function applySpeed(mode: SpeedMode): void {
  speedMode = mode;
  speedEl.textContent = mode.toUpperCase();
  speedEl.classList.toggle('slow', mode === 'slow');
  speedEl.classList.toggle('fast', mode === 'fast');
}

function setShiftLatched(value: boolean): void {
  shiftLatched = value;
  shiftButton.classList.toggle('active', shiftLatched);
}

function ensureAudio(): void {
  if (!audioCtx) {
    const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctx) {
      return;
    }
    audioCtx = new Ctx();
    osc = audioCtx.createOscillator();
    osc.type = 'square';
    gain = audioCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
}

function updateAudio(): void {
  if (!audioCtx || !osc || !gain || muted || lastSpeakerHz <= 0) {
    if (gain) {
      gain.gain.value = 0;
    }
    return;
  }
  osc.frequency.setValueAtTime(lastSpeakerHz, audioCtx.currentTime);
  gain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.01);
}

function applyMuteState(): void {
  muteEl.textContent = muted ? 'MUTED' : 'SOUND';
  if (muted && gain) {
    gain.gain.value = 0;
  }
  updateAudio();
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

function addButton(
  label: string,
  action: () => void,
  className: string | undefined,
  col: number | undefined,
  row: number | undefined,
  isLongLabel: boolean,
): HTMLDivElement {
  const button = document.createElement('div');
  button.className = className ? 'keycap ' + className : 'keycap';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'label ' + (isLongLabel ? 'long' : 'short');
  labelSpan.textContent = label;
  button.appendChild(labelSpan);
  if (col) {
    button.style.gridColumn = String(col);
  }
  if (row) {
    button.style.gridRow = String(row);
  }
  button.addEventListener('click', action);
  keypadEl.appendChild(button);
  return button;
}

function addSysCtrlBar(col: number, row: number, rowSpan?: number): void {
  const bar = document.createElement('div');
  bar.className = 'sysctrl';
  for (let i = 0; i < 8; i += 1) {
    const seg = document.createElement('div');
    seg.className = 'sysctrl-seg';
    bar.appendChild(seg);
  }
  bar.style.gridColumn = String(col);
  bar.style.gridRow = rowSpan ? row + ' / span ' + rowSpan : String(row);
  keypadEl.appendChild(bar);
  sysCtrlSegs = Array.from(bar.querySelectorAll('.sysctrl-seg'));
}

function updateSysCtrl(): void {
  if (!sysCtrlSegs.length) {
    return;
  }
  for (let i = 0; i < 8; i += 1) {
    const on = (sysCtrlValue & (1 << i)) !== 0;
    const seg = sysCtrlSegs[7 - i];
    if (seg) {
      seg.classList.toggle('on', on);
    }
  }
}

function updateStatusLeds(): void {
  const shadowOn = (sysCtrlValue & 0x01) === 0;
  const protectOn = (sysCtrlValue & 0x02) !== 0;
  const expandOn = (sysCtrlValue & 0x04) !== 0;
  const capsOn = (sysCtrlValue & 0x20) !== 0;
  if (statusShadow) {
    statusShadow.classList.toggle('on', shadowOn);
  }
  if (statusProtect) {
    statusProtect.classList.toggle('on', protectOn);
  }
  if (statusExpand) {
    statusExpand.classList.toggle('on', expandOn);
  }
  if (statusCaps) {
    statusCaps.classList.toggle('on', capsOn);
  }
}

addButton('RESET', () => {
  setShiftLatched(false);
  vscode.postMessage({ type: 'reset' });
}, 'keycap-light', 1, 1, true);
addSysCtrlBar(1, 2, 2);

for (let row = 0; row < 4; row += 1) {
  const control = controlOrder[row];
  const rowNum = row + 1;
  const controlLabel = controlLabels[control] ?? control;
  const isLong = controlLabel.length > 1;
  addButton(controlLabel, () => sendKey(keyMap[control]), 'keycap-light', 2, rowNum, isLong);
  const rowStart = row * 4;
  for (let col = 0; col < 4; col += 1) {
    const label = hexOrder[rowStart + col];
    addButton(label, () => sendKey(keyMap[label]), 'keycap-cream', 3 + col, rowNum, false);
  }
}

const shiftButton = addButton('FN', () => {
  setShiftLatched(!shiftLatched);
}, 'keycap-light', 1, 4, true);
speedEl.addEventListener('click', () => {
  const next = speedMode === 'fast' ? 'slow' : 'fast';
  applySpeed(next);
  vscode.postMessage({ type: 'speed', mode: next });
});
muteEl.addEventListener('click', () => {
  muted = !muted;
  if (!muted) {
    ensureAudio();
  }
  applyMuteState();
});

function updateDigit(el: HTMLElement, value: number): void {
  const segments = el.querySelectorAll('[data-mask]');
  segments.forEach((seg) => {
    const mask = parseInt(seg.dataset.mask || '0', 10);
    if (value & mask) {
      seg.classList.add('on');
    } else {
      seg.classList.remove('on');
    }
  });
}

function applyUpdate(payload: Tec1gUpdatePayload | null | undefined): void {
  if (!payload || typeof payload !== 'object') {
    return;
  }
  const data = payload;
  const digits = Array.isArray(data.digits) ? data.digits : [];
  digitEls.forEach((el, idx) => {
    updateDigit(el, digits[idx] || 0);
  });
  if (data.speaker) {
    speakerEl.classList.add('on');
  } else {
    speakerEl.classList.remove('on');
  }
  if (speakerLabel) {
    if (typeof data.speakerHz === 'number' && data.speakerHz > 0) {
      speakerLabel.textContent = data.speakerHz + ' Hz';
      lastSpeakerHz = data.speakerHz;
    } else {
      speakerLabel.textContent = 'SPEAKER';
      lastSpeakerHz = 0;
    }
  }
  lastSpeakerOn = !!data.speaker;
  updateAudio();
  if (data.speedMode === 'slow' || data.speedMode === 'fast') {
    applySpeed(data.speedMode);
  }
  lcdRenderer.applyLcdUpdate(data);
  if (Array.isArray(data.matrix)) {
    matrixUi.applyMatrixRows(data.matrix);
  }
  if (Array.isArray(data.matrixGreen)) {
    matrixUi.applyMatrixGreenRows(data.matrixGreen);
  }
  if (Array.isArray(data.matrixBlue)) {
    matrixUi.applyMatrixBlueRows(data.matrixBlue);
  }
  if (Array.isArray(data.matrixBrightness)) {
    matrixUi.applyMatrixBrightness(
      data.matrixBrightness,
      Array.isArray(data.matrixBrightnessG) ? data.matrixBrightnessG : undefined,
      Array.isArray(data.matrixBrightnessB) ? data.matrixBrightnessB : undefined
    );
  }
  if (typeof data.sysCtrl === 'number') {
    sysCtrlValue = data.sysCtrl & 0xff;
    updateSysCtrl();
    updateStatusLeds();
  }
  if (typeof data.capsLock === 'boolean') {
    matrixUi.applyCapsLock(data.capsLock);
  }
  if (typeof data.matrixMode === 'boolean') {
    matrixUi.applyMatrixMode(data.matrixMode);
  }
  glcdRenderer.applyGlcdUpdate(data);
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
  getRowSize: () => memoryRowSize,
  isActive: () => activeTab === 'memory',
});
memoryPanelController.wire();

window.addEventListener('message', (event: MessageEvent<IncomingMessage | undefined>): void => {
  const message = event.data;
  if (!message) {
    return;
  }
  if (message.type === 'projectStatus') {
    applyProjectStatus(message);
    return;
  }
  if (message.type === 'sessionStatus') {
    sessionStatusController.setStatus(message.status);
    return;
  }
  if (message.type === 'selectTab') {
    setTab(message.tab, false);
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
    applyUpdate(message);
    if (activeTab === 'memory') {
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
applyMuteState();
matrixUi.init();
visibilityController.wire();
lcdRenderer.draw();
glcdRenderer.draw();
setTab(DEFAULT_TAB, false);
sessionStatusController.setStatus('not running');
window.addEventListener('resize', scheduleMemoryResize);
updateMemoryLayout(false);
wireTec1gSerialUi(vscode);

window.addEventListener('keydown', event => {
  if (event.repeat) return;
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
  if (keyMap[key] !== undefined) {
    sendKey(keyMap[key]);
    event.preventDefault();
    return;
  }
  if (event.key === 'Enter') {
    sendKey(0x12);
    event.preventDefault();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    sendKey(0x11);
    event.preventDefault();
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    sendKey(0x10);
    event.preventDefault();
  } else if (event.key === 'Tab') {
    sendKey(0x13);
    event.preventDefault();
  }
});
window.addEventListener('keyup', event => {
  if (matrixUi.handleKeyEvent(event, false)) {
    event.preventDefault();
  }
});
window.addEventListener('beforeunload', () => {
  sessionStatusController.dispose();
  projectRootController.dispose();
});
  
