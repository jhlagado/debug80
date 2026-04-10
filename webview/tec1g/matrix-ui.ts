export interface MatrixUiController {
  applyMatrixRows(rows: number[]): void;
  applyMatrixGreenRows(rows: number[]): void;
  applyMatrixBlueRows(rows: number[]): void;
  applyMatrixBrightness(levels: number[], green?: number[], blue?: number[]): void;
  applyCapsLock(enabled: boolean): void;
  applyMatrixMode(enabled: boolean): void;
  handleKeyEvent(event: KeyboardEvent, pressed: boolean): boolean;
  init(): void;
}

interface VscodeApi {
  postMessage(message: unknown): void;
}

export function createMatrixUiController(
  vscode: VscodeApi,
  isUiTabActive: () => boolean,
): MatrixUiController {
  const matrixGrid = document.getElementById('matrixGrid') as HTMLElement;
  const matrixModeToggle = document.getElementById('matrixModeToggle') as HTMLElement;
  const matrixModeStatus = document.getElementById('matrixModeStatus') as HTMLElement;
  const matrixCapsStatus = document.getElementById('matrixCapsStatus') as HTMLElement;
  const matrixKeyboardGrid = document.getElementById('matrixKeyboardGrid') as HTMLElement;
  const matrixShift = document.getElementById('matrixShift') as HTMLElement;
  const matrixCtrl = document.getElementById('matrixCtrl') as HTMLElement;
  const matrixAlt = document.getElementById('matrixAlt') as HTMLElement;

  let matrixModeEnabled = false;
  let capsLockEnabled = false;
  const matrixHeldKeys = new Set<string>();
  const matrixClickMods = {
    shift: false,
    ctrl: false,
    alt: false,
  };
  const matrixKeyElements = new Map<string, HTMLElement>();
  let matrixRedRows = new Array(8).fill(0);
  let matrixGreenRows = new Array(8).fill(0);
  let matrixBlueRows = new Array(8).fill(0);
  let matrixBrightnessR = new Array(64).fill(0);
  let matrixBrightnessG = new Array(64).fill(0);
  let matrixBrightnessB = new Array(64).fill(0);
  /** After the first brightness payload, prefer per-pixel RGB (latched commits) over row planes. */
  let hasMatrixBrightness = false;

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

  /**
   * Maps emulated 0–255 drive to display values so lit pixels read closer to bright
   * LED signage (lift shadows, slight gamma) without clipping white mixes.
   */
  function ledEmissionChannel(raw: number): number {
    if (raw <= 0) {
      return 0;
    }
    const t = raw / 255;
    const gamma = Math.pow(t, 0.82);
    return Math.min(255, Math.round(255 * gamma + 10 * t));
  }

  function drawMatrix() {
    if (!matrixGrid) return;
    const dots = matrixGrid.querySelectorAll('.matrix-dot');
    dots.forEach(dot => {
      const row = parseInt((dot as HTMLElement).dataset.row || '0', 10);
      const col = parseInt((dot as HTMLElement).dataset.col || '0', 10);
      const mask = 1 << col;
      const idx = row * 8 + col;
      let br: number;
      let bg: number;
      let bb: number;
      if (hasMatrixBrightness) {
        br = matrixBrightnessR[idx] ?? 0;
        bg = matrixBrightnessG[idx] ?? 0;
        bb = matrixBrightnessB[idx] ?? 0;
      } else {
        br = (matrixRedRows[row] & mask) !== 0 ? 255 : 0;
        bg = (matrixGreenRows[row] & mask) !== 0 ? 255 : 0;
        bb = (matrixBlueRows[row] & mask) !== 0 ? 255 : 0;
      }
      const er = ledEmissionChannel(br);
      const eg = ledEmissionChannel(bg);
      const eb = ledEmissionChannel(bb);
      const level = Math.max(er, eg, eb);
      const el = dot as HTMLElement;
      el.style.setProperty('--matrix-r', (er / 255).toFixed(3));
      el.style.setProperty('--matrix-g', (eg / 255).toFixed(3));
      el.style.setProperty('--matrix-b', (eb / 255).toFixed(3));
      el.style.setProperty('--matrix-level', (level / 255).toFixed(3));
      if (level > 0) {
        dot.classList.add('on');
      } else {
        dot.classList.remove('on');
      }
    });
  }

  function applyMatrixBrightness(levels: number[], green?: number[], blue?: number[]) {
    hasMatrixBrightness = true;
    const pad64 = (source: number[] | undefined, fill: number): number[] =>
      Array.from({ length: 64 }, (_, index) => {
        const value = source?.[index];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return fill;
        }
        return Math.max(0, Math.min(255, Math.trunc(value)));
      });
    matrixBrightnessR = pad64(levels, 0);
    if (green !== undefined || blue !== undefined) {
      matrixBrightnessG = pad64(green, 0);
      matrixBrightnessB = pad64(blue, 0);
    } else {
      matrixBrightnessG = new Array(64).fill(0);
      matrixBrightnessB = new Array(64).fill(0);
    }
    drawMatrix();
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

  function handleKeyEvent(event: KeyboardEvent, pressed: boolean): boolean {
    if (!matrixModeEnabled || !isUiTabActive() || shouldIgnoreKeyEvent(event)) {
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
          if (!matrixModeEnabled || !isUiTabActive()) {
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

  function init() {
    buildMatrix();
    drawMatrix();
    buildMatrixKeyboard();
    applyMatrixMode(matrixModeEnabled);
    applyCapsLock(capsLockEnabled);
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
  }

  function padRowPlane(rows: number[]): number[] {
    const next = rows.slice(0, 8);
    while (next.length < 8) {
      next.push(0);
    }
    return next;
  }

  return {
    applyMatrixRows(rows: number[]) {
      matrixRedRows = padRowPlane(rows);
      drawMatrix();
    },
    applyMatrixGreenRows(rows: number[]) {
      matrixGreenRows = padRowPlane(rows);
      drawMatrix();
    },
    applyMatrixBlueRows(rows: number[]) {
      matrixBlueRows = padRowPlane(rows);
      drawMatrix();
    },
    applyMatrixBrightness,
    applyCapsLock,
    applyMatrixMode,
    handleKeyEvent,
    init,
  };
}
