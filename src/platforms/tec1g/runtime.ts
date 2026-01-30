import { IoHandlers } from '../../z80/runtime';
import { CycleClock } from '../cycle-clock';
import { BitbangUartDecoder } from '../serial/bitbang-uart';
import { Tec1gPlatformConfig, Tec1gPlatformConfigNormalized } from '../types';
import { normalizeSimpleRegions } from '../simple/runtime';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';
import { decodeSysCtrl } from './sysctrl';
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

export interface Tec1gState {
  digits: number[];
  matrix: number[];
  digitLatch: number;
  segmentLatch: number;
  matrixLatch: number;
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
}

export interface Tec1gRuntime {
  state: Tec1gState;
  ioHandlers: IoHandlers;
  applyKey(code: number): void;
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

export function normalizeTec1gConfig(cfg?: Tec1gPlatformConfig): Tec1gPlatformConfigNormalized {
  const config = cfg ?? {};
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
  const updateMs =
    Number.isFinite(config.updateMs) && config.updateMs !== undefined ? config.updateMs : 16;
  const yieldMs =
    Number.isFinite(config.yieldMs) && config.yieldMs !== undefined ? config.yieldMs : 0;
  const extraListings = Array.isArray(config.extraListings)
    ? config.extraListings
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry !== '')
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
    ...(extraListings ? { extraListings } : {}),
    ...(cfg?.uiVisibility ? { uiVisibility: cfg.uiVisibility } : {}),
  };
}

export function createTec1gRuntime(
  config: Tec1gPlatformConfigNormalized,
  onUpdate: (payload: Tec1gUpdatePayload) => void,
  onSerialByte?: (byte: number) => void,
  onPortWrite?: (payload: { port: number; value: number }) => void
): Tec1gRuntime {
  const state: Tec1gState = {
    digits: Array.from({ length: 6 }, () => 0),
    matrix: Array.from({ length: 8 }, () => 0),
    digitLatch: 0,
    segmentLatch: 0,
    matrixLatch: 0,
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
    sysCtrl: 0x00,
    shadowEnabled: true,
    protectEnabled: false,
    expandEnabled: false,
  };
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
    return busy | (state.lcdAddr & 0x7f);
  };

  const lcdSetAddr = (addr: number): void => {
    state.lcdAddr = addr & 0xff;
  };

  const lcdWriteData = (value: number): void => {
    const index = lcdIndexForAddr(state.lcdAddr);
    if (index !== null) {
      state.lcd[index] = value & 0xff;
      queueUpdate();
    }
    state.lcdAddr = lcdAdvanceAddr(state.lcdAddr);
    lcdSetBusy(TEC1G_LCD_BUSY_US);
  };

  const lcdReadData = (): number => {
    const index = lcdIndexForAddr(state.lcdAddr);
    const value = index !== null ? (state.lcd[index] ?? 0x20) : 0x20;
    state.lcdAddr = lcdAdvanceAddr(state.lcdAddr);
    lcdSetBusy(TEC1G_LCD_BUSY_US);
    return value & 0xff;
  };

  const lcdClear = (): void => {
    state.lcd.fill(0x20);
    lcdSetAddr(0x80);
    queueUpdate();
    lcdSetBusy(TEC1G_LCD_BUSY_CLEAR_US);
  };

  const lcdAdvanceAddr = (addr: number): number => {
    const masked = addr & 0xff;
    if (masked >= 0x80 && masked <= 0x93) {
      return masked === 0x93 ? 0x94 : masked + 1;
    }
    if (masked >= 0xc0 && masked <= 0xd3) {
      return masked === 0xd3 ? 0xd4 : masked + 1;
    }
    if (masked >= 0x94 && masked <= 0xa7) {
      return masked === 0xa7 ? 0xc0 : masked + 1;
    }
    if (masked >= 0xd4 && masked <= 0xe7) {
      return masked === 0xe7 ? 0x80 : masked + 1;
    }
    return (masked + 1) & 0xff;
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
      const p = port & 0xff;
      if (p === 0x00) {
        if (serialRxPending && !serialRxBusy && serialRxQueue.length > 0) {
          serialRxPending = false;
          serialRxLeadCycles = Math.max(1, Math.round(serialCyclesPerBit * 2));
          startNextSerialRx();
        }
        const key = state.keyValue & 0x7f;
        return key | (serialRxLevel ? 0x80 : 0x00);
      }
      if (p === 0xfe) {
        // Matrix keyboard input (unwired for now).
        return 0xff;
      }
      if (p === 0x04) {
        return lcdReadStatus();
      }
      if (p === 0x84) {
        return lcdReadData();
      }
      if (p === 0x07) {
        return glcdReadStatus();
      }
      if (p === 0x87) {
        return glcdReadData();
      }
      if (p === 0xff) {
        return state.sysCtrl & 0xff;
      }
      if (p === 0x03) {
        const keyPressed = (state.keyValue & 0x7f) !== 0x7f;
        let value = 0x00;
        if (state.protectEnabled) {
          value |= 0x02;
        }
        if (state.expandEnabled) {
          value |= 0x04;
          value |= 0x08;
        }
        if (!keyPressed) {
          value |= 0x40;
        }
        if (serialRxLevel) {
          value |= 0x80;
        }
        return value;
      }
      return 0xff;
    },
    write: (port: number, value: number): void => {
      const p = port & 0xff;
      if (p === 0x01) {
        state.digitLatch = value & 0xff;
        const speaker = (value & 0x80) !== 0;
        const nextSerial: 0 | 1 = (value & 0x40) !== 0 ? 1 : 0;
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
      if (p === 0x02) {
        state.segmentLatch = value & 0xff;
        updateDisplay();
        return;
      }
      if (p === 0x06) {
        state.matrixLatch = value & 0xff;
        return;
      }
      if (p === 0x05) {
        updateMatrix(value & 0xff);
        return;
      }
      if (p === 0x04) {
        const instruction = value & 0xff;
        if (instruction === 0x01) {
          lcdClear();
          return;
        }
        if (instruction === 0x02) {
          lcdSetAddr(0x80);
          lcdSetBusy(TEC1G_LCD_BUSY_CLEAR_US);
          return;
        }
        if ((instruction & 0x80) !== 0) {
          lcdSetAddr(instruction);
          lcdSetBusy(TEC1G_LCD_BUSY_US);
          return;
        }
        lcdSetBusy(TEC1G_LCD_BUSY_US);
        return;
      }
      if (p === 0x84) {
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
      if (p === 0x87) {
        glcdWriteData(value);
        return;
      }
      if (p >= 0xfc && p <= 0xfe) {
        logPortWrite(p, value);
        return;
      }
      if (p === 0xff) {
        logPortWrite(p, value);
        state.sysCtrl = value & 0xff;
        const decoded = decodeSysCtrl(state.sysCtrl);
        state.shadowEnabled = decoded.shadowEnabled;
        state.protectEnabled = decoded.protectEnabled;
        state.expandEnabled = decoded.expandEnabled;
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
    state.keyValue = code & 0x7f;
    state.nmiPending = true;
    if (state.keyReleaseEventId !== null) {
      state.cycleClock.cancel(state.keyReleaseEventId);
    }
    const holdCycles = calculateKeyHoldCycles(state.clockHz, TEC1G_KEY_HOLD_MS);
    state.keyReleaseEventId = state.cycleClock.scheduleIn(holdCycles, () => {
      state.keyValue = 0x7f;
      state.keyReleaseEventId = null;
    });
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
    lcdBusyUntil = 0;
    state.matrix.fill(0x00);
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
    state.sysCtrl = 0x00;
    const decoded = decodeSysCtrl(state.sysCtrl);
    state.shadowEnabled = decoded.shadowEnabled;
    state.protectEnabled = decoded.protectEnabled;
    state.expandEnabled = decoded.expandEnabled;
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
    queueSerial,
    recordCycles,
    silenceSpeaker,
    setSpeed,
    resetState,
    queueUpdate,
  };
}
