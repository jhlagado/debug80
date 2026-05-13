/**
 * @file Platform provider tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';

const { getExtension } = vi.hoisted(() => ({
  getExtension: vi.fn(),
}));

const { buildPlatformIoHandlers, createTec1gMemoryHooks, applyCartridgeMemory } = vi.hoisted(
  () => ({
    buildPlatformIoHandlers: vi.fn(() => ({ ioHandlers: undefined })),
    createTec1gMemoryHooks: vi.fn(() => ({
      memRead: vi.fn(() => 0),
      memWrite: vi.fn(() => undefined),
      expandBanks: ['bank'],
    })),
    applyCartridgeMemory: vi.fn(() => undefined),
  })
);

vi.mock('vscode', () => ({
  extensions: {
    getExtension,
  },
  workspace: {
    workspaceFolders: undefined,
  },
}));

vi.mock('../../src/debug/session/platform-host', () => ({
  buildPlatformIoHandlers,
}));

vi.mock('../../src/platforms/tec1g/tec1g-memory', () => ({
  createTec1gMemoryHooks,
  applyCartridgeMemory,
}));

import {
  listPlatforms,
  registerPlatform,
  resolvePlatformProvider,
  type PlatformManifestEntry,
} from '../../src/platforms/provider';
import { PlatformRegistry } from '../../src/debug/session/platform-registry';
import { createSessionState } from '../../src/debug/session/session-state';
import type { Tec1gRuntime } from '../../src/platforms/tec1g/runtime';

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

  it('lists the built-in platform manifest entries', () => {
    expect(listPlatforms()).toEqual([
      expect.objectContaining({ id: 'simple', displayName: 'Simple' }),
      expect.objectContaining({ id: 'tec1', displayName: 'TEC-1' }),
      expect.objectContaining({ id: 'tec1g', displayName: 'TEC-1G' }),
    ]);
  });

  it('resolves a registered external platform provider', async () => {
    const customProvider = {
      id: 'microbee',
      payload: { id: 'microbee' },
      extraListings: [],
      registerCommands: vi.fn(),
      buildIoHandlers: vi.fn(() => Promise.resolve({ ioHandlers: undefined })),
      resolveEntry: vi.fn(() => 0x4000),
    };
    const entry: PlatformManifestEntry = {
      id: 'microbee',
      displayName: 'MicroBee',
      loadProvider: vi.fn(() => Promise.resolve(customProvider)),
    };

    registerPlatform(entry);

    expect(listPlatforms()).toContainEqual(expect.objectContaining({ id: 'microbee' }));

    const provider = await resolvePlatformProvider({
      platform: 'microbee',
    });

    expect(entry.loadProvider).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'microbee' })
    );
    expect(provider).toBe(customProvider);
  });

  it('builds a simple provider with terminal IO delegation', async () => {
    const provider = await resolvePlatformProvider({
      platform: 'simple',
      terminal: { txPort: 4 },
      simple: { entry: 0x1234, extraListings: ['rom.lst'] },
    });

    expect(provider.id).toBe('simple');
    expect(provider.payload).toEqual({ id: 'simple' });
    expect(provider.extraListings).toEqual(['rom.lst']);
    expect(provider.resolveEntry()).toBe(0x1234);
    expect(provider.runtimeOptions).toEqual({
      romRanges: provider.simpleConfig?.romRanges ?? [],
    });

    await provider.buildIoHandlers({
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

  it('registers TEC-1 commands through the platform registry', async () => {
    const provider = await resolvePlatformProvider({
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

  it('finalizes TEC-1G runtime setup through the provider hook', async () => {
    const provider = await resolvePlatformProvider({
      platform: 'tec1g',
      tec1g: {
        entry: 0x2000,
        cartridgeHex: 'cart.hex',
        uiVisibility: { matrix: false },
        extraListings: ['tec1g.rom.lst'],
      },
    });
    const context = createCommandContext();
    const setCartridgePresent = vi.fn();
    context.sessionState.tec1gRuntime = {
      state: {
        display: {
          digits: [],
          ledMatrixRedRows: [],
          ledMatrixGreenRows: [],
          ledMatrixBlueRows: [],
          ledMatrixBrightnessR: [],
          ledMatrixBrightnessG: [],
          ledMatrixBrightnessB: [],
          digitLatch: 0,
          segmentLatch: 0,
          ledMatrixRowLatch: 0,
          ledMatrixRedLatch: 0,
          ledMatrixGreenLatch: 0,
          ledMatrixBlueLatch: 0,
          glcdCtrl: {} as never,
        },
        input: {
          matrixKeyStates: new Uint8Array(16),
          matrixModeEnabled: false,
          keyValue: 0x7f,
          keyReleaseEventId: null,
          nmiPending: false,
          shiftKeyActive: false,
          rawKeyActive: false,
        },
        audio: {
          speaker: false,
          speakerHz: 0,
          lastEdgeCycle: null,
          silenceEventId: null,
        },
        lcdCtrl: {
          lcd: [],
          lcdAddr: 0,
          lcdAddrMode: 'ddram',
          lcdEntryIncrement: true,
          lcdEntryShift: false,
          lcdDisplayOn: true,
          lcdCursorOn: false,
          lcdCursorBlink: false,
          lcdDisplayShift: 0,
          lcdCgram: new Uint8Array(),
          lcdCgramAddr: 0,
          lcdFunction: {
            dataLength8: true,
            lines2: true,
            font5x8: true,
          },
        },
        timing: {
          cycleClock: {} as never,
          lastUpdateMs: 0,
          pendingUpdate: false,
          clockHz: 0,
          speedMode: 'fast',
          updateMs: 0,
          yieldMs: 0,
        },
        system: {
          sysCtrl: 0,
          shadowEnabled: false,
          protectEnabled: false,
          expandEnabled: false,
          bankA14: false,
          capsLock: false,
          cartridgePresent: false,
          gimpSignal: false,
        },
      },
      setCartridgePresent,
    } as Tec1gRuntime;
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

    const tec1gRuntime = context.sessionState.tec1gRuntime as Tec1gRuntime | undefined;
    expect(createTec1gMemoryHooks).toHaveBeenCalledWith(
      runtimeMemory,
      provider.runtimeOptions?.romRanges ?? [],
      tec1gRuntime?.state.system
    );
    expect(applyCartridgeMemory).toHaveBeenCalledWith(['bank'], assets.cartridgeImage.memory);
    expect(setCartridgePresent).toHaveBeenCalledWith(true);
  });
});
