/**
 * @file Memory write request tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { createSessionState } from '../../src/debug/session/session-state';
import { handleMemoryWriteRequest } from '../../src/debug/requests/memory-write';
import { createZ80Runtime } from '../../src/z80/runtime';

describe('memory-write', () => {
  it('writes a byte through the runtime memory hook when paused', () => {
    const sessionState = createMemoryWriteSession();
    const memWrite = createMemoryWriteSpy(sessionState);
    sessionState.runtime.hardware.memWrite = memWrite;

    const error = handleMemoryWriteRequest(sessionState, {
      address: 0x1234,
      value: 'ab',
    });

    expect(error).toBeNull();
    expect(memWrite).toHaveBeenCalledWith(0x1234, 0xab);
    expect(sessionState.runtime.hardware.memory[0x1234]).toBe(0xab);
  });

  it('rejects paused writes that do not stick', () => {
    const sessionState = createMemoryWriteSession();
    sessionState.runtime.hardware.memWrite = vi.fn();

    const error = handleMemoryWriteRequest(sessionState, {
      address: 0x1234,
      value: 'ab',
    });

    expect(error).toBe('Debug80: Memory address is read-only or write-protected.');
    expect(sessionState.runtime.hardware.memory[0x1234]).toBe(0);
  });

  it('uses force writes when the read-only override is explicit', () => {
    const sessionState = createMemoryWriteSession();
    sessionState.runtime.hardware.memWrite = vi.fn();
    const forceMemWrite = createMemoryWriteSpy(sessionState);
    sessionState.runtime.hardware.forceMemWrite = forceMemWrite;

    const error = handleMemoryWriteRequest(sessionState, {
      address: 0x1234,
      value: 'ab',
      allowReadOnly: true,
    });

    expect(error).toBeNull();
    expect(forceMemWrite).toHaveBeenCalledWith(0x1234, 0xab);
    expect(sessionState.runtime.hardware.memory[0x1234]).toBe(0xab);
  });

  it('rejects writes while the session is running', () => {
    const sessionState = createMemoryWriteSession({ running: true });

    const error = handleMemoryWriteRequest(sessionState, {
      address: 0x1234,
      value: 'ab',
    });

    expect(error).toBe('Debug80: Memory can only be edited while paused.');
  });
});

function createMemoryWriteSession(
  options: { running?: boolean } = {}
): ReturnType<typeof createSessionState> {
  const sessionState = createSessionState();
  sessionState.runtime = createZ80Runtime({
    memory: new Uint8Array(0x10000),
    startAddress: 0,
  });
  sessionState.runState.isRunning = options.running ?? false;
  return sessionState;
}

function createMemoryWriteSpy(
  sessionState: ReturnType<typeof createSessionState>
): ReturnType<typeof vi.fn<(address: number, value: number) => void>> {
  return vi.fn((address: number, value: number) => {
    sessionState.runtime!.hardware.memory[address & 0xffff] = value & 0xff;
  });
}
