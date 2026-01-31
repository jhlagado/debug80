/**
 * @file UI panel helper tests.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  applyMemoryViews as applyTec1MemoryViews,
  createMemoryViewState as createTec1MemoryViewState,
} from '../../src/platforms/tec1/ui-panel-memory';
import {
  appendSerialText as appendTec1SerialText,
  clearSerialBuffer as clearTec1SerialBuffer,
  createSerialBuffer as createTec1SerialBuffer,
} from '../../src/platforms/tec1/ui-panel-serial';
import {
  applyTec1Update,
  createTec1UiState,
  resetTec1UiState,
} from '../../src/platforms/tec1/ui-panel-state';
import {
  createRefreshState as createTec1RefreshState,
  refreshSnapshot as refreshTec1Snapshot,
} from '../../src/platforms/tec1/ui-panel-refresh';
import {
  applyMemoryViews as applyTec1gMemoryViews,
  createMemoryViewState as createTec1gMemoryViewState,
} from '../../src/platforms/tec1g/ui-panel-memory';
import {
  appendSerialText as appendTec1gSerialText,
  clearSerialBuffer as clearTec1gSerialBuffer,
  createSerialBuffer as createTec1gSerialBuffer,
} from '../../src/platforms/tec1g/ui-panel-serial';
import {
  applyTec1gUpdate,
  createTec1gUiState,
  resetTec1gUiState,
} from '../../src/platforms/tec1g/ui-panel-state';
import {
  createRefreshState as createTec1gRefreshState,
  refreshSnapshot as refreshTec1gSnapshot,
} from '../../src/platforms/tec1g/ui-panel-refresh';

describe('tec1 ui helpers', () => {
  it('clamps and applies memory view settings', () => {
    const state = createTec1MemoryViewState();
    applyTec1MemoryViews(state, [
      { id: 'a', view: 'sp', after: -5, address: 0x12345 },
      { id: 'x', view: 'pc', after: 32 },
    ]);
    expect(state.viewModes.a).toBe('sp');
    expect(state.viewAfter.a).toBe(16);
    expect(state.viewAddress.a).toBe(0x2345);
    expect(state.viewModes.x).toBeUndefined();
  });

  it('maintains bounded serial buffer', () => {
    const buffer = createTec1SerialBuffer(5);
    appendTec1SerialText(buffer, 'hello');
    appendTec1SerialText(buffer, 'world');
    expect(buffer.text).toBe('world');
    clearTec1SerialBuffer(buffer);
    expect(buffer.text).toBe('');
  });

  it('applies and resets ui state', () => {
    const state = createTec1UiState();
    applyTec1Update(state, {
      digits: [1, 2, 3, 4, 5, 6, 7],
      matrix: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      speaker: 1,
      speedMode: 'slow',
      lcd: Array.from({ length: 40 }, (_, index) => index),
    });
    expect(state.digits).toEqual([1, 2, 3, 4, 5, 6]);
    expect(state.matrix).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(state.speaker).toBe(true);
    expect(state.lcd.length).toBe(32);
    resetTec1UiState(state);
    expect(state.speedMode).toBe('slow');
    expect(state.speaker).toBe(false);
  });

  it('handles refresh snapshot success and failure', async () => {
    const state = createTec1RefreshState();
    const handlers = {
      postSnapshot: vi.fn(() => undefined),
      onSnapshotPosted: vi.fn(),
      onSnapshotFailed: vi.fn(),
    };
    await refreshTec1Snapshot(state, handlers, { views: [] }, { allowErrors: true });
    expect(handlers.postSnapshot).toHaveBeenCalledTimes(1);
    expect(handlers.onSnapshotPosted).toHaveBeenCalledTimes(1);

    handlers.postSnapshot.mockRejectedValueOnce(new Error('fail'));
    await refreshTec1Snapshot(state, handlers, { views: [] }, { allowErrors: true });
    expect(handlers.onSnapshotFailed).toHaveBeenCalledTimes(1);

    state.inFlight = true;
    await refreshTec1Snapshot(state, handlers, { views: [] }, { allowErrors: true });
    expect(handlers.postSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe('tec1g ui helpers', () => {
  it('clamps and applies memory view settings', () => {
    const state = createTec1gMemoryViewState();
    applyTec1gMemoryViews(state, [
      { id: 'b', view: 'hl', after: 2048, address: 0x1 },
    ]);
    expect(state.viewModes.b).toBe('hl');
    expect(state.viewAfter.b).toBe(1024);
    expect(state.viewAddress.b).toBe(0x1);
  });

  it('maintains bounded serial buffer', () => {
    const buffer = createTec1gSerialBuffer(4);
    appendTec1gSerialText(buffer, 'abcd');
    appendTec1gSerialText(buffer, 'ef');
    expect(buffer.text).toBe('cdef');
    clearTec1gSerialBuffer(buffer);
    expect(buffer.text).toBe('');
  });

  it('applies and resets ui state', () => {
    const state = createTec1gUiState();
    applyTec1gUpdate(state, {
      digits: [9, 8, 7, 6, 5, 4, 3],
      matrix: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      glcd: [1, 2, 3],
      glcdDdram: [0x41],
      glcdState: { displayOn: false, textShift: 2 },
      speaker: 1,
      speedMode: 'slow',
      sysCtrl: 0x1ff,
      lcd: Array.from({ length: 100 }, (_, index) => index),
    });
    expect(state.digits).toEqual([9, 8, 7, 6, 5, 4]);
    expect(state.matrix).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(state.glcd).toEqual([1, 2, 3]);
    expect(state.glcdDdram.length).toBe(64);
    expect(state.glcdDdram[0]).toBe(0x41);
    expect(state.glcdDdram[1]).toBe(0x20);
    expect(state.glcdState.displayOn).toBe(false);
    expect(state.glcdState.textShift).toBe(2);
    expect(state.sysCtrlValue).toBe(0xff);
    expect(state.lcd.length).toBe(80);
    resetTec1gUiState(state);
    expect(state.speedMode).toBe('slow');
    expect(state.sysCtrlValue).toBe(0x00);
  });

  it('handles refresh snapshot success and failure', async () => {
    const state = createTec1gRefreshState();
    const handlers = {
      postSnapshot: vi.fn(() => undefined),
      onSnapshotPosted: vi.fn(),
      onSnapshotFailed: vi.fn(),
    };
    await refreshTec1gSnapshot(state, handlers, { views: [] }, { allowErrors: true });
    expect(handlers.postSnapshot).toHaveBeenCalledTimes(1);
    expect(handlers.onSnapshotPosted).toHaveBeenCalledTimes(1);

    handlers.postSnapshot.mockRejectedValueOnce(new Error('fail'));
    await refreshTec1gSnapshot(state, handlers, { views: [] }, { allowErrors: true });
    expect(handlers.onSnapshotFailed).toHaveBeenCalledTimes(1);

    state.inFlight = true;
    await refreshTec1gSnapshot(state, handlers, { views: [] }, { allowErrors: true });
    expect(handlers.postSnapshot).toHaveBeenCalledTimes(2);
  });
});
