/**
 * @file TEC-1G runtime implementation and configuration.
 * @fileoverview
 *
 * Normalizes TEC-1G configuration and builds IO handlers for LCD/GLCD,
 * keypad, serial, and shadow/protection behavior.
 */

import { IoHandlers } from '../../z80/runtime';
import { CycleClock } from '../cycle-clock';
import { Tec1gPlatformConfig, Tec1gPlatformConfigNormalized } from '../types';
import { normalizeSimpleRegions } from '../simple/runtime';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';
import { decodeSysCtrl } from './sysctrl';
import { Ds1302 } from './ds1302';
import { SdSpi } from './sd-spi';
import { createTec1gLcdController, type Tec1gLcdState } from './lcd';
import { createTec1gSerialController } from './serial';
import { createGlcdController, createGlcdState, type GlcdState } from './glcd';
import { createTec1gUpdateController, type Tec1gUpdateController } from './update-controller';
import {
  TEC1G_SYSCTRL_PROTECT,
  TEC1G_SYSCTRL_BANK_A14,
  TEC1G_KEY_SHIFT_MASK,
  TEC1G_LCD_ARROW_LEFT,
  TEC1G_LCD_ARROW_RIGHT,
  TEC1G_ROM0_END,
  TEC1G_ROM0_START,
  TEC1G_ROM1_END,
  TEC1G_ROM1_START,
  TEC1G_RAM_END,
  TEC1G_RAM_START,
  TEC1G_APP_START_DEFAULT,
  TEC1G_ENTRY_DEFAULT,
  TEC1G_LCD_ROW0_START,
  TEC1G_LCD_SPACE,
  TEC1G_MASK_BYTE,
  TEC1G_MASK_LOW7,
  TEC1G_ADDR_MAX,
  TEC1G_NMI_VECTOR,
} from './constants';
import * as fs from 'fs';
import {
  TEC_SLOW_HZ,
  TEC_FAST_HZ,
  TEC_KEY_HOLD_MS,
  calculateKeyHoldCycles,
  millisecondsToClocks,
} from '../tec-common';
import { createTec1gIoHandlers } from './io-handlers';

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
/** Multiplex decay time constant; slightly longer hold reads brighter between scans. */
const TEC1G_MATRIX_PERSISTENCE_MS = 10;
/** Higher = shorter attack time → pixels reach full drive faster (bright LED look). */
const TEC1G_MATRIX_BRIGHTNESS_GAIN = 72;

/**
 *
 */
function updateLedMatrixBrightness(
  display: Tec1gState['display'],
  clockHz: number,
  cycles: number
): boolean {
  if (cycles <= 0 || clockHz <= 0) {
    return false;
  }

  const persistenceCycles = millisecondsToClocks(clockHz, TEC1G_MATRIX_PERSISTENCE_MS);
  const safePersistenceCycles = Math.max(1, persistenceCycles);
  const decayFactor = Math.exp(-cycles / safePersistenceCycles);
  const attackCycles = Math.max(1, safePersistenceCycles / TEC1G_MATRIX_BRIGHTNESS_GAIN);
  const chargeFactor = 1 - Math.exp(-cycles / attackCycles);
  const rowMask = display.ledMatrixRowLatch & TEC1G_MASK_BYTE;
  const redMask = display.ledMatrixRedLatch & TEC1G_MASK_BYTE;
  const greenMask = display.ledMatrixGreenLatch & TEC1G_MASK_BYTE;
  const blueMask = display.ledMatrixBlueLatch & TEC1G_MASK_BYTE;
  let changed = false;

  const updateChannel = (channel: number[], index: number, lit: boolean): void => {
    const current = channel[index] ?? 0;
    const faded = current > 0 ? current * decayFactor : 0;
    const next = lit ? faded + ((255 - faded) * chargeFactor) : faded;
    if (Math.abs(next - current) > 0.0001) {
      channel[index] = next;
      changed = true;
    }
  };

  for (let row = 0; row < 8; row += 1) {
    const rowSelected = (rowMask & (1 << row)) !== 0;
    const base = row * 8;
    for (let col = 0; col < 8; col += 1) {
      const index = base + col;
      const columnBit = 1 << col;
      const redLit = rowSelected && (redMask & columnBit) !== 0;
      const greenLit = rowSelected && (greenMask & columnBit) !== 0;
      const blueLit = rowSelected && (blueMask & columnBit) !== 0;
      updateChannel(display.ledMatrixBrightnessR, index, redLit);
      updateChannel(display.ledMatrixBrightnessG, index, greenLit);
      updateChannel(display.ledMatrixBrightnessB, index, blueLit);
    }
  }

  return changed;
}

/**
 * Normalizes TEC-1G configuration with defaults and bounds.
 * @param cfg - Optional TEC-1G config from project settings.
 * @returns Normalized config for runtime construction.
 */
export function normalizeTec1gConfig(cfg?: Tec1gPlatformConfig): Tec1gPlatformConfigNormalized {
  const config: Tec1gPlatformConfig = cfg ?? {};
  const regions = normalizeSimpleRegions(config.regions, [
    { start: TEC1G_ROM0_START, end: TEC1G_ROM0_END, kind: 'rom' },
    { start: TEC1G_RAM_START, end: TEC1G_RAM_END, kind: 'ram' },
    { start: TEC1G_ROM1_START, end: TEC1G_ROM1_END, kind: 'rom' },
  ]);
  const romRanges = regions
    .filter((region) => region.kind === 'rom' || region.readOnly === true)
    .map((region) => ({ start: region.start, end: region.end }));
  const appStart =
    Number.isFinite(config.appStart) && config.appStart !== undefined
      ? config.appStart
      : TEC1G_APP_START_DEFAULT;
  const entry =
    Number.isFinite(config.entry) && config.entry !== undefined
      ? config.entry
      : TEC1G_ENTRY_DEFAULT;
  const romHex =
    typeof config.romHex === 'string' && config.romHex !== '' ? config.romHex : undefined;
  const ramInitHex =
    typeof config.ramInitHex === 'string' && config.ramInitHex !== ''
      ? config.ramInitHex
      : undefined;
  const cartridgeHex =
    typeof config.cartridgeHex === 'string' && config.cartridgeHex !== ''
      ? config.cartridgeHex
      : undefined;
  const updateMs =
    Number.isFinite(config.updateMs) && config.updateMs !== undefined ? config.updateMs : 16;
  const yieldMs =
    Number.isFinite(config.yieldMs) && config.yieldMs !== undefined ? config.yieldMs : 0;
  const extraListings = Array.isArray(config.extraListings)
    ? config.extraListings
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry !== '')
    : undefined;
  const gimpSignal = config.gimpSignal === true;
  const expansionBankHi = config.expansionBankHi === true;
  const matrixMode = config.matrixMode === true;
  const protectOnReset = config.protectOnReset === true;
  const rtcEnabled = config.rtcEnabled === true;
  const sdEnabled = config.sdEnabled === true;
  const sdHighCapacity = config.sdHighCapacity !== false;
  const sdImagePath =
    typeof config.sdImagePath === 'string' && config.sdImagePath !== ''
      ? config.sdImagePath
      : undefined;
  return {
    regions,
    romRanges,
    appStart: Math.max(0, Math.min(TEC1G_ADDR_MAX, appStart)),
    entry: Math.max(0, Math.min(TEC1G_ADDR_MAX, entry)),
    ...(romHex !== undefined ? { romHex } : {}),
    ...(ramInitHex !== undefined ? { ramInitHex } : {}),
    updateMs: Math.max(0, updateMs),
    yieldMs: Math.max(0, yieldMs),
    gimpSignal,
    expansionBankHi,
    matrixMode,
    protectOnReset,
    rtcEnabled,
    sdEnabled,
    sdHighCapacity,
    ...(sdImagePath !== undefined ? { sdImagePath } : {}),
    ...(cartridgeHex !== undefined ? { cartridgeHex } : {}),
    ...(extraListings ? { extraListings } : {}),
    ...(cfg?.uiVisibility ? { uiVisibility: cfg.uiVisibility } : {}),
  };
}

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
  const sdEnabled = config.sdEnabled;
  const sdImagePath = config.sdImagePath;
  const sdHighCapacity = config.sdHighCapacity;
  let sdImage: Uint8Array | undefined;
  if (sdEnabled && typeof sdImagePath === 'string' && sdImagePath !== '') {
    try {
      sdImage = new Uint8Array(fs.readFileSync(sdImagePath));
    } catch {
      sdImage = undefined;
    }
  }
  const sdSpi = sdEnabled
    ? new SdSpi({
        highCapacity: sdHighCapacity,
        ...(sdImage ? { image: sdImage } : {}),
        ...(sdImagePath !== undefined && sdImagePath !== '' && sdImage
          ? {
              onWrite: (image): void => {
                try {
                  fs.writeFileSync(sdImagePath, image);
                } catch {
                  // Ignore persistence failures; runtime continues with in-memory image.
                }
              },
            }
          : {}),
      })
    : null;
  let cartridgePresentDefault = config.cartridgeHex !== undefined;
  const state: Tec1gState = {
    display: {
      digits: Array.from({ length: 6 }, () => 0),
      ledMatrixRedRows: Array.from({ length: 8 }, () => 0),
      ledMatrixGreenRows: Array.from({ length: 8 }, () => 0),
      ledMatrixBlueRows: Array.from({ length: 8 }, () => 0),
      ledMatrixBrightnessR: Array.from({ length: 64 }, () => 0),
      ledMatrixBrightnessG: Array.from({ length: 64 }, () => 0),
      ledMatrixBrightnessB: Array.from({ length: 64 }, () => 0),
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
      clockHz: TEC1G_FAST_HZ,
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
  const defaultGimpSignal = config.gimpSignal;
  const defaultSysCtrl = initialSysCtrl;
  const display = state.display;
  const input = state.input;
  const audio = state.audio;
  const lcdState = state.lcdCtrl;
  const timing = state.timing;
  const system = state.system;
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

  const updateControllerRef: { current: Tec1gUpdateController | undefined } = { current: undefined };
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

  const glcd = createGlcdController(display.glcdCtrl, timing.cycleClock, timing.clockHz, queueUpdate);

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
    if (updateLedMatrixBrightness(display, timing.clockHz, cycles)) {
      queueUpdate();
    }
  };

  const silenceSpeaker = (): void => {
    if (audio.speakerHz !== 0 || audio.speaker) {
      audio.speakerHz = 0;
      audio.speaker = false;
      audio.lastEdgeCycle = null;
      if (audio.silenceEventId !== null) {
        timing.cycleClock.cancel(audio.silenceEventId);
        audio.silenceEventId = null;
      }
      queueUpdate();
    }
  };

  const setSpeed = (mode: Tec1gSpeedMode): void => {
    updateControllerRef.current?.setSpeed(mode);
  };

  const resetState = (): void => {
    audio.speaker = false;
    audio.speakerHz = 0;
    audio.lastEdgeCycle = null;
    lcd.reset();
    display.ledMatrixRedRows.fill(0);
    display.ledMatrixGreenRows.fill(0);
    display.ledMatrixBlueRows.fill(0);
    display.ledMatrixBrightnessR.fill(0);
    display.ledMatrixBrightnessG.fill(0);
    display.ledMatrixBrightnessB.fill(0);
    display.ledMatrixRowLatch = 0;
    display.ledMatrixRedLatch = 0;
    display.ledMatrixGreenLatch = 0;
    display.ledMatrixBlueLatch = 0;
    input.matrixKeyStates.fill(TEC1G_MASK_BYTE);
    input.matrixModeEnabled = matrixMode;
    glcd.reset();
    system.sysCtrl = defaultSysCtrl;
    const decoded = decodeSysCtrl(system.sysCtrl);
    system.shadowEnabled = decoded.shadowEnabled;
    system.protectEnabled = decoded.protectEnabled;
    system.expandEnabled = decoded.expandEnabled;
    system.bankA14 = decoded.bankA14;
    system.capsLock = decoded.capsLock;
    input.shiftKeyActive = false;
    input.rawKeyActive = false;
    system.gimpSignal = defaultGimpSignal;
    system.cartridgePresent = cartridgePresentDefault;
    if (audio.silenceEventId !== null) {
      timing.cycleClock.cancel(audio.silenceEventId);
      audio.silenceEventId = null;
    }
    serial.reset();
    queueUpdate();
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
