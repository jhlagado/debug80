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
import { createTec1gLcdController } from './lcd';
import { createTec1gSerialController } from './serial';
import { createGlcdController, createGlcdState, type GlcdState } from './glcd';
import {
  TEC1G_DIGIT_SERIAL_TX,
  TEC1G_DIGIT_SPEAKER,
  TEC1G_PORT_DIGIT,
  TEC1G_PORT_GLCD_CMD,
  TEC1G_PORT_GLCD_DATA,
  TEC1G_PORT_KEYBOARD,
  TEC1G_PORT_LCD_CMD,
  TEC1G_PORT_LCD_DATA,
  TEC1G_PORT_MATRIX,
  TEC1G_PORT_MATRIX_LATCH,
  TEC1G_PORT_MATRIX_STROBE,
  TEC1G_PORT_RTC,
  TEC1G_PORT_SD,
  TEC1G_PORT_SEGMENT,
  TEC1G_PORT_STATUS,
  TEC1G_PORT_SYSCTRL,
  TEC1G_ADDR_MAX,
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
  TEC1G_MASK_LOW4,
  TEC1G_NMI_VECTOR,
  TEC1G_STATUS_CARTRIDGE,
  TEC1G_STATUS_EXPAND,
  TEC1G_STATUS_GIMP,
  TEC1G_STATUS_NO_KEY,
  TEC1G_STATUS_PROTECT,
  TEC1G_STATUS_RAW_KEY,
  TEC1G_STATUS_SERIAL_RX,
  TEC1G_STATUS_SHIFT,
} from './constants';
import * as fs from 'fs';
import {
  TEC_SLOW_HZ,
  TEC_FAST_HZ,
  TEC_SILENCE_CYCLES,
  TEC_KEY_HOLD_MS,
  updateDisplayDigits,
  updateMatrixRow,
  calculateSpeakerFrequency,
  calculateKeyHoldCycles,
  shouldUpdate,
} from '../tec-common';

/**
 * Mutable runtime state for TEC-1G hardware emulation.
 */
export interface Tec1gState {
  digits: number[];
  matrix: number[];
  digitLatch: number;
  segmentLatch: number;
  matrixLatch: number;
  matrixKeyStates: Uint8Array;
  matrixModeEnabled: boolean;
  glcdCtrl: GlcdState;
  speaker: boolean;
  speakerHz: number;
  lcd: number[];
  lcdAddr: number;
  lcdAddrMode: 'ddram' | 'cgram';
  lcdEntryIncrement: boolean;
  lcdEntryShift: boolean;
  lcdDisplayOn: boolean;
  lcdCursorOn: boolean;
  lcdCursorBlink: boolean;
  lcdDisplayShift: number;
  lcdCgram: Uint8Array;
  lcdCgramAddr: number;
  lcdFunction: {
    dataLength8: boolean;
    lines2: boolean;
    font5x8: boolean;
  };
  cycleClock: CycleClock;
  lastEdgeCycle: number | null;
  silenceEventId: number | null;
  keyValue: number;
  keyReleaseEventId: number | null;
  nmiPending: boolean;
  lastUpdateMs: number;
  pendingUpdate: boolean;
  clockHz: number;
  speedMode: Tec1gSpeedMode;
  updateMs: number;
  yieldMs: number;
  sysCtrl: number;
  shadowEnabled: boolean;
  protectEnabled: boolean;
  expandEnabled: boolean;
  bankA14: boolean;
  capsLock: boolean;
  cartridgePresent: boolean;
  shiftKeyActive: boolean;
  rawKeyActive: boolean;
  gimpSignal: boolean;
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
const TEC1G_SILENCE_CYCLES = TEC_SILENCE_CYCLES;
const TEC1G_KEY_HOLD_MS = TEC_KEY_HOLD_MS;

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
    digits: Array.from({ length: 6 }, () => 0),
    matrix: Array.from({ length: 8 }, () => 0),
    digitLatch: 0,
    segmentLatch: 0,
    matrixLatch: 0,
    matrixKeyStates: new Uint8Array(16).fill(TEC1G_MASK_BYTE),
    matrixModeEnabled: matrixMode,
    glcdCtrl: createGlcdState(),
    speaker: false,
    speakerHz: 0,
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
    cycleClock: new CycleClock(),
    lastEdgeCycle: null,
    silenceEventId: null,
    keyValue: TEC1G_MASK_LOW7,
    keyReleaseEventId: null,
    nmiPending: false,
    lastUpdateMs: 0,
    pendingUpdate: false,
    clockHz: TEC1G_FAST_HZ,
    speedMode: 'fast',
    updateMs: config.updateMs,
    yieldMs: config.yieldMs,
    sysCtrl: initialSysCtrl,
    shadowEnabled: initialSysCtrlDecoded.shadowEnabled,
    protectEnabled: initialSysCtrlDecoded.protectEnabled,
    expandEnabled: initialSysCtrlDecoded.expandEnabled,
    bankA14: initialSysCtrlDecoded.bankA14,
    capsLock: initialSysCtrlDecoded.capsLock,
    cartridgePresent: cartridgePresentDefault,
    shiftKeyActive: false,
    rawKeyActive: false,
    gimpSignal: config.gimpSignal,
  };
  const defaultGimpSignal = config.gimpSignal;
  const defaultSysCtrl = initialSysCtrl;
  const lcdTest = 'ARROWS: ';
  for (let i = 0; i < lcdTest.length && i < state.lcd.length; i += 1) {
    state.lcd[i] = lcdTest.charCodeAt(i);
  }
  if (state.lcd.length > lcdTest.length) {
    state.lcd[lcdTest.length] = TEC1G_LCD_ARROW_LEFT;
  }
  if (state.lcd.length > lcdTest.length + 1) {
    state.lcd[lcdTest.length + 1] = TEC1G_LCD_SPACE;
  }
  if (state.lcd.length > lcdTest.length + 2) {
    state.lcd[lcdTest.length + 2] = TEC1G_LCD_ARROW_RIGHT;
  }

  const sendUpdate = (): void => {
    onUpdate({
      digits: [...state.digits],
      matrix: [...state.matrix],
      matrixMode: state.matrixModeEnabled,
      glcd: Array.from(state.glcdCtrl.glcd),
      glcdDdram: Array.from(state.glcdCtrl.glcdDdram),
      glcdState: {
        displayOn: state.glcdCtrl.glcdDisplayOn,
        graphicsOn: state.glcdCtrl.glcdGraphics,
        cursorOn: state.glcdCtrl.glcdCursorOn,
        cursorBlink: state.glcdCtrl.glcdCursorBlink,
        blinkVisible: state.glcdCtrl.glcdBlinkVisible,
        ddramAddr: state.glcdCtrl.glcdDdramAddr,
        ddramPhase: state.glcdCtrl.glcdDdramPhase,
        textShift: state.glcdCtrl.glcdTextShift,
        scroll: state.glcdCtrl.glcdScroll,
        reverseMask: state.glcdCtrl.glcdReverseMask,
      },
      sysCtrl: state.sysCtrl,
      bankA14: state.bankA14,
      capsLock: state.capsLock,
      lcdState: {
        displayOn: state.lcdDisplayOn,
        cursorOn: state.lcdCursorOn,
        cursorBlink: state.lcdCursorBlink,
        cursorAddr: state.lcdAddr,
        displayShift: state.lcdDisplayShift,
      },
      lcdCgram: Array.from(state.lcdCgram),
      speaker: state.speaker ? 1 : 0,
      speedMode: state.speedMode,
      lcd: [...state.lcd],
      speakerHz: state.speakerHz,
    });
  };

  const glcd = createGlcdController(state.glcdCtrl, state.cycleClock, state.clockHz, () => queueUpdate());

  const serial = createTec1gSerialController(state.cycleClock, state.clockHz, onSerialByte);
  const portWriteLog = new Map<number, number>();
  const logPortWrite = (port: number, value: number): void => {
    const prev = portWriteLog.get(port);
    if (prev === value) {
      return;
    }
    portWriteLog.set(port, value);
    if (onPortWrite) {
      onPortWrite({ port, value });
    }
  };

  const queueUpdate = (): void => {
    if (shouldUpdate(state.lastUpdateMs, state.updateMs)) {
      state.lastUpdateMs = Date.now();
      state.pendingUpdate = false;
      sendUpdate();
      return;
    }
    state.pendingUpdate = true;
  };

  const flushUpdate = (): void => {
    if (!state.pendingUpdate) {
      return;
    }
    if (!shouldUpdate(state.lastUpdateMs, state.updateMs)) {
      return;
    }
    state.lastUpdateMs = Date.now();
    state.pendingUpdate = false;
    sendUpdate();
  };

  const lcd = createTec1gLcdController(state, state.cycleClock, state.clockHz, queueUpdate);

  const updateDisplay = (): void => {
    if (updateDisplayDigits(state.digits, state.digitLatch, state.segmentLatch)) {
      queueUpdate();
    }
  };

  const updateMatrix = (rowMask: number): void => {
    if (updateMatrixRow(state.matrix, rowMask, state.matrixLatch)) {
      queueUpdate();
    }
  };

  const scheduleSilence = (): void => {
    if (state.silenceEventId !== null) {
      state.cycleClock.cancel(state.silenceEventId);
    }
    state.silenceEventId = state.cycleClock.scheduleIn(TEC1G_SILENCE_CYCLES, () => {
      if (state.speakerHz !== 0) {
        state.speakerHz = 0;
        queueUpdate();
      }
    });
  };

  const ioHandlers: IoHandlers = {
    read: (port: number): number => {
      const fullPort = port & TEC1G_ADDR_MAX;
      const p = fullPort & TEC1G_MASK_BYTE;
      const highByte = (fullPort >> 8) & TEC1G_MASK_BYTE;
      if (p === TEC1G_PORT_KEYBOARD) {
        serial.maybeStartQueuedRx();
        const key = state.keyValue & TEC1G_MASK_LOW7;
        return key | (serial.getRxLevel() ? TEC1G_STATUS_SERIAL_RX : 0);
      }
      if (p === TEC1G_PORT_MATRIX) {
        if (!state.matrixModeEnabled) {
          return TEC1G_MASK_BYTE;
        }
        const row = highByte & TEC1G_MASK_LOW4;
        return state.matrixKeyStates[row] ?? TEC1G_MASK_BYTE;
      }
      if (p === TEC1G_PORT_LCD_CMD) {
        return lcd.readStatus();
      }
      if (p === TEC1G_PORT_LCD_DATA) {
        return lcd.readData();
      }
      if (p === TEC1G_PORT_RTC) {
        return rtcEnabled && rtc ? rtc.read() : TEC1G_MASK_BYTE;
      }
      if (p === TEC1G_PORT_SD) {
        return sdEnabled && sdSpi ? sdSpi.read() : TEC1G_MASK_BYTE;
      }
      if (p === TEC1G_PORT_GLCD_CMD) {
        return glcd.readStatus();
      }
      if (p === TEC1G_PORT_GLCD_DATA) {
        return glcd.readData();
      }
      if (p === TEC1G_PORT_SYSCTRL) {
        return state.sysCtrl & TEC1G_MASK_BYTE;
      }
      if (p === TEC1G_PORT_STATUS) {
        const keyPressed = (state.keyValue & TEC1G_MASK_LOW7) !== TEC1G_MASK_LOW7;
        let value = 0;
        if (state.shiftKeyActive) {
          value |= TEC1G_STATUS_SHIFT;
        }
        if (state.protectEnabled) {
          value |= TEC1G_STATUS_PROTECT;
        }
        if (state.expandEnabled) {
          value |= TEC1G_STATUS_EXPAND;
        }
        if (state.cartridgePresent) {
          value |= TEC1G_STATUS_CARTRIDGE;
        }
        if (state.rawKeyActive) {
          value |= TEC1G_STATUS_RAW_KEY;
        }
        if (state.gimpSignal) {
          value |= TEC1G_STATUS_GIMP;
        }
        if (!keyPressed) {
          value |= TEC1G_STATUS_NO_KEY;
        }
        if (serial.getRxLevel()) {
          value |= TEC1G_STATUS_SERIAL_RX;
        }
        return value;
      }
      return TEC1G_MASK_BYTE;
    },
    write: (port: number, value: number): void => {
      const fullPort = port & TEC1G_ADDR_MAX;
      const p = fullPort & TEC1G_MASK_BYTE;
      void fullPort;
      if (p === TEC1G_PORT_DIGIT) {
        state.digitLatch = value & TEC1G_MASK_BYTE;
        const speaker = (value & TEC1G_DIGIT_SPEAKER) !== 0;
        const nextSerial: 0 | 1 = (value & TEC1G_DIGIT_SERIAL_TX) !== 0 ? 1 : 0;
        serial.recordTxLevel(nextSerial);
        if (speaker !== state.speaker) {
          const now = state.cycleClock.now();
          if (state.lastEdgeCycle !== null) {
            const delta = now - state.lastEdgeCycle;
            state.speakerHz = calculateSpeakerFrequency(state.clockHz, delta);
            if (state.speakerHz > 0) {
              queueUpdate();
            }
          }
          state.lastEdgeCycle = now;
          scheduleSilence();
        }
        state.speaker = speaker;
        updateDisplay();
        return;
      }
      if (p === TEC1G_PORT_SEGMENT) {
        state.segmentLatch = value & TEC1G_MASK_BYTE;
        updateDisplay();
        return;
      }
      if (p === TEC1G_PORT_MATRIX_LATCH) {
        state.matrixLatch = value & TEC1G_MASK_BYTE;
        return;
      }
      if (p === TEC1G_PORT_MATRIX_STROBE) {
        updateMatrix(value & TEC1G_MASK_BYTE);
        return;
      }
      if (p === TEC1G_PORT_RTC) {
        if (rtcEnabled && rtc) {
          rtc.write(value & TEC1G_MASK_BYTE);
        }
        return;
      }
      if (p === TEC1G_PORT_SD) {
        if (sdEnabled && sdSpi) {
          sdSpi.write(value & TEC1G_MASK_BYTE);
        }
        return;
      }
      if (p === TEC1G_PORT_LCD_CMD) {
        lcd.writeCommand(value & TEC1G_MASK_BYTE);
        return;
      }
      if (p === TEC1G_PORT_LCD_DATA) {
        lcd.writeData(value & TEC1G_MASK_BYTE);
        return;
      }
      if (p === TEC1G_PORT_GLCD_CMD) {
        glcd.writeCommand(value & TEC1G_MASK_BYTE);
        return;
      }
      if (p === TEC1G_PORT_GLCD_DATA) {
        glcd.writeData(value & TEC1G_MASK_BYTE);
        return;
      }
      if (p >= TEC1G_PORT_RTC && p <= TEC1G_PORT_MATRIX) {
        logPortWrite(p, value);
        return;
      }
      if (p === TEC1G_PORT_SYSCTRL) {
        logPortWrite(p, value);
        state.sysCtrl = value & TEC1G_MASK_BYTE;
        const decoded = decodeSysCtrl(state.sysCtrl);
        state.shadowEnabled = decoded.shadowEnabled;
        state.protectEnabled = decoded.protectEnabled;
        state.expandEnabled = decoded.expandEnabled;
        state.bankA14 = decoded.bankA14;
        state.capsLock = decoded.capsLock;
        return;
      }
    },
    tick: (): { interrupt?: { nonMaskable?: boolean; data?: number } } | void => {
      flushUpdate();
      if (state.nmiPending) {
        state.nmiPending = false;
        return { interrupt: { nonMaskable: true, data: TEC1G_NMI_VECTOR } };
      }
      return undefined;
    },
  };

  const applyKey = (code: number): void => {
    if (state.matrixModeEnabled) {
      return;
    }
    state.keyValue = code & TEC1G_MASK_LOW7;
    state.rawKeyActive = (state.keyValue & TEC1G_MASK_LOW7) !== TEC1G_MASK_LOW7;
    state.shiftKeyActive = state.rawKeyActive && (state.keyValue & TEC1G_KEY_SHIFT_MASK) === 0;
    state.nmiPending = true;
    if (state.keyReleaseEventId !== null) {
      state.cycleClock.cancel(state.keyReleaseEventId);
    }
    const holdCycles = calculateKeyHoldCycles(state.clockHz, TEC1G_KEY_HOLD_MS);
    state.keyReleaseEventId = state.cycleClock.scheduleIn(holdCycles, () => {
      state.keyValue = TEC1G_MASK_LOW7;
      state.rawKeyActive = false;
      state.shiftKeyActive = false;
      state.keyReleaseEventId = null;
    });
  };

  const applyMatrixKey = (row: number, col: number, pressed: boolean): void => {
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return;
    }
    const rowIndex = Math.max(0, Math.min(15, Math.trunc(row)));
    const colIndex = Math.max(0, Math.min(7, Math.trunc(col)));
    const mask = 1 << colIndex;
    const current = state.matrixKeyStates[rowIndex] ?? TEC1G_MASK_BYTE;
    state.matrixKeyStates[rowIndex] = pressed ? current & ~mask : current | mask;
  };

  const setMatrixMode = (enabled: boolean): void => {
    state.matrixModeEnabled = enabled;
  };

  const queueSerial = (bytes: number[]): void => {
    serial.queueSerial(bytes);
  };

  const recordCycles = (cycles: number): void => {
    if (cycles <= 0) {
      return;
    }
    state.cycleClock.advance(cycles);
  };

  const silenceSpeaker = (): void => {
    if (state.speakerHz !== 0 || state.speaker) {
      state.speakerHz = 0;
      state.speaker = false;
      state.lastEdgeCycle = null;
      if (state.silenceEventId !== null) {
        state.cycleClock.cancel(state.silenceEventId);
        state.silenceEventId = null;
      }
      queueUpdate();
    }
  };

  const setSpeed = (mode: Tec1gSpeedMode): void => {
    state.speedMode = mode;
    state.clockHz = mode === 'slow' ? TEC1G_SLOW_HZ : TEC1G_FAST_HZ;
    serial.setClockHz(state.clockHz);
    lcd.setClockHz(state.clockHz);
    glcd.setClockHz(state.clockHz);
    sendUpdate();
  };

  const resetState = (): void => {
    state.speaker = false;
    state.speakerHz = 0;
    state.lastEdgeCycle = null;
    lcd.reset();
    state.matrix.fill(0);
    state.matrixKeyStates.fill(TEC1G_MASK_BYTE);
    state.matrixModeEnabled = matrixMode;
    glcd.reset();
    state.sysCtrl = defaultSysCtrl;
    const decoded = decodeSysCtrl(state.sysCtrl);
    state.shadowEnabled = decoded.shadowEnabled;
    state.protectEnabled = decoded.protectEnabled;
    state.expandEnabled = decoded.expandEnabled;
    state.bankA14 = decoded.bankA14;
    state.capsLock = decoded.capsLock;
    state.shiftKeyActive = false;
    state.rawKeyActive = false;
    state.gimpSignal = defaultGimpSignal;
    state.cartridgePresent = cartridgePresentDefault;
    if (state.silenceEventId !== null) {
      state.cycleClock.cancel(state.silenceEventId);
      state.silenceEventId = null;
    }
    serial.reset();
    queueUpdate();
  };

  return {
    state,
    ioHandlers,
    applyKey,
    applyMatrixKey,
    setMatrixMode,
    setCartridgePresent: (enabled: boolean): void => {
      cartridgePresentDefault = enabled;
      state.cartridgePresent = enabled;
    },
    queueSerial,
    recordCycles,
    silenceSpeaker,
    setSpeed,
    resetState,
    queueUpdate,
  };
}
