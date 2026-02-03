/**
 * @file TEC-1G runtime implementation and configuration.
 * @fileoverview
 *
 * Normalizes TEC-1G configuration and builds IO handlers for LCD/GLCD,
 * keypad, serial, and shadow/protection behavior.
 */

import { IoHandlers } from '../../z80/runtime';
import { CycleClock } from '../cycle-clock';
import { BitbangUartDecoder } from '../serial/bitbang-uart';
import { Tec1gPlatformConfig, Tec1gPlatformConfigNormalized } from '../types';
import { normalizeSimpleRegions } from '../simple/runtime';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';
import { decodeSysCtrl } from './sysctrl';
import { Ds1302 } from './ds1302';
import { SdSpi } from './sd-spi';
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
  microsecondsToClocks,
  millisecondsToClocks,
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
  glcd: Uint8Array;
  glcdRowAddr: number;
  glcdRowBase: number;
  glcdCol: number;
  glcdExpectColumn: boolean;
  glcdRe: boolean;
  glcdGraphics: boolean;
  glcdDisplayOn: boolean;
  glcdCursorOn: boolean;
  glcdCursorBlink: boolean;
  glcdBlinkVisible: boolean;
  glcdBlinkEventId: number | null;
  glcdEntryIncrement: boolean;
  glcdEntryShift: boolean;
  glcdTextShift: number;
  glcdScrollMode: boolean;
  glcdScroll: number;
  glcdReverseMask: number;
  glcdGdramPhase: 0 | 1;
  glcdDdram: Uint8Array;
  glcdDdramAddr: number;
  glcdDdramPhase: 0 | 1;
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
const TEC1G_SERIAL_BAUD = 4800;
const TEC1G_KEY_HOLD_MS = TEC_KEY_HOLD_MS;
const TEC1G_LCD_BUSY_US = 37;
const TEC1G_LCD_BUSY_CLEAR_US = 1600;
const TEC1G_GLCD_BUSY_US = 72;
const TEC1G_GLCD_BUSY_CLEAR_US = 1600;
const TEC1G_GLCD_BLINK_MS = 400;

/**
 * Normalizes TEC-1G configuration with defaults and bounds.
 * @param cfg - Optional TEC-1G config from project settings.
 * @returns Normalized config for runtime construction.
 */
export function normalizeTec1gConfig(cfg?: Tec1gPlatformConfig): Tec1gPlatformConfigNormalized {
  const config: Tec1gPlatformConfig = cfg ?? {};
  const regions = normalizeSimpleRegions(config.regions, [
    { start: 0x0000, end: 0x07ff, kind: 'rom' },
    { start: 0x0800, end: 0x7fff, kind: 'ram' },
    { start: 0xc000, end: 0xffff, kind: 'rom' },
  ]);
  const romRanges = regions
    .filter((region) => region.kind === 'rom' || region.readOnly === true)
    .map((region) => ({ start: region.start, end: region.end }));
  const appStart =
    Number.isFinite(config.appStart) && config.appStart !== undefined ? config.appStart : 0x4000;
  const entry = Number.isFinite(config.entry) && config.entry !== undefined ? config.entry : 0x0000;
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
  const rtcEnabled = config.rtcEnabled === true;
  const sdEnabled = config.sdEnabled === true;
  const sdImagePath =
    typeof config.sdImagePath === 'string' && config.sdImagePath !== ''
      ? config.sdImagePath
      : undefined;
  return {
    regions,
    romRanges,
    appStart: Math.max(0, Math.min(0xffff, appStart)),
    entry: Math.max(0, Math.min(0xffff, entry)),
    ...(romHex !== undefined ? { romHex } : {}),
    ...(ramInitHex !== undefined ? { ramInitHex } : {}),
    updateMs: Math.max(0, updateMs),
    yieldMs: Math.max(0, yieldMs),
    gimpSignal,
    expansionBankHi,
    matrixMode,
    rtcEnabled,
    sdEnabled,
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
  const initialSysCtrl = config.expansionBankHi ? 0x08 : 0x00;
  const matrixMode = config.matrixMode;
  const rtcEnabled = config.rtcEnabled;
  const rtc = rtcEnabled ? new Ds1302() : null;
  const sdEnabled = config.sdEnabled;
  const sdImagePath = config.sdImagePath;
  let sdImage: Uint8Array | undefined;
  if (sdEnabled && typeof sdImagePath === 'string' && sdImagePath !== '') {
    try {
      sdImage = new Uint8Array(fs.readFileSync(sdImagePath));
    } catch {
      sdImage = undefined;
    }
  }
  const sdSpi = sdEnabled ? new SdSpi(sdImage ? { image: sdImage } : undefined) : null;
  let cartridgePresentDefault = config.cartridgeHex !== undefined;
  const state: Tec1gState = {
    digits: Array.from({ length: 6 }, () => 0),
    matrix: Array.from({ length: 8 }, () => 0),
    digitLatch: 0,
    segmentLatch: 0,
    matrixLatch: 0,
    matrixKeyStates: new Uint8Array(16).fill(0xff),
    matrixModeEnabled: matrixMode,
    glcd: new Uint8Array(1024),
    glcdRowAddr: 0,
    glcdRowBase: 0,
    glcdCol: 0,
    glcdExpectColumn: false,
    glcdRe: false,
    glcdGraphics: false,
    glcdDisplayOn: true,
    glcdCursorOn: false,
    glcdCursorBlink: false,
    glcdBlinkVisible: true,
    glcdBlinkEventId: null,
    glcdEntryIncrement: true,
    glcdEntryShift: false,
    glcdTextShift: 0,
    glcdScrollMode: false,
    glcdScroll: 0,
    glcdReverseMask: 0,
    glcdGdramPhase: 0,
    glcdDdram: new Uint8Array(64),
    glcdDdramAddr: 0x80,
    glcdDdramPhase: 0,
    speaker: false,
    speakerHz: 0,
    lcd: Array.from({ length: 80 }, () => 0x20),
    lcdAddr: 0x80,
    lcdAddrMode: 'ddram',
    lcdEntryIncrement: true,
    lcdEntryShift: false,
    lcdDisplayOn: true,
    lcdCursorOn: false,
    lcdCursorBlink: false,
    lcdDisplayShift: 0,
    lcdCgram: new Uint8Array(64),
    lcdCgramAddr: 0x00,
    lcdFunction: {
      dataLength8: true,
      lines2: true,
      font5x8: true,
    },
    cycleClock: new CycleClock(),
    lastEdgeCycle: null,
    silenceEventId: null,
    keyValue: 0x7f,
    keyReleaseEventId: null,
    nmiPending: false,
    lastUpdateMs: 0,
    pendingUpdate: false,
    clockHz: TEC1G_FAST_HZ,
    speedMode: 'fast',
    updateMs: config.updateMs,
    yieldMs: config.yieldMs,
    sysCtrl: initialSysCtrl,
    shadowEnabled: true,
    protectEnabled: false,
    expandEnabled: false,
    bankA14: config.expansionBankHi,
    capsLock: false,
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
    state.lcd[lcdTest.length] = 0x7f;
  }
  if (state.lcd.length > lcdTest.length + 1) {
    state.lcd[lcdTest.length + 1] = 0x20;
  }
  if (state.lcd.length > lcdTest.length + 2) {
    state.lcd[lcdTest.length + 2] = 0x7e;
  }

  let lcdBusyUntil = 0;
  let glcdBusyUntil = 0;

  const sendUpdate = (): void => {
    onUpdate({
      digits: [...state.digits],
      matrix: [...state.matrix],
      matrixMode: state.matrixModeEnabled,
      glcd: Array.from(state.glcd),
      glcdDdram: Array.from(state.glcdDdram),
      glcdState: {
        displayOn: state.glcdDisplayOn,
        graphicsOn: state.glcdGraphics,
        cursorOn: state.glcdCursorOn,
        cursorBlink: state.glcdCursorBlink,
        blinkVisible: state.glcdBlinkVisible,
        ddramAddr: state.glcdDdramAddr,
        ddramPhase: state.glcdDdramPhase,
        textShift: state.glcdTextShift,
        scroll: state.glcdScroll,
        reverseMask: state.glcdReverseMask,
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

  const glcdSetRowAddr = (value: number): void => {
    state.glcdRowAddr = value & 0x1f;
    state.glcdExpectColumn = true;
    state.glcdGdramPhase = 0;
  };

  const glcdSetColumn = (value: number): void => {
    const bankSelected = (value & 0x08) !== 0;
    state.glcdRowBase = bankSelected ? 32 : 0;
    state.glcdCol = value & 0x07;
    state.glcdExpectColumn = false;
    state.glcdGdramPhase = 0;
  };

  // ST7920 DDRAM row address to linear index mapping.
  // Row addresses: 0x80=row0, 0x90=row1, 0x88=row2, 0x98=row3.
  // Each row has 16 byte positions (8 character pairs).
  const glcdDdramIndex = (addr: number): number => {
    const a = addr & 0x7f; // strip bit 7
    const row = ((a & 0x10) >> 4) | ((a & 0x08) >> 2); // bits: row1=bit4, row0=bit3
    const col = a & 0x07;
    return row * 16 + col * 2;
  };

  const glcdSetDdramAddr = (addr: number): void => {
    state.glcdDdramAddr = addr & 0xff;
    state.glcdDdramPhase = 0;
    queueUpdate();
  };

  const glcdShiftDisplay = (delta: number): void => {
    const next = Math.max(-15, Math.min(15, state.glcdTextShift + delta));
    if (next !== state.glcdTextShift) {
      state.glcdTextShift = next;
      queueUpdate();
    }
  };

  const glcdOffsetDdramAddr = (delta: number): void => {
    const base = state.glcdDdramAddr & 0x1f;
    const next = (base + delta + 0x20) & 0x1f;
    state.glcdDdramAddr = 0x80 | next;
    state.glcdDdramPhase = 0;
  };

  const glcdAdvanceDdramAddr = (): void => {
    const delta = state.glcdEntryIncrement ? 1 : -1;
    glcdOffsetDdramAddr(delta);
    if (state.glcdEntryShift) {
      glcdShiftDisplay(delta);
    }
  };

  const glcdSetBusy = (microseconds: number): void => {
    const cycles = microsecondsToClocks(state.clockHz, microseconds);
    const until = state.cycleClock.now() + cycles;
    if (until > glcdBusyUntil) {
      glcdBusyUntil = until;
    }
  };

  const glcdIsBusy = (): boolean => state.cycleClock.now() < glcdBusyUntil;

  const glcdRescheduleBlink = (): void => {
    if (state.glcdBlinkEventId !== null) {
      state.cycleClock.cancel(state.glcdBlinkEventId);
      state.glcdBlinkEventId = null;
    }
    state.glcdBlinkVisible = true;
    if (!state.glcdCursorBlink) {
      queueUpdate();
      return;
    }
    const periodCycles = millisecondsToClocks(state.clockHz, TEC1G_GLCD_BLINK_MS);
    const scheduleToggle = (): void => {
      if (!state.glcdCursorBlink) {
        state.glcdBlinkVisible = true;
        state.glcdBlinkEventId = null;
        queueUpdate();
        return;
      }
      state.glcdBlinkVisible = !state.glcdBlinkVisible;
      queueUpdate();
      state.glcdBlinkEventId = state.cycleClock.scheduleIn(periodCycles, scheduleToggle);
    };
    state.glcdBlinkEventId = state.cycleClock.scheduleIn(periodCycles, scheduleToggle);
    queueUpdate();
  };

  const glcdWriteDdram = (value: number): void => {
    const idx = glcdDdramIndex(state.glcdDdramAddr);
    const slot = idx + state.glcdDdramPhase;
    if (slot >= 0 && slot < state.glcdDdram.length) {
      state.glcdDdram[slot] = value & 0xff;
    }
    if (state.glcdDdramPhase === 0) {
      state.glcdDdramPhase = 1;
    } else {
      state.glcdDdramPhase = 0;
      glcdAdvanceDdramAddr();
    }
    queueUpdate();
  };

  const glcdReadDdram = (): number => {
    const idx = glcdDdramIndex(state.glcdDdramAddr);
    const slot = idx + state.glcdDdramPhase;
    const value =
      slot >= 0 && slot < state.glcdDdram.length ? (state.glcdDdram[slot] ?? 0x20) : 0x20;
    if (state.glcdDdramPhase === 0) {
      state.glcdDdramPhase = 1;
    } else {
      state.glcdDdramPhase = 0;
      glcdAdvanceDdramAddr();
    }
    return value & 0xff;
  };

  const glcdWriteData = (value: number): void => {
    if (!state.glcdGraphics) {
      glcdWriteDdram(value);
      glcdSetBusy(TEC1G_GLCD_BUSY_US);
      return;
    }
    const row = (state.glcdRowBase + state.glcdRowAddr) & 0x3f;
    const col = state.glcdCol & 0x07;
    const index = row * 16 + col * 2 + state.glcdGdramPhase;
    if (index >= 0 && index < state.glcd.length) {
      state.glcd[index] = value & 0xff;
      queueUpdate();
    }
    glcdSetBusy(TEC1G_GLCD_BUSY_US);
    if (state.glcdGdramPhase === 0) {
      state.glcdGdramPhase = 1;
    } else {
      state.glcdGdramPhase = 0;
      state.glcdCol = (state.glcdCol + 1) & 0x07;
    }
  };

  const glcdReadData = (): number => {
    if (!state.glcdGraphics) {
      return glcdReadDdram();
    }
    const row = (state.glcdRowBase + state.glcdRowAddr) & 0x3f;
    const col = state.glcdCol & 0x07;
    const index = row * 16 + col * 2 + state.glcdGdramPhase;
    const value = index >= 0 && index < state.glcd.length ? (state.glcd[index] ?? 0x00) : 0x00;
    if (state.glcdGdramPhase === 0) {
      state.glcdGdramPhase = 1;
    } else {
      state.glcdGdramPhase = 0;
      state.glcdCol = (state.glcdCol + 1) & 0x07;
    }
    return value & 0xff;
  };

  const glcdReadStatus = (): number => {
    const busy = glcdIsBusy() ? 0x80 : 0x00;
    const addr = state.glcdGraphics ? state.glcdRowAddr & 0x3f : state.glcdDdramAddr & 0x7f;
    return busy | addr;
  };

  let serialLevel: 0 | 1 = 1;
  let serialRxLevel: 0 | 1 = 1;
  let serialRxBusy = false;
  let serialRxToken = 0;
  let serialRxLeadCycles = 0;
  let serialRxPending = false;
  let serialCyclesPerBit = state.clockHz / TEC1G_SERIAL_BAUD;
  const serialRxQueue: number[] = [];
  let serialRxPrimed = false;
  const serialDecoder = new BitbangUartDecoder(state.cycleClock, {
    baud: TEC1G_SERIAL_BAUD,
    cyclesPerSecond: state.clockHz,
    dataBits: 8,
    stopBits: 2,
    parity: 'none',
    inverted: false,
  });
  serialDecoder.setByteHandler((event) => {
    if (onSerialByte) {
      onSerialByte(event.byte);
    }
  });
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

  const updateDisplay = (): void => {
    if (updateDisplayDigits(state.digits, state.digitLatch, state.segmentLatch)) {
      queueUpdate();
    }
  };

  const lcdIndexForAddr = (addr: number): number | null => {
    if (addr >= 0x80 && addr <= 0x93) {
      return addr - 0x80;
    }
    if (addr >= 0xc0 && addr <= 0xd3) {
      return 20 + (addr - 0xc0);
    }
    if (addr >= 0x94 && addr <= 0xa7) {
      return 40 + (addr - 0x94);
    }
    if (addr >= 0xd4 && addr <= 0xe7) {
      return 60 + (addr - 0xd4);
    }
    return null;
  };

  const lcdSetBusy = (microseconds: number): void => {
    const cycles = microsecondsToClocks(state.clockHz, microseconds);
    const until = state.cycleClock.now() + cycles;
    if (until > lcdBusyUntil) {
      lcdBusyUntil = until;
    }
  };

  const lcdIsBusy = (): boolean => state.cycleClock.now() < lcdBusyUntil;

  const lcdReadStatus = (): number => {
    const busy = lcdIsBusy() ? 0x80 : 0x00;
    const addr =
      state.lcdAddrMode === 'cgram' ? (state.lcdCgramAddr & 0x3f) : (state.lcdAddr & 0x7f);
    return busy | addr;
  };

  const lcdSetAddr = (addr: number): void => {
    state.lcdAddr = addr & 0xff;
    state.lcdAddrMode = 'ddram';
  };

  const lcdWriteData = (value: number): void => {
    if (state.lcdAddrMode === 'cgram') {
      const addr = state.lcdCgramAddr & 0x3f;
      state.lcdCgram[addr] = value & 0xff;
      state.lcdCgramAddr = lcdAdvanceCgramAddr(state.lcdCgramAddr, state.lcdEntryIncrement);
      lcdSetBusy(TEC1G_LCD_BUSY_US);
      return;
    }
    const index = lcdIndexForAddr(state.lcdAddr);
    if (index !== null) {
      state.lcd[index] = value & 0xff;
      queueUpdate();
    }
    state.lcdAddr = lcdAdvanceAddr(state.lcdAddr, state.lcdEntryIncrement);
    if (state.lcdEntryShift) {
      shiftLcdDisplay(state.lcdEntryIncrement ? 1 : -1);
    }
    lcdSetBusy(TEC1G_LCD_BUSY_US);
  };

  const lcdReadData = (): number => {
    if (state.lcdAddrMode === 'cgram') {
      const addr = state.lcdCgramAddr & 0x3f;
      const value = state.lcdCgram[addr] ?? 0x00;
      state.lcdCgramAddr = lcdAdvanceCgramAddr(state.lcdCgramAddr, state.lcdEntryIncrement);
      lcdSetBusy(TEC1G_LCD_BUSY_US);
      return value & 0xff;
    }
    const index = lcdIndexForAddr(state.lcdAddr);
    const value = index !== null ? (state.lcd[index] ?? 0x20) : 0x20;
    state.lcdAddr = lcdAdvanceAddr(state.lcdAddr, state.lcdEntryIncrement);
    if (state.lcdEntryShift) {
      shiftLcdDisplay(state.lcdEntryIncrement ? 1 : -1);
    }
    lcdSetBusy(TEC1G_LCD_BUSY_US);
    return value & 0xff;
  };

  const lcdClear = (): void => {
    state.lcd.fill(0x20);
    lcdSetAddr(0x80);
    state.lcdDisplayShift = 0;
    queueUpdate();
    lcdSetBusy(TEC1G_LCD_BUSY_CLEAR_US);
  };

  const lcdAdvanceAddr = (addr: number, increment: boolean): number => {
    const masked = addr & 0xff;
    const index = lcdIndexForAddr(masked);
    if (index !== null) {
      const next = (index + (increment ? 1 : -1) + state.lcd.length) % state.lcd.length;
      return lcdAddrForIndex(next);
    }
    return (masked + (increment ? 1 : -1)) & 0xff;
  };

  const lcdAddrForIndex = (index: number): number => {
    if (index < 20) {
      return 0x80 + index;
    }
    if (index < 40) {
      return 0xc0 + (index - 20);
    }
    if (index < 60) {
      return 0x94 + (index - 40);
    }
    return 0xd4 + (index - 60);
  };

  const lcdAdvanceCgramAddr = (addr: number, increment: boolean): number => {
    const delta = increment ? 1 : -1;
    return (addr + delta + 64) & 0x3f;
  };

  const shiftLcdDisplay = (delta: number): void => {
    const next = (state.lcdDisplayShift + delta + 20) % 20;
    if (next !== state.lcdDisplayShift) {
      state.lcdDisplayShift = next;
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
      const fullPort = port & 0xffff;
      const p = fullPort & 0xff;
      const highByte = (fullPort >> 8) & 0xff;
      if (p === TEC1G_PORT_KEYBOARD) {
        if (serialRxPending && !serialRxBusy && serialRxQueue.length > 0) {
          serialRxPending = false;
          serialRxLeadCycles = Math.max(1, Math.round(serialCyclesPerBit * 2));
          startNextSerialRx();
        }
        const key = state.keyValue & 0x7f;
        return key | (serialRxLevel ? 0x80 : 0x00);
      }
      if (p === TEC1G_PORT_MATRIX) {
        if (!state.matrixModeEnabled) {
          return 0xff;
        }
        const row = highByte & 0x0f;
        return state.matrixKeyStates[row] ?? 0xff;
      }
      if (p === TEC1G_PORT_LCD_CMD) {
        return lcdReadStatus();
      }
      if (p === TEC1G_PORT_LCD_DATA) {
        return lcdReadData();
      }
      if (p === TEC1G_PORT_RTC) {
        return rtcEnabled && rtc ? rtc.read() : 0xff;
      }
      if (p === TEC1G_PORT_SD) {
        return sdEnabled && sdSpi ? sdSpi.read() : 0xff;
      }
      if (p === TEC1G_PORT_GLCD_CMD) {
        return glcdReadStatus();
      }
      if (p === TEC1G_PORT_GLCD_DATA) {
        return glcdReadData();
      }
      if (p === TEC1G_PORT_SYSCTRL) {
        return state.sysCtrl & 0xff;
      }
      if (p === TEC1G_PORT_STATUS) {
        const keyPressed = (state.keyValue & 0x7f) !== 0x7f;
        let value = 0x00;
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
        if (serialRxLevel) {
          value |= TEC1G_STATUS_SERIAL_RX;
        }
        return value;
      }
      return 0xff;
    },
    write: (port: number, value: number): void => {
      const fullPort = port & 0xffff;
      const p = fullPort & 0xff;
      void fullPort;
      if (p === TEC1G_PORT_DIGIT) {
        state.digitLatch = value & 0xff;
        const speaker = (value & TEC1G_DIGIT_SPEAKER) !== 0;
        const nextSerial: 0 | 1 = (value & TEC1G_DIGIT_SERIAL_TX) !== 0 ? 1 : 0;
        if (nextSerial !== serialLevel) {
          serialLevel = nextSerial;
          serialDecoder.recordLevel(serialLevel);
        }
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
        state.segmentLatch = value & 0xff;
        updateDisplay();
        return;
      }
      if (p === TEC1G_PORT_MATRIX_LATCH) {
        state.matrixLatch = value & 0xff;
        return;
      }
      if (p === TEC1G_PORT_MATRIX_STROBE) {
        updateMatrix(value & 0xff);
        return;
      }
      if (p === TEC1G_PORT_RTC) {
        if (rtcEnabled && rtc) {
          rtc.write(value & 0xff);
        }
        return;
      }
      if (p === TEC1G_PORT_SD) {
        if (sdEnabled && sdSpi) {
          sdSpi.write(value & 0xff);
        }
        return;
      }
      if (p === TEC1G_PORT_LCD_CMD) {
        const instruction = value & 0xff;
        if (instruction === 0x01) {
          lcdClear();
          return;
        }
        if (instruction === 0x02) {
          lcdSetAddr(0x80);
          state.lcdDisplayShift = 0;
          lcdSetBusy(TEC1G_LCD_BUSY_CLEAR_US);
          return;
        }
        if ((instruction & 0x80) !== 0) {
          lcdSetAddr(instruction);
          lcdSetBusy(TEC1G_LCD_BUSY_US);
          return;
        }
        if ((instruction & 0x40) !== 0) {
          state.lcdCgramAddr = instruction & 0x3f;
          state.lcdAddrMode = 'cgram';
          lcdSetBusy(TEC1G_LCD_BUSY_US);
          return;
        }
        if ((instruction & 0xfc) === 0x04) {
          state.lcdEntryIncrement = (instruction & 0x02) !== 0;
          state.lcdEntryShift = (instruction & 0x01) !== 0;
          lcdSetBusy(TEC1G_LCD_BUSY_US);
          return;
        }
        if ((instruction & 0xf8) === 0x08) {
          state.lcdDisplayOn = (instruction & 0x04) !== 0;
          state.lcdCursorOn = (instruction & 0x02) !== 0;
          state.lcdCursorBlink = (instruction & 0x01) !== 0;
          queueUpdate();
          lcdSetBusy(TEC1G_LCD_BUSY_US);
          return;
        }
        if ((instruction & 0xf0) === 0x10) {
          const displayShift = (instruction & 0x08) !== 0;
          const shiftRight = (instruction & 0x04) !== 0;
          if (displayShift) {
            shiftLcdDisplay(shiftRight ? 1 : -1);
          } else {
            state.lcdAddrMode = 'ddram';
            state.lcdAddr = lcdAdvanceAddr(state.lcdAddr, shiftRight);
          }
          lcdSetBusy(TEC1G_LCD_BUSY_US);
          return;
        }
        if ((instruction & 0xe0) === 0x20) {
          state.lcdFunction = {
            dataLength8: (instruction & 0x10) !== 0,
            lines2: (instruction & 0x08) !== 0,
            font5x8: (instruction & 0x04) === 0,
          };
          lcdSetBusy(TEC1G_LCD_BUSY_US);
          return;
        }
        lcdSetBusy(TEC1G_LCD_BUSY_US);
        return;
      }
      if (p === TEC1G_PORT_LCD_DATA) {
        lcdWriteData(value);
        return;
      }
      if (p === 0x07) {
        const instruction = value & 0xff;
        if ((instruction & 0xe0) === 0x20) {
          const re = (instruction & 0x04) !== 0;
          const g = re && (instruction & 0x02) !== 0;
          state.glcdRe = re;
          state.glcdGraphics = g;
          state.glcdExpectColumn = false;
          state.glcdGdramPhase = 0;
          glcdSetBusy(TEC1G_GLCD_BUSY_US);
          queueUpdate();
          return;
        }
        if (state.glcdRe) {
          if (instruction === 0x01) {
            // Standby: approximate as display off.
            state.glcdDisplayOn = false;
            glcdSetBusy(TEC1G_GLCD_BUSY_US);
            queueUpdate();
            return;
          }
          if ((instruction & 0xfe) === 0x02) {
            state.glcdScrollMode = (instruction & 0x01) !== 0;
            glcdSetBusy(TEC1G_GLCD_BUSY_US);
            return;
          }
          if ((instruction & 0xfc) === 0x04) {
            const line = instruction & 0x03;
            state.glcdReverseMask ^= 1 << line;
            glcdSetBusy(TEC1G_GLCD_BUSY_US);
            queueUpdate();
            return;
          }
          if ((instruction & 0xc0) === 0x40) {
            if (state.glcdScrollMode) {
              state.glcdScroll = instruction & 0x3f;
              queueUpdate();
            }
            glcdSetBusy(TEC1G_GLCD_BUSY_US);
            return;
          }
        } else {
          if (instruction === 0x01) {
            // Clear display: fill DDRAM with spaces, reset address
            state.glcdDdram.fill(0x20);
            glcdSetDdramAddr(0x80);
            state.glcdEntryIncrement = true;
            state.glcdEntryShift = false;
            state.glcdTextShift = 0;
            state.glcdReverseMask = 0;
            glcdSetBusy(TEC1G_GLCD_BUSY_CLEAR_US);
            queueUpdate();
            return;
          }
          if (instruction === 0x02) {
            glcdSetDdramAddr(0x80);
            state.glcdTextShift = 0;
            glcdSetBusy(TEC1G_GLCD_BUSY_US);
            queueUpdate();
            return;
          }
          if ((instruction & 0xf8) === 0x08) {
            state.glcdDisplayOn = (instruction & 0x04) !== 0;
            state.glcdCursorOn = (instruction & 0x02) !== 0;
            state.glcdCursorBlink = (instruction & 0x01) !== 0;
            glcdRescheduleBlink();
            glcdSetBusy(TEC1G_GLCD_BUSY_US);
            queueUpdate();
            return;
          }
          if ((instruction & 0xfc) === 0x04) {
            state.glcdEntryIncrement = (instruction & 0x02) !== 0;
            state.glcdEntryShift = (instruction & 0x01) !== 0;
            glcdSetBusy(TEC1G_GLCD_BUSY_US);
            return;
          }
          if ((instruction & 0xf0) === 0x10) {
            const displayShift = (instruction & 0x08) !== 0;
            const shiftRight = (instruction & 0x04) !== 0;
            if (displayShift) {
              glcdShiftDisplay(shiftRight ? -1 : 1);
            } else {
              glcdOffsetDdramAddr(shiftRight ? 1 : -1);
              queueUpdate();
            }
            glcdSetBusy(TEC1G_GLCD_BUSY_US);
            return;
          }
        }
        if ((instruction & 0x80) !== 0) {
          if (state.glcdGraphics) {
            if (state.glcdExpectColumn) {
              glcdSetColumn(instruction);
            } else {
              glcdSetRowAddr(instruction);
            }
          } else {
            // Text mode: set DDRAM address
            glcdSetDdramAddr(instruction);
          }
          glcdSetBusy(TEC1G_GLCD_BUSY_US);
          return;
        }
        logPortWrite(p, value);
        return;
      }
      if (p === TEC1G_PORT_GLCD_DATA) {
        glcdWriteData(value);
        return;
      }
      if (p >= TEC1G_PORT_RTC && p <= TEC1G_PORT_MATRIX) {
        logPortWrite(p, value);
        return;
      }
      if (p === TEC1G_PORT_SYSCTRL) {
        logPortWrite(p, value);
        state.sysCtrl = value & 0xff;
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
        return { interrupt: { nonMaskable: true, data: 0x66 } };
      }
      return undefined;
    },
  };

  const applyKey = (code: number): void => {
    if (state.matrixModeEnabled) {
      return;
    }
    state.keyValue = code & 0x7f;
    state.rawKeyActive = (state.keyValue & 0x7f) !== 0x7f;
    state.shiftKeyActive = state.rawKeyActive && (state.keyValue & 0x20) === 0;
    state.nmiPending = true;
    if (state.keyReleaseEventId !== null) {
      state.cycleClock.cancel(state.keyReleaseEventId);
    }
    const holdCycles = calculateKeyHoldCycles(state.clockHz, TEC1G_KEY_HOLD_MS);
    state.keyReleaseEventId = state.cycleClock.scheduleIn(holdCycles, () => {
      state.keyValue = 0x7f;
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
    const current = state.matrixKeyStates[rowIndex] ?? 0xff;
    state.matrixKeyStates[rowIndex] = pressed ? current & ~mask : current | mask;
  };

  const setMatrixMode = (enabled: boolean): void => {
    state.matrixModeEnabled = enabled;
  };

  const setSerialRxLevel = (level: 0 | 1): void => {
    serialRxLevel = level;
  };

  const scheduleSerialRxByte = (byte: number, leadCycles = 0): void => {
    const token = serialRxToken;
    const start = state.cycleClock.now() + leadCycles;
    if (leadCycles <= 0) {
      setSerialRxLevel(0);
    } else {
      setSerialRxLevel(1);
      state.cycleClock.scheduleAt(start, () => {
        if (serialRxToken !== token) {
          return;
        }
        setSerialRxLevel(0);
      });
    }
    for (let i = 0; i < 8; i += 1) {
      const bit = ((byte >> i) & 1) as 0 | 1;
      const at = start + serialCyclesPerBit * (i + 1);
      state.cycleClock.scheduleAt(at, () => {
        if (serialRxToken !== token) {
          return;
        }
        setSerialRxLevel(bit);
      });
    }

    const stopAt = start + serialCyclesPerBit * (1 + 8);
    state.cycleClock.scheduleAt(stopAt, () => {
      if (serialRxToken !== token) {
        return;
      }
      setSerialRxLevel(1);
    });

    const doneAt = start + serialCyclesPerBit * (1 + 8 + 2);
    state.cycleClock.scheduleAt(doneAt, () => {
      if (serialRxToken !== token) {
        return;
      }
      startNextSerialRx();
    });
  };

  const startNextSerialRx = (): void => {
    if (serialRxQueue.length === 0) {
      serialRxBusy = false;
      setSerialRxLevel(1);
      return;
    }
    serialRxBusy = true;
    const next = serialRxQueue.shift();
    if (next === undefined) {
      serialRxBusy = false;
      setSerialRxLevel(1);
      return;
    }
    const leadCycles = serialRxLeadCycles;
    serialRxLeadCycles = 0;
    scheduleSerialRxByte(next, leadCycles);
  };

  const queueSerial = (bytes: number[]): void => {
    if (!bytes.length) {
      return;
    }
    if (!serialRxPrimed) {
      // Prime RX once so the first real byte is aligned to the ROM's bitbang receiver.
      serialRxQueue.push(0x00);
      serialRxPrimed = true;
    }
    for (const value of bytes) {
      serialRxQueue.push(value & 0xff);
    }
    if (!serialRxBusy) {
      serialRxPending = true;
    }
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
    serialDecoder.setCyclesPerSecond(state.clockHz);
    serialCyclesPerBit = state.clockHz / TEC1G_SERIAL_BAUD;
    glcdRescheduleBlink();
    sendUpdate();
  };

  const resetState = (): void => {
    state.speaker = false;
    state.speakerHz = 0;
    state.lastEdgeCycle = null;
    state.lcd.fill(0x20);
    state.lcdAddr = 0x80;
    state.lcdAddrMode = 'ddram';
    state.lcdEntryIncrement = true;
    state.lcdEntryShift = false;
    state.lcdDisplayOn = true;
    state.lcdCursorOn = false;
    state.lcdCursorBlink = false;
    state.lcdDisplayShift = 0;
    state.lcdCgram.fill(0x00);
    state.lcdCgramAddr = 0x00;
    state.lcdFunction = {
      dataLength8: true,
      lines2: true,
      font5x8: true,
    };
    lcdBusyUntil = 0;
    state.matrix.fill(0x00);
    state.matrixKeyStates.fill(0xff);
    state.matrixModeEnabled = matrixMode;
    state.glcd.fill(0x00);
    state.glcdRowAddr = 0;
    state.glcdRowBase = 0;
    state.glcdCol = 0;
    state.glcdExpectColumn = false;
    state.glcdRe = false;
    state.glcdGraphics = false;
    state.glcdDisplayOn = true;
    state.glcdCursorOn = false;
    state.glcdCursorBlink = false;
    state.glcdBlinkVisible = true;
    if (state.glcdBlinkEventId !== null) {
      state.cycleClock.cancel(state.glcdBlinkEventId);
      state.glcdBlinkEventId = null;
    }
    state.glcdEntryIncrement = true;
    state.glcdEntryShift = false;
    state.glcdTextShift = 0;
    state.glcdScrollMode = false;
    state.glcdScroll = 0;
    state.glcdReverseMask = 0;
    state.glcdGdramPhase = 0;
    state.glcdDdram.fill(0x20);
    glcdSetDdramAddr(0x80);
    glcdBusyUntil = 0;
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
    serialRxQueue.length = 0;
    serialRxBusy = false;
    serialRxPrimed = false;
    serialRxToken += 1;
    setSerialRxLevel(1);
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
