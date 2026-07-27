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
  type MatrixModifier,
} from './matrix-state';
import { createMatrixScanPlayer } from './matrix-scan-player';
import { wirePointerHold, type PointerHoldController } from '../common/pointer-hold';
import type { Tec1gMatrixScanCycle } from '@jhlagado/debug80-runtime/platforms/tec1g/types';

export interface MatrixUiController {
  applyMatrixRows(rows: number[]): void;
  applyMatrixGreenRows(rows: number[]): void;
  applyMatrixBlueRows(rows: number[]): void;
  applyMatrixScanCycles(
    cycles: Tec1gMatrixScanCycle[],
    droppedCycles?: number,
    clockHz?: number
  ): void;
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

const MATRIX_MINIMUM_POINTER_HOLD_MS = 80;

export function createMatrixUiController(
  vscode: VscodeApi,
  isUiTabActive: () => boolean
): MatrixUiController {
  const matrixCanvas = document.getElementById('matrixCanvas') as HTMLCanvasElement | null;
  const matrixStats = document.getElementById('matrixStats') as HTMLElement | null;
  const matrixKeyboardGrid = document.getElementById('matrixKeyboardGrid') as HTMLElement;
  const matrixScanPlayer = createMatrixScanPlayer(matrixCanvas, matrixStats);

  let keyboardCaptureEnabled = false;
  let capsLockEnabled = false;
  const matrixHeldKeys = new Map<string, MatrixHeldKey>();
  const matrixHeldSources = new Map<string, MatrixHeldKey>();
  const matrixPointerHolds: PointerHoldController[] = [];
  const matrixPhysicalPressMods = new Map<string, MatrixKeyMods>();
  const matrixClickMods = createMatrixMods();
  const matrixKeyElements = new Map<string, HTMLElement[]>();
  let matrixRedRows = new Array(8).fill(0);
  let matrixGreenRows = new Array(8).fill(0);
  let matrixBlueRows = new Array(8).fill(0);

  function buildMatrix() {
    drawMatrix();
  }

  function drawMatrix() {
    matrixScanPlayer.renderStaticRows(matrixRedRows, matrixGreenRows, matrixBlueRows);
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

  function applyKeyboardCapture(enabled: boolean): void {
    if (!enabled) {
      resetTransientState();
    }
    keyboardCaptureEnabled = !!enabled;
    refreshMatrixModifierKeys();
  }

  function applyCapsLock(enabled: boolean): void {
    capsLockEnabled = !!enabled;
    refreshMatrixModifierKeys();
  }

  function shouldIgnoreKeyEvent(event: KeyboardEvent): boolean {
    const target = event.target;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
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

  function setMatrixKeyPressed(key: string, pressed: boolean): void {
    for (const el of matrixElementsForKey(key)) {
      el.classList.toggle('pressed', pressed);
    }
  }

  function postMatrixKeyMessage(key: string, pressed: boolean, mods: MatrixKeyMods) {
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

  function refreshMatrixKeyPressed(key: string): void {
    const pressed = Array.from(matrixHeldSources.values()).some((held) => held.key === key);
    setMatrixKeyPressed(key, pressed);
  }

  function pressMatrixSource(sourceId: string, key: string, mods: MatrixKeyMods): boolean {
    if (matrixHeldSources.has(sourceId)) {
      return true;
    }
    matrixHeldSources.set(sourceId, { key, mods: cloneMatrixMods(mods) });
    const changed = holdMatrixKey(matrixHeldKeys, key, mods).changed;
    refreshMatrixKeyPressed(key);
    if (changed) {
      postMatrixKeyMessage(key, true, mods);
    }
    return true;
  }

  function releaseMatrixSource(sourceId: string): boolean {
    const held = matrixHeldSources.get(sourceId);
    if (!held) {
      return false;
    }
    matrixHeldSources.delete(sourceId);
    const keyId = matrixKeyId(held.key, held.mods);
    const stillHeld = Array.from(matrixHeldSources.values()).some(
      (candidate) => matrixKeyId(candidate.key, candidate.mods) === keyId
    );
    refreshMatrixKeyPressed(held.key);
    if (stillHeld || !releaseMatrixKey(matrixHeldKeys, held.key, held.mods).changed) {
      return false;
    }
    postMatrixKeyMessage(held.key, false, held.mods);
    return true;
  }

  function releaseHeldMatrixKeys() {
    for (const hold of matrixPointerHolds) {
      hold.cancel();
    }
    matrixPhysicalPressMods.clear();
    matrixHeldSources.clear();
    for (const held of drainMatrixHeldKeys(matrixHeldKeys)) {
      postMatrixKeyMessage(held.key, false, held.mods);
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
    const payloadKey = key.length === 1 ? key.toLowerCase() : key;
    const sourceId = `physical:${event.code || payloadKey}`;
    if (event.metaKey) {
      if (pressed || !matrixPhysicalPressMods.has(sourceId)) {
        return false;
      }
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
    const eventMods = createMatrixMods({
      shiftKey: event.shiftKey || (capsLockEnabled && isLetterKey(payloadKey)),
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    });
    const mods = pressed ? eventMods : (matrixPhysicalPressMods.get(sourceId) ?? eventMods);
    if (pressed) {
      pressMatrixSource(sourceId, payloadKey, mods);
      matrixPhysicalPressMods.set(sourceId, cloneMatrixMods(mods));
    } else {
      releaseMatrixSource(sourceId);
      matrixPhysicalPressMods.delete(sourceId);
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

  function setMatrixMod(mod: MatrixModifier, active: boolean): void {
    matrixClickMods[mod] = active;
    refreshMatrixModifierKeys();
  }

  function armMatrixMod(mod: MatrixModifier): void {
    setMatrixMod(mod, true);
  }

  function clearOneShotMatrixMods() {
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
        const sourceId = `pointer:${matrixPointerHolds.length}`;
        const modifier = matrixModifierForKey(keyValue);
        let pointerPressMods: MatrixKeyMods | null = null;
        matrixPointerHolds.push(
          wirePointerHold(keyEl, {
            minimumHoldMs: modifier === undefined ? MATRIX_MINIMUM_POINTER_HOLD_MS : 0,
            onPress: () => {
              if (!keyboardCaptureEnabled || !isUiTabActive()) {
                return;
              }
              if (modifier !== undefined) {
                armMatrixMod(modifier);
                return;
              }
              if (keyValue === 'CapsLock') {
                applyCapsLock(!capsLockEnabled);
                pointerPressMods = cloneMatrixMods(matrixClickMods);
                pressMatrixSource(sourceId, keyValue, pointerPressMods);
                return;
              }
              pointerPressMods = clickModsForKey(keyValue);
              pressMatrixSource(sourceId, keyValue, pointerPressMods);
              clearOneShotMatrixMods();
            },
            onRelease: () => {
              if (pointerPressMods === null) {
                return;
              }
              releaseMatrixSource(sourceId);
              pointerPressMods = null;
            },
          })
        );
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
    applyMatrixScanCycles(cycles, droppedCycles, clockHz) {
      matrixScanPlayer.enqueue(cycles, droppedCycles, clockHz);
    },
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
