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
import type { PanelTab } from '../../src/platforms/panel-html';

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
    const { postSnapshot, refreshController, sync, advance } = createMemoryRefreshHarness();

    sync({ rehydrate: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(postSnapshot).toHaveBeenCalledTimes(1);

    await advance();

    expect(postSnapshot).toHaveBeenCalledTimes(2);
    stopMemoryRefresh(refreshController);
  });

  it('stops refresh when the visible active tab is not memory', () => {
    const { refreshController, sync } = createMemoryRefreshHarness();

    sync();
    expect(refreshController.state.timer).not.toBeUndefined();

    sync({ activeTab: 'ui' });

    expect(refreshController.state.timer).toBeUndefined();
  });

  it('does not start refresh while the view is hidden', () => {
    const { postSnapshot, refreshController, sync } = createMemoryRefreshHarness();

    sync({ visible: false, rehydrate: true });

    expect(refreshController.state.timer).toBeUndefined();
    expect(postSnapshot).not.toHaveBeenCalled();
  });
});

type MemoryRefreshSyncOptions = {
  activeTab?: PanelTab;
  rehydrate?: boolean;
  visible?: boolean;
};

function createMemoryRefreshHarness(intervalMs = 50): ReturnType<
  typeof createRefreshTestController
> & {
  advance: () => Promise<void>;
  sync: (options?: MemoryRefreshSyncOptions) => void;
} {
  vi.useFakeTimers();
  const controller = createRefreshTestController();

  return {
    ...controller,
    advance: async () => {
      await vi.advanceTimersByTimeAsync(intervalMs);
    },
    sync: (options: MemoryRefreshSyncOptions = {}) => {
      syncMemoryRefresh({
        visible: options.visible ?? true,
        activeTab: options.activeTab ?? 'memory',
        refreshController: controller.refreshController,
        intervalMs,
        rehydrate: options.rehydrate ?? false,
      });
    },
  };
}
