import { IoHandlers } from '../../z80/runtime';
import { CycleClock } from '../cycle-clock';
import { BitbangUartDecoder } from '../serial/bitbang-uart';
import { Tec1gPlatformConfig, Tec1gPlatformConfigNormalized } from '../types';
import { normalizeSimpleRegions } from '../simple/runtime';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';

export interface Tec1gState {
  digits: number[];
  matrix: number[];
  digitLatch: number;
  segmentLatch: number;
  matrixLatch: number;
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

export const TEC1G_SLOW_HZ = 400000;
export const TEC1G_FAST_HZ = 4000000;
const TEC1G_SILENCE_CYCLES = 10000;
const TEC1G_SERIAL_BAUD = 4800;
const TEC1G_KEY_HOLD_MS = 30;

export function normalizeTec1gConfig(
  cfg?: Tec1gPlatformConfig
): Tec1gPlatformConfigNormalized {
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
    Number.isFinite(config.appStart) && config.appStart !== undefined
      ? config.appStart
      : 0x4000;
  const entry =
    Number.isFinite(config.entry) && config.entry !== undefined
      ? config.entry
      : 0x0000;
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

  const sendUpdate = (): void => {
    onUpdate({
      digits: [...state.digits],
      matrix: [...state.matrix],
      speaker: state.speaker ? 1 : 0,
      speedMode: state.speedMode,
      lcd: [...state.lcd],
      speakerHz: state.speakerHz,
    });
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
    const now = Date.now();
    const updateMs = state.updateMs;
    if (updateMs <= 0 || now - state.lastUpdateMs >= updateMs) {
      state.lastUpdateMs = now;
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
    const now = Date.now();
    const updateMs = state.updateMs;
    if (updateMs > 0 && now - state.lastUpdateMs < updateMs) {
      return;
    }
    state.lastUpdateMs = now;
    state.pendingUpdate = false;
    sendUpdate();
  };

  const updateDisplay = (): void => {
    const mask = state.digitLatch & 0x3f;
    if (mask === 0) {
      return;
    }
    for (let i = 0; i < state.digits.length; i += 1) {
      if (mask & (1 << i)) {
        state.digits[i] = state.segmentLatch & 0xff;
      }
    }
    queueUpdate();
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

  const lcdSetAddr = (addr: number): void => {
    state.lcdAddr = addr & 0xff;
  };

  const lcdWriteData = (value: number): void => {
    const index = lcdIndexForAddr(state.lcdAddr);
    if (index !== null) {
      state.lcd[index] = value & 0xff;
      queueUpdate();
    }
    state.lcdAddr = (state.lcdAddr + 1) & 0xff;
  };

  const lcdReadData = (): number => {
    const index = lcdIndexForAddr(state.lcdAddr);
    const value = index !== null ? (state.lcd[index] ?? 0x20) : 0x20;
    state.lcdAddr = (state.lcdAddr + 1) & 0xff;
    return value & 0xff;
  };

  const lcdClear = (): void => {
    state.lcd.fill(0x20);
    lcdSetAddr(0x80);
    queueUpdate();
  };

  const updateMatrix = (rowMask: number): void => {
    const rowIndex = rowMask ? Math.log2(rowMask & 0xff) : -1;
    if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex > 7) {
      return;
    }
    state.matrix[rowIndex] = state.matrixLatch & 0xff;
    queueUpdate();
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
        return 0x00;
      }
      if (p === 0x84) {
        return lcdReadData();
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
            if (delta > 0 && state.clockHz > 0) {
              state.speakerHz = Math.round((state.clockHz / 2) / delta);
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
          return;
        }
        if ((instruction & 0x80) !== 0) {
          lcdSetAddr(instruction);
        }
        return;
      }
      if (p === 0x84) {
        lcdWriteData(value);
        return;
      }
      if (p === 0x07 || p === 0x87 || (p >= 0xfc && p <= 0xfe)) {
        logPortWrite(p, value);
        return;
      }
      if (p === 0xff) {
        logPortWrite(p, value);
        state.sysCtrl = value & 0xff;
        state.shadowEnabled = (state.sysCtrl & 0x01) === 0;
        state.protectEnabled = (state.sysCtrl & 0x02) !== 0;
        state.expandEnabled = (state.sysCtrl & 0x04) !== 0;
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
    const holdCycles = Math.max(
      1,
      Math.round((state.clockHz * TEC1G_KEY_HOLD_MS) / 1000)
    );
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
    sendUpdate();
  };

  const resetState = (): void => {
    state.speaker = false;
    state.speakerHz = 0;
    state.lastEdgeCycle = null;
    state.lcd.fill(0x20);
    state.lcdAddr = 0x80;
    state.matrix.fill(0x00);
    state.sysCtrl = 0x00;
    state.shadowEnabled = true;
    state.protectEnabled = false;
    state.expandEnabled = false;
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
