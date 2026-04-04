/**
 * @file TEC-1G port IO handler construction.
 */

import type { Tec1gState } from './runtime';
import {
  TEC1G_PORT_8X8_DATA,
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
  updateMatrixRow,
} from '../tec-common';
import { decodeSysCtrl } from './sysctrl';
import type { IoHandlers } from '../../z80/runtime';

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
  const { state, timing, lcd, glcd, serial, rtcEnabled, rtc, sdEnabled, sdSpi, queueUpdate, onPortWrite } =
    context;
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
    if (updateMatrixRow(display.ledMatrixRows, rowMask, display.ledMatrixDataLatch)) {
      queueUpdate();
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
      if (p === TEC1G_PORT_8X8_DATA) {
        display.ledMatrixDataLatch = value & TEC1G_MASK_BYTE;
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
