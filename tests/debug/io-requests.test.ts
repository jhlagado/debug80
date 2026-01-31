/**
 * @file IO request helpers tests.
 */

import { describe, it, expect } from 'vitest';
import { applySerialInput, applySpeedChange, applyTerminalBreak, applyTerminalInput } from '../../src/debug/io-requests';
import type { TerminalState } from '../../src/debug/types';

describe('io-requests', () => {
  it('applies terminal input and break', () => {
    const state: TerminalState = {
      input: [],
      output: [],
      breakRequested: false,
    };
    applyTerminalInput({ text: 'A' }, state);
    applyTerminalBreak(state);
    expect(state.input).toEqual([65]);
    expect(state.breakRequested).toBe(true);
  });

  it('applies serial input', () => {
    const bytes: number[] = [];
    applySerialInput({ text: 'B' }, { queueSerial: (data) => bytes.push(...data) });
    expect(bytes).toEqual([66]);
  });

  it('validates speed mode', () => {
    let mode: string | null = null;
    const target = { setSpeed: (value: 'slow' | 'fast') => { mode = value; } };
    expect(applySpeedChange({ mode: 'fast' }, target)).toBeNull();
    expect(mode).toBe('fast');
    expect(applySpeedChange({ mode: 'nope' }, target)).toContain('Missing speed mode');
  });
});
