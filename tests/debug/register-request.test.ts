/**
 * @file Register write request tests.
 */

import { describe, expect, it } from 'vitest';
import { createSessionState } from '../../src/debug/session-state';
import { handleRegisterWriteRequest } from '../../src/debug/register-request';
import { createZ80Runtime } from '../../src/z80/runtime';

describe('register-request', () => {
  it('writes core register pairs when the session is paused', () => {
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    sessionState.runState.isRunning = false;

    const error = handleRegisterWriteRequest(sessionState, {
      register: 'bc',
      value: '1234',
    });

    expect(error).toBeNull();
    const cpu = sessionState.runtime.getRegisters();
    expect(cpu.b).toBe(0x12);
    expect(cpu.c).toBe(0x34);
  });

  it('rejects writes while the session is running', () => {
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    sessionState.runState.isRunning = true;

    const error = handleRegisterWriteRequest(sessionState, {
      register: 'bc',
      value: '1234',
    });

    expect(error).toBe('Debug80: Registers can only be edited while paused.');
  });
});
