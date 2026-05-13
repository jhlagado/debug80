/**
 * @file Central serialization for TEC-1 UI update payloads (runtime, webview, DAP events).
 */

import type { Tec1State } from './runtime';
import type { Tec1UiState } from './ui-panel-state';
import type { Tec1SpeedMode, Tec1UpdatePayload } from './types';

/**
 * Snapshot payload from emulator runtime state (adapter → extension / UI).
 */
export function serializeTec1UpdateFromRuntimeState(state: Tec1State): Tec1UpdatePayload {
  return {
    digits: [...state.digits],
    matrix: [...state.matrix],
    speaker: state.speaker ? 1 : 0,
    speedMode: state.speedMode,
    lcd: [...state.lcd],
    speakerHz: state.speakerHz,
  };
}

/**
 * Snapshot payload from sidebar UI state after applying an update (extension → webview).
 */
export function serializeTec1UpdateFromUiState(
  state: Tec1UiState,
  speakerHz?: number
): Tec1UpdatePayload {
  const payload: Tec1UpdatePayload = {
    digits: [...state.digits],
    matrix: [...state.matrix],
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
 * Partial update with speaker forced off (session clear / idle reset).
 */
export function serializeTec1ClearFromUiState(state: Tec1UiState): Tec1UpdatePayload {
  return {
    digits: [...state.digits],
    matrix: [...state.matrix],
    speaker: 0,
    speedMode: state.speedMode,
    lcd: [...state.lcd],
  };
}

/** Type guard for TEC-1 speed mode literals in unknown event data. */
function isTec1SpeedMode(value: unknown): value is Tec1SpeedMode {
  return value === 'slow' || value === 'fast';
}

/** True when `value` is an array of numbers (for DAP event body parsing). */
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

/**
 * Normalizes a `debug80/tec1Update` custom event body to a UI payload, or `undefined` if invalid.
 */
export function tec1UpdatePayloadFromDebugEventBody(body: unknown): Tec1UpdatePayload | undefined {
  if (body === null || typeof body !== 'object') {
    return undefined;
  }
  const raw = body as Record<string, unknown>;
  const digits = raw.digits;
  const matrix = raw.matrix;
  const lcd = raw.lcd;
  if (!isNumberArray(digits) || !isNumberArray(matrix) || !isNumberArray(lcd)) {
    return undefined;
  }
  const speakerRaw = raw.speaker;
  const speaker = typeof speakerRaw === 'number' ? speakerRaw : 0;
  const speedMode = isTec1SpeedMode(raw.speedMode) ? raw.speedMode : 'slow';
  const payload: Tec1UpdatePayload = {
    digits,
    matrix,
    speaker,
    speedMode,
    lcd,
  };
  const hz = raw.speakerHz;
  if (typeof hz === 'number') {
    payload.speakerHz = hz;
  }
  return payload;
}
