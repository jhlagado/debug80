/**
 * @file Platform view runtime state helper tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { createMemoryViewState } from '../../src/platforms/panel-memory';
import type { PlatformUiModules } from '../../src/extension/platform-view-manifest';
import {
  applyPlatformRuntimeUpdate,
  buildPlatformRuntimeClearMessage,
  buildPlatformRuntimeUpdateMessage,
  clearPlatformRuntimeState,
  type PlatformRuntimeState,
} from '../../src/extension/platform-view-runtime-state';
import {
  appendPlatformSerial,
  buildSerialInitMessage,
  createSerialBuffer,
} from '../../src/extension/platform-view-serial-state';

describe('platform-view-runtime-state', () => {
  it('applies adapter updates and marks runtime state as posted', () => {
    const modules = createModules();
    const state = createState();

    expect(applyPlatformRuntimeUpdate(modules, state, { digits: [1, 2, 3] }, 7)).toEqual({
      type: 'update',
      uiRevision: 7,
      display: 'updated',
    });
    expect(modules.applyUpdate).toHaveBeenCalledWith(state.uiState, { digits: [1, 2, 3] });
    expect(state.hasPostedRuntimeUpdate).toBe(true);
  });

  it('builds render-time update messages without mutating posted state', () => {
    const modules = createModules();
    const state = createState();

    expect(buildPlatformRuntimeUpdateMessage(modules, state, 3)).toEqual({
      type: 'update',
      uiRevision: 3,
      display: 'rendered',
    });
    expect(state.hasPostedRuntimeUpdate).toBe(false);
  });

  it('clears platform runtime state', () => {
    const modules = createModules();
    const state = createState();
    state.hasPostedRuntimeUpdate = true;
    state.memoryViews.viewModes.a = 'absolute';
    appendPlatformSerial(state.serialBuffer, 'hello', {
      platform: 'tec1',
      currentPlatform: 'tec1',
    });

    clearPlatformRuntimeState(modules, state);

    expect(modules.resetUiState).toHaveBeenCalledWith(state.uiState);
    expect(state.hasPostedRuntimeUpdate).toBe(false);
    expect(state.memoryViews.viewModes.a).toBe('pc');
    expect(buildSerialInitMessage(state.serialBuffer)).toBeUndefined();
  });

  it('builds clear messages from the current UI state', () => {
    const modules = createModules();
    const state = createState();

    expect(buildPlatformRuntimeClearMessage(modules, state, 12)).toEqual({
      type: 'clear',
      uiRevision: 12,
    });
    expect(modules.buildClearMessage).toHaveBeenCalledWith(state.uiState, 12);
  });
});

function createState(): PlatformRuntimeState {
  return {
    uiState: { display: 'initial' },
    hasPostedRuntimeUpdate: false,
    serialBuffer: createSerialBuffer(),
    memoryViews: createMemoryViewState(),
  };
}

function createModules(): PlatformUiModules {
  return {
    createUiState: vi.fn(() => ({ display: 'initial' })),
    resetUiState: vi.fn(),
    applyUpdate: vi.fn(() => ({ display: 'updated' })),
    createMemoryViewState,
    getHtml: vi.fn(),
    handleMessage: vi.fn(),
    buildUpdateMessage: vi.fn((_state, uiRevision) => ({
      type: 'update',
      uiRevision,
      display: 'rendered',
    })),
    buildClearMessage: vi.fn((_state, uiRevision) => ({ type: 'clear', uiRevision })),
    snapshotCommand: 'debug80/memorySnapshot',
  };
}
