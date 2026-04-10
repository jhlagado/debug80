/**
 * @file TEC-1G port IO handler construction.
 */

import type { Tec1gState } from './runtime';
import {
  TEC1G_PORT_8X8_BLUE,
  TEC1G_PORT_8X8_GREEN,
  TEC1G_PORT_8X8_RED,
  TEC1G_PORT_8X8_ROW,
  TEC1G_DIGIT_SERIAL_TX,
  TEC1G_DIGIT_SPEAKER,
  TEC1G_PORT_DIGIT,
  TEC1G_PORT_GLCD_CMD,
  TEC1G_PORT_GLCD_DATA,
  TEC1G_PORT_KEYBOARD,
  TEC1G_PORT_LCD_CMD,
  TEC1G_PORT_LCD_DATA,
  TEC1G_PORT_MATRIX_KEYBOARD,
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
  TEC1G_MASK_BYTE,
  TEC1G_MASK_LOW4,
  TEC1G_MASK_LOW7,
  TEC1G_ADDR_MAX,
} from './constants';
import {
  TEC_SILENCE_CYCLES,
  calculateSpeakerFrequency,
  updateDisplayDigits,
} from '../tec-common';
import { decodeSysCtrl } from './sysctrl';
import type { IoHandlers } from '../../z80/runtime';

/**
 *
 */
function rebuildLedMatrixRows(display: Tec1gState['display']): boolean {
  let changed = false;
  const rowMask = display.ledMatrixRowLatch & TEC1G_MASK_BYTE;
  const rebuildPlane = (rows: number[], latch: number): void => {
    const dataMask = latch & TEC1G_MASK_BYTE;
    for (let row = 0; row < 8; row += 1) {
      const next = (rowMask & (1 << row)) !== 0 ? dataMask : 0;
      if (rows[row] !== next) {
        rows[row] = next;
        changed = true;
      }
    }
  };
  rebuildPlane(display.ledMatrixRedRows, display.ledMatrixRedLatch);
  rebuildPlane(display.ledMatrixGreenRows, display.ledMatrixGreenLatch);
  rebuildPlane(display.ledMatrixBlueRows, display.ledMatrixBlueLatch);
  return changed;
}

/**
 *
 */
function updateLedMatrixLatches(
  display: Tec1gState['display'],
  nextRowLatch: number,
  nextRed: number,
  nextGreen: number,
  nextBlue: number
): boolean {
  let changed = false;
  if (display.ledMatrixRowLatch !== nextRowLatch) {
    display.ledMatrixRowLatch = nextRowLatch;
    changed = true;
  }
  const r = nextRed & TEC1G_MASK_BYTE;
  const g = nextGreen & TEC1G_MASK_BYTE;
  const b = nextBlue & TEC1G_MASK_BYTE;
  if (display.ledMatrixRedLatch !== r) {
    display.ledMatrixRedLatch = r;
    changed = true;
  }
  if (display.ledMatrixGreenLatch !== g) {
    display.ledMatrixGreenLatch = g;
    changed = true;
  }
  if (display.ledMatrixBlueLatch !== b) {
    display.ledMatrixBlueLatch = b;
    changed = true;
  }
  return rebuildLedMatrixRows(display) || changed;
}

type Tec1gIoTiming = Pick<Tec1gState['timing'], 'cycleClock' | 'clockHz'>;

type Tec1gLcdIo = {
  readStatus(): number;
  readData(): number;
  writeCommand(value: number): void;
  writeData(value: number): void;
};

type Tec1gSerialIo = {
  maybeStartQueuedRx(): void;
  getRxLevel(): number;
  recordTxLevel(level: 0 | 1): void;
  queueSerial(bytes: number[]): void;
};

type Tec1gPortContext = {
  state: Tec1gState;
  timing: Tec1gIoTiming;
  lcd: Tec1gLcdIo;
  glcd: Tec1gLcdIo;
  serial: Tec1gSerialIo;
  rtcEnabled: boolean;
  rtc: { read(): number; write(value: number): void } | null;
  sdEnabled: boolean;
  sdSpi: { read(): number; write(value: number): void } | null;
  queueUpdate: () => void;
  /** Called after matrix latches change; do not queue UI here — runtime commits on 8 rows or idle. */
  onMatrixPortsChanged?: (kind: 'row' | 'rgb') => void;
  onPortWrite?: (payload: { port: number; value: number }) => void;
};

/**
 * Computes the TEC-1G status-port bitfield from the current runtime state.
 */
function createTec1gPortStatus(state: Tec1gState): number {
  const keyPressed = (state.input.keyValue & TEC1G_MASK_LOW7) !== TEC1G_MASK_LOW7;
  let value = 0;
  if (state.input.shiftKeyActive) {
    value |= TEC1G_STATUS_SHIFT;
  }
  if (state.system.protectEnabled) {
    value |= TEC1G_STATUS_PROTECT;
  }
  if (state.system.expandEnabled) {
    value |= TEC1G_STATUS_EXPAND;
  }
  if (state.system.cartridgePresent) {
    value |= TEC1G_STATUS_CARTRIDGE;
  }
  if (state.input.rawKeyActive) {
    value |= TEC1G_STATUS_RAW_KEY;
  }
  if (state.system.gimpSignal) {
    value |= TEC1G_STATUS_GIMP;
  }
  if (!keyPressed) {
    value |= TEC1G_STATUS_NO_KEY;
  }
  return value;
}

/**
 * Builds the TEC-1G runtime port handlers.
 */
export function createTec1gIoHandlers(context: Tec1gPortContext): IoHandlers {
  const {
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
    onMatrixPortsChanged,
    onPortWrite,
  } = context;
  const display = state.display;
  const input = state.input;
  const audio = state.audio;
  const system = state.system;

  const logPortWrite = (port: number, value: number): void => {
    if (onPortWrite) {
      onPortWrite({ port, value });
    }
  };

  const updateDisplay = (): void => {
    if (updateDisplayDigits(display.digits, display.digitLatch, display.segmentLatch)) {
      queueUpdate();
    }
  };

  const updateLedMatrix = (rowMask: number): void => {
    if (
      updateLedMatrixLatches(
        display,
        rowMask & TEC1G_MASK_BYTE,
        display.ledMatrixRedLatch,
        display.ledMatrixGreenLatch,
        display.ledMatrixBlueLatch
      )
    ) {
      onMatrixPortsChanged?.('row');
    }
  };

  const updateLedMatrixRed = (dataMask: number): void => {
    if (
      updateLedMatrixLatches(
        display,
        display.ledMatrixRowLatch,
        dataMask & TEC1G_MASK_BYTE,
        display.ledMatrixGreenLatch,
        display.ledMatrixBlueLatch
      )
    ) {
      onMatrixPortsChanged?.('rgb');
    }
  };

  const updateLedMatrixGreen = (dataMask: number): void => {
    if (
      updateLedMatrixLatches(
        display,
        display.ledMatrixRowLatch,
        display.ledMatrixRedLatch,
        dataMask & TEC1G_MASK_BYTE,
        display.ledMatrixBlueLatch
      )
    ) {
      onMatrixPortsChanged?.('rgb');
    }
  };

  const updateLedMatrixBlue = (dataMask: number): void => {
    if (
      updateLedMatrixLatches(
        display,
        display.ledMatrixRowLatch,
        display.ledMatrixRedLatch,
        display.ledMatrixGreenLatch,
        dataMask & TEC1G_MASK_BYTE
      )
    ) {
      onMatrixPortsChanged?.('rgb');
    }
  };

  const scheduleSilence = (): void => {
    if (audio.silenceEventId !== null) {
      timing.cycleClock.cancel(audio.silenceEventId);
    }
    audio.silenceEventId = timing.cycleClock.scheduleIn(TEC_SILENCE_CYCLES, () => {
      if (audio.speakerHz !== 0) {
        audio.speakerHz = 0;
        queueUpdate();
      }
    });
  };

  return {
    read: (port: number): number => {
      const fullPort = port & TEC1G_ADDR_MAX;
      const p = fullPort & TEC1G_MASK_BYTE;
      const highByte = (fullPort >> 8) & TEC1G_MASK_BYTE;
      if (p === TEC1G_PORT_KEYBOARD) {
        serial.maybeStartQueuedRx();
        const key = input.keyValue & TEC1G_MASK_LOW7;
        return key | (serial.getRxLevel() ? TEC1G_STATUS_SERIAL_RX : 0);
      }
      if (p === TEC1G_PORT_MATRIX_KEYBOARD) {
        if (!input.matrixModeEnabled) {
          return TEC1G_MASK_BYTE;
        }
        const row = highByte & TEC1G_MASK_LOW4;
        return input.matrixKeyStates[row] ?? TEC1G_MASK_BYTE;
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
        return system.sysCtrl & TEC1G_MASK_BYTE;
      }
      if (p === TEC1G_PORT_STATUS) {
        const status = createTec1gPortStatus(state);
        if (serial.getRxLevel()) {
          return status | TEC1G_STATUS_SERIAL_RX;
        }
        return status;
      }
      return TEC1G_MASK_BYTE;
    },
    write: (port: number, value: number): void => {
      const fullPort = port & TEC1G_ADDR_MAX;
      const p = fullPort & TEC1G_MASK_BYTE;
      void fullPort;
      if (p === TEC1G_PORT_DIGIT) {
        display.digitLatch = value & TEC1G_MASK_BYTE;
        const speaker = (value & TEC1G_DIGIT_SPEAKER) !== 0;
        const nextSerial: 0 | 1 = (value & TEC1G_DIGIT_SERIAL_TX) !== 0 ? 1 : 0;
        serial.recordTxLevel(nextSerial);
        if (speaker !== audio.speaker) {
          const now = timing.cycleClock.now();
          if (audio.lastEdgeCycle !== null) {
            const delta = now - audio.lastEdgeCycle;
            audio.speakerHz = calculateSpeakerFrequency(timing.clockHz, delta);
            if (audio.speakerHz > 0) {
              queueUpdate();
            }
          }
          audio.lastEdgeCycle = now;
          scheduleSilence();
        }
        audio.speaker = speaker;
        updateDisplay();
        return;
      }
      if (p === TEC1G_PORT_SEGMENT) {
        display.segmentLatch = value & TEC1G_MASK_BYTE;
        updateDisplay();
        return;
      }
      if (p === TEC1G_PORT_8X8_RED) {
        updateLedMatrixRed(value & TEC1G_MASK_BYTE);
        return;
      }
      if (p === TEC1G_PORT_8X8_GREEN) {
        updateLedMatrixGreen(value & TEC1G_MASK_BYTE);
        return;
      }
      if (p === TEC1G_PORT_8X8_BLUE) {
        updateLedMatrixBlue(value & TEC1G_MASK_BYTE);
        return;
      }
      if (p === TEC1G_PORT_8X8_ROW) {
        updateLedMatrix(value & TEC1G_MASK_BYTE);
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
      if (p >= TEC1G_PORT_RTC && p <= TEC1G_PORT_MATRIX_KEYBOARD) {
        logPortWrite(p, value);
        return;
      }
      if (p === TEC1G_PORT_SYSCTRL) {
        logPortWrite(p, value);
        system.sysCtrl = value & TEC1G_MASK_BYTE;
        const decoded = decodeSysCtrl(system.sysCtrl);
        system.shadowEnabled = decoded.shadowEnabled;
        system.protectEnabled = decoded.protectEnabled;
        system.expandEnabled = decoded.expandEnabled;
        system.bankA14 = decoded.bankA14;
        system.capsLock = decoded.capsLock;
      }
    },
  };
}
