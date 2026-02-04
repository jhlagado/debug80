import { createDigit } from '../common/digits';
import { MemoryPanel } from '../common/memory-panel';
import { appendSerialText, sendSerialInput } from '../common/serial';
import { acquireVscodeApi } from '../common/vscode';

type PanelTab = 'ui' | 'memory';

const vscode = acquireVscodeApi();
const DEFAULT_TAB: PanelTab = document.body.dataset.activeTab === 'memory' ? 'memory' : 'ui';
const displayEl = document.getElementById('display') as HTMLElement;
const keypadEl = document.getElementById('keypad') as HTMLElement;
const speakerEl = document.getElementById('speaker') as HTMLElement;
const speakerHzEl = document.getElementById('speakerHz') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const muteEl = document.getElementById('mute') as HTMLElement;
const serialOutEl = document.getElementById('serialOut') as HTMLElement;
const serialInputEl = document.getElementById('serialInput') as HTMLInputElement;
const serialSendEl = document.getElementById('serialSend') as HTMLElement;
const serialSendFileEl = document.getElementById('serialSendFile') as HTMLElement;
const serialSaveEl = document.getElementById('serialSave') as HTMLElement;
const serialClearEl = document.getElementById('serialClear') as HTMLElement;
const lcdCanvas = document.getElementById('lcdCanvas') as HTMLCanvasElement | null;
const lcdCtx = lcdCanvas?.getContext('2d') ?? null;
const matrixGrid = document.getElementById('matrixGrid') as HTMLElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanel = document.getElementById('memoryPanel') as HTMLElement;
const SERIAL_MAX = 8000;
const SHIFT_BIT = 0x20;
const DIGITS = 6;
const LCD_COLS = 16;
const LCD_ROWS = 2;
const LCD_CELL_W = 14;
const LCD_CELL_H = 20;
let lcdBytes = new Array(LCD_COLS * LCD_ROWS).fill(0x20);
let matrixRows = new Array(8).fill(0);
const digitEls = [];
for (let i = 0; i < DIGITS; i++) {
  const digit = createDigit();
  digitEls.push(digit);
  displayEl.appendChild(digit);
}

let activeTab: PanelTab = DEFAULT_TAB === 'memory' ? 'memory' : 'ui';
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
let muted = true;
let lastSpeakerOn = false;
let lastSpeakerHz = 0;
let shiftLatched = false;
let audioCtx = null;
let osc = null;
let gain = null;

function applySpeed(mode: string): void {
  speedMode = mode;
  speedEl.textContent = mode.toUpperCase();
  speedEl.classList.toggle('slow', mode === 'slow');
  speedEl.classList.toggle('fast', mode === 'fast');
}

function lcdByteToChar(value: number): string {
  const code = value & 0xff;
  if (code === 0x5c) {
    return '¥';
  }
  if (code === 0x7e) {
    return '▶';
  }
  if (code === 0x7f) {
    return '◀';
  }
  if (code >= 0x20 && code <= 0x7e) {
    return String.fromCharCode(code);
  }
  return ' ';
}

function drawLcd(): void {
  if (!lcdCtx || !lcdCanvas) {
    return;
  }
  lcdCanvas.width = LCD_COLS * LCD_CELL_W;
  lcdCanvas.height = LCD_ROWS * LCD_CELL_H;
  lcdCtx.fillStyle = '#0b1a10';
  lcdCtx.fillRect(0, 0, lcdCanvas.width, lcdCanvas.height);
  lcdCtx.font = '16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  lcdCtx.textBaseline = 'top';
  lcdCtx.fillStyle = '#b4f5b4';
  for (let row = 0; row < LCD_ROWS; row += 1) {
    for (let col = 0; col < LCD_COLS; col += 1) {
      const idx = row * LCD_COLS + col;
      const char = lcdByteToChar(lcdBytes[idx] || 0x20);
      lcdCtx.fillText(char, col * LCD_CELL_W + 2, row * LCD_CELL_H + 2);
    }
  }
}

function buildMatrix(): void {
  if (!matrixGrid) return;
  matrixGrid.innerHTML = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const dot = document.createElement('div');
      dot.className = 'matrix-dot';
      dot.dataset.row = String(row);
      dot.dataset.col = String(col);
      matrixGrid.appendChild(dot);
    }
  }
}

function drawMatrix(): void {
  if (!matrixGrid) return;
  const dots = matrixGrid.querySelectorAll('.matrix-dot');
  dots.forEach(dot => {
    const row = parseInt(dot.dataset.row || '0', 10);
    const col = parseInt(dot.dataset.col || '0', 10);
    const mask = 1 << col;
    if (matrixRows[row] & mask) {
      dot.classList.add('on');
    } else {
      dot.classList.remove('on');
    }
  });
}

function setShiftLatched(value: boolean): void {
  shiftLatched = value;
  shiftButton.classList.toggle('active', shiftLatched);
}

function ensureAudio(): void {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    osc = audioCtx.createOscillator();
    osc.type = 'square';
    gain = audioCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function updateAudio(): void {
  if (!gain || muted || lastSpeakerHz <= 0) {
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
  muted = !muted;
  if (!muted) {
    ensureAudio();
  }
  applyMuteState();
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
      lastSpeakerHz = payload.speakerHz;
    } else {
      speakerHzEl.textContent = '';
      lastSpeakerHz = 0;
    }
  }
  lastSpeakerOn = !!payload.speaker;
  updateAudio();
  if (payload.speedMode === 'slow' || payload.speedMode === 'fast') {
    applySpeed(payload.speedMode);
  }
  if (Array.isArray(payload.lcd)) {
    lcdBytes = payload.lcd.slice(0, LCD_COLS * LCD_ROWS);
    while (lcdBytes.length < LCD_COLS * LCD_ROWS) {
      lcdBytes.push(0x20);
    }
    drawLcd();
  }
  if (Array.isArray(payload.matrix)) {
    matrixRows = payload.matrix.slice(0, 8);
    while (matrixRows.length < 8) {
      matrixRows.push(0);
    }
    drawMatrix();
  }
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

window.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'selectTab') {
    setTab(event.data.tab, false);
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
    if (activeTab === 'memory') {
      memoryPanelController?.requestSnapshot();
    }
    return;
  }
  if (event.data.type === 'serial') {
    appendSerialText(serialOutEl, event.data.text || '', SERIAL_MAX);
    return;
  }
  if (event.data.type === 'serialInit') {
    serialOutEl.textContent = event.data.text || '';
    return;
  }
  if (event.data.type === 'serialClear') {
    serialOutEl.textContent = '';
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
applyMuteState();
drawLcd();
buildMatrix();
drawMatrix();
setTab(DEFAULT_TAB, false);
window.addEventListener('resize', scheduleMemoryResize);
updateMemoryLayout(false);
if (document.activeElement !== serialInputEl) {
  document.getElementById('app').focus();
}

serialSendEl.addEventListener('click', () => {
  sendSerialInput(serialInputEl, vscode);
});
serialInputEl.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    sendSerialInput(serialInputEl, vscode);
    event.preventDefault();
  }
});

serialSendFileEl.addEventListener('click', () => {
  vscode.postMessage({ type: 'serialSendFile' });
});
serialSaveEl.addEventListener('click', () => {
  const text = serialOutEl.textContent || '';
  vscode.postMessage({ type: 'serialSave', text });
});
serialClearEl.addEventListener('click', () => {
  serialOutEl.textContent = '';
  vscode.postMessage({ type: 'serialClear' });
});

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
  
