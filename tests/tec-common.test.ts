/**
 * @file TEC Common Utilities Tests
 * @description Tests for shared TEC platform utilities
 */

import { describe, it, expect } from 'vitest';
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
  createSerialState,
} from '../src/platforms/tec-common';

describe('TEC Common Constants', () => {
  it('should have correct clock frequencies', () => {
    expect(TEC_SLOW_HZ).toBe(400000);
    expect(TEC_FAST_HZ).toBe(4000000);
  });

  it('should have correct timing constants', () => {
    expect(TEC_SILENCE_CYCLES).toBe(10000);
    expect(TEC_KEY_HOLD_MS).toBe(30);
  });
});

describe('updateDisplayDigits', () => {
  it('should update selected digits', () => {
    const digits = [0, 0, 0, 0, 0, 0];
    const result = updateDisplayDigits(digits, 0b000101, 0xab);
    expect(result).toBe(true);
    expect(digits).toEqual([0xab, 0, 0xab, 0, 0, 0]);
  });

  it('should return false when no digits selected', () => {
    const digits = [0, 0, 0, 0, 0, 0];
    const result = updateDisplayDigits(digits, 0, 0xab);
    expect(result).toBe(false);
    expect(digits).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('should update all digits when all selected', () => {
    const digits = [0, 0, 0, 0, 0, 0];
    const result = updateDisplayDigits(digits, 0b111111, 0xff);
    expect(result).toBe(true);
    expect(digits).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  });
});

describe('updateMatrixRow', () => {
  it('should update the correct row', () => {
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = updateMatrixRow(matrix, 0b00000100, 0xcd);
    expect(result).toBe(true);
    expect(matrix[2]).toBe(0xcd);
  });

  it('should return false for invalid row mask', () => {
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = updateMatrixRow(matrix, 0, 0xcd);
    expect(result).toBe(false);
  });

  it('should handle row 0', () => {
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = updateMatrixRow(matrix, 0b00000001, 0x55);
    expect(result).toBe(true);
    expect(matrix[0]).toBe(0x55);
  });

  it('should handle row 7', () => {
    const matrix = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = updateMatrixRow(matrix, 0b10000000, 0xaa);
    expect(result).toBe(true);
    expect(matrix[7]).toBe(0xaa);
  });
});

describe('calculateSpeakerFrequency', () => {
  it('should calculate correct frequency', () => {
    // At 4MHz, 2000 cycles between edges = 1kHz
    const freq = calculateSpeakerFrequency(4000000, 2000);
    expect(freq).toBe(1000);
  });

  it('should return 0 for zero or negative delta', () => {
    expect(calculateSpeakerFrequency(4000000, 0)).toBe(0);
    expect(calculateSpeakerFrequency(4000000, -100)).toBe(0);
  });

  it('should return 0 for zero clock', () => {
    expect(calculateSpeakerFrequency(0, 2000)).toBe(0);
  });
});

describe('calculateKeyHoldCycles', () => {
  it('should calculate correct cycles at 4MHz', () => {
    // 30ms at 4MHz = 120000 cycles
    const cycles = calculateKeyHoldCycles(TEC_FAST_HZ, 30);
    expect(cycles).toBe(120000);
  });

  it('should calculate correct cycles at 400kHz', () => {
    // 30ms at 400kHz = 12000 cycles
    const cycles = calculateKeyHoldCycles(TEC_SLOW_HZ, 30);
    expect(cycles).toBe(12000);
  });

  it('should return minimum of 1 cycle', () => {
    const cycles = calculateKeyHoldCycles(1, 0);
    expect(cycles).toBeGreaterThanOrEqual(1);
  });
});

describe('shouldUpdate', () => {
  it('should return true when updateMs is 0', () => {
    expect(shouldUpdate(Date.now(), 0)).toBe(true);
  });

  it('should return true when enough time has elapsed', () => {
    const lastUpdate = Date.now() - 100;
    expect(shouldUpdate(lastUpdate, 50)).toBe(true);
  });

  it('should return false when not enough time has elapsed', () => {
    const lastUpdate = Date.now();
    expect(shouldUpdate(lastUpdate, 1000)).toBe(false);
  });
});

describe('microsecondsToClocks', () => {
  it('should convert microseconds to clocks', () => {
    // 37us at 4MHz = 148 cycles
    const cycles = microsecondsToClocks(4000000, 37);
    expect(cycles).toBe(148);
  });

  it('should return minimum of 1', () => {
    const cycles = microsecondsToClocks(1, 0);
    expect(cycles).toBe(1);
  });
});

describe('millisecondsToClocks', () => {
  it('should convert milliseconds to clocks', () => {
    // 400ms at 4MHz = 1600000 cycles
    const cycles = millisecondsToClocks(4000000, 400);
    expect(cycles).toBe(1600000);
  });

  it('should return minimum of 1', () => {
    const cycles = millisecondsToClocks(1, 0);
    expect(cycles).toBe(1);
  });
});

describe('createSerialState', () => {
  it('should create initial serial state with correct cyclesPerBit', () => {
    const state = createSerialState(4000000, 9600);
    expect(state.level).toBe(1);
    expect(state.rxLevel).toBe(1);
    expect(state.rxBusy).toBe(false);
    expect(state.rxToken).toBe(0);
    expect(state.rxQueue).toEqual([]);
    expect(state.cyclesPerBit).toBeCloseTo(4000000 / 9600, 2);
  });
});
