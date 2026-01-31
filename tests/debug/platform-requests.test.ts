/**
 * @file Platform request handler tests.
 */

import { describe, it, expect } from 'vitest';
import {
  handleKeyRequest,
  handleResetRequest,
  handleSerialRequest,
  handleSpeedRequest,
} from '../../src/debug/platform-requests';
import { KEY_RESET } from '../../src/platforms/tec-common';

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
    expect(handleKeyRequest({ applyKey: () => undefined, silenceSpeaker: () => undefined }, undefined))
      .toBe('Debug80: Missing key code.');
  });

  it('handles reset requests', () => {
    const calls: string[] = [];
    const runtime = { reset: () => calls.push('reset') };
    const platform = { resetState: () => calls.push('platform-reset') };
    const error = handleResetRequest(runtime, {}, 1234, platform);
    expect(error).toBeNull();
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
