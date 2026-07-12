/**
 * @file TEC-1 panel UI state helpers.
 */

import { Tec1SpeedMode, Tec1UpdatePayload } from './types';

export type Tec1UiState = {
  digits: number[];
  matrix: number[];
  speaker: boolean;
  speedMode: Tec1SpeedMode;
  lcd: number[];
};

/**
 * Creates the default TEC-1 UI state.
 */
export function createTec1UiState(): Tec1UiState {
  return {
    digits: Array.from({ length: 6 }, () => 0),
    matrix: Array.from({ length: 8 }, () => 0),
    speaker: false,
    speedMode: 'fast',
    lcd: Array.from({ length: 32 }, () => 0x20),
  };
}

/**
 * Resets mutable UI state in place.
 */
export function resetTec1UiState(state: Tec1UiState): void {
  const next = createTec1UiState();
  state.digits = next.digits;
  state.matrix = next.matrix;
  state.speaker = next.speaker;
  state.speedMode = 'slow';
  state.lcd = next.lcd;
}

/**
 * Applies incoming update payload to UI state.
 */
export function applyTec1Update(state: Tec1UiState, payload: Tec1UpdatePayload): void {
  state.digits = payload.digits.slice(0, 6);
  state.matrix = payload.matrix.slice(0, 8);
  state.speaker = payload.speaker === 1;
  state.speedMode = payload.speedMode;
  state.lcd = payload.lcd.slice(0, 32);
}
