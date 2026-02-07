import { createDigit } from '../common/digits';
import { MemoryPanel } from '../common/memory-panel';
import { appendSerialText, sendSerialInput } from '../common/serial';
import { acquireVscodeApi } from '../common/vscode';
import { A00 } from './hd44780-a00';
import { ST7920_FONT } from './st7920-font';

type PanelTab = 'ui' | 'memory';

const vscode = acquireVscodeApi();
const DEFAULT_TAB: PanelTab = document.body.dataset.activeTab === 'memory' ? 'memory' : 'ui';
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
const serialOutEl = document.getElementById('serialOut') as HTMLElement;
const serialInputEl = document.getElementById('serialInput') as HTMLInputElement;
const serialSendEl = document.getElementById('serialSend') as HTMLElement;
const serialSendFileEl = document.getElementById('serialSendFile') as HTMLElement;
const serialSaveEl = document.getElementById('serialSave') as HTMLElement;
const serialClearEl = document.getElementById('serialClear') as HTMLElement;
const lcdCanvas = document.getElementById('lcdCanvas') as HTMLCanvasElement | null;
const lcdCtx = lcdCanvas?.getContext('2d') ?? null;
const glcdCanvas = document.getElementById('glcdCanvas') as HTMLCanvasElement | null;
const glcdCtx = glcdCanvas?.getContext('2d') ?? null;
const glcdBaseCanvas = glcdCtx ? document.createElement('canvas') : null;
const glcdBaseCtx = glcdBaseCanvas?.getContext('2d') ?? null;
const matrixGrid = document.getElementById('matrixGrid') as HTMLElement;
const matrixModeToggle = document.getElementById('matrixModeToggle') as HTMLElement;
const matrixModeStatus = document.getElementById('matrixModeStatus') as HTMLElement;
const matrixCapsStatus = document.getElementById('matrixCapsStatus') as HTMLElement;
const matrixKeyboardGrid = document.getElementById('matrixKeyboardGrid') as HTMLElement;
const matrixShift = document.getElementById('matrixShift') as HTMLElement;
const matrixCtrl = document.getElementById('matrixCtrl') as HTMLElement;
const matrixAlt = document.getElementById('matrixAlt') as HTMLElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const uiControls = document.getElementById('uiControls') as HTMLElement;
const uiSectionNodes = Array.from(document.querySelectorAll<HTMLElement>('.ui-section'));
const memoryPanel = document.getElementById('memoryPanel') as HTMLElement;
const SERIAL_MAX = 8000;
const SHIFT_BIT = 0x20;
const DIGITS = 6;
const LCD_COLS = 20;
const LCD_ROWS = 4;
const LCD_BYTES = LCD_COLS * LCD_ROWS;
const GLCD_WIDTH = 128;
const GLCD_HEIGHT = 64;
const GLCD_BYTES = 1024;
let lcdBytes = new Array(LCD_BYTES).fill(0x20);
let lcdCgram = new Array(64).fill(0x00);
let lcdDisplayOn = true;
let lcdCursorOn = false;
let lcdCursorBlink = false;
let lcdCursorAddr = 0x80;
let lcdDisplayShift = 0;
let lcdCursorBlinkVisible = true;
let lcdCursorBlinkTimer = null;
const GLCD_DDRAM_SIZE = 64;
const GLCD_TEXT_COLS = 16;
const GLCD_TEXT_ROWS = 4;
let glcdDdram = new Array(GLCD_DDRAM_SIZE).fill(0x20);
let glcdDisplayOn = true;
let glcdGraphicsOn = true;
let glcdCursorOn = false;
let glcdCursorBlink = false;
let glcdCursorAddr = 0x80;
let glcdCursorPhase = 0;
let glcdTextShift = 0;
let glcdScroll = 0;
let glcdReverseMask = 0;
let glcdBlinkVisible = true;
let glcdBytes = new Array(GLCD_BYTES).fill(0x00);
let sysCtrlSegs = [];
let sysCtrlValue = 0;
let matrixModeEnabled = false;
let capsLockEnabled = false;
const matrixHeldKeys = new Set();
const matrixClickMods = {
  shift: false,
  ctrl: false,
  alt: false,
};
const matrixKeyElements = new Map();
if (glcdBaseCanvas) {
  glcdBaseCanvas.width = GLCD_WIDTH;
  glcdBaseCanvas.height = GLCD_HEIGHT;
}
const glcdImageData =
  glcdBaseCtx && glcdBaseCanvas
    ? glcdBaseCtx.createImageData(GLCD_WIDTH, GLCD_HEIGHT)
    : null;
let matrixRows = new Array(8).fill(0);
const digitEls: HTMLElement[] = [];
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

function resolveMemoryRowSize(width) {
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

function updateMemoryLayout(forceRefresh) {
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

function scheduleMemoryResize() {
  if (resizeTimer !== null) {
    clearTimeout(resizeTimer);
  }
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    updateMemoryLayout(false);
  }, 150);
}

function setTab(tab, notify) {
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

const defaultVisibility = {
  lcd: true,
  display: true,
  keypad: true,
  matrixKeyboard: true,
  matrix: false,
  glcd: false,
  serial: true,
};

function applyVisibility(visibility) {
  uiSectionNodes.forEach((node) => {
    const key = node.dataset.section;
    if (!key) {
      return;
    }
    const enabled = visibility[key] !== false;
    node.classList.toggle('ui-hidden', !enabled);
  });
  if (uiControls) {
    uiControls
      .querySelectorAll('input[type="checkbox"][data-section]')
      .forEach((input) => {
        const key = input.dataset.section;
        if (!key) {
          return;
        }
        input.checked = visibility[key] !== false;
      });
  }
}

function loadVisibility() {
  const stored = vscode.getState();
  const visibility = {
    ...defaultVisibility,
    ...(stored && stored.uiVisibility ? stored.uiVisibility : {}),
  };
  applyVisibility(visibility);
  return visibility;
}

function saveVisibility(visibility) {
  const stored = vscode.getState() || {};
  vscode.setState({ ...stored, uiVisibility: visibility });
}

function applyVisibilityOverride(visibility, persist) {
  if (!visibility || typeof visibility !== 'object') {
    return;
  }
  uiVisibility = { ...defaultVisibility, ...visibility };
  applyVisibility(uiVisibility);
  if (persist) {
    saveVisibility(uiVisibility);
  }
}

let uiVisibility = loadVisibility();

if (uiControls) {
  uiControls.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const key = target.dataset.section;
    if (!key) {
      return;
    }
    uiVisibility = { ...uiVisibility, [key]: target.checked };
    applyVisibility(uiVisibility);
    saveVisibility(uiVisibility);
  });
}

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

let speedMode = 'fast';
let uiRevision = 0;
let muted = true;
let lastSpeakerOn = false;
let lastSpeakerHz = 0;
let shiftLatched = false;
let audioCtx = null;
let osc = null;
let gain = null;

function applySpeed(mode) {
  speedMode = mode;
  speedEl.textContent = mode.toUpperCase();
  speedEl.classList.toggle('slow', mode === 'slow');
  speedEl.classList.toggle('fast', mode === 'fast');
}

function drawLcd() {
  drawLcdBitmap();
}

function drawLcdBitmap() {
  if (!lcdCtx || !lcdCanvas) {
    return;
  }
  const dot = 2;
  const cellW = 5 * dot + 2;
  const cellH = 8 * dot + 2;
  const w = LCD_COLS * cellW;
  const h = LCD_ROWS * cellH;
  lcdCanvas.width = w;
  lcdCanvas.height = h;
  lcdCanvas.style.width = '';
  lcdCanvas.style.height = '';
  const img = lcdCtx.createImageData(w, h);
  const d = img.data;
  const bgR = 11, bgG = 26, bgB = 16;
  const onR = 180, onG = 245, onB = 180;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = bgR; d[i + 1] = bgG; d[i + 2] = bgB; d[i + 3] = 255;
  }
  const cursorVisible = lcdDisplayOn && (lcdCursorOn || (lcdCursorBlink && lcdCursorBlinkVisible));
  const cursorIndex = getLcdIndex(lcdCursorAddr);
  for (let row = 0; row < LCD_ROWS; row++) {
    for (let col = 0; col < LCD_COLS; col++) {
      const srcCol = (col + lcdDisplayShift + LCD_COLS) % LCD_COLS;
      const index = row * LCD_COLS + srcCol;
      const charCode = lcdDisplayOn ? ((lcdBytes[index] || 0x20) & 0xFF) : 0x20;
      const romBase = charCode * 8;
      const ox = col * cellW + 1;
      const oy = row * cellH + 1;
      for (let dy = 0; dy < 8; dy++) {
        let bits = A00[romBase + dy] || 0;
        if (charCode < 0x08) {
          bits = lcdCgram[charCode * 8 + dy] || 0;
        }
        for (let dx = 0; dx < 5; dx++) {
          if (bits & (0x10 >> dx)) {
            const sx = ox + dx * dot;
            const sy = oy + dy * dot;
            for (let py = 0; py < dot; py++) {
              for (let px = 0; px < dot; px++) {
                const idx = ((sy + py) * w + (sx + px)) * 4;
                if (idx >= 0 && idx < d.length - 3) {
                  d[idx] = onR;
                  d[idx + 1] = onG;
                  d[idx + 2] = onB;
                }
              }
            }
          }
        }
      }
      if (cursorVisible && cursorIndex === index) {
        const dy = 7;
        for (let dx = 0; dx < 5; dx++) {
          const sx = ox + dx * dot;
          const sy = oy + dy * dot;
          for (let py = 0; py < dot; py++) {
            for (let px = 0; px < dot; px++) {
              const idx = ((sy + py) * w + (sx + px)) * 4;
              if (idx >= 0 && idx < d.length - 3) {
                d[idx] = onR;
                d[idx + 1] = onG;
                d[idx + 2] = onB;
              }
            }
          }
        }
      }
    }
  }
  lcdCtx.putImageData(img, 0, 0);
}

function getLcdIndex(addr) {
  const masked = addr & 0xFF;
  if (masked >= 0x80 && masked <= 0x93) return masked - 0x80;
  if (masked >= 0xC0 && masked <= 0xD3) return 20 + (masked - 0xC0);
  if (masked >= 0x94 && masked <= 0xA7) return 40 + (masked - 0x94);
  if (masked >= 0xD4 && masked <= 0xE7) return 60 + (masked - 0xD4);
  return -1;
}

function updateLcdCursorBlink() {
  if (lcdCursorBlinkTimer) {
    clearInterval(lcdCursorBlinkTimer);
    lcdCursorBlinkTimer = null;
  }
  lcdCursorBlinkVisible = true;
  if (!lcdCursorBlink) {
    return;
  }
  lcdCursorBlinkTimer = setInterval(() => {
    lcdCursorBlinkVisible = !lcdCursorBlinkVisible;
    drawLcd();
  }, 500);
}

function drawGlcd() {
  if (!glcdCtx || !glcdCanvas || !glcdBaseCtx || !glcdBaseCanvas || !glcdImageData) {
    return;
  }
  const data = glcdImageData.data;
  const onR = 32;
  const onG = 58;
  const onB = 22;
  const offR = 158;
  const offG = 182;
  const offB = 99;
  const scroll = glcdScroll & 0x3f;
  const shift = Math.max(-15, Math.min(15, Math.trunc(glcdTextShift || 0)));
  let ptr = 0;
  if (!glcdDisplayOn) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = offR;
      data[i + 1] = offG;
      data[i + 2] = offB;
      data[i + 3] = 255;
    }
  } else {
    if (glcdGraphicsOn) {
      for (let row = 0; row < GLCD_HEIGHT; row += 1) {
        const srcRow = (row + scroll) & 0x3f;
        for (let colByte = 0; colByte < 16; colByte += 1) {
          const value = glcdBytes[srcRow * 16 + colByte] || 0;
          for (let bit = 0; bit < 8; bit += 1) {
            const on = (value & (0x80 >> bit)) !== 0;
            data[ptr++] = on ? onR : offR;
            data[ptr++] = on ? onG : offG;
            data[ptr++] = on ? onB : offB;
            data[ptr++] = 255;
          }
        }
      }
    } else {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = offR;
        data[i + 1] = offG;
        data[i + 2] = offB;
        data[i + 3] = 255;
      }
    }
    // Overlay DDRAM text layer using ST7920 half-height font (8x16, 16 cols x 4 rows)
    for (let tRow = 0; tRow < GLCD_TEXT_ROWS; tRow++) {
      for (let tCol = 0; tCol < GLCD_TEXT_COLS; tCol++) {
        const memCol = tCol + shift;
        if (memCol < 0 || memCol >= GLCD_TEXT_COLS) {
          continue;
        }
        const ch = glcdDdram[tRow * GLCD_TEXT_COLS + memCol] || 0x20;
        if (ch === 0x20 || ch === 0x00) continue; // skip spaces
        const romBase = (ch & 0x7F) * 16;
        const px0 = tCol * 8;
        const py0 = tRow * 16;
        for (let dy = 0; dy < 16; dy++) {
          const bits = ST7920_FONT[romBase + dy] || 0;
          if (bits === 0) continue;
          for (let dx = 0; dx < 8; dx++) {
            if (bits & (0x80 >> dx)) {
              const px = px0 + dx;
              const py = (py0 + dy - scroll + GLCD_HEIGHT) & 0x3f;
              if (px < GLCD_WIDTH && py < GLCD_HEIGHT) {
                const idx = (py * GLCD_WIDTH + px) * 4;
                if (glcdGraphicsOn) {
                  const isOn =
                    data[idx] === onR && data[idx + 1] === onG && data[idx + 2] === onB;
                  data[idx] = isOn ? offR : onR;
                  data[idx + 1] = isOn ? offG : onG;
                  data[idx + 2] = isOn ? offB : onB;
                } else {
                  data[idx] = onR;
                  data[idx + 1] = onG;
                  data[idx + 2] = onB;
                }
              }
            }
          }
        }
      }
    }
    if (glcdReverseMask) {
      for (let tRow = 0; tRow < GLCD_TEXT_ROWS; tRow++) {
        if ((glcdReverseMask & (1 << tRow)) === 0) continue;
        for (let dy = 0; dy < 16; dy++) {
          const py = (tRow * 16 + dy - scroll + GLCD_HEIGHT) & 0x3f;
          for (let px = 0; px < GLCD_WIDTH; px++) {
            const idx = (py * GLCD_WIDTH + px) * 4;
            const isOn = data[idx] === onR && data[idx + 1] === onG && data[idx + 2] === onB;
            data[idx] = isOn ? offR : onR;
            data[idx + 1] = isOn ? offG : onG;
            data[idx + 2] = isOn ? offB : onB;
          }
        }
      }
    }
    const cursorVisible = glcdCursorOn || (glcdCursorBlink && glcdBlinkVisible);
    if (cursorVisible) {
      const addr = glcdCursorAddr & 0x7f;
      const row = ((addr & 0x10) >> 4) | ((addr & 0x08) >> 2);
      const col = addr & 0x07;
      const memCol = col * 2 + (glcdCursorPhase ? 1 : 0);
      const dispCol = memCol - shift;
      if (dispCol >= 0 && dispCol < GLCD_TEXT_COLS) {
        const px0 = dispCol * 8;
        const py0 = (row * 16 - scroll + GLCD_HEIGHT) & 0x3f;
        const underlineY = (py0 + 15) & 0x3f;
        for (let dx = 0; dx < 8; dx++) {
          const px = px0 + dx;
          if (px >= GLCD_WIDTH) continue;
          const idx = (underlineY * GLCD_WIDTH + px) * 4;
          data[idx] = onR;
          data[idx + 1] = onG;
          data[idx + 2] = onB;
        }
      }
    }
  }
  glcdBaseCtx.putImageData(glcdImageData, 0, 0);
  glcdCtx.imageSmoothingEnabled = false;
  glcdCtx.clearRect(0, 0, glcdCanvas.width, glcdCanvas.height);
  glcdCtx.drawImage(glcdBaseCanvas, 0, 0, glcdCanvas.width, glcdCanvas.height);
}

function buildMatrix() {
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

function drawMatrix() {
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

function setShiftLatched(value) {
  shiftLatched = value;
  shiftButton.classList.toggle('active', shiftLatched);
}

function ensureAudio() {
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

function updateAudio() {
  if (!gain || muted || lastSpeakerHz <= 0) {
    if (gain) {
      gain.gain.value = 0;
    }
    return;
  }
  osc.frequency.setValueAtTime(lastSpeakerHz, audioCtx.currentTime);
  gain.gain.setTargetAtTime(0.15, audioCtx.currentTime, 0.01);
}

function applyMuteState() {
  muteEl.textContent = muted ? 'MUTED' : 'SOUND';
  if (muted && gain) {
    gain.gain.value = 0;
  }
  updateAudio();
}

function sendKey(code) {
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

function addButton(label, action, className, col, row, isLongLabel) {
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

function addSysCtrlBar(col, row, rowSpan) {
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

function updateSysCtrl() {
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

function updateStatusLeds() {
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

function applyMatrixMode(enabled) {
  matrixModeEnabled = !!enabled;
  if (matrixModeToggle) {
    matrixModeToggle.classList.toggle('active', matrixModeEnabled);
  }
  if (matrixModeStatus) {
    matrixModeStatus.textContent = matrixModeEnabled ? 'ON' : 'OFF';
    matrixModeStatus.classList.toggle('on', matrixModeEnabled);
  }
}

function applyCapsLock(enabled) {
  capsLockEnabled = !!enabled;
  if (matrixCapsStatus) {
    matrixCapsStatus.classList.toggle('on', capsLockEnabled);
  }
}

function shouldIgnoreKeyEvent(event) {
  const target = event.target;
  return (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  );
}

function setMatrixKeyPressed(key, pressed) {
  if (!key) {
    return;
  }
  const direct = matrixKeyElements.get(key);
  const fallback =
    key.length === 1 ? matrixKeyElements.get(key.toLowerCase()) : undefined;
  const el = direct ?? fallback;
  if (el) {
    el.classList.toggle('pressed', pressed);
  }
}

function sendMatrixKey(key, pressed, mods) {
  const keyId =
    key + '|' + (mods.shift ? '1' : '0') + (mods.ctrl ? '1' : '0') + (mods.alt ? '1' : '0');
  if (pressed) {
    if (matrixHeldKeys.has(keyId)) {
      return true;
    }
    matrixHeldKeys.add(keyId);
  } else {
    if (!matrixHeldKeys.has(keyId)) {
      return false;
    }
    matrixHeldKeys.delete(keyId);
  }
  vscode.postMessage({
    type: 'matrixKey',
    key: key,
    pressed: !!pressed,
    shift: mods.shift,
    ctrl: mods.ctrl,
    alt: mods.alt,
  });
  return true;
}

function handleMatrixKeyEvent(event, pressed) {
  if (!matrixModeEnabled || activeTab !== 'ui' || shouldIgnoreKeyEvent(event)) {
    return false;
  }
  const key = event.key;
  if (!key) {
    return false;
  }
  if (pressed && event.repeat) {
    return true;
  }
  setMatrixKeyPressed(key, pressed);
  if (key.length === 1 && key !== key.toLowerCase()) {
    setMatrixKeyPressed(key.toLowerCase(), pressed);
  }
  sendMatrixKey(key, pressed, {
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
  });
  return true;
}

function setMatrixMod(mod, active) {
  matrixClickMods[mod] = active;
  const el = mod === 'shift' ? matrixShift : mod === 'ctrl' ? matrixCtrl : matrixAlt;
  if (el) {
    el.classList.toggle('active', active);
  }
}

function toggleMatrixMod(mod) {
  setMatrixMod(mod, !matrixClickMods[mod]);
}

function buildMatrixKeyboard() {
  if (!matrixKeyboardGrid) {
    return;
  }
  const rows = [
    ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
    ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\\\'],
    ['Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'],
    ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'Shift'],
    ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl'],
  ];
  const spans = {
    Backspace: 2,
    Tab: 2,
    Caps: 2,
    Enter: 2,
    Shift: 2,
    Ctrl: 2,
    Alt: 2,
    Space: 6,
  };
  matrixKeyboardGrid.innerHTML = '';
  rows.forEach((row) => {
    row.forEach((label) => {
      const keyEl = document.createElement('div');
      keyEl.className = 'matrix-key' + (spans[label] ? ' wide' : '');
      const span = spans[label] ?? 1;
      keyEl.style.gridColumn = 'span ' + span;
      keyEl.textContent = label;
      const keyValue =
        label === 'Space'
          ? ' '
          : label === 'Backspace'
          ? 'Backspace'
          : label === 'Enter'
          ? 'Enter'
          : label === 'Esc'
          ? 'Escape'
          : label === 'Tab'
          ? 'Tab'
          : label === 'Caps'
          ? 'CapsLock'
          : label === 'Shift'
          ? 'Shift'
          : label === 'Ctrl'
          ? 'Control'
          : label === 'Alt'
          ? 'Alt'
          : label;
      keyEl.dataset.key = keyValue;
      if (keyValue !== 'Shift' && keyValue !== 'Control' && keyValue !== 'Alt' && keyValue !== 'CapsLock') {
        matrixKeyElements.set(keyValue, keyEl);
      }
      keyEl.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (!matrixModeEnabled || activeTab !== 'ui') {
          return;
        }
        if (keyValue === 'Shift') {
          toggleMatrixMod('shift');
          return;
        }
        if (keyValue === 'Control') {
          toggleMatrixMod('ctrl');
          return;
        }
        if (keyValue === 'Alt') {
          toggleMatrixMod('alt');
          return;
        }
        setMatrixKeyPressed(keyValue, true);
        sendMatrixKey(keyValue, true, matrixClickMods);
      });
      const release = () => {
        if (keyValue === 'Shift' || keyValue === 'Control' || keyValue === 'Alt') {
          return;
        }
        setMatrixKeyPressed(keyValue, false);
        sendMatrixKey(keyValue, false, matrixClickMods);
      };
      keyEl.addEventListener('mouseup', release);
      keyEl.addEventListener('mouseleave', release);
      matrixKeyboardGrid.appendChild(keyEl);
    });
  });
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
if (matrixModeToggle) {
  matrixModeToggle.addEventListener('click', () => {
    const next = !matrixModeEnabled;
    applyMatrixMode(next);
    vscode.postMessage({ type: 'matrixMode', enabled: next });
  });
}
if (matrixShift) {
  matrixShift.addEventListener('click', () => toggleMatrixMod('shift'));
}
if (matrixCtrl) {
  matrixCtrl.addEventListener('click', () => toggleMatrixMod('ctrl'));
}
if (matrixAlt) {
  matrixAlt.addEventListener('click', () => toggleMatrixMod('alt'));
}
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

function updateDigit(el, value) {
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

function applyUpdate(payload) {
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
  if (Array.isArray(data.lcd)) {
    lcdBytes = data.lcd.slice(0, LCD_BYTES);
    while (lcdBytes.length < LCD_BYTES) {
      lcdBytes.push(0x20);
    }
    drawLcd();
  }
  if (Array.isArray(data.lcdCgram)) {
    lcdCgram = data.lcdCgram.slice(0, 64);
    while (lcdCgram.length < 64) {
      lcdCgram.push(0x00);
    }
    drawLcd();
  }
  if (data.lcdState && typeof data.lcdState === 'object') {
    if (typeof data.lcdState.displayOn === 'boolean') {
      lcdDisplayOn = data.lcdState.displayOn;
    }
    if (typeof data.lcdState.cursorOn === 'boolean') {
      lcdCursorOn = data.lcdState.cursorOn;
    }
    if (typeof data.lcdState.cursorBlink === 'boolean') {
      lcdCursorBlink = data.lcdState.cursorBlink;
    }
    if (typeof data.lcdState.cursorAddr === 'number') {
      lcdCursorAddr = data.lcdState.cursorAddr & 0xFF;
    }
    if (typeof data.lcdState.displayShift === 'number') {
      const shift = Math.trunc(data.lcdState.displayShift || 0);
      lcdDisplayShift = ((shift % LCD_COLS) + LCD_COLS) % LCD_COLS;
    }
    updateLcdCursorBlink();
    drawLcd();
  }
  if (Array.isArray(data.matrix)) {
    matrixRows = data.matrix.slice(0, 8);
    while (matrixRows.length < 8) {
      matrixRows.push(0);
    }
    drawMatrix();
  }
  if (typeof data.sysCtrl === 'number') {
    sysCtrlValue = data.sysCtrl & 0xff;
    updateSysCtrl();
    updateStatusLeds();
  }
  if (typeof data.capsLock === 'boolean') {
    applyCapsLock(data.capsLock);
  }
  if (typeof data.matrixMode === 'boolean') {
    applyMatrixMode(data.matrixMode);
  }
  if (Array.isArray(data.glcdDdram)) {
    glcdDdram = data.glcdDdram.slice(0, GLCD_DDRAM_SIZE);
    while (glcdDdram.length < GLCD_DDRAM_SIZE) {
      glcdDdram.push(0x20);
    }
  }
  if (data.glcdState && typeof data.glcdState === 'object') {
    if (typeof data.glcdState.displayOn === 'boolean') {
      glcdDisplayOn = data.glcdState.displayOn;
    }
    if (typeof data.glcdState.graphicsOn === 'boolean') {
      glcdGraphicsOn = data.glcdState.graphicsOn;
    }
    if (typeof data.glcdState.cursorOn === 'boolean') {
      glcdCursorOn = data.glcdState.cursorOn;
    }
    if (typeof data.glcdState.cursorBlink === 'boolean') {
      glcdCursorBlink = data.glcdState.cursorBlink;
    }
    if (typeof data.glcdState.blinkVisible === 'boolean') {
      glcdBlinkVisible = data.glcdState.blinkVisible;
    }
    if (typeof data.glcdState.ddramAddr === 'number') {
      glcdCursorAddr = data.glcdState.ddramAddr & 0xFF;
    }
    if (typeof data.glcdState.ddramPhase === 'number') {
      glcdCursorPhase = data.glcdState.ddramPhase ? 1 : 0;
    }
    if (typeof data.glcdState.textShift === 'number') {
      glcdTextShift = data.glcdState.textShift;
    }
    if (typeof data.glcdState.scroll === 'number') {
      glcdScroll = data.glcdState.scroll & 0x3F;
    }
    if (typeof data.glcdState.reverseMask === 'number') {
      glcdReverseMask = data.glcdState.reverseMask & 0x0F;
    }
  }
  if (Array.isArray(data.glcd)) {
    glcdBytes = data.glcd.slice(0, GLCD_BYTES);
    while (glcdBytes.length < GLCD_BYTES) {
      glcdBytes.push(0);
    }
  }
  drawGlcd();
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
  if (event.data.type === 'uiVisibility') {
    applyVisibilityOverride(event.data.visibility, event.data.persist === true);
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
applyMatrixMode(matrixModeEnabled);
buildMatrixKeyboard();
applyCapsLock(capsLockEnabled);
drawLcd();
buildMatrix();
drawMatrix();
drawGlcd();
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
  if (handleMatrixKeyEvent(event, true)) {
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
  if (handleMatrixKeyEvent(event, false)) {
    event.preventDefault();
  }
});
  
