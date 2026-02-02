/**
 * @file WebviewViewProvider for the Debug80 sidebar platform view.
 */

import * as vscode from 'vscode';
import { Tec1PanelTab, getTec1Html } from '../platforms/tec1/ui-panel-html';
import {
  createMemoryViewState as createTec1MemoryViewState,
  MemoryViewState as Tec1MemoryViewState,
} from '../platforms/tec1/ui-panel-memory';
import { handleTec1Message, Tec1Message } from '../platforms/tec1/ui-panel-messages';
import {
  createRefreshController as createTec1RefreshController,
  refreshSnapshot as refreshTec1Snapshot,
  startAutoRefresh as startTec1AutoRefresh,
  stopAutoRefresh as stopTec1AutoRefresh,
} from '../platforms/tec1/ui-panel-refresh';
import {
  applyTec1Update,
  createTec1UiState,
  resetTec1UiState,
} from '../platforms/tec1/ui-panel-state';
import { appendSerialText, clearSerialBuffer, createSerialBuffer } from '../platforms/tec1/ui-panel-serial';
import type { Tec1UpdatePayload } from '../platforms/tec1/types';
import { Tec1gPanelTab, getTec1gHtml } from '../platforms/tec1g/ui-panel-html';
import {
  createMemoryViewState as createTec1gMemoryViewState,
  MemoryViewState as Tec1gMemoryViewState,
} from '../platforms/tec1g/ui-panel-memory';
import { handleTec1gMessage, Tec1gMessage } from '../platforms/tec1g/ui-panel-messages';
import {
  createRefreshController as createTec1gRefreshController,
  refreshSnapshot as refreshTec1gSnapshot,
  startAutoRefresh as startTec1gAutoRefresh,
  stopAutoRefresh as stopTec1gAutoRefresh,
} from '../platforms/tec1g/ui-panel-refresh';
import {
  applyTec1gUpdate,
  createTec1gUiState,
  resetTec1gUiState,
} from '../platforms/tec1g/ui-panel-state';
import { appendSerialText as appendTec1gSerialText, clearSerialBuffer as clearTec1gSerialBuffer, createSerialBuffer as createTec1gSerialBuffer } from '../platforms/tec1g/ui-panel-serial';
import type { Tec1gUpdatePayload } from '../platforms/tec1g/types';

type PlatformId = 'tec1' | 'tec1g' | 'simple';

export class PlatformViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug80.platformView';

  private view: vscode.WebviewView | undefined;
  private currentPlatform: PlatformId | undefined;
  private currentSession: vscode.DebugSession | undefined;
  private currentSessionId: string | undefined;

  private tec1ActiveTab: Tec1PanelTab = 'ui';
  private tec1UiState = createTec1UiState();
  private tec1SerialBuffer = createSerialBuffer();
  private tec1MemoryViews = createTec1MemoryViewState();
  private tec1RefreshController = createTec1RefreshController(
    () => this.buildSnapshotPayload(this.tec1MemoryViews),
    {
      postSnapshot: async (payload) => this.postTec1Snapshot(payload),
      onSnapshotPosted: () => undefined,
      onSnapshotFailed: (allowErrors) => this.onTec1SnapshotFailed(allowErrors),
    }
  );

  private tec1gActiveTab: Tec1gPanelTab = 'ui';
  private tec1gUiState = createTec1gUiState();
  private tec1gSerialBuffer = createTec1gSerialBuffer();
  private tec1gMemoryViews = createTec1gMemoryViewState();
  private tec1gUiVisibilityOverride: Record<string, boolean> | undefined;
  private tec1gRefreshController = createTec1gRefreshController(
    () => this.buildSnapshotPayload(this.tec1gMemoryViews),
    {
      postSnapshot: async (payload) => this.postTec1gSnapshot(payload),
      onSnapshotPosted: () => undefined,
      onSnapshotFailed: (allowErrors) => this.onTec1gSnapshotFailed(allowErrors),
    }
  );

  reveal(focus = false): void {
    void vscode.commands.executeCommand('workbench.view.extension.debug80').then(() => {
      if (this.view?.show) {
        this.view.show(!focus);
      }
    });
  }

  setPlatform(
    platform: PlatformId,
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; tab?: Tec1PanelTab | Tec1gPanelTab }
  ): void {
    this.currentPlatform = platform;
    if (session !== undefined) {
      this.currentSession = session;
      this.currentSessionId = session.id;
    }
    if (platform === 'tec1' && (options?.tab === 'ui' || options?.tab === 'memory')) {
      this.tec1ActiveTab = options.tab;
    }
    if (platform === 'tec1g' && (options?.tab === 'ui' || options?.tab === 'memory')) {
      this.tec1gActiveTab = options.tab;
    }
    if (options?.reveal !== false) {
      this.reveal(options?.focus ?? false);
    }
    this.renderCurrentView(true);
  }

  setTec1gUiVisibility(visibility: Record<string, boolean> | undefined, persist = false): void {
    if (!visibility) {
      return;
    }
    this.tec1gUiVisibilityOverride = { ...visibility };
    if (this.currentPlatform === 'tec1g') {
      this.postMessage({
        type: 'uiVisibility',
        visibility: this.tec1gUiVisibilityOverride,
        persist,
      });
    }
  }

  updateTec1(payload: Tec1UpdatePayload, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId)) {
      return;
    }
    applyTec1Update(this.tec1UiState, payload);
    if (this.currentPlatform !== 'tec1') {
      return;
    }
    this.postMessage({
      type: 'update',
      digits: this.tec1UiState.digits,
      matrix: this.tec1UiState.matrix,
      speaker: this.tec1UiState.speaker,
      speedMode: this.tec1UiState.speedMode,
      lcd: this.tec1UiState.lcd,
      speakerHz: payload.speakerHz,
    });
  }

  updateTec1g(payload: Tec1gUpdatePayload, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId)) {
      return;
    }
    applyTec1gUpdate(this.tec1gUiState, payload);
    if (this.currentPlatform !== 'tec1g') {
      return;
    }
    this.postMessage({
      type: 'update',
      digits: this.tec1gUiState.digits,
      matrix: this.tec1gUiState.matrix,
      glcd: this.tec1gUiState.glcd,
      glcdDdram: this.tec1gUiState.glcdDdram,
      glcdState: this.tec1gUiState.glcdState,
      speaker: this.tec1gUiState.speaker,
      speedMode: this.tec1gUiState.speedMode,
      sysCtrl: this.tec1gUiState.sysCtrlValue,
      bankA14: this.tec1gUiState.bankA14,
      capsLock: this.tec1gUiState.capsLock,
      lcdState: this.tec1gUiState.lcdState,
      lcdCgram: this.tec1gUiState.lcdCgram,
      lcd: this.tec1gUiState.lcd,
      speakerHz: payload.speakerHz,
    });
  }

  appendTec1Serial(text: string, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId)) {
      return;
    }
    if (text.length === 0) {
      return;
    }
    appendSerialText(this.tec1SerialBuffer, text);
    if (this.currentPlatform === 'tec1') {
      this.postMessage({ type: 'serial', text });
    }
  }

  appendTec1gSerial(text: string, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId)) {
      return;
    }
    if (text.length === 0) {
      return;
    }
    appendTec1gSerialText(this.tec1gSerialBuffer, text);
    if (this.currentPlatform === 'tec1g') {
      this.postMessage({ type: 'serial', text });
    }
  }

  clear(): void {
    resetTec1UiState(this.tec1UiState);
    clearSerialBuffer(this.tec1SerialBuffer);
    resetTec1gUiState(this.tec1gUiState);
    clearTec1gSerialBuffer(this.tec1gSerialBuffer);
    if (this.currentPlatform === 'tec1') {
      this.postMessage({
        type: 'update',
        digits: this.tec1UiState.digits,
        matrix: this.tec1UiState.matrix,
        speaker: false,
        speedMode: this.tec1UiState.speedMode,
        lcd: this.tec1UiState.lcd,
      });
      this.postMessage({ type: 'serialClear' });
    } else if (this.currentPlatform === 'tec1g') {
      this.postMessage({
        type: 'update',
        digits: this.tec1gUiState.digits,
        matrix: this.tec1gUiState.matrix,
        glcd: this.tec1gUiState.glcd,
        speaker: false,
        speedMode: this.tec1gUiState.speedMode,
        lcd: this.tec1gUiState.lcd,
      });
      this.postMessage({ type: 'serialClear' });
    }
  }

  handleSessionTerminated(sessionId: string): void {
    if (this.currentSessionId !== sessionId) {
      return;
    }
    this.currentSession = undefined;
    this.currentSessionId = undefined;
    stopTec1AutoRefresh(this.tec1RefreshController.state);
    stopTec1gAutoRefresh(this.tec1gRefreshController.state);
    this.clear();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (msg: Tec1Message | Tec1gMessage) => {
      if (this.currentPlatform === 'tec1') {
        await handleTec1Message(msg as Tec1Message, {
          getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
          refreshController: this.tec1RefreshController,
          autoRefreshMs: 150,
          setActiveTab: (tab) => {
            this.tec1ActiveTab = tab;
          },
          getActiveTab: () => this.tec1ActiveTab,
          isPanelVisible: () => this.view?.visible === true,
          memoryViews: this.tec1MemoryViews,
        });
      } else if (this.currentPlatform === 'tec1g') {
        await handleTec1gMessage(msg as Tec1gMessage, {
          getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
          refreshController: this.tec1gRefreshController,
          autoRefreshMs: 150,
          setActiveTab: (tab) => {
            this.tec1gActiveTab = tab;
          },
          getActiveTab: () => this.tec1gActiveTab,
          isPanelVisible: () => this.view?.visible === true,
          memoryViews: this.tec1gMemoryViews,
        });
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
      stopTec1AutoRefresh(this.tec1RefreshController.state);
      stopTec1gAutoRefresh(this.tec1gRefreshController.state);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.renderCurrentView(true);
        return;
      }
      stopTec1AutoRefresh(this.tec1RefreshController.state);
      stopTec1gAutoRefresh(this.tec1gRefreshController.state);
    });

    this.renderCurrentView(false);
  }

  private renderCurrentView(rehydrate: boolean): void {
    if (!this.view) {
      return;
    }
    if (this.currentPlatform === 'tec1') {
      this.view.webview.html = getTec1Html(this.tec1ActiveTab);
      this.postMessage({
        type: 'update',
        digits: this.tec1UiState.digits,
        matrix: this.tec1UiState.matrix,
        speaker: this.tec1UiState.speaker,
        speedMode: this.tec1UiState.speedMode,
        lcd: this.tec1UiState.lcd,
      });
      if (this.tec1SerialBuffer.text.length > 0) {
        this.postMessage({ type: 'serialInit', text: this.tec1SerialBuffer.text });
      }
      this.postMessage({ type: 'selectTab', tab: this.tec1ActiveTab });
      this.syncMemoryRefresh('tec1', rehydrate);
      return;
    }
    if (this.currentPlatform === 'tec1g') {
      this.view.webview.html = getTec1gHtml(this.tec1gActiveTab);
      this.postMessage({
        type: 'update',
        digits: this.tec1gUiState.digits,
        matrix: this.tec1gUiState.matrix,
        glcd: this.tec1gUiState.glcd,
        glcdDdram: this.tec1gUiState.glcdDdram,
        glcdState: this.tec1gUiState.glcdState,
        speaker: this.tec1gUiState.speaker,
        speedMode: this.tec1gUiState.speedMode,
        sysCtrl: this.tec1gUiState.sysCtrlValue,
        bankA14: this.tec1gUiState.bankA14,
        capsLock: this.tec1gUiState.capsLock,
        lcdState: this.tec1gUiState.lcdState,
        lcdCgram: this.tec1gUiState.lcdCgram,
        lcd: this.tec1gUiState.lcd,
      });
      if (this.tec1gUiVisibilityOverride) {
        this.postMessage({
          type: 'uiVisibility',
          visibility: this.tec1gUiVisibilityOverride,
          persist: false,
        });
      }
      if (this.tec1gSerialBuffer.text.length > 0) {
        this.postMessage({ type: 'serialInit', text: this.tec1gSerialBuffer.text });
      }
      this.postMessage({ type: 'selectTab', tab: this.tec1gActiveTab });
      this.syncMemoryRefresh('tec1g', rehydrate);
      return;
    }
    if (rehydrate || this.view.webview.html.length === 0) {
      this.view.webview.html = this.getPlaceholderHtml();
    }
  }

  private syncMemoryRefresh(platform: 'tec1' | 'tec1g', rehydrate: boolean): void {
    if (this.view?.visible !== true) {
      return;
    }
    if (platform === 'tec1') {
      if (this.tec1ActiveTab !== 'memory') {
        stopTec1AutoRefresh(this.tec1RefreshController.state);
        return;
      }
      startTec1AutoRefresh(this.tec1RefreshController.state, 150, () => {
        void refreshTec1Snapshot(
          this.tec1RefreshController.state,
          this.tec1RefreshController.handlers,
          this.tec1RefreshController.snapshotPayload(),
          { allowErrors: false }
        );
      });
      if (rehydrate) {
        void refreshTec1Snapshot(
          this.tec1RefreshController.state,
          this.tec1RefreshController.handlers,
          this.tec1RefreshController.snapshotPayload(),
          { allowErrors: true }
        );
      }
      return;
    }
    if (this.tec1gActiveTab !== 'memory') {
      stopTec1gAutoRefresh(this.tec1gRefreshController.state);
      return;
    }
    startTec1gAutoRefresh(this.tec1gRefreshController.state, 150, () => {
      void refreshTec1gSnapshot(
        this.tec1gRefreshController.state,
        this.tec1gRefreshController.handlers,
        this.tec1gRefreshController.snapshotPayload(),
        { allowErrors: false }
      );
    });
    if (rehydrate) {
      void refreshTec1gSnapshot(
        this.tec1gRefreshController.state,
        this.tec1gRefreshController.handlers,
        this.tec1gRefreshController.snapshotPayload(),
        { allowErrors: true }
      );
    }
  }

  private buildSnapshotPayload(memoryViews: Tec1MemoryViewState | Tec1gMemoryViewState): {
    views: Array<{ id: string; view: string; after: number; address?: number | undefined }>;
  } {
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

  private async postTec1Snapshot(payload: {
    views: Array<{ id: string; view: string; after: number; address?: number | undefined }>;
  }): Promise<void> {
    if (!this.view) {
      throw new Error('Debug80: view unavailable');
    }
    const target = this.currentSession ?? vscode.debug.activeDebugSession;
    if (!target || target.type !== 'z80') {
      throw new Error('Debug80: No active z80 session.');
    }
    const snapshot = (await target.customRequest('debug80/tec1MemorySnapshot', {
      before: 16,
      rowSize: 16,
      views: payload.views,
    })) as unknown;
    if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object') {
      throw new Error('Debug80: Invalid snapshot payload.');
    }
    const snapshotObject = snapshot as Record<string, unknown>;
    this.postMessage({ type: 'snapshot', ...snapshotObject });
  }

  private onTec1SnapshotFailed(allowErrors: boolean): void {
    if (!allowErrors || !this.view) {
      return;
    }
    this.postMessage({
      type: 'snapshotError',
      message: 'No active z80 session.',
    });
  }

  private async postTec1gSnapshot(payload: {
    views: Array<{ id: string; view: string; after: number; address?: number | undefined }>;
  }): Promise<void> {
    if (!this.view) {
      throw new Error('Debug80: view unavailable');
    }
    const target = this.currentSession ?? vscode.debug.activeDebugSession;
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
    const snapshotObject = snapshot as Record<string, unknown>;
    this.postMessage({ type: 'snapshot', ...snapshotObject });
  }

  private onTec1gSnapshotFailed(allowErrors: boolean): void {
    if (!allowErrors || !this.view) {
      return;
    }
    this.postMessage({
      type: 'snapshotError',
      message: 'No active z80 session.',
    });
  }

  private postMessage(payload: Record<string, unknown>): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage(payload);
  }

  private shouldAcceptSession(sessionId?: string): boolean {
    if (sessionId === undefined) {
      return true;
    }
    if (this.currentSessionId === undefined) {
      this.currentSessionId = sessionId;
      return true;
    }
    return this.currentSessionId === sessionId;
  }

  private getPlaceholderHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground);">
  <p>Debug80</p>
  <p style="opacity: 0.7;">Start a debug session to see the platform UI.</p>
</body>
</html>`;
  }
}
