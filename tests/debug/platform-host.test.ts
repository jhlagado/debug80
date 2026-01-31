/**
 * @file Platform host tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IoHandlers } from '../../src/z80/runtime';

vi.mock('../../src/platforms/tec1/runtime', () => ({
  createTec1Runtime: vi.fn(() => ({
    ioHandlers: {
      read: () => 0,
      write: () => undefined,
    } satisfies IoHandlers,
  })),
}));

vi.mock('../../src/platforms/tec1g/runtime', () => ({
  createTec1gRuntime: vi.fn(() => ({
    ioHandlers: {
      read: () => 0,
      write: () => undefined,
    } satisfies IoHandlers,
  })),
}));

import { buildPlatformIoHandlers } from '../../src/debug/platform-host';

describe('platform-host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined handlers when platform config is missing', () => {
    const result = buildPlatformIoHandlers({
      platform: 'tec1',
      onTec1Update: () => undefined,
      onTec1Serial: () => undefined,
      onTec1gUpdate: () => undefined,
      onTec1gSerial: () => undefined,
      onTerminalOutput: () => undefined,
    });

    expect(result.ioHandlers).toBeUndefined();
    expect(result.tec1Runtime).toBeUndefined();
  });

  it('creates tec1 runtime when config is provided', () => {
    const result = buildPlatformIoHandlers({
      platform: 'tec1',
      tec1Config: { regions: [], romRanges: [], entry: 0, appStart: 0, updateMs: 16, yieldMs: 0 },
      onTec1Update: () => undefined,
      onTec1Serial: () => undefined,
      onTec1gUpdate: () => undefined,
      onTec1gSerial: () => undefined,
      onTerminalOutput: () => undefined,
    });

    expect(result.ioHandlers).toBeDefined();
    expect(result.tec1Runtime).toBeDefined();
  });

  it('creates tec1g runtime when config is provided', () => {
    const result = buildPlatformIoHandlers({
      platform: 'tec1g',
      tec1gConfig: { regions: [], romRanges: [], entry: 0, appStart: 0, updateMs: 16, yieldMs: 0 },
      onTec1Update: () => undefined,
      onTec1Serial: () => undefined,
      onTec1gUpdate: () => undefined,
      onTec1gSerial: () => undefined,
      onTerminalOutput: () => undefined,
    });

    expect(result.ioHandlers).toBeDefined();
    expect(result.tec1gRuntime).toBeDefined();
  });

  it('builds terminal io handlers for simple platform', () => {
    const output: string[] = [];
    const result = buildPlatformIoHandlers({
      platform: 'simple',
      terminal: { txPort: 4, rxPort: 5, statusPort: 6, interrupt: true },
      onTec1Update: () => undefined,
      onTec1Serial: () => undefined,
      onTec1gUpdate: () => undefined,
      onTec1gSerial: () => undefined,
      onTerminalOutput: (payload) => output.push(payload.text),
    });

    expect(result.ioHandlers).toBeDefined();
    expect(result.terminalState).toBeDefined();

    const handlers = result.ioHandlers!;
    const state = result.terminalState!;
    state.input.push(0x41);
    expect(handlers.read(5)).toBe(0x41);
    expect(handlers.read(6)).toBe(0b10);

    handlers.write(4, 0x42);
    expect(output.join('')).toBe('B');

    state.breakRequested = true;
    const tickResult = handlers.tick?.();
    expect(tickResult?.interrupt?.data).toBe(0x38);
  });
});
