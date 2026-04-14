/**
 * @file TEC-1G runtime state definitions and initialization helpers.
 */

import { CycleClock } from '../cycle-clock';
import type { Tec1gPlatformConfigNormalized } from '../types';
import { TEC_FAST_HZ } from '../tec-common';
import {
  TEC1G_LCD_ARROW_LEFT,
  TEC1G_LCD_ARROW_RIGHT,
  TEC1G_LCD_ROW0_START,
  TEC1G_LCD_SPACE,
  TEC1G_MASK_BYTE,
  TEC1G_MASK_LOW7,
} from './constants';
import { createGlcdState, type GlcdState } from './glcd';
import type { Tec1gLcdState } from './lcd';
import type { Tec1gSpeedMode } from './types';

/**
 * Mutable runtime state for TEC-1G hardware emulation.
 */
export interface Tec1gState {
  display: {
    digits: number[];
    ledMatrixRedRows: number[];
    ledMatrixGreenRows: number[];
    ledMatrixBlueRows: number[];
    ledMatrixBrightnessR: number[];
    ledMatrixBrightnessG: number[];
    ledMatrixBrightnessB: number[];
    matrixStagingR: number[];
    matrixStagingG: number[];
    matrixStagingB: number[];
    matrixRowsVisitedMask: number;
    matrixLastActivityCycle: number;
    digitLatch: number;
    segmentLatch: number;
    ledMatrixRowLatch: number;
    ledMatrixRedLatch: number;
    ledMatrixGreenLatch: number;
    ledMatrixBlueLatch: number;
    glcdCtrl: GlcdState;
  };
  input: {
    matrixKeyStates: Uint8Array;
    matrixModeEnabled: boolean;
    keyValue: number;
    keyReleaseEventId: number | null;
    nmiPending: boolean;
    shiftKeyActive: boolean;
    rawKeyActive: boolean;
  };
  audio: {
    speaker: boolean;
    speakerHz: number;
    lastEdgeCycle: number | null;
    silenceEventId: number | null;
  };
  lcdCtrl: Tec1gLcdState;
  timing: {
    cycleClock: CycleClock;
    lastUpdateMs: number;
    pendingUpdate: boolean;
    clockHz: number;
    speedMode: Tec1gSpeedMode;
    updateMs: number;
    yieldMs: number;
  };
  system: {
    sysCtrl: number;
    shadowEnabled: boolean;
    protectEnabled: boolean;
    expandEnabled: boolean;
    bankA14: boolean;
    capsLock: boolean;
    cartridgePresent: boolean;
    gimpSignal: boolean;
  };
}

/**
 * Creates the initial mutable TEC-1G runtime state object.
 */
export function createTec1gInitialState(params: {
  config: Tec1gPlatformConfigNormalized;
  matrixMode: boolean;
  initialSysCtrl: number;
  initialSysCtrlDecoded: {
    shadowEnabled: boolean;
    protectEnabled: boolean;
    expandEnabled: boolean;
    bankA14: boolean;
    capsLock: boolean;
  };
  cartridgePresentDefault: boolean;
}): Tec1gState {
  const { config, matrixMode, initialSysCtrl, initialSysCtrlDecoded, cartridgePresentDefault } = params;
  const state: Tec1gState = {
    display: {
      digits: Array.from({ length: 6 }, () => 0),
      ledMatrixRedRows: Array.from({ length: 8 }, () => 0),
      ledMatrixGreenRows: Array.from({ length: 8 }, () => 0),
      ledMatrixBlueRows: Array.from({ length: 8 }, () => 0),
      ledMatrixBrightnessR: Array.from({ length: 64 }, () => 0),
      ledMatrixBrightnessG: Array.from({ length: 64 }, () => 0),
      ledMatrixBrightnessB: Array.from({ length: 64 }, () => 0),
      matrixStagingR: Array.from({ length: 64 }, () => 0),
      matrixStagingG: Array.from({ length: 64 }, () => 0),
      matrixStagingB: Array.from({ length: 64 }, () => 0),
      matrixRowsVisitedMask: 0,
      matrixLastActivityCycle: -1,
      digitLatch: 0,
      segmentLatch: 0,
      ledMatrixRowLatch: 0,
      ledMatrixRedLatch: 0,
      ledMatrixGreenLatch: 0,
      ledMatrixBlueLatch: 0,
      glcdCtrl: createGlcdState(),
    },
    input: {
      matrixKeyStates: new Uint8Array(16).fill(TEC1G_MASK_BYTE),
      matrixModeEnabled: matrixMode,
      keyValue: TEC1G_MASK_LOW7,
      keyReleaseEventId: null,
      nmiPending: false,
      shiftKeyActive: false,
      rawKeyActive: false,
    },
    audio: {
      speaker: false,
      speakerHz: 0,
      lastEdgeCycle: null,
      silenceEventId: null,
    },
    lcdCtrl: {
      lcd: Array.from({ length: 80 }, () => TEC1G_LCD_SPACE),
      lcdAddr: TEC1G_LCD_ROW0_START,
      lcdAddrMode: 'ddram',
      lcdEntryIncrement: true,
      lcdEntryShift: false,
      lcdDisplayOn: true,
      lcdCursorOn: false,
      lcdCursorBlink: false,
      lcdDisplayShift: 0,
      lcdCgram: new Uint8Array(64),
      lcdCgramAddr: 0,
      lcdFunction: {
        dataLength8: true,
        lines2: true,
        font5x8: true,
      },
    },
    timing: {
      cycleClock: new CycleClock(),
      lastUpdateMs: 0,
      pendingUpdate: false,
      clockHz: TEC_FAST_HZ,
      speedMode: 'fast',
      updateMs: config.updateMs,
      yieldMs: config.yieldMs,
    },
    system: {
      sysCtrl: initialSysCtrl,
      shadowEnabled: initialSysCtrlDecoded.shadowEnabled,
      protectEnabled: initialSysCtrlDecoded.protectEnabled,
      expandEnabled: initialSysCtrlDecoded.expandEnabled,
      bankA14: initialSysCtrlDecoded.bankA14,
      capsLock: initialSysCtrlDecoded.capsLock,
      cartridgePresent: cartridgePresentDefault,
      gimpSignal: config.gimpSignal,
    },
  };
  primeTec1gLcdTestLine(state.lcdCtrl);
  return state;
}

/**
 *
 */
function primeTec1gLcdTestLine(lcdState: Tec1gLcdState): void {
  const lcdTest = 'ARROWS: ';
  for (let i = 0; i < lcdTest.length && i < lcdState.lcd.length; i += 1) {
    lcdState.lcd[i] = lcdTest.charCodeAt(i);
  }
  if (lcdState.lcd.length > lcdTest.length) {
    lcdState.lcd[lcdTest.length] = TEC1G_LCD_ARROW_LEFT;
  }
  if (lcdState.lcd.length > lcdTest.length + 1) {
    lcdState.lcd[lcdTest.length + 1] = TEC1G_LCD_SPACE;
  }
  if (lcdState.lcd.length > lcdTest.length + 2) {
    lcdState.lcd[lcdTest.length + 2] = TEC1G_LCD_ARROW_RIGHT;
  }
}
