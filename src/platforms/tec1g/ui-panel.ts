/**
 * @file TEC-1G platform UI panel controller.
 */

import * as vscode from 'vscode';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types';
import { Tec1gPanelTab, getTec1gHtml } from './ui-panel-html';
import { applyMemoryViews, createMemoryViewState } from './ui-panel-memory';
import { appendSerialText, clearSerialBuffer, createSerialBuffer } from './ui-panel-serial';
import {
  createRefreshController,
  refreshSnapshot,
  startAutoRefresh,
  stopAutoRefresh,
} from './ui-panel-refresh';

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
  let digits = Array.from({ length: 6 }, () => 0);
  let matrix = Array.from({ length: 8 }, () => 0);
  let glcd = Array.from({ length: 1024 }, () => 0);
  let glcdDdram = Array.from({ length: 64 }, () => 0x20);
  let glcdState = {
    displayOn: true,
    graphicsOn: true,
    cursorOn: false,
    cursorBlink: false,
    blinkVisible: true,
    ddramAddr: 0x80,
    ddramPhase: 0,
    textShift: 0,
    scroll: 0,
    reverseMask: 0,
  };
  let sysCtrlValue = 0x00;
  let speaker = false;
  let speedMode: Tec1gSpeedMode = 'fast';
  let lcd = Array.from({ length: 80 }, () => 0x20);
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
        digits = Array.from({ length: 6 }, () => 0);
        matrix = Array.from({ length: 8 }, () => 0);
        glcd = Array.from({ length: 1024 }, () => 0);
        glcdDdram = Array.from({ length: 64 }, () => 0x20);
        glcdState = {
          displayOn: true,
          graphicsOn: true,
          cursorOn: false,
          cursorBlink: false,
          blinkVisible: true,
          ddramAddr: 0x80,
          ddramPhase: 0,
          textShift: 0,
          scroll: 0,
          reverseMask: 0,
        };
        speaker = false;
        speedMode = 'slow';
        lcd = Array.from({ length: 80 }, () => 0x20);
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
      panel.webview.onDidReceiveMessage(
        async (msg: {
          type?: string;
          code?: number;
          mode?: Tec1gSpeedMode;
          text?: string;
          id?: string;
          tab?: string;
          views?: Array<{ id?: string; view?: string; after?: number; address?: number }>;
        }) => {
          if (msg.type === 'tab' && (msg.tab === 'ui' || msg.tab === 'memory')) {
            activeTab = msg.tab;
            if (panel?.visible === true && activeTab === 'memory') {
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
            return;
          }
          if (msg.type === 'refresh' && Array.isArray(msg.views)) {
            applyMemoryViews(memoryViews, msg.views);
            void refreshSnapshot(
              refreshController.state,
              refreshController.handlers,
              refreshController.snapshotPayload(),
              { allowErrors: true }
            );
            return;
          }
          if (msg.type === 'key' && typeof msg.code === 'number') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1gKey', { code: msg.code });
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'reset') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1gReset', {});
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'speed' && (msg.mode === 'slow' || msg.mode === 'fast')) {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1gSpeed', { mode: msg.mode });
              } catch {
                /* ignore */
              }
            }
          }
          if (msg.type === 'serialSend' && typeof msg.text === 'string') {
            const target = session ?? getFallbackSession();
            if (target?.type === 'z80') {
              try {
                await target.customRequest('debug80/tec1gSerialInput', { text: msg.text });
              } catch {
                /* ignore */
              }
            }
          }
        }
      );
    }
    if (targetSession !== undefined) {
      session = targetSession;
    }
    if (reveal) {
      panel.reveal(targetColumn, !focus);
    }
    panel.webview.html = getTec1gHtml(activeTab);
    update({
      digits,
      matrix,
      glcd,
      glcdDdram,
      glcdState,
      speaker: speaker ? 1 : 0,
      speedMode,
      sysCtrl: sysCtrlValue,
      lcd,
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
    digits = payload.digits.slice(0, 6);
    matrix = payload.matrix.slice(0, 8);
    glcd = payload.glcd.slice(0, 1024);
    if (typeof payload.sysCtrl === 'number') {
      sysCtrlValue = payload.sysCtrl & 0xff;
    }
    if (Array.isArray(payload.glcdDdram)) {
      glcdDdram = payload.glcdDdram.slice(0, 64);
      while (glcdDdram.length < 64) {
        glcdDdram.push(0x20);
      }
    }
    if (payload.glcdState && typeof payload.glcdState === 'object') {
      glcdState = {
        displayOn: payload.glcdState.displayOn ?? glcdState.displayOn,
        graphicsOn: payload.glcdState.graphicsOn ?? glcdState.graphicsOn,
        cursorOn: payload.glcdState.cursorOn ?? glcdState.cursorOn,
        cursorBlink: payload.glcdState.cursorBlink ?? glcdState.cursorBlink,
        blinkVisible: payload.glcdState.blinkVisible ?? glcdState.blinkVisible,
        ddramAddr: payload.glcdState.ddramAddr ?? glcdState.ddramAddr,
        ddramPhase: payload.glcdState.ddramPhase ?? glcdState.ddramPhase,
        textShift: payload.glcdState.textShift ?? glcdState.textShift,
        scroll: payload.glcdState.scroll ?? glcdState.scroll,
        reverseMask: payload.glcdState.reverseMask ?? glcdState.reverseMask,
      };
    }
    speaker = payload.speaker === 1;
    speedMode = payload.speedMode;
    lcd = payload.lcd.slice(0, 80);
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'update',
        digits,
        matrix,
        glcd,
        glcdDdram,
        glcdState,
        speaker,
        speedMode,
        sysCtrl: sysCtrlValue,
        lcd,
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
    digits = Array.from({ length: 6 }, () => 0);
    matrix = Array.from({ length: 8 }, () => 0);
    glcd = Array.from({ length: 1024 }, () => 0);
    speaker = false;
    lcd = Array.from({ length: 80 }, () => 0x20);
    clearSerialBuffer(serialBuffer);
    if (panel !== undefined) {
      void panel.webview.postMessage({
        type: 'update',
        digits,
        matrix,
        glcd,
        speaker: false,
        speedMode,
        lcd,
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
