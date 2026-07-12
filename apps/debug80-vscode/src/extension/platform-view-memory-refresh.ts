/**
 * @file Memory refresh helpers for the Debug80 platform webview.
 */

import type { PanelTab } from '../platforms/panel-html';
import type { MemoryViewState } from '../platforms/panel-memory';
import {
  refreshSnapshot,
  startAutoRefresh,
  stopAutoRefresh,
  type RefreshController,
  type SnapshotRequest,
} from '../platforms/panel-refresh';

export type MemoryRefreshSyncOptions = {
  visible: boolean;
  activeTab: PanelTab;
  refreshController: RefreshController;
  intervalMs: number;
  rehydrate: boolean;
};

/**
 * Builds the debug adapter snapshot request for the current panel memory views.
 */
export function buildMemorySnapshotPayload(memoryViews: MemoryViewState): SnapshotRequest {
  const { viewModes, viewAfter, viewAddress } = memoryViews;
  const views = Object.keys(viewModes).map((id) => ({
    id,
    view: viewModes[id] ?? 'hl',
    after: viewAfter[id] ?? 16,
    ...(viewModes[id] === 'absolute' && typeof viewAddress[id] === 'number'
      ? { address: viewAddress[id] }
      : {}),
  }));
  return { views };
}

/**
 * Keeps the memory snapshot timer aligned with webview visibility and active tab.
 */
export function syncMemoryRefresh(options: MemoryRefreshSyncOptions): void {
  const { visible, activeTab, refreshController, intervalMs, rehydrate } = options;
  if (!visible) {
    return;
  }
  if (activeTab !== 'memory') {
    stopAutoRefresh(refreshController.state);
    return;
  }
  startAutoRefresh(refreshController.state, intervalMs, () => {
    void refreshSnapshot(
      refreshController.state,
      refreshController.handlers,
      refreshController.snapshotPayload(),
      { allowErrors: false }
    );
  });
  if (rehydrate) {
    void refreshSnapshot(
      refreshController.state,
      refreshController.handlers,
      refreshController.snapshotPayload(),
      { allowErrors: true }
    );
  }
}

/**
 * Stops the memory snapshot timer for a platform.
 */
export function stopMemoryRefresh(refreshController: RefreshController): void {
  stopAutoRefresh(refreshController.state);
}
