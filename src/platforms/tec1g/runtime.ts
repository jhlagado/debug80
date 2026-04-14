/**
 * @file TEC-1G runtime implementation and configuration.
 * @fileoverview
 *
 * Normalizes TEC-1G configuration and builds IO handlers for LCD/GLCD,
 * keypad, serial, and shadow/protection behavior.
 */

import { IoHandlers } from '../../z80/runtime';
import { Tec1gPlatformConfigNormalized } from '../types';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';
import { decodeSysCtrl } from './sysctrl';
import { Ds1302 } from './ds1302';
import { createTec1gLcdController } from './lcd';
import { createTec1gSerialController } from './serial';
import { createGlcdController } from './glcd';
import { createTec1gUpdateController, type Tec1gUpdateController } from './update-controller';
import {
  TEC1G_SYSCTRL_PROTECT,
  TEC1G_SYSCTRL_BANK_A14,
  TEC1G_KEY_SHIFT_MASK,
  TEC1G_MASK_BYTE,
  TEC1G_MASK_LOW7,
  TEC1G_NMI_VECTOR,
} from './constants';
import {
  TEC_SLOW_HZ,
  TEC_FAST_HZ,
  TEC_KEY_HOLD_MS,
  calculateKeyHoldCycles,
} from '../tec-common';
import { createTec1gIoHandlers } from './io-handlers';
import { handleMatrixPortWrite, maybeCommitMatrixOnIdle } from './runtime-matrix';
import { createTec1gSdSpi } from './runtime-storage';
import { createTec1gInitialState } from './runtime-state';
import type { Tec1gState } from './runtime-state';
import { resetTec1gRuntimeState, silenceTec1gSpeaker } from './runtime-lifecycle';
export { normalizeTec1gConfig } from './runtime-config';

/**
 * Runtime facade for TEC-1G IO handlers and lifecycle controls.
 */
export interface Tec1gRuntime {
  state: Tec1gState;
  ioHandlers: IoHandlers;
  applyKey(code: number): void;
  applyMatrixKey(row: number, col: number, pressed: boolean): void;
  setMatrixMode(enabled: boolean): void;
  setCartridgePresent(enabled: boolean): void;
  queueSerial(bytes: number[]): void;
  recordCycles(cycles: number): void;
  silenceSpeaker(): void;
  setSpeed(mode: Tec1gSpeedMode): void;
  resetState(): void;
  queueUpdate(): void;
}

export const TEC1G_SLOW_HZ = TEC_SLOW_HZ;
export const TEC1G_FAST_HZ = TEC_FAST_HZ;
const TEC1G_KEY_HOLD_MS = TEC_KEY_HOLD_MS;
export type { Tec1gState };

/**
 * Builds the TEC-1G runtime IO handlers and state.
 * @param config - Normalized TEC-1G configuration.
 * @param onUpdate - Called with UI payloads when state changes.
 * @param onSerialByte - Optional serial byte callback.
 * @returns Runtime facade with IO handlers and control helpers.
 */
export function createTec1gRuntime(
  config: Tec1gPlatformConfigNormalized,
  onUpdate: (payload: Tec1gUpdatePayload) => void,
  onSerialByte?: (byte: number) => void,
  onPortWrite?: (payload: { port: number; value: number }) => void
): Tec1gRuntime {
  const initialSysCtrl =
    (config.expansionBankHi ? TEC1G_SYSCTRL_BANK_A14 : 0) |
    (config.protectOnReset ? TEC1G_SYSCTRL_PROTECT : 0);
  const initialSysCtrlDecoded = decodeSysCtrl(initialSysCtrl);
  const matrixMode = config.matrixMode;
  const rtcEnabled = config.rtcEnabled;
  const rtc = rtcEnabled ? new Ds1302() : null;
  const { sdEnabled, sdSpi } = createTec1gSdSpi(config);
  let cartridgePresentDefault = config.cartridgeHex !== undefined;
  const state = createTec1gInitialState({
    config,
    matrixMode,
    initialSysCtrl,
    initialSysCtrlDecoded,
    cartridgePresentDefault,
  });
  const defaultGimpSignal = config.gimpSignal;
  const defaultSysCtrl = initialSysCtrl;
  const display = state.display;
  const input = state.input;
  const lcdState = state.lcdCtrl;
  const timing = state.timing;
  const system = state.system;

  const updateControllerRef: { current: Tec1gUpdateController | undefined } = {
    current: undefined,
  };
  /**
   * Queues a throttled runtime UI update through the update controller.
   */
  function queueUpdate(): void {
    updateControllerRef.current?.queueUpdate();
  }
  /**
   * Flushes any pending throttled runtime UI update through the update controller.
   */
  function flushUpdate(): void {
    updateControllerRef.current?.flushUpdate();
  }

  const glcd = createGlcdController(
    display.glcdCtrl,
    timing.cycleClock,
    timing.clockHz,
    queueUpdate
  );

  const serial = createTec1gSerialController(timing.cycleClock, timing.clockHz, onSerialByte);

  const lcd = createTec1gLcdController(lcdState, timing.cycleClock, timing.clockHz, queueUpdate);

  updateControllerRef.current = createTec1gUpdateController({
    state,
    lcd,
    glcd,
    serial,
    onUpdate,
  });

  const ioHandlers = createTec1gIoHandlers({
    state,
    timing,
    lcd,
    glcd,
    serial,
    rtcEnabled,
    rtc,
    sdEnabled,
    sdSpi,
    queueUpdate,
    onMatrixPortsChanged: (kind: 'row' | 'rgb'): void => {
      handleMatrixPortWrite(display, timing, kind, queueUpdate);
    },
    ...(onPortWrite ? { onPortWrite } : {}),
  });

  const tick = (): { interrupt?: { nonMaskable?: boolean; data?: number } } | void => {
    flushUpdate();
    if (input.nmiPending) {
      input.nmiPending = false;
      return { interrupt: { nonMaskable: true, data: TEC1G_NMI_VECTOR } };
    }
    return undefined;
  };

  const applyKey = (code: number): void => {
    if (input.matrixModeEnabled) {
      return;
    }
    input.keyValue = code & TEC1G_MASK_LOW7;
    input.rawKeyActive = (input.keyValue & TEC1G_MASK_LOW7) !== TEC1G_MASK_LOW7;
    input.shiftKeyActive = input.rawKeyActive && (input.keyValue & TEC1G_KEY_SHIFT_MASK) === 0;
    input.nmiPending = true;
    if (input.keyReleaseEventId !== null) {
      timing.cycleClock.cancel(input.keyReleaseEventId);
    }
    const holdCycles = calculateKeyHoldCycles(timing.clockHz, TEC1G_KEY_HOLD_MS);
    input.keyReleaseEventId = timing.cycleClock.scheduleIn(holdCycles, () => {
      input.keyValue = TEC1G_MASK_LOW7;
      input.rawKeyActive = false;
      input.shiftKeyActive = false;
      input.keyReleaseEventId = null;
    });
  };

  const applyMatrixKey = (row: number, col: number, pressed: boolean): void => {
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return;
    }
    const rowIndex = Math.max(0, Math.min(15, Math.trunc(row)));
    const colIndex = Math.max(0, Math.min(7, Math.trunc(col)));
    const mask = 1 << colIndex;
    const current = input.matrixKeyStates[rowIndex] ?? TEC1G_MASK_BYTE;
    input.matrixKeyStates[rowIndex] = pressed ? current & ~mask : current | mask;
  };

  const setMatrixMode = (enabled: boolean): void => {
    input.matrixModeEnabled = enabled;
  };

  const queueSerial = (bytes: number[]): void => {
    serial.queueSerial(bytes);
  };

  const recordCycles = (cycles: number): void => {
    if (cycles <= 0) {
      return;
    }
    timing.cycleClock.advance(cycles);
    maybeCommitMatrixOnIdle(display, timing, queueUpdate);
  };

  const silenceSpeaker = (): void => {
    silenceTec1gSpeaker(state, queueUpdate);
  };

  const setSpeed = (mode: Tec1gSpeedMode): void => {
    updateControllerRef.current?.setSpeed(mode);
  };

  const resetState = (): void => {
    resetTec1gRuntimeState(
      state,
      {
        matrixMode,
        sysCtrl: defaultSysCtrl,
        gimpSignal: defaultGimpSignal,
        cartridgePresent: cartridgePresentDefault,
      },
      { lcd, glcd, serial },
      queueUpdate
    );
  };

  return {
    state,
    ioHandlers: { ...ioHandlers, tick },
    applyKey,
    applyMatrixKey,
    setMatrixMode,
    setCartridgePresent: (enabled: boolean): void => {
      cartridgePresentDefault = enabled;
      system.cartridgePresent = enabled;
    },
    queueSerial,
    recordCycles,
    silenceSpeaker,
    setSpeed,
    resetState,
    queueUpdate,
  };
}
