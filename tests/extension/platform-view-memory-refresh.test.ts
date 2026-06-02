/**
 * @file Platform view memory refresh helper tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryViewState } from '../../src/platforms/panel-memory';
import {
  buildMemorySnapshotPayload,
  stopMemoryRefresh,
  syncMemoryRefresh,
} from '../../src/extension/platform-view-memory-refresh';
import { createRefreshTestController } from '../platforms/panel-message-fixtures';

describe('platform-view-memory-refresh', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds snapshot payloads from the current memory view state', () => {
    const memoryViews = createMemoryViewState();
    memoryViews.viewModes.a = 'pc';
    memoryViews.viewAfter.a = 8;
    memoryViews.viewModes.b = 'absolute';
    memoryViews.viewAfter.b = 32;
    memoryViews.viewAddress.b = 0x1234;

    expect(buildMemorySnapshotPayload(memoryViews)).toEqual({
      views: [
        { id: 'a', view: 'pc', after: 8 },
        { id: 'b', view: 'absolute', after: 32, address: 0x1234 },
        { id: 'c', view: 'hl', after: 16 },
        { id: 'd', view: 'de', after: 16 },
      ],
    });
  });

  it('starts refresh and rehydrates when the visible active tab is memory', async () => {
    vi.useFakeTimers();
    const { postSnapshot, refreshController } = createRefreshTestController();

    syncMemoryRefresh({
      visible: true,
      activeTab: 'memory',
      refreshController,
      intervalMs: 50,
      rehydrate: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(postSnapshot).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);

    expect(postSnapshot).toHaveBeenCalledTimes(2);
    stopMemoryRefresh(refreshController);
  });

  it('stops refresh when the visible active tab is not memory', () => {
    vi.useFakeTimers();
    const { refreshController } = createRefreshTestController();

    syncMemoryRefresh({
      visible: true,
      activeTab: 'memory',
      refreshController,
      intervalMs: 50,
      rehydrate: false,
    });
    expect(refreshController.state.timer).not.toBeUndefined();

    syncMemoryRefresh({
      visible: true,
      activeTab: 'ui',
      refreshController,
      intervalMs: 50,
      rehydrate: false,
    });

    expect(refreshController.state.timer).toBeUndefined();
  });

  it('does not start refresh while the view is hidden', () => {
    vi.useFakeTimers();
    const { postSnapshot, refreshController } = createRefreshTestController();

    syncMemoryRefresh({
      visible: false,
      activeTab: 'memory',
      refreshController,
      intervalMs: 50,
      rehydrate: true,
    });

    expect(refreshController.state.timer).toBeUndefined();
    expect(postSnapshot).not.toHaveBeenCalled();
  });
});
