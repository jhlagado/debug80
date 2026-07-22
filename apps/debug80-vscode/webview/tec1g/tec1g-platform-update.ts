/**
 * @file Applies adapter `update` payloads to TEC-1G renderers and keypad state.
 */

import type { SevenSegmentScanPlayer } from '../common/seven-seg-scan-player';
import type { createGlcdRenderer } from './glcd-renderer';
import type { createLcdRenderer } from './lcd-renderer';
import type { createMatrixUiController } from './matrix-ui';
import type { createTms9918Renderer } from './tms9918-renderer';
import type { Tec1gUpdatePayload } from './entry-types';
import type { createTec1gAudio } from './tec1g-audio';
import type { Tec1gKeypad } from './tec1g-keypad';

export type Tec1gPlatformUpdateDeps = {
  segmentPlayer: SevenSegmentScanPlayer;
  audio: ReturnType<typeof createTec1gAudio>;
  applySpeed: (mode: 'slow' | 'fast') => void;
  lcdRenderer: ReturnType<typeof createLcdRenderer>;
  matrixUi: ReturnType<typeof createMatrixUiController>;
  glcdRenderer: ReturnType<typeof createGlcdRenderer>;
  tms9918Renderer: ReturnType<typeof createTms9918Renderer>;
  keypad: Tec1gKeypad;
};

/**
 * Maps a `update` message body onto digits, LCD/GLCD, matrix, audio, and SysCtrl.
 */
export function applyTec1gPlatformUpdate(
  deps: Tec1gPlatformUpdateDeps,
  payload: Tec1gUpdatePayload | null | undefined
): void {
  if (!payload || typeof payload !== 'object') {
    return;
  }
  const data = payload;
  if (Array.isArray(data.segmentScanCycles)) {
    deps.segmentPlayer.enqueue(
      data.segmentScanCycles,
      data.segmentDroppedScanCycles,
      data.segmentClockHz
    );
  }
  if (Array.isArray(data.segmentIntensities) || Array.isArray(data.digits)) {
    deps.segmentPlayer.renderStatic(data.digits, data.segmentIntensities);
  }

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
  if (Array.isArray(data.matrixScanCycles)) {
    deps.matrixUi.applyMatrixScanCycles(
      data.matrixScanCycles,
      data.matrixDroppedScanCycles,
      data.matrixClockHz
    );
  }
  if (typeof data.sysCtrl === 'number') {
    deps.keypad.setSysCtrlValue(data.sysCtrl & 0xff);
    deps.keypad.updateSysCtrl();
    deps.keypad.updateStatusLeds();
  }
  deps.glcdRenderer.applyGlcdUpdate(data);
  deps.tms9918Renderer.applyTms9918Update(data);
}
