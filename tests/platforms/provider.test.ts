/**
 * @file Platform provider tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';

const {
  buildPlatformIoHandlers,
  createTec1gMemoryHooks,
  applyCartridgeMemory,
} = vi.hoisted(() => ({
  buildPlatformIoHandlers: vi.fn(() => ({ ioHandlers: undefined })),
  createTec1gMemoryHooks: vi.fn(() => ({
    memRead: vi.fn(() => 0),
    memWrite: vi.fn(() => undefined),
    expandBanks: ['bank'],
  })),
  applyCartridgeMemory: vi.fn(() => undefined),
}));

vi.mock('../../src/debug/platform-host', () => ({
  buildPlatformIoHandlers,
}));

vi.mock('../../src/debug/tec1g-memory', () => ({
  createTec1gMemoryHooks,
  applyCartridgeMemory,
}));

import { resolvePlatformProvider } from '../../src/platforms/provider';
import { PlatformRegistry } from '../../src/debug/platform-registry';
import { createSessionState } from '../../src/debug/session-state';

function createCommandContext() {
  return {
    sessionState: createSessionState(),
    sendResponse: vi.fn(),
    sendErrorResponse: vi.fn(),
    handleMatrixModeRequest: vi.fn(() => null),
    handleMatrixKeyRequest: vi.fn(() => null),
    clearMatrixHeldKeys: vi.fn(),
  };
}

describe('platform providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a simple provider with terminal IO delegation', () => {
    const provider = resolvePlatformProvider({
      platform: 'simple',
      terminal: { txPort: 4 },
      simple: { entry: 0x1234, extraListings: ['rom.lst'] },
    });

    expect(provider.id).toBe('simple');
    expect(provider.payload).toEqual({ id: 'simple' });
    expect(provider.extraListings).toEqual(['rom.lst']);
    expect(provider.resolveEntry()).toBe(0x1234);
    expect(provider.runtimeOptions).toEqual({ romRanges: [] });

    provider.buildIoHandlers({
      terminal: { txPort: 4 },
      onTec1Update: () => undefined,
      onTec1Serial: () => undefined,
      onTec1gUpdate: () => undefined,
      onTec1gSerial: () => undefined,
      onTerminalOutput: () => undefined,
    });

    expect(buildPlatformIoHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'simple',
        terminal: { txPort: 4 },
      })
    );
  });

  it('registers TEC-1 commands through the platform registry', () => {
    const provider = resolvePlatformProvider({
      platform: 'tec1',
      tec1: { entry: 0x4567, extraListings: ['tec1.rom.lst'] },
    });
    const registry = new PlatformRegistry();
    const context = createCommandContext();
    context.sessionState.tec1Runtime = {
      applyKey: vi.fn(),
      silenceSpeaker: vi.fn(),
      resetState: vi.fn(),
      setSpeed: vi.fn(),
      queueSerial: vi.fn(),
    } as never;
    context.sessionState.runtime = { reset: vi.fn() } as never;
    context.sessionState.loadedProgram = {} as never;
    context.sessionState.loadedEntry = 0x4567;

    provider.registerCommands(registry, context);

    const keyHandler = registry.getHandler('debug80/tec1Key');
    expect(keyHandler).toBeDefined();
    keyHandler?.({} as DebugProtocol.Response, { code: 0x41 });
    expect(context.sessionState.tec1Runtime?.applyKey).toHaveBeenCalledWith(0x41);
    expect(context.sendResponse).toHaveBeenCalledTimes(1);

    const resetHandler = registry.getHandler('debug80/tec1Reset');
    expect(resetHandler).toBeDefined();
    resetHandler?.({} as DebugProtocol.Response, undefined);
    expect(context.sessionState.runtime?.reset).toHaveBeenCalledWith(
      context.sessionState.loadedProgram,
      0x4567
    );
    expect(context.sessionState.tec1Runtime?.resetState).toHaveBeenCalledTimes(1);
  });

  it('finalizes TEC-1G runtime setup through the provider hook', () => {
    const provider = resolvePlatformProvider({
      platform: 'tec1g',
      tec1g: {
        entry: 0x2000,
        cartridgeHex: 'cart.hex',
        uiVisibility: { matrix: false },
        extraListings: ['tec1g.rom.lst'],
      },
    });
    const context = createCommandContext();
    context.sessionState.tec1gRuntime = {
      state: { bank: 0 },
      setCartridgePresent: vi.fn(),
    } as never;
    const runtimeMemory = new Uint8Array(0x10000);
    const runtime = {
      hardware: {
        memory: runtimeMemory,
      },
    } as never;
    const assets = {
      cartridgeImage: {
        bootEntry: 0x3456,
        memory: new Uint8Array([1, 2, 3]),
      },
    };

    expect(provider.payload).toEqual({
      id: 'tec1g',
      uiVisibility: { matrix: false },
    });
    expect(provider.extraListings).toEqual(['tec1g.rom.lst']);
    expect(provider.resolveEntry(assets)).toBe(0x3456);

    provider.finalizeRuntime?.({
      runtime,
      sessionState: context.sessionState,
      assets,
    });

    expect(createTec1gMemoryHooks).toHaveBeenCalledWith(
      runtimeMemory,
      provider.runtimeOptions?.romRanges ?? [],
      context.sessionState.tec1gRuntime?.state
    );
    expect(applyCartridgeMemory).toHaveBeenCalledWith(['bank'], assets.cartridgeImage.memory);
    expect(context.sessionState.tec1gRuntime?.setCartridgePresent).toHaveBeenCalledWith(true);
  });
});
