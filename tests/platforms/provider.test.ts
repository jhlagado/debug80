/**
 * @file Platform provider tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';

const { getExtension } = vi.hoisted(() => ({
  getExtension: vi.fn(),
}));

const { buildPlatformIoHandlers, createTec1gMemoryHooks, applyExpansionRomMemory } = vi.hoisted(
  () => ({
    buildPlatformIoHandlers: vi.fn(() => ({ ioHandlers: undefined })),
    createTec1gMemoryHooks: vi.fn(() => ({
      memRead: vi.fn(() => 0),
      memWrite: vi.fn(() => undefined),
      expandBanks: ['bank'],
    })),
    applyExpansionRomMemory: vi.fn(() => undefined),
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
  applyExpansionRomMemory,
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
    handleJoystickRequest: vi.fn(() => null),
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
      simple: { entry: 0x1234 },
    });

    expect(provider.id).toBe('simple');
    expect(provider.payload).toEqual({ id: 'simple' });
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
      tec1: { entry: 0x4567 },
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

  it('registers TEC-1G reset with MON-3 monitor RAM preservation', async () => {
    const provider = await resolvePlatformProvider({
      platform: 'tec1g',
      tec1g: { entry: 0x0000 },
    });
    const registry = new PlatformRegistry();
    const context = createCommandContext();
    const program = { memory: new Uint8Array(0x10000), startAddress: 0 };
    program.memory[0x0800] = 0x00;
    program.memory[0x4000] = 0x3e;
    const memory = new Uint8Array(0x10000);
    memory[0x0800] = 0x4d;
    memory[0x0888] = 0x80;
    memory[0x4000] = 0x00;
    context.sessionState.runtime = {
      hardware: { memory },
      reset: vi.fn((nextProgram?: typeof program) => {
        memory.fill(0);
        if (nextProgram) {
          memory.set(nextProgram.memory);
        }
      }),
    } as never;
    context.sessionState.tec1gRuntime = {
      resetState: vi.fn(),
    } as never;
    context.sessionState.loadedProgram = program as never;
    context.sessionState.loadedEntry = 0x0000;

    provider.registerCommands(registry, context);

    const resetHandler = registry.getHandler('debug80/tec1gReset');
    expect(resetHandler).toBeDefined();
    resetHandler?.({} as DebugProtocol.Response, undefined);

    expect(context.sessionState.runtime?.reset).toHaveBeenCalledWith(program, 0x0000);
    expect(memory[0x0800]).toBe(0x4d);
    expect(memory[0x0888]).toBe(0x80);
    expect(memory[0x4000]).toBe(0x3e);
    expect(context.sessionState.tec1gRuntime?.resetState).toHaveBeenCalledTimes(1);
  });

  it('remembers TMS9918 panel state before the TEC-1G runtime exists', async () => {
    const provider = await resolvePlatformProvider({
      platform: 'tec1g',
      tec1g: { entry: 0x0000 },
    });
    const registry = new PlatformRegistry();
    const context = createCommandContext();

    provider.registerCommands(registry, context);

    const activeHandler = registry.getHandler('debug80/tec1gTms9918Active');
    const standardHandler = registry.getHandler('debug80/tec1gTms9918VideoStandard');
    expect(activeHandler).toBeDefined();
    expect(standardHandler).toBeDefined();
    activeHandler?.({} as DebugProtocol.Response, { enabled: true });
    standardHandler?.({} as DebugProtocol.Response, { standard: 'ntsc' });

    expect(context.sendErrorResponse).not.toHaveBeenCalled();
    expect(context.sendResponse).toHaveBeenCalledTimes(2);
    expect(context.sessionState.ui.tec1gTms9918Active).toBe(true);
    expect(context.sessionState.ui.tec1gTms9918VideoStandard).toBe('ntsc');
  });

  it('finalizes TEC-1G runtime setup through the provider hook', async () => {
    const provider = await resolvePlatformProvider({
      platform: 'tec1g',
      tec1g: {
        entry: 0x2000,
        expansionRomHex: 'expansion.bin',
      },
    });
    const context = createCommandContext();
    const setCartridgePresent = vi.fn();
    const setTms9918Active = vi.fn();
    const setTms9918VideoStandard = vi.fn();
    context.sessionState.ui.tec1gTms9918Active = true;
    context.sessionState.ui.tec1gTms9918VideoStandard = 'ntsc';
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
      setTms9918Active,
      setTms9918VideoStandard,
    } as Tec1gRuntime;
    const runtimeMemory = new Uint8Array(0x10000);
    const runtime = {
      hardware: {
        memory: runtimeMemory,
      },
    } as never;
    const assets = {
      expansionRomImage: {
        bootEntry: 0x3456,
        banks: [new Uint8Array([1]), new Uint8Array([2])],
        memory: new Uint8Array([1, 2, 3]),
      },
    };

    expect(provider.payload).toEqual({ id: 'tec1g' });
    expect(provider.tec1gConfig?.expansionRomHex).toBe('expansion.bin');
    expect(provider.resolveEntry(assets)).toBe(0x3456);
    expect(
      provider.resolveEntry({
        expansionRomImage: {
          bootEntry: null,
          banks: [new Uint8Array(0x4000), new Uint8Array([2])],
          memory: new Uint8Array(0x10000),
        },
      })
    ).toBe(0x2000);

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
    expect(setTms9918Active).toHaveBeenCalledWith(true);
    expect(setTms9918VideoStandard).toHaveBeenCalledWith('ntsc');
    expect(applyExpansionRomMemory).toHaveBeenCalledWith(['bank'], assets.expansionRomImage);
    expect(setCartridgePresent).toHaveBeenCalledWith(true);
  });
});
