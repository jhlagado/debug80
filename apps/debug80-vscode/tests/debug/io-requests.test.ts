/**
 * @file IO request helpers tests.
 */

import { describe, it, expect } from 'vitest';
import {
  applySerialInput,
  applySpeedChange,
  applyTerminalBreak,
  applyTerminalInput,
} from '../../src/debug/requests/io-requests';
import type { TerminalState } from '../../src/debug/session/terminal-types';

describe('io-requests', () => {
  it('applies terminal input and break', () => {
    const state = createTerminalState();
    applyTerminalInput({ text: 'A' }, state);
    applyTerminalBreak(state);
    expect(state.input).toEqual([65]);
    expect(state.breakRequested).toBe(true);
  });

  it('applies serial input', () => {
    const serial = createSerialQueue();
    applySerialInput({ text: 'B' }, serial.target);
    expect(serial.bytes).toEqual([66]);
  });

  it('validates speed mode', () => {
    let mode: string | null = null;
    const target = {
      setSpeed: (value: 'slow' | 'fast') => {
        mode = value;
      },
    };
    expect(applySpeedChange({ mode: 'fast' }, target)).toBeNull();
    expect(mode).toBe('fast');
    expect(applySpeedChange({ mode: 'nope' }, target)).toContain('Missing speed mode');
  });
});

function createTerminalState(): TerminalState {
  return {
    config: { txPort: 0, rxPort: 1, statusPort: 2, interrupt: false },
    input: [],
    breakRequested: false,
  };
}

function createSerialQueue(): {
  bytes: number[];
  target: { queueSerial: (data: number[]) => void };
} {
  const bytes: number[] = [];
  return {
    bytes,
    target: {
      queueSerial: (data) => bytes.push(...data),
    },
  };
}
