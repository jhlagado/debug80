import {
  clearOneShotMatrixMods as createClearedMatrixMods,
  cloneMatrixMods,
  createMatrixMods,
  drainMatrixHeldKeys,
  holdMatrixKey,
  isHostReleaseChord,
  isLetterKey,
  matrixClickModsForKey,
  matrixKeyId,
  matrixModifierForKey,
  releaseMatrixKey,
  resolvePhysicalMatrixKey,
  type MatrixHeldKey,
  type MatrixKeyMods,
} from './matrix-state';

export interface MatrixUiController {
  applyMatrixRows(rows: number[]): void;
  applyMatrixGreenRows(rows: number[]): void;
  applyMatrixBlueRows(rows: number[]): void;
  applyMatrixBrightness(levels?: number[], green?: number[], blue?: number[]): void;
  applyCapsLock(enabled: boolean): void;
  applyKeyboardCapture(enabled: boolean): void;
  releaseKeyboardCapture(): void;
  isKeyboardCaptured(): boolean;
  resetTransientState(): void;
  handleKeyEvent(event: KeyboardEvent, pressed: boolean): boolean;
  init(): void;
}

interface VscodeApi {
  postMessage(message: unknown): void;
}

type MatrixEventSource = 'mouse' | 'physical' | 'system';

const MATRIX_CLICK_HOLD_MS = 80;

export function createMatrixUiController(
  vscode: VscodeApi,
  isUiTabActive: () => boolean
): MatrixUiController {
  const matrixGrid = document.getElementById('matrixGrid') as HTMLElement;
  const matrixKeyboardGrid = document.getElementById('matrixKeyboardGrid') as HTMLElement;

  let keyboardCaptureEnabled = false;
  let capsLockEnabled = false;
  const matrixHeldKeys = new Map<string, MatrixHeldKey>();
  const matrixClickReleaseTimers = new Map<string, number>();
  const matrixClickPressMods = new Map<string, MatrixKeyMods>();
  const matrixPhysicalPressMods = new Map<string, MatrixKeyMods>();
  const matrixClickMods = createMatrixMods();
  const matrixKeyElements = new Map<string, HTMLElement[]>();
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
    const t = Math.min(1, (raw / 255) * 5.2);
    const gamma = Math.pow(t, 0.7);
    return Math.min(255, Math.round(255 * gamma + 18 * t));
  }

  function drawMatrix() {
    if (!matrixGrid) return;
    const dots = matrixGrid.querySelectorAll('.matrix-dot');
    dots.forEach((dot) => {
      const row = parseInt((dot as HTMLElement).dataset.row || '0', 10);
      const col = parseInt((dot as HTMLElement).dataset.col || '0', 10);
      const hardwareCol = 7 - col;
      const mask = 1 << hardwareCol;
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

  function applyMatrixBrightness(levels?: number[], green?: number[], blue?: number[]) {
    const hadMatrixBrightness = hasMatrixBrightness;
    hasMatrixBrightness = true;
    const pad64 = (source: number[] | undefined, fill: number): number[] =>
      Array.from({ length: 64 }, (_, index) => {
        const value = source?.[index];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return fill;
        }
        return Math.max(0, Math.min(255, Math.trunc(value)));
      });
    if (levels !== undefined) {
      matrixBrightnessR = pad64(levels, 0);
    } else if (!hadMatrixBrightness) {
      matrixBrightnessR = new Array(64).fill(0);
    }
    if (green !== undefined) {
      matrixBrightnessG = pad64(green, 0);
    } else if (!hadMatrixBrightness) {
      matrixBrightnessG = new Array(64).fill(0);
    }
    if (blue !== undefined) {
      matrixBrightnessB = pad64(blue, 0);
    } else if (!hadMatrixBrightness) {
      matrixBrightnessB = new Array(64).fill(0);
    }
    drawMatrix();
  }

  function resetTransientState() {
    releaseHeldMatrixKeys();
    clearOneShotMatrixMods();
    applyCapsLock(false);
    setMatrixKeyPressed('Shift', false);
    setMatrixKeyPressed('Control', false);
    setMatrixKeyPressed('Fn', false);
    setMatrixKeyPressed('Alt', false);
    setMatrixKeyPressed('CapsLock', false);
    matrixKeyboardGrid
      ?.querySelectorAll('.matrix-key.pressed')
      .forEach((key) => key.classList.remove('pressed'));
    refreshMatrixModifierKeys();
  }

  function applyKeyboardCapture(enabled) {
    if (!enabled) {
      resetTransientState();
    }
    keyboardCaptureEnabled = !!enabled;
    refreshMatrixModifierKeys();
  }

  function applyCapsLock(enabled) {
    capsLockEnabled = !!enabled;
    refreshMatrixModifierKeys();
  }

  function shouldIgnoreKeyEvent(event) {
    const target = event.target;
    return (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    );
  }

  function consumeHandledKeyEvent(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function matrixElementsForKey(key: string): HTMLElement[] {
    if (!key) {
      return [];
    }
    const direct = matrixKeyElements.get(key);
    const fallback = key.length === 1 ? matrixKeyElements.get(key.toLowerCase()) : undefined;
    return direct ?? fallback ?? [];
  }

  function setMatrixKeyPressed(key, pressed) {
    for (const el of matrixElementsForKey(key)) {
      el.classList.toggle('pressed', pressed);
    }
  }

  function clearMatrixClickReleaseTimer(keyId: string): void {
    const timer = matrixClickReleaseTimers.get(keyId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      matrixClickReleaseTimers.delete(keyId);
    }
  }

  function logMatrixModifierState(
    action: 'armed' | 'cleared',
    modifier?: keyof MatrixKeyMods
  ): void {
    // eslint-disable-next-line no-console -- matrix trace for webview input debugging
    console.log('[Debug80 matrix] modifiers', {
      action,
      modifier,
      shift: matrixClickMods.shift,
      ctrl: matrixClickMods.ctrl,
      fn: matrixClickMods.fn,
      alt: matrixClickMods.alt,
      capsLock: capsLockEnabled,
      capture: keyboardCaptureEnabled,
    });
  }

  function postMatrixKeyMessage(
    source: MatrixEventSource,
    key: string,
    pressed: boolean,
    mods: MatrixKeyMods
  ) {
    // eslint-disable-next-line no-console -- matrix trace for webview input debugging
    console.log('[Debug80 matrix] send', {
      source,
      key,
      pressed: !!pressed,
      shift: !!mods.shift,
      ctrl: !!mods.ctrl,
      fn: !!mods.fn,
      alt: !!mods.alt,
      capsLock: capsLockEnabled,
      capture: keyboardCaptureEnabled,
    });
    vscode.postMessage({
      type: 'matrixKey',
      key: key,
      pressed: !!pressed,
      shift: mods.shift,
      ctrl: mods.ctrl,
      fn: mods.fn,
      alt: mods.alt,
    });
  }

  function sendMatrixKey(key, pressed, mods, source: MatrixEventSource) {
    const keyId = matrixKeyId(key, mods);
    if (pressed) {
      clearMatrixClickReleaseTimer(keyId);
      if (!holdMatrixKey(matrixHeldKeys, key, mods).changed) {
        return true;
      }
    } else {
      clearMatrixClickReleaseTimer(keyId);
      if (!releaseMatrixKey(matrixHeldKeys, key, mods).changed) {
        return false;
      }
    }
    postMatrixKeyMessage(source, key, pressed, mods);
    return true;
  }

  function scheduleMatrixClickRelease(key: string, mods: MatrixKeyMods): void {
    const keyId = matrixKeyId(key, mods);
    clearMatrixClickReleaseTimer(keyId);
    const timer = window.setTimeout(() => {
      matrixClickReleaseTimers.delete(keyId);
      matrixClickPressMods.delete(key);
      setMatrixKeyPressed(key, false);
      sendMatrixKey(key, false, mods, 'mouse');
    }, MATRIX_CLICK_HOLD_MS);
    matrixClickReleaseTimers.set(keyId, timer);
  }

  function releaseHeldMatrixKeys() {
    for (const timer of matrixClickReleaseTimers.values()) {
      window.clearTimeout(timer);
    }
    matrixClickReleaseTimers.clear();
    matrixClickPressMods.clear();
    matrixPhysicalPressMods.clear();
    for (const held of drainMatrixHeldKeys(matrixHeldKeys)) {
      postMatrixKeyMessage('system', held.key, false, held.mods);
    }
  }

  function handleKeyEvent(event: KeyboardEvent, pressed: boolean): boolean {
    if (!keyboardCaptureEnabled || !isUiTabActive() || shouldIgnoreKeyEvent(event)) {
      return false;
    }
    const key = resolvePhysicalMatrixKey(event);
    if (!key) {
      return false;
    }
    consumeHandledKeyEvent(event);
    if (pressed && isHostReleaseChord(key, event)) {
      applyKeyboardCapture(false);
      return true;
    }
    if (pressed && event.repeat) {
      return true;
    }
    if (key === 'CapsLock' && pressed) {
      applyCapsLock(!capsLockEnabled);
    }
    const payloadKey = key.length === 1 ? key.toLowerCase() : key;
    const eventMods = createMatrixMods({
      shiftKey: event.shiftKey || (capsLockEnabled && isLetterKey(payloadKey)),
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    });
    const mods = pressed ? eventMods : (matrixPhysicalPressMods.get(payloadKey) ?? eventMods);
    setMatrixKeyPressed(key, pressed);
    if (key.length === 1 && key !== key.toLowerCase()) {
      setMatrixKeyPressed(key.toLowerCase(), pressed);
    }
    sendMatrixKey(payloadKey, pressed, mods, 'physical');
    if (pressed) {
      matrixPhysicalPressMods.set(payloadKey, cloneMatrixMods(mods));
    } else {
      matrixPhysicalPressMods.delete(payloadKey);
    }
    return true;
  }

  function clickModsForKey(key: string) {
    return matrixClickModsForKey(key, matrixClickMods, capsLockEnabled);
  }

  function refreshMatrixModifierKeys() {
    for (const el of matrixElementsForKey('Shift')) {
      el.classList.toggle('active', matrixClickMods.shift || capsLockEnabled);
    }
    for (const el of matrixElementsForKey('Control')) {
      el.classList.toggle('active', matrixClickMods.ctrl);
    }
    for (const el of matrixElementsForKey('Fn')) {
      el.classList.toggle('active', matrixClickMods.fn);
    }
    for (const el of matrixElementsForKey('Alt')) {
      el.classList.toggle('active', matrixClickMods.alt);
    }
    for (const el of matrixElementsForKey('CapsLock')) {
      el.classList.toggle('active', capsLockEnabled);
    }
  }

  function setMatrixMod(mod, active) {
    matrixClickMods[mod] = active;
    refreshMatrixModifierKeys();
  }

  function armMatrixMod(mod) {
    setMatrixMod(mod, true);
    logMatrixModifierState('armed', mod);
  }

  function clearOneShotMatrixMods() {
    if (
      matrixClickMods.shift ||
      matrixClickMods.ctrl ||
      matrixClickMods.fn ||
      matrixClickMods.alt
    ) {
      logMatrixModifierState('cleared');
    }
    const cleared = createClearedMatrixMods(matrixClickMods);
    setMatrixMod('shift', cleared.shift);
    setMatrixMod('ctrl', cleared.ctrl);
    setMatrixMod('fn', cleared.fn);
    setMatrixMod('alt', cleared.alt);
  }

  function buildMatrixKeyboard() {
    if (!matrixKeyboardGrid) {
      return;
    }
    type MatrixKeyDef = {
      label: string;
      key: string;
      unit?: number;
      subLabel?: string;
      smallLabel?: boolean;
    };
    const rows: MatrixKeyDef[][] = [
      [
        { label: 'ESC', key: 'Escape', unit: 1.25 },
        { label: '1!', key: '1' },
        { label: '2@', key: '2' },
        { label: '3#', key: '3' },
        { label: '4$', key: '4' },
        { label: '5%', key: '5' },
        { label: '6^', key: '6' },
        { label: '7&', key: '7' },
        { label: '8*', key: '8' },
        { label: '9(', key: '9' },
        { label: '0)', key: '0' },
        { label: '-_', key: '-' },
        { label: '=+', key: '=' },
        { label: 'DEL', key: 'Backspace', unit: 1.35 },
      ],
      [
        { label: 'TAB', key: 'Tab', unit: 1.35 },
        { label: 'Q', key: 'q' },
        { label: 'W', key: 'w' },
        { label: 'E', key: 'e' },
        { label: 'R', key: 'r' },
        { label: 'T', key: 't' },
        { label: 'Y', key: 'y' },
        { label: 'U', key: 'u' },
        { label: 'I', key: 'i' },
        { label: 'O', key: 'o' },
        { label: 'P', key: 'p' },
        { label: '"\'', key: "'" },
        { label: '\\|', key: '\\' },
      ],
      [
        { label: 'CAPS', key: 'CapsLock', unit: 1.55 },
        { label: 'A', key: 'a' },
        { label: 'S', key: 's' },
        { label: 'D', key: 'd' },
        { label: 'F', key: 'f' },
        { label: 'G', key: 'g' },
        { label: 'H', key: 'h' },
        { label: 'J', key: 'j' },
        { label: 'K', key: 'k' },
        { label: 'L', key: 'l' },
        { label: ';:', key: ';' },
        { label: 'ENTER', key: 'Enter', unit: 1.9 },
      ],
      [
        { label: 'SHIFT', key: 'Shift', unit: 1.75 },
        { label: 'Z', key: 'z' },
        { label: 'X', key: 'x' },
        { label: 'C', key: 'c' },
        { label: 'V', key: 'v' },
        { label: 'B', key: 'b' },
        { label: 'N', key: 'n' },
        { label: 'M', key: 'm' },
        { label: ',<', key: ',' },
        { label: '.>', key: '.' },
        { label: '/?', key: '/' },
        { label: '▲', key: 'ArrowUp' },
        { label: 'SHIFT', key: 'Shift', smallLabel: true },
      ],
      [
        { label: 'CTRL', key: 'Control', unit: 1.15 },
        { label: 'FN', key: 'Fn', unit: 1.05 },
        { label: 'ALT', key: 'Alt', unit: 1.15 },
        { label: 'SPACE', key: ' ', unit: 6.8 },
        { label: 'ALT', key: 'Alt', unit: 1.15 },
        { label: '◀', key: 'ArrowLeft' },
        { label: '▼', key: 'ArrowDown' },
        { label: '▶', key: 'ArrowRight' },
      ],
    ];
    matrixKeyboardGrid.innerHTML = '';
    rows.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'matrix-keyboard-row';
      row.forEach((keyDef) => {
        const keyEl = document.createElement('div');
        keyEl.className = 'matrix-key';
        keyEl.style.setProperty('--key-unit', String(keyDef.unit ?? 1));
        const primaryLabel = document.createElement('span');
        primaryLabel.className =
          'smallLabel' in keyDef && keyDef.smallLabel
            ? 'matrix-key-label matrix-key-sub-label'
            : 'matrix-key-label';
        primaryLabel.textContent = keyDef.label;
        keyEl.appendChild(primaryLabel);
        if (keyDef.subLabel) {
          keyEl.classList.add('matrix-key-with-sub-label');
          const subLabel = document.createElement('span');
          subLabel.className = 'matrix-key-sub-label';
          subLabel.textContent = keyDef.subLabel;
          keyEl.appendChild(subLabel);
        }
        const keyValue = keyDef.key;
        keyEl.dataset.key = keyValue;
        const elements = matrixKeyElements.get(keyValue) ?? [];
        elements.push(keyEl);
        matrixKeyElements.set(keyValue, elements);
        if (keyValue.length === 1 && keyValue !== keyValue.toLowerCase()) {
          const lowerElements = matrixKeyElements.get(keyValue.toLowerCase()) ?? [];
          lowerElements.push(keyEl);
          matrixKeyElements.set(keyValue.toLowerCase(), lowerElements);
        }
        keyEl.addEventListener('mousedown', (event) => {
          event.preventDefault();
          if (!keyboardCaptureEnabled || !isUiTabActive()) {
            return;
          }
          const mod = matrixModifierForKey(keyValue);
          if (mod !== undefined) {
            armMatrixMod(mod);
            return;
          }
          if (keyValue === 'CapsLock') {
            applyCapsLock(!capsLockEnabled);
            setMatrixKeyPressed(keyValue, true);
            sendMatrixKey(keyValue, true, matrixClickMods, 'mouse');
            return;
          }
          const pressMods = clickModsForKey(keyValue);
          matrixClickPressMods.set(keyValue, pressMods);
          setMatrixKeyPressed(keyValue, true);
          sendMatrixKey(keyValue, true, pressMods, 'mouse');
          clearOneShotMatrixMods();
        });
        const release = () => {
          if (
            matrixModifierForKey(keyValue) !== undefined
          ) {
            return;
          }
          const releaseMods =
            keyValue === 'CapsLock'
              ? matrixClickMods
              : (matrixClickPressMods.get(keyValue) ?? clickModsForKey(keyValue));
          scheduleMatrixClickRelease(keyValue, releaseMods);
        };
        keyEl.addEventListener('mouseup', release);
        keyEl.addEventListener('mouseleave', release);
        rowEl.appendChild(keyEl);
      });
      matrixKeyboardGrid.appendChild(rowEl);
    });
  }

  function init() {
    buildMatrix();
    drawMatrix();
    buildMatrixKeyboard();
    applyKeyboardCapture(keyboardCaptureEnabled);
    applyCapsLock(capsLockEnabled);
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
    applyKeyboardCapture,
    releaseKeyboardCapture() {
      applyKeyboardCapture(false);
    },
    isKeyboardCaptured() {
      return keyboardCaptureEnabled;
    },
    resetTransientState,
    handleKeyEvent,
    init,
  };
}
