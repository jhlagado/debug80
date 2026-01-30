/**
 * @file TEC Common Platform Utilities
 * @description Shared types, constants, and utilities for TEC-1 and TEC-1G platforms.
 * This module extracts common functionality to reduce code duplication between
 * the tec1 and tec1g platform implementations.
 * @module platforms/tec-common
 */

import { CycleClock } from '../cycle-clock';
import { BitbangUartDecoder, BitbangUartOptions } from '../serial/bitbang-uart';

// ============================================================================
// Shared Types
// ============================================================================

/**
 * Speed mode for TEC platforms.
 * - 'slow': 400kHz clock for debugging
 * - 'fast': 4MHz clock for normal operation
 */
export type TecSpeedMode = 'slow' | 'fast';

/**
 * Base state properties shared between TEC-1 and TEC-1G.
 */
export interface TecBaseState {
  /** 7-segment display digit values (6 digits) */
  digits: number[];
  /** LED matrix column values (8 columns) */
  matrix: number[];
  /** Current digit select latch value */
  digitLatch: number;
  /** Current segment latch value */
  segmentLatch: number;
  /** Current matrix latch value */
  matrixLatch: number;
  /** Speaker output state */
  speaker: boolean;
  /** Calculated speaker frequency in Hz */
  speakerHz: number;
  /** LCD display buffer */
  lcd: number[];
  /** Current LCD DDRAM address */
  lcdAddr: number;
  /** Cycle-accurate timing clock */
  cycleClock: CycleClock;
  /** Cycle count at last speaker edge transition */
  lastEdgeCycle: number | null;
  /** Event ID for scheduled speaker silence */
  silenceEventId: number | null;
  /** Current key scan value (0x7F = no key) */
  keyValue: number;
  /** Event ID for scheduled key release */
  keyReleaseEventId: number | null;
  /** Whether NMI is pending */
  nmiPending: boolean;
  /** Timestamp of last UI update */
  lastUpdateMs: number;
  /** Whether an update is pending */
  pendingUpdate: boolean;
  /** Current clock frequency in Hz */
  clockHz: number;
  /** Current speed mode */
  speedMode: TecSpeedMode;
  /** Update throttle interval in ms */
  updateMs: number;
  /** Yield interval in ms */
  yieldMs: number;
}

/**
 * Base update payload shared between platforms.
 */
export interface TecBasePayload {
  /** 7-segment display digit values */
  digits: number[];
  /** LED matrix column values */
  matrix: number[];
  /** Speaker state (1 = on, 0 = off) */
  speaker: number;
  /** Current speed mode */
  speedMode: TecSpeedMode;
  /** LCD display buffer */
  lcd: number[];
  /** Speaker frequency in Hz */
  speakerHz?: number;
}

/**
 * Base runtime interface shared between platforms.
 */
export interface TecBaseRuntime<TState extends TecBaseState> {
  /** Platform state */
  state: TState;
  /** Apply a key press */
  applyKey(code: number): void;
  /** Queue serial bytes for transmission */
  queueSerial(bytes: number[]): void;
  /** Record CPU cycles */
  recordCycles(cycles: number): void;
  /** Silence the speaker */
  silenceSpeaker(): void;
  /** Set the clock speed mode */
  setSpeed(mode: TecSpeedMode): void;
  /** Reset platform state */
  resetState(): void;
  /** Queue a UI update */
  queueUpdate(): void;
}

// ============================================================================
// Shared Constants
// ============================================================================

/** Slow clock frequency (400kHz) */
export const TEC_SLOW_HZ = 400000;

/** Fast clock frequency (4MHz) */
export const TEC_FAST_HZ = 4000000;

/** Cycles before speaker is silenced due to inactivity */
export const TEC_SILENCE_CYCLES = 10000;

/** Duration to hold key state in milliseconds */
export const TEC_KEY_HOLD_MS = 30;

// ============================================================================
// Serial Communication
// ============================================================================

/**
 * Serial communication state for bitbang UART.
 */
export interface TecSerialState {
  /** Current TX level */
  level: 0 | 1;
  /** Current RX level */
  rxLevel: 0 | 1;
  /** Whether serial RX is busy */
  rxBusy: boolean;
  /** Token for cancelling pending serial operations */
  rxToken: number;
  /** Lead cycles before starting next byte */
  rxLeadCycles: number;
  /** Whether RX has pending data */
  rxPending: boolean;
  /** Cycles per bit at current baud rate */
  cyclesPerBit: number;
  /** Queue of bytes to receive */
  rxQueue: number[];
  /** Whether RX has been primed */
  rxPrimed: boolean;
}

/**
 * Creates initial serial state.
 * @param clockHz - Clock frequency in Hz
 * @param baud - Baud rate
 * @returns Initial serial state
 */
export function createSerialState(clockHz: number, baud: number): TecSerialState {
  return {
    level: 1,
    rxLevel: 1,
    rxBusy: false,
    rxToken: 0,
    rxLeadCycles: 0,
    rxPending: false,
    cyclesPerBit: clockHz / baud,
    rxQueue: [],
    rxPrimed: false,
  };
}

/**
 * Configuration for creating a serial decoder.
 */
export interface SerialDecoderConfig {
  /** Cycle clock for timing */
  cycleClock: CycleClock;
  /** Baud rate */
  baud: number;
  /** Clock frequency in Hz */
  clockHz: number;
  /** Callback when a byte is received */
  onByte?: (byte: number) => void;
}

/**
 * Creates a bitbang UART decoder with TEC-standard settings.
 * @param config - Decoder configuration
 * @returns Configured BitbangUartDecoder
 */
export function createTecSerialDecoder(config: SerialDecoderConfig): BitbangUartDecoder {
  const uartConfig: BitbangUartOptions = {
    baud: config.baud,
    cyclesPerSecond: config.clockHz,
    dataBits: 8,
    stopBits: 2,
    parity: 'none',
    inverted: false,
  };
  const decoder = new BitbangUartDecoder(config.cycleClock, uartConfig);
  if (config.onByte) {
    const onByte = config.onByte;
    decoder.setByteHandler((event) => onByte(event.byte));
  }
  return decoder;
}

// ============================================================================
// Display Utilities
// ============================================================================

/**
 * Updates the 7-segment display digits based on latch values.
 * @param digits - Array of digit values to update
 * @param digitLatch - Current digit select latch (bits 0-5)
 * @param segmentLatch - Current segment latch value
 * @returns True if any digit was updated
 */
export function updateDisplayDigits(
  digits: number[],
  digitLatch: number,
  segmentLatch: number
): boolean {
  const mask = digitLatch & 0x3f;
  if (mask === 0) {
    return false;
  }
  for (let i = 0; i < digits.length; i += 1) {
    if (mask & (1 << i)) {
      digits[i] = segmentLatch & 0xff;
    }
  }
  return true;
}

/**
 * Updates an LED matrix row based on row mask and latch value.
 * @param matrix - Array of matrix column values to update
 * @param rowMask - Row select mask (one bit set)
 * @param matrixLatch - Current matrix latch value
 * @returns True if the matrix was updated
 */
export function updateMatrixRow(
  matrix: number[],
  rowMask: number,
  matrixLatch: number
): boolean {
  const rowIndex = rowMask ? Math.log2(rowMask & 0xff) : -1;
  if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex > 7) {
    return false;
  }
  matrix[rowIndex] = matrixLatch & 0xff;
  return true;
}

// ============================================================================
// Speaker Utilities
// ============================================================================

/**
 * Calculates speaker frequency based on edge timing.
 * @param clockHz - Clock frequency in Hz
 * @param cycleDelta - Cycles since last edge
 * @returns Calculated frequency in Hz
 */
export function calculateSpeakerFrequency(clockHz: number, cycleDelta: number): number {
  if (cycleDelta <= 0 || clockHz <= 0) {
    return 0;
  }
  return Math.round((clockHz / 2) / cycleDelta);
}

// ============================================================================
// Key Handling
// ============================================================================

/**
 * Calculates the number of cycles to hold a key pressed.
 * @param clockHz - Clock frequency in Hz
 * @param holdMs - Hold time in milliseconds
 * @returns Number of cycles
 */
export function calculateKeyHoldCycles(clockHz: number, holdMs: number = TEC_KEY_HOLD_MS): number {
  return Math.max(1, Math.round((clockHz * holdMs) / 1000));
}

// ============================================================================
// Timing Utilities
// ============================================================================

/**
 * Checks if enough time has elapsed for a UI update.
 * @param lastUpdateMs - Timestamp of last update
 * @param updateMs - Update interval in milliseconds
 * @returns True if an update should occur
 */
export function shouldUpdate(lastUpdateMs: number, updateMs: number): boolean {
  if (updateMs <= 0) {
    return true;
  }
  return Date.now() - lastUpdateMs >= updateMs;
}

/**
 * Converts microseconds to cycles.
 * @param clockHz - Clock frequency in Hz
 * @param microseconds - Time in microseconds
 * @returns Number of cycles
 */
export function microsecondsToClocks(clockHz: number, microseconds: number): number {
  return Math.max(1, Math.round((clockHz * microseconds) / 1_000_000));
}

/**
 * Converts milliseconds to cycles.
 * @param clockHz - Clock frequency in Hz
 * @param milliseconds - Time in milliseconds
 * @returns Number of cycles
 */
export function millisecondsToClocks(clockHz: number, milliseconds: number): number {
  return Math.max(1, Math.round((clockHz * milliseconds) / 1000));
}
