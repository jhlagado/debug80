/**
 * @file Per-platform state bundle used by PlatformViewProvider.
 *
 * Collapses the duplicated tec1 / tec1g field sets into a single
 * generic container so that refresh, snapshot, clear, and render
 * operations can be written once.
 */

import type * as vscode from 'vscode';
import { type PanelTab } from '../platforms/panel-html';
import { type MemoryViewState } from '../platforms/panel-memory';
import {
  type RefreshController,
  type SnapshotRequest,
  startAutoRefresh,
  stopAutoRefresh,
  refreshSnapshot,
} from '../platforms/panel-refresh';
import { type SerialBuffer } from '../platforms/panel-serial';
import type {
  PlatformUiMessageContext,
} from './platform-view-manifest';
import type { PlatformViewMessage } from './platform-view-messages';

/**
 * Bundles one platform's worth of view state alongside the
 * functions that differ per platform (create/reset/clear,
 * build update messages, render HTML).
 */
export interface PlatformViewState<TUiState> {
  activeTab: PanelTab;
  uiState: TUiState;
  serialBuffer: SerialBuffer;
  memoryViews: MemoryViewState;
  refreshController: RefreshController;
  snapshotCommand: 'debug80/tec1MemorySnapshot' | 'debug80/tec1gMemorySnapshot';
  getHtml: (tab: PanelTab, webview: vscode.Webview, extensionUri: vscode.Uri) => string;
  applyUpdate: (state: TUiState, payload: unknown) => Record<string, unknown>;
  handleMessage: (
    message: PlatformViewMessage,
    context: PlatformUiMessageContext
  ) => Promise<void>;

  resetUiState: (state: TUiState) => void;
  clearSerialBuffer: (buffer: SerialBuffer) => void;
  createMemoryViewState: () => MemoryViewState;
  buildUpdateMessage: (state: TUiState, uiRevision: number) => Record<string, unknown>;
  buildClearMessage: (state: TUiState, uiRevision: number) => Record<string, unknown>;
}

/**
 * Stop auto-refresh for this platform.
 */
export function stopPlatformRefresh<TUiState>(ps: PlatformViewState<TUiState>): void {
  stopAutoRefresh(ps.refreshController.state);
}

/**
 * Synchronise the memory auto-refresh timer for a platform.
 */
export function syncPlatformMemoryRefresh(
  ps: PlatformViewState<unknown>,
  visible: boolean,
  rehydrate: boolean,
): void {
  if (!visible) {
    return;
  }
  if (ps.activeTab !== 'memory') {
    stopAutoRefresh(ps.refreshController.state);
    return;
  }
  startAutoRefresh(ps.refreshController.state, 150, () => {
    void refreshSnapshot(
      ps.refreshController.state,
      ps.refreshController.handlers,
      ps.refreshController.snapshotPayload(),
      { allowErrors: false },
    );
  });
  if (rehydrate) {
    void refreshSnapshot(
      ps.refreshController.state,
      ps.refreshController.handlers,
      ps.refreshController.snapshotPayload(),
      { allowErrors: true },
    );
  }
}

/**
 * Reset all mutable state for a platform (UI state, serial buffer, memory views).
 */
export function clearPlatformState<T>(ps: PlatformViewState<T>): void {
  ps.resetUiState(ps.uiState);
  ps.clearSerialBuffer(ps.serialBuffer);
  ps.memoryViews = ps.createMemoryViewState();
}

/**
 * Build the snapshot payload from memory view configuration.
 */
export function buildSnapshotPayload(memoryViews: MemoryViewState): SnapshotRequest {
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
