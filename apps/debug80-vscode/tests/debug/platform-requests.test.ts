/**
 * @file Platform request handler tests.
 */

import { describe, it, expect } from 'vitest';
import {
  handleKeyRequest,
  handleResetRequest,
  handleSerialRequest,
  handleSpeedRequest,
} from '../../src/debug/requests/platform-requests';
import { KEY_RESET } from '@jhlagado/debug80-runtime/platforms/tec-common';

function createProgram() {
  return { memory: new Uint8Array(0x10000), startAddress: 0 };
}

function createResetRuntime(calls: unknown[]) {
  return {
    hardware: { memory: new Uint8Array(0x10000) },
    reset: (program?: unknown, entry?: number) => calls.push(['reset', program, entry]),
    restoreCpuState: () => calls.push('restore'),
  };
}

describe('platform-requests', () => {
  it('handles key requests and reset side effects', () => {
    const events: string[] = [];
    const runtime = {
      applyKey: (code: number) => events.push(`key:${code}`),
      silenceSpeaker: () => events.push('silence'),
    };
    const error = handleKeyRequest(runtime, KEY_RESET, () => events.push('other'));
    expect(error).toBeNull();
    expect(events).toEqual(['silence', 'other', `key:${KEY_RESET}`]);
  });

  it('returns errors for missing runtime or code', () => {
    expect(handleKeyRequest(undefined, 1)).toBe('Debug80: Platform not active.');
    expect(
      handleKeyRequest({ applyKey: () => undefined, silenceSpeaker: () => undefined }, undefined)
    ).toBe('Debug80: Missing key code.');
  });

  it('handles reset requests', () => {
    const calls: unknown[] = [];
    const program = createProgram();
    const runtime = createResetRuntime(calls);
    const platform = { resetState: () => calls.push('platform-reset') };
    const error = handleResetRequest(runtime, program, 1234, platform);
    expect(error).toBeNull();
    expect(calls).toEqual([['reset', program, 1234], 'platform-reset']);
  });

  it('resets hardware to the entry address instead of restoring a captured entry snapshot', () => {
    const calls: unknown[] = [];
    const program = createProgram();
    const runtime = createResetRuntime(calls);
    const platform = { resetState: () => calls.push('platform-reset') };

    const error = handleResetRequest(runtime, program, 1234, platform);

    expect(error).toBeNull();
    expect(calls).toEqual([['reset', program, 1234], 'platform-reset']);
  });

  it('reloads app memory while preserving platform monitor RAM ranges', () => {
    const program = createProgram();
    program.memory[0x0800] = 0x00;
    program.memory[0x0888] = 0x00;
    program.memory[0x4000] = 0x3e;

    const memory = new Uint8Array(0x10000);
    memory[0x0800] = 0x4d;
    memory[0x0888] = 0x80;
    memory[0x4000] = 0x00;
    const calls: string[] = [];
    const runtime = {
      hardware: { memory },
      reset: (nextProgram?: typeof program) => {
        memory.fill(0);
        if (nextProgram) {
          memory.set(nextProgram.memory);
        }
        calls.push('reset');
      },
      restoreCpuState: () => calls.push('restore'),
    };
    const platform = { resetState: () => calls.push('platform-reset') };

    const error = handleResetRequest(runtime, program, 0, platform, {
      preserveRanges: [{ start: 0x0800, end: 0x0900 }],
    });

    expect(error).toBeNull();
    expect(memory[0x0800]).toBe(0x4d);
    expect(memory[0x0888]).toBe(0x80);
    expect(memory[0x4000]).toBe(0x3e);
    expect(calls).toEqual(['reset', 'platform-reset']);
  });

  it('handles speed and serial requests', () => {
    const speedCalls: string[] = [];
    const serialCalls: number[][] = [];
    const speedTarget = { setSpeed: (mode: 'slow' | 'fast') => speedCalls.push(mode) };
    const serialTarget = { queueSerial: (bytes: number[]) => serialCalls.push(bytes) };

    expect(handleSpeedRequest(undefined, {})).toBe('Debug80: Platform not active.');
    expect(handleSerialRequest(undefined, {})).toBe('Debug80: Platform not active.');

    expect(handleSpeedRequest(speedTarget, { mode: 'fast' })).toBeNull();
    expect(handleSerialRequest(serialTarget, { text: 'A' })).toBeNull();
    expect(speedCalls).toEqual(['fast']);
    expect(serialCalls[0]).toEqual([65]);
  });
});
