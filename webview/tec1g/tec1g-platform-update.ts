/**
 * @file Applies adapter `update` payloads to TEC-1G renderers and keypad state.
 */

import type { SevenSegDisplay } from '../common/seven-seg-display';
import type { createGlcdRenderer } from './glcd-renderer';
import type { createLcdRenderer } from './lcd-renderer';
import type { createMatrixUiController } from './matrix-ui';
import type { Tec1gUpdatePayload } from './entry-types';
import type { createTec1gAudio } from './tec1g-audio';
import type { Tec1gKeypad } from './tec1g-keypad';

export type Tec1gPlatformUpdateDeps = {
  display: SevenSegDisplay;
  audio: ReturnType<typeof createTec1gAudio>;
  applySpeed: (mode: 'slow' | 'fast') => void;
  lcdRenderer: ReturnType<typeof createLcdRenderer>;
  matrixUi: ReturnType<typeof createMatrixUiController>;
  glcdRenderer: ReturnType<typeof createGlcdRenderer>;
  keypad: Tec1gKeypad;
};

/**
 * Maps a `update` message body onto digits, LCD/GLCD, matrix, audio, and SysCtrl.
 */
export function applyTec1gPlatformUpdate(deps: Tec1gPlatformUpdateDeps, payload: Tec1gUpdatePayload | null | undefined): void {
  if (!payload || typeof payload !== 'object') {
    return;
  }
  const data = payload;
  deps.display.applyDigits(Array.isArray(data.digits) ? data.digits : []);

  deps.audio.applySpeakerFromUpdate(data);

  if (data.speedMode === 'slow' || data.speedMode === 'fast') {
    deps.applySpeed(data.speedMode);
  }
  deps.lcdRenderer.applyLcdUpdate(data);
  if (Array.isArray(data.matrix)) {
    deps.matrixUi.applyMatrixRows(data.matrix);
  }
  if (Array.isArray(data.matrixGreen)) {
    deps.matrixUi.applyMatrixGreenRows(data.matrixGreen);
  }
  if (Array.isArray(data.matrixBlue)) {
    deps.matrixUi.applyMatrixBlueRows(data.matrixBlue);
  }
  if (Array.isArray(data.matrixBrightness)) {
    deps.matrixUi.applyMatrixBrightness(
      data.matrixBrightness,
      Array.isArray(data.matrixBrightnessG) ? data.matrixBrightnessG : undefined,
      Array.isArray(data.matrixBrightnessB) ? data.matrixBrightnessB : undefined
    );
  }
  if (typeof data.sysCtrl === 'number') {
    deps.keypad.setSysCtrlValue(data.sysCtrl & 0xff);
    deps.keypad.updateSysCtrl();
    deps.keypad.updateStatusLeds();
  }
  if (typeof data.capsLock === 'boolean') {
    deps.matrixUi.applyCapsLock(data.capsLock);
  }
  if (typeof data.matrixMode === 'boolean') {
    deps.matrixUi.applyMatrixMode(data.matrixMode);
  }
  deps.glcdRenderer.applyGlcdUpdate(data);
}
