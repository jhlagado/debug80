/**
 * @file TEC-1G platform UI panel controller.
 */

import * as vscode from 'vscode';
import { Tec1gUpdatePayload } from './types';
import { Tec1gPanelTab, getTec1gHtml } from './ui-panel-html';
import { createMemoryViewState } from './ui-panel-memory';
import { appendSerialText, clearSerialBuffer, createSerialBuffer } from './ui-panel-serial';
import {
  createRefreshController,
  refreshSnapshot,
  startAutoRefresh,
  stopAutoRefresh,
} from './ui-panel-refresh';
import { handleTec1gMessage, Tec1gMessage } from './ui-panel-messages';
import {
  applyTec1gUpdate,
  createTec1gUiState,
  resetTec1gUiState,
} from './ui-panel-state';

export interface Tec1gPanelController {
  open(
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn; tab?: Tec1gPanelTab }
  ): void;
  update(payload: Tec1gUpdatePayload): void;
  appendSerial(text: string): void;
  setUiVisibility(visibility: Record<string, boolean> | undefined, persist?: boolean): void;
  clear(): void;
  handleSessionTerminated(sessionId: string): void;
}

/**
 * Creates the TEC-1G panel controller.
 */
export function createTec1gPanelController(
  getTargetColumn: () => vscode.ViewColumn,
  getFallbackSession: () => vscode.DebugSession | undefined
): Tec1gPanelController {
  let panel: vscode.WebviewPanel | undefined;
  let session: vscode.DebugSession | undefined;
  const uiState = createTec1gUiState();
  const serialBuffer = createSerialBuffer();
  let activeTab: Tec1gPanelTab = 'ui';
  const memoryViews = createMemoryViewState();
  const autoRefreshMs = 150;
  let uiVisibilityOverride: Record<string, boolean> | undefined;

  const open = (
    targetSession?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn; tab?: Tec1gPanelTab }
  ): void => {
    const focus = options?.focus ?? false;
    const reveal = options?.reveal ?? true;
    const targetColumn = options?.column ?? getTargetColumn();
    if (options?.tab === 'ui' || options?.tab === 'memory') {
      activeTab = options.tab;
    }
    if (panel === undefined) {
      panel = vscode.window.createWebviewPanel(
        'debug80Tec1g',
        'Debug80 TEC-1G',
        targetColumn,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.onDidDispose(() => {
        stopAutoRefresh(refreshController.state);
        panel = undefined;
        session = undefined;
        resetTec1gUiState(uiState);
        activeTab = 'ui';
      });
      panel.onDidChangeViewState((event) => {
        if (!event.webviewPanel.visible) {
          stopAutoRefresh(refreshController.state);
          return;
        }
        if (activeTab === 'memory') {
          startAutoRefresh(refreshController.state, autoRefreshMs, () => {
            void refreshSnapshot(
              refreshController.state,
              refreshController.handlers,
              refreshController.snapshotPayload(),
              { allowErrors: false }
            );
          });
          void refreshSnapshot(
            refreshController.state,
            refreshController.handlers,
            refreshController.snapshotPayload(),
            { allowErrors: true }
          );
        }
      });
      panel.webview.onDidReceiveMessage(async (msg: Tec1gMessage) => {
        await handleTec1gMessage(msg, {
          getSession: () => session ?? getFallbackSession(),
          refreshController,
          autoRefreshMs,
          setActiveTab: (tab) => {
            activeTab = tab;
          },
          getActiveTab: () => activeTab,
          isPanelVisible: () => panel?.visible === true,
          memoryViews,
        });
      });
    }
    if (targetSession !== undefined) {
      session = targetSession;
    }
    if (reveal) {
      panel.reveal(targetColumn, !focus);
    }
    panel.webview.html = getTec1gHtml(activeTab);
    update({
      digits: uiState.digits,
      matrix: uiState.matrix,
      glcd: uiState.glcd,
      glcdDdram: uiState.glcdDdram,
      glcdState: uiState.glcdState,
      speaker: uiState.speaker ? 1 : 0,
      speedMode: uiState.speedMode,
      sysCtrl: uiState.sysCtrlValue,
      lcd: uiState.lcd,
    });
    if (uiVisibilityOverride) {
      void panel.webview.postMessage({
        type: 'uiVisibility',
        visibility: uiVisibilityOverride,
        persist: false,
      });
    }
    if (serialBuffer.text.length > 0) {
      void panel.webview.postMessage({ type: 'serialInit', text: serialBuffer.text });
    }
    void panel.webview.postMessage({ type: 'selectTab', tab: activeTab });
    if (activeTab === 'memory') {
      startAutoRefresh(refreshController.state, autoRefreshMs, () => {
        void refreshSnapshot(
          refreshController.state,
          refreshController.handlers,
          refreshController.snapshotPayload(),
          { allowErrors: false }
        );
      });
      void refreshSnapshot(
        refreshController.state,
        refreshController.handlers,
        refreshController.snapshotPayload(),
        { allowErrors: true }
      );
    } else {
      stopAutoRefresh(refreshController.state);
    }
  };


  /**
   * Snapshot payload posted to the webview.
   */
  interface SnapshotPayload {
    before: number;
    rowSize: number;
    views: Array<{
      id: string;
      view: string;
      address: number;
      start: number;
      bytes: number[];
      focus: number;
      after: number;
      symbol?: string | null;
      symbolOffset?: number | null;
    }>;
    symbols?: Array<{ name: string; address: number }>;
  }

  /**
   * Builds the snapshot payload for the memory view request.
   */
  function buildSnapshotPayload(): { views: Array<{ id: string; view: string; after: number; address?: number | undefined }> } {
    const views = Object.keys(memoryViews.viewModes).map((id) => ({
      id,
      view: memoryViews.viewModes[id] ?? 'hl',
      after: memoryViews.viewAfter[id] ?? 16,
      ...(memoryViews.viewModes[id] === 'absolute' && typeof memoryViews.viewAddress[id] === 'number'
        ? { address: memoryViews.viewAddress[id] }
        : {}),
    }));
    return { views };
  }

  const refreshHandlers = {
    postSnapshot: async (payload: { views: Array<{ id: string; view: string; after: number; address?: number | undefined }> }): Promise<void> => {
      if (panel === undefined) {
        throw new Error('Debug80: panel unavailable');
      }
      const target = session ?? getFallbackSession();
      if (!target || target.type !== 'z80') {
        throw new Error('Debug80: No active z80 session.');
      }
      const snapshot = (await target.customRequest('debug80/tec1gMemorySnapshot', {
        before: 16,
        rowSize: 16,
        views: payload.views,
      })) as unknown;
      if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object') {
        throw new Error('Debug80: Invalid snapshot payload.');
      }
      void panel.webview.postMessage({ type: 'snapshot', ...(snapshot as SnapshotPayload) });
    },
    onSnapshotPosted: () => undefined,
    /**
     * Handles snapshot refresh failures.
     */
    onSnapshotFailed: (allowErrors: boolean): void => {
      if (panel === undefined || !allowErrors) {
        return;
      }
      void panel.webview.postMessage({
        type: 'snapshotError',
        message: 'No active z80 session.',
      });
    },
  };
  const refreshController = createRefreshController(buildSnapshotPayload, refreshHandlers);

  const update = (payload: Tec1gUpdatePayload): void => {
    applyTec1gUpdate(uiState, payload);
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'update',
        digits: uiState.digits,
        matrix: uiState.matrix,
        glcd: uiState.glcd,
        glcdDdram: uiState.glcdDdram,
        glcdState: uiState.glcdState,
        speaker: uiState.speaker,
        speedMode: uiState.speedMode,
        sysCtrl: uiState.sysCtrlValue,
        lcd: uiState.lcd,
        speakerHz: payload.speakerHz,
      });
    }
  };

  const appendSerial = (text: string): void => {
    if (text.length === 0) {
      return;
    }
    appendSerialText(serialBuffer, text);
    if (panel !== undefined) {
      void panel.webview.postMessage({ type: 'serial', text });
    }
  };

  const setUiVisibility = (
    visibility: Record<string, boolean> | undefined,
    persist = false
  ): void => {
    if (!visibility) {
      return;
    }
    uiVisibilityOverride = { ...visibility };
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'uiVisibility',
        visibility: uiVisibilityOverride,
        persist,
      });
    }
  };

  const clear = (): void => {
    resetTec1gUiState(uiState);
    clearSerialBuffer(serialBuffer);
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'update',
        digits: uiState.digits,
        matrix: uiState.matrix,
        glcd: uiState.glcd,
        speaker: false,
        speedMode: uiState.speedMode,
        lcd: uiState.lcd,
      });
      void panel.webview.postMessage({ type: 'serialClear' });
    }
  };

  const handleSessionTerminated = (sessionId: string): void => {
    if (session?.id === sessionId) {
      session = undefined;
      stopAutoRefresh(refreshController.state);
      clear();
    }
  };

  return {
    open,
    update,
    appendSerial,
    setUiVisibility,
    clear,
    handleSessionTerminated,
  };

}
