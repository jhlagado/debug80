/**
 * @file Central serialization for TEC-1G UI update payloads (webview rehydration, DAP events).
 *
 * Runtime snapshots use {@link serializeTec1gUpdateFromRuntimeState} in `update-controller.ts`
 * (same field layout; keep changes in sync).
 */

import type { Tec1gUiState } from './ui-panel-state';
import type { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';

/**
 * Sidebar UI state → webview message body after `applyTec1gUpdate`.
 */
export function serializeTec1gUpdateFromUiState(
  state: Tec1gUiState,
  speakerHz?: number
): Tec1gUpdatePayload {
  const payload: Tec1gUpdatePayload = {
    digits: [...state.digits],
    matrix: [...state.matrix],
    matrixGreen: [...state.matrixGreen],
    matrixBlue: [...state.matrixBlue],
    matrixBrightness: [...state.matrixBrightness],
    matrixBrightnessG: [...state.matrixBrightnessG],
    matrixBrightnessB: [...state.matrixBrightnessB],
    matrixMode: state.matrixMode,
    glcd: [...state.glcd],
    glcdDdram: [...state.glcdDdram],
    glcdState: { ...state.glcdState },
    sysCtrl: state.sysCtrlValue,
    bankA14: state.bankA14,
    capsLock: state.capsLock,
    lcdState: { ...state.lcdState },
    lcdCgram: [...state.lcdCgram],
    speaker: state.speaker ? 1 : 0,
    speedMode: state.speedMode,
    lcd: [...state.lcd],
  };
  if (speakerHz !== undefined) {
    payload.speakerHz = speakerHz;
  }
  return payload;
}

/**
 * Partial update when clearing serial / resetting speaker (matches legacy sidebar clear payload).
 */
export function serializeTec1gClearPanelUpdateFromUiState(state: Tec1gUiState): Tec1gUpdatePayload {
  return {
    digits: [...state.digits],
    matrix: [...state.matrix],
    matrixGreen: [...state.matrixGreen],
    matrixBlue: [...state.matrixBlue],
    matrixBrightness: [...state.matrixBrightness],
    matrixBrightnessG: [...state.matrixBrightnessG],
    matrixBrightnessB: [...state.matrixBrightnessB],
    glcd: [...state.glcd],
    speaker: 0,
    speedMode: state.speedMode,
    lcd: [...state.lcd],
  };
}

/** Type guard for TEC-1G speed mode literals in unknown event data. */
function isTec1gSpeedMode(value: unknown): value is Tec1gSpeedMode {
  return value === 'slow' || value === 'fast';
}

/** True when `value` is an array of numbers (for DAP event body parsing). */
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

/**
 * Normalizes a `debug80/tec1gUpdate` custom event body to a UI payload, or `undefined` if invalid.
 */
export function tec1gUpdatePayloadFromDebugEventBody(
  body: unknown
): Tec1gUpdatePayload | undefined {
  if (body === null || typeof body !== 'object') {
    return undefined;
  }
  const payload = body as Record<string, unknown>;
  const digits = payload.digits;
  const matrix = payload.matrix;
  const lcd = payload.lcd;
  const glcd = payload.glcd;
  if (
    !isNumberArray(digits) ||
    !isNumberArray(matrix) ||
    !isNumberArray(lcd) ||
    !isNumberArray(glcd)
  ) {
    return undefined;
  }
  const speakerRaw = payload.speaker;
  const speaker = typeof speakerRaw === 'number' ? speakerRaw : 0;
  const speedMode = isTec1gSpeedMode(payload.speedMode) ? payload.speedMode : 'slow';
  const update: Tec1gUpdatePayload = {
    digits,
    matrix,
    glcd,
    speaker,
    speedMode,
    lcd,
  };
  const matrixGreen = payload.matrixGreen;
  if (isNumberArray(matrixGreen)) {
    update.matrixGreen = matrixGreen;
  }
  const matrixBlue = payload.matrixBlue;
  if (isNumberArray(matrixBlue)) {
    update.matrixBlue = matrixBlue;
  }
  const matrixBrightness = payload.matrixBrightness;
  if (isNumberArray(matrixBrightness)) {
    update.matrixBrightness = matrixBrightness;
  }
  const matrixBrightnessG = payload.matrixBrightnessG;
  if (isNumberArray(matrixBrightnessG)) {
    update.matrixBrightnessG = matrixBrightnessG;
  }
  const matrixBrightnessB = payload.matrixBrightnessB;
  if (isNumberArray(matrixBrightnessB)) {
    update.matrixBrightnessB = matrixBrightnessB;
  }
  if (typeof payload.matrixMode === 'boolean') {
    update.matrixMode = payload.matrixMode;
  }
  const glcdDdram = payload.glcdDdram;
  if (isNumberArray(glcdDdram)) {
    update.glcdDdram = glcdDdram;
  }
  if (payload.glcdState !== null && typeof payload.glcdState === 'object') {
    update.glcdState = payload.glcdState as NonNullable<Tec1gUpdatePayload['glcdState']>;
  }
  if (typeof payload.sysCtrl === 'number') {
    update.sysCtrl = payload.sysCtrl;
  }
  if (typeof payload.bankA14 === 'boolean') {
    update.bankA14 = payload.bankA14;
  }
  if (typeof payload.capsLock === 'boolean') {
    update.capsLock = payload.capsLock;
  }
  if (payload.lcdState !== null && typeof payload.lcdState === 'object') {
    update.lcdState = payload.lcdState as NonNullable<Tec1gUpdatePayload['lcdState']>;
  }
  const lcdCgram = payload.lcdCgram;
  if (isNumberArray(lcdCgram)) {
    update.lcdCgram = lcdCgram;
  }
  const hz = payload.speakerHz;
  if (typeof hz === 'number') {
    update.speakerHz = hz;
  }
  return update;
}
