/**
 * @file TEC-1G panel UI state helpers.
 */

import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';

export type GlcdState = {
  displayOn: boolean;
  graphicsOn: boolean;
  cursorOn: boolean;
  cursorBlink: boolean;
  blinkVisible: boolean;
  ddramAddr: number;
  ddramPhase: number;
  textShift: number;
  scroll: number;
  reverseMask: number;
};

export type Tec1gUiState = {
  digits: number[];
  matrix: number[];
  matrixMode: boolean;
  glcd: number[];
  glcdDdram: number[];
  glcdState: GlcdState;
  speaker: boolean;
  speedMode: Tec1gSpeedMode;
  sysCtrlValue: number;
  bankA14: boolean;
  capsLock: boolean;
  lcdState: {
    displayOn: boolean;
    cursorOn: boolean;
    cursorBlink: boolean;
    cursorAddr: number;
    displayShift: number;
  };
  lcdCgram: number[];
  lcd: number[];
};

/**
 * Creates the default TEC-1G UI state.
 */
export function createTec1gUiState(): Tec1gUiState {
  return {
    digits: Array.from({ length: 6 }, () => 0),
    matrix: Array.from({ length: 8 }, () => 0),
    matrixMode: false,
    glcd: Array.from({ length: 1024 }, () => 0),
    glcdDdram: Array.from({ length: 64 }, () => 0x20),
    glcdState: {
      displayOn: true,
      graphicsOn: true,
      cursorOn: false,
      cursorBlink: false,
      blinkVisible: true,
      ddramAddr: 0x80,
      ddramPhase: 0,
      textShift: 0,
      scroll: 0,
      reverseMask: 0,
    },
    speaker: false,
    speedMode: 'fast',
    sysCtrlValue: 0x00,
    bankA14: false,
    capsLock: false,
    lcdState: {
      displayOn: true,
      cursorOn: false,
      cursorBlink: false,
      cursorAddr: 0x80,
      displayShift: 0,
    },
    lcdCgram: Array.from({ length: 64 }, () => 0x00),
    lcd: Array.from({ length: 80 }, () => 0x20),
  };
}

/**
 * Resets mutable UI state in place.
 */
export function resetTec1gUiState(state: Tec1gUiState): void {
  const next = createTec1gUiState();
  state.digits = next.digits;
  state.matrix = next.matrix;
  state.matrixMode = next.matrixMode;
  state.glcd = next.glcd;
  state.glcdDdram = next.glcdDdram;
  state.glcdState = next.glcdState;
  state.speaker = next.speaker;
  state.speedMode = 'slow';
  state.sysCtrlValue = next.sysCtrlValue;
  state.bankA14 = next.bankA14;
  state.capsLock = next.capsLock;
  state.lcdState = next.lcdState;
  state.lcdCgram = next.lcdCgram;
  state.lcd = next.lcd;
}

/**
 * Applies incoming update payload to UI state.
 */
export function applyTec1gUpdate(state: Tec1gUiState, payload: Tec1gUpdatePayload): void {
  state.digits = payload.digits.slice(0, 6);
  state.matrix = payload.matrix.slice(0, 8);
  if (typeof payload.matrixMode === 'boolean') {
    state.matrixMode = payload.matrixMode;
  }
  state.glcd = payload.glcd.slice(0, 1024);
  if (typeof payload.sysCtrl === 'number') {
    state.sysCtrlValue = payload.sysCtrl & 0xff;
  }
  if (typeof payload.bankA14 === 'boolean') {
    state.bankA14 = payload.bankA14;
  }
  if (typeof payload.capsLock === 'boolean') {
    state.capsLock = payload.capsLock;
  }
  if (payload.lcdState && typeof payload.lcdState === 'object') {
    state.lcdState = {
      displayOn: payload.lcdState.displayOn ?? state.lcdState.displayOn,
      cursorOn: payload.lcdState.cursorOn ?? state.lcdState.cursorOn,
      cursorBlink: payload.lcdState.cursorBlink ?? state.lcdState.cursorBlink,
      cursorAddr: payload.lcdState.cursorAddr ?? state.lcdState.cursorAddr,
      displayShift: payload.lcdState.displayShift ?? state.lcdState.displayShift,
    };
  }
  if (Array.isArray(payload.lcdCgram)) {
    state.lcdCgram = payload.lcdCgram.slice(0, 64);
    while (state.lcdCgram.length < 64) {
      state.lcdCgram.push(0x00);
    }
  }
  if (Array.isArray(payload.glcdDdram)) {
    state.glcdDdram = payload.glcdDdram.slice(0, 64);
    while (state.glcdDdram.length < 64) {
      state.glcdDdram.push(0x20);
    }
  }
  if (payload.glcdState && typeof payload.glcdState === 'object') {
    state.glcdState = {
      displayOn: payload.glcdState.displayOn ?? state.glcdState.displayOn,
      graphicsOn: payload.glcdState.graphicsOn ?? state.glcdState.graphicsOn,
      cursorOn: payload.glcdState.cursorOn ?? state.glcdState.cursorOn,
      cursorBlink: payload.glcdState.cursorBlink ?? state.glcdState.cursorBlink,
      blinkVisible: payload.glcdState.blinkVisible ?? state.glcdState.blinkVisible,
      ddramAddr: payload.glcdState.ddramAddr ?? state.glcdState.ddramAddr,
      ddramPhase: payload.glcdState.ddramPhase ?? state.glcdState.ddramPhase,
      textShift: payload.glcdState.textShift ?? state.glcdState.textShift,
      scroll: payload.glcdState.scroll ?? state.glcdState.scroll,
      reverseMask: payload.glcdState.reverseMask ?? state.glcdState.reverseMask,
    };
  }
  state.speaker = payload.speaker === 1;
  state.speedMode = payload.speedMode;
  state.lcd = payload.lcd.slice(0, 80);
}
