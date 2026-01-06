import { IoHandlers } from '../../z80/runtime';
import { CycleClock } from '../cycle-clock';
import { BitbangUartDecoder } from '../serial/bitbang-uart';
import { Tec1PlatformConfig, Tec1PlatformConfigNormalized } from '../types';
import { normalizeSimpleRegions } from '../simple/runtime';
import { Tec1SpeedMode, Tec1UpdatePayload } from './types';

export interface Tec1State {
  digits: number[];
  digitLatch: number;
  segmentLatch: number;
  speaker: boolean;
  speakerHz: number;
  cycleClock: CycleClock;
  lastEdgeCycle: number | null;
  silenceEventId: number | null;
  keyValue: number;
  nmiPending: boolean;
  lastUpdateMs: number;
  pendingUpdate: boolean;
  clockHz: number;
  speedMode: Tec1SpeedMode;
  updateMs: number;
  yieldMs: number;
}

export interface Tec1Runtime {
  state: Tec1State;
  ioHandlers: IoHandlers;
  applyKey(code: number): void;
  queueSerial(bytes: number[]): void;
  recordCycles(cycles: number): void;
  silenceSpeaker(): void;
  setSpeed(mode: Tec1SpeedMode): void;
  resetState(): void;
  queueUpdate(): void;
}

export const TEC1_SLOW_HZ = 400000;
export const TEC1_FAST_HZ = 4000000;
const TEC1_SILENCE_CYCLES = 10000;
const TEC1_SERIAL_BAUD = 9600;

export function normalizeTec1Config(cfg?: Tec1PlatformConfig): Tec1PlatformConfigNormalized {
  const config = cfg ?? {};
  const regions = normalizeSimpleRegions(config.regions, [
    { start: 0x0000, end: 0x07ff, kind: 'rom' },
    { start: 0x0800, end: 0x0fff, kind: 'ram' },
  ]);
  const romRanges = regions
    .filter((region) => region.kind === 'rom' || region.readOnly === true)
    .map((region) => ({ start: region.start, end: region.end }));
  const appStart =
    Number.isFinite(config.appStart) && config.appStart !== undefined
      ? config.appStart
      : 0x0800;
  const entry =
    Number.isFinite(config.entry) && config.entry !== undefined
      ? config.entry
      : romRanges[0]?.start ?? 0x0000;
  const romHex =
    typeof config.romHex === 'string' && config.romHex !== '' ? config.romHex : undefined;
  const updateMs =
    Number.isFinite(config.updateMs) && config.updateMs !== undefined ? config.updateMs : 16;
  const yieldMs =
    Number.isFinite(config.yieldMs) && config.yieldMs !== undefined ? config.yieldMs : 0;
  return {
    regions,
    romRanges,
    appStart: Math.max(0, Math.min(0xffff, appStart)),
    entry: Math.max(0, Math.min(0xffff, entry)),
    ...(romHex ? { romHex } : {}),
    updateMs: Math.max(0, updateMs),
    yieldMs: Math.max(0, yieldMs),
  };
}

export function createTec1Runtime(
  config: Tec1PlatformConfigNormalized,
  onUpdate: (payload: Tec1UpdatePayload) => void,
  onSerialByte?: (byte: number) => void
): Tec1Runtime {
  const state: Tec1State = {
    digits: Array.from({ length: 6 }, () => 0),
    digitLatch: 0,
    segmentLatch: 0,
    speaker: false,
    speakerHz: 0,
    cycleClock: new CycleClock(),
    lastEdgeCycle: null,
    silenceEventId: null,
    keyValue: 0x7f,
    nmiPending: false,
    lastUpdateMs: 0,
    pendingUpdate: false,
    clockHz: TEC1_FAST_HZ,
    speedMode: 'fast',
    updateMs: config.updateMs,
    yieldMs: config.yieldMs,
  };

  const sendUpdate = (): void => {
    onUpdate({
      digits: [...state.digits],
      speaker: state.speaker ? 1 : 0,
      speedMode: state.speedMode,
      speakerHz: state.speakerHz,
    });
  };

  let serialLevel: 0 | 1 = 1;
  let serialRxLevel: 0 | 1 = 1;
  let serialRxBusy = false;
  let serialRxToken = 0;
  let serialRxLeadCycles = 0;
  let serialCyclesPerBit = state.clockHz / TEC1_SERIAL_BAUD;
  const serialRxQueue: number[] = [];
  const serialDecoder = new BitbangUartDecoder(state.cycleClock, {
    baud: TEC1_SERIAL_BAUD,
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

  const scheduleSilence = (): void => {
    if (state.silenceEventId !== null) {
      state.cycleClock.cancel(state.silenceEventId);
    }
    state.silenceEventId = state.cycleClock.scheduleIn(TEC1_SILENCE_CYCLES, () => {
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
        const base = state.keyValue & 0x7f;
        return base | (serialRxLevel ? 0x80 : 0);
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
    for (const value of bytes) {
      serialRxQueue.push(value & 0xff);
    }
    if (!serialRxBusy) {
      serialRxLeadCycles = Math.max(1, Math.round(serialCyclesPerBit * 2));
      startNextSerialRx();
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

  const setSpeed = (mode: Tec1SpeedMode): void => {
    state.speedMode = mode;
    state.clockHz = mode === 'slow' ? TEC1_SLOW_HZ : TEC1_FAST_HZ;
    serialDecoder.setCyclesPerSecond(state.clockHz);
    serialCyclesPerBit = state.clockHz / TEC1_SERIAL_BAUD;
    sendUpdate();
  };

  const resetState = (): void => {
    state.speaker = false;
    state.speakerHz = 0;
    state.lastEdgeCycle = null;
    if (state.silenceEventId !== null) {
      state.cycleClock.cancel(state.silenceEventId);
      state.silenceEventId = null;
    }
    serialRxQueue.length = 0;
    serialRxBusy = false;
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
