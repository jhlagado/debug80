/**
 * @file WebviewViewProvider for the Debug80 sidebar platform view.
 */

import * as vscode from 'vscode';
import { getTec1Html } from '../platforms/tec1/ui-panel-html';
import {
  createMemoryViewState as createTec1MemoryViewState,
} from '../platforms/tec1/ui-panel-memory';
import { handleTec1Message } from '../platforms/tec1/ui-panel-messages';
import {
  createRefreshController,
} from '../platforms/panel-refresh';
import {
  type Tec1UiState,
  applyTec1Update,
  createTec1UiState,
  resetTec1UiState,
} from '../platforms/tec1/ui-panel-state';
import { appendSerialText, clearSerialBuffer, createSerialBuffer } from '../platforms/panel-serial';
import type { Tec1UpdatePayload } from '../platforms/tec1/types';
import { getTec1gHtml } from '../platforms/tec1g/ui-panel-html';
import {
  createMemoryViewState as createTec1gMemoryViewState,
} from '../platforms/tec1g/ui-panel-memory';
import { handleTec1gMessage } from '../platforms/tec1g/ui-panel-messages';
import {
  type Tec1gUiState,
  applyTec1gUpdate,
  createTec1gUiState,
  resetTec1gUiState,
} from '../platforms/tec1g/ui-panel-state';
import type { Tec1gUpdatePayload } from '../platforms/tec1g/types';
import type { PanelTab } from '../platforms/panel-html';
import {
  handlePlatformViewMessage,
  type PlatformViewMessage,
  type PlatformViewPlatform,
} from './platform-view-messages';
import {
  handlePlatformSerialSave,
  handlePlatformSerialSendFile,
} from './platform-view-serial-actions';
import { getPlatformViewIdleHtml } from './platform-view-idle-html';
import {
  type PlatformViewState,
  buildSnapshotPayload,
  clearPlatformState,
  stopPlatformRefresh,
  syncPlatformMemoryRefresh,
} from './platform-view-state';

export class PlatformViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug80.platformView';

  private view: vscode.WebviewView | undefined;
  private currentPlatform: PlatformViewPlatform | undefined;
  private currentSession: vscode.DebugSession | undefined;
  private currentSessionId: string | undefined;
  private uiRevision = 0;
  private selectedWorkspace: vscode.WorkspaceFolder | undefined;
  private hasProject = false;
  private readonly extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  private tec1 = this.initTec1Platform();
  private tec1g = this.initTec1gPlatform();
  private tec1gUiVisibilityOverride: Record<string, boolean> | undefined;

  private platformStateFor(
    platform: PlatformViewPlatform | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): PlatformViewState<any> | undefined {
    if (platform === 'tec1') {return this.tec1;}
    if (platform === 'tec1g') {return this.tec1g;}
    return undefined;
  }

  private initTec1Platform(): PlatformViewState<Tec1UiState> {
    const ps: PlatformViewState<Tec1UiState> = {
      activeTab: 'ui',
      uiState: createTec1UiState(),
      serialBuffer: createSerialBuffer(),
      memoryViews: createTec1MemoryViewState(),
      snapshotCommand: 'debug80/tec1MemorySnapshot',
      resetUiState: resetTec1UiState,
      clearSerialBuffer: clearSerialBuffer,
      createMemoryViewState: createTec1MemoryViewState,
      buildUpdateMessage: (state, uiRevision) => ({
        type: 'update',
        uiRevision,
        digits: state.digits,
        matrix: state.matrix,
        speaker: state.speaker,
        speedMode: state.speedMode,
        lcd: state.lcd,
      }),
      buildClearMessage: (state, uiRevision) => ({
        type: 'update',
        uiRevision,
        digits: state.digits,
        matrix: state.matrix,
        speaker: false,
        speedMode: state.speedMode,
        lcd: state.lcd,
      }),
      refreshController: undefined!,
    };
    ps.refreshController = createRefreshController(
      () => buildSnapshotPayload(ps.memoryViews),
      {
        postSnapshot: async (payload) => this.postSnapshot(ps.snapshotCommand, payload),
        onSnapshotPosted: () => undefined,
        onSnapshotFailed: (allowErrors) => this.onSnapshotFailed(allowErrors),
      },
    );
    return ps;
  }

  private initTec1gPlatform(): PlatformViewState<Tec1gUiState> {
    const ps: PlatformViewState<Tec1gUiState> = {
      activeTab: 'ui',
      uiState: createTec1gUiState(),
      serialBuffer: createSerialBuffer(),
      memoryViews: createTec1gMemoryViewState(),
      snapshotCommand: 'debug80/tec1gMemorySnapshot',
      resetUiState: resetTec1gUiState,
      clearSerialBuffer: clearSerialBuffer,
      createMemoryViewState: createTec1gMemoryViewState,
      buildUpdateMessage: (state, uiRevision) => ({
        type: 'update',
        uiRevision,
        digits: state.digits,
        matrix: state.matrix,
        glcd: state.glcd,
        glcdDdram: state.glcdDdram,
        glcdState: state.glcdState,
        speaker: state.speaker,
        speedMode: state.speedMode,
        sysCtrl: state.sysCtrlValue,
        bankA14: state.bankA14,
        capsLock: state.capsLock,
        lcdState: state.lcdState,
        lcdCgram: state.lcdCgram,
        lcd: state.lcd,
      }),
      buildClearMessage: (state, uiRevision) => ({
        type: 'update',
        uiRevision,
        digits: state.digits,
        matrix: state.matrix,
        glcd: state.glcd,
        speaker: false,
        speedMode: state.speedMode,
        lcd: state.lcd,
      }),
      refreshController: undefined!,
    };
    ps.refreshController = createRefreshController(
      () => buildSnapshotPayload(ps.memoryViews),
      {
        postSnapshot: async (payload) => this.postSnapshot(ps.snapshotCommand, payload),
        onSnapshotPosted: () => undefined,
        onSnapshotFailed: (allowErrors) => this.onSnapshotFailed(allowErrors),
      },
    );
    return ps;
  }

  reveal(focus = false): void {
    void vscode.commands.executeCommand('workbench.view.extension.debug80').then(() => {
      if (this.view?.show) {
        this.view.show(!focus);
      }
    });
  }

  setSelectedWorkspace(folder: vscode.WorkspaceFolder | undefined): void {
    this.selectedWorkspace = folder;
    if (!this.currentPlatform) {
      this.renderCurrentView(true);
    }
  }

  setHasProject(value: boolean): void {
    this.hasProject = value;
    if (!this.currentPlatform) {
      this.renderCurrentView(true);
    }
  }

  setPlatform(
    platform: PlatformViewPlatform,
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; tab?: PanelTab }
  ): void {
    this.currentPlatform = platform;
    if (session !== undefined) {
      this.currentSession = session;
      this.currentSessionId = session.id;
    }
    const ps = this.platformStateFor(platform);
    if (ps && (options?.tab === 'ui' || options?.tab === 'memory')) {
      ps.activeTab = options.tab;
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
    applyTec1Update(this.tec1.uiState, payload);
    if (this.currentPlatform !== 'tec1') {
      return;
    }
    this.postMessage({
      type: 'update',
      uiRevision: this.nextUiRevision(),
      digits: this.tec1.uiState.digits,
      matrix: this.tec1.uiState.matrix,
      speaker: this.tec1.uiState.speaker,
      speedMode: this.tec1.uiState.speedMode,
      lcd: this.tec1.uiState.lcd,
      speakerHz: payload.speakerHz,
    });
  }

  updateTec1g(payload: Tec1gUpdatePayload, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId)) {
      return;
    }
    applyTec1gUpdate(this.tec1g.uiState, payload);
    if (this.currentPlatform !== 'tec1g') {
      return;
    }
    this.postMessage({
      type: 'update',
      uiRevision: this.nextUiRevision(),
      digits: this.tec1g.uiState.digits,
      matrix: this.tec1g.uiState.matrix,
      glcd: this.tec1g.uiState.glcd,
      glcdDdram: this.tec1g.uiState.glcdDdram,
      glcdState: this.tec1g.uiState.glcdState,
      speaker: this.tec1g.uiState.speaker,
      speedMode: this.tec1g.uiState.speedMode,
      sysCtrl: this.tec1g.uiState.sysCtrlValue,
      bankA14: this.tec1g.uiState.bankA14,
      capsLock: this.tec1g.uiState.capsLock,
      lcdState: this.tec1g.uiState.lcdState,
      lcdCgram: this.tec1g.uiState.lcdCgram,
      lcd: this.tec1g.uiState.lcd,
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
    appendSerialText(this.tec1.serialBuffer, text);
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
    appendSerialText(this.tec1g.serialBuffer, text);
    if (this.currentPlatform === 'tec1g') {
      this.postMessage({ type: 'serial', text });
    }
  }

  clear(): void {
    clearPlatformState(this.tec1);
    clearPlatformState(this.tec1g);
    const ps = this.platformStateFor(this.currentPlatform);
    if (ps) {
      this.postMessage(ps.buildClearMessage(ps.uiState, this.nextUiRevision()));
      this.postMessage({ type: 'serialClear' });
    }
  }

  handleSessionTerminated(sessionId: string): void {
    if (this.currentSessionId !== sessionId) {
      return;
    }
    this.currentSession = undefined;
    this.currentSessionId = undefined;
    stopPlatformRefresh(this.tec1);
    stopPlatformRefresh(this.tec1g);
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
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')],
    };

    webviewView.webview.onDidReceiveMessage((msg: PlatformViewMessage) => {
      void handlePlatformViewMessage(msg, {
        currentPlatform: () => this.currentPlatform,
        handleStartDebug: () => vscode.commands.executeCommand('workbench.action.debug.start'),
        handleSerialSendFile: () =>
          handlePlatformSerialSendFile({
            getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
            getPlatform: () => this.currentPlatform,
          }),
        handleSerialSave: (text) => handlePlatformSerialSave(text),
        clearSerialBuffer: (platform) => {
          const ps = this.platformStateFor(platform);
          if (ps) {clearSerialBuffer(ps.serialBuffer);}
        },
        handleTec1Message: async (message) =>
          handleTec1Message(message, {
            getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
            refreshController: this.tec1.refreshController,
            autoRefreshMs: 150,
            setActiveTab: (tab) => {
              this.tec1.activeTab = tab;
            },
            getActiveTab: () => this.tec1.activeTab,
            isPanelVisible: () => this.view?.visible === true,
            memoryViews: this.tec1.memoryViews,
          }),
        handleTec1gMessage: async (message) =>
          handleTec1gMessage(message, {
            getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
            refreshController: this.tec1g.refreshController,
            autoRefreshMs: 150,
            setActiveTab: (tab) => {
              this.tec1g.activeTab = tab;
            },
            getActiveTab: () => this.tec1g.activeTab,
            isPanelVisible: () => this.view?.visible === true,
            memoryViews: this.tec1g.memoryViews,
          }),
      });
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
      stopPlatformRefresh(this.tec1);
      stopPlatformRefresh(this.tec1g);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.renderCurrentView(true);
        return;
      }
      stopPlatformRefresh(this.tec1);
      stopPlatformRefresh(this.tec1g);
    });

    this.renderCurrentView(false);
  }

  private renderCurrentView(rehydrate: boolean): void {
    if (!this.view) {
      return;
    }
    const ps = this.platformStateFor(this.currentPlatform);
    if (ps) {
      this.view.webview.html =
        this.currentPlatform === 'tec1'
          ? getTec1Html(ps.activeTab, this.view.webview, this.extensionUri)
          : getTec1gHtml(ps.activeTab, this.view.webview, this.extensionUri);
      this.postMessage(ps.buildUpdateMessage(ps.uiState, this.nextUiRevision()));
      if (this.currentPlatform === 'tec1g' && this.tec1gUiVisibilityOverride) {
        this.postMessage({
          type: 'uiVisibility',
          visibility: this.tec1gUiVisibilityOverride,
          persist: false,
        });
      }
      if (ps.serialBuffer.text.length > 0) {
        this.postMessage({ type: 'serialInit', text: ps.serialBuffer.text });
      }
      this.postMessage({ type: 'selectTab', tab: ps.activeTab });
      syncPlatformMemoryRefresh(ps, this.view.visible, rehydrate);
      return;
    }
    if (rehydrate || this.view.webview.html.length === 0) {
      const idleHtmlOptions = {
        hasProject: this.hasProject,
        multiRoot: (vscode.workspace.workspaceFolders ?? []).length > 1,
        ...(this.selectedWorkspace?.name !== undefined
          ? { selectedWorkspaceName: this.selectedWorkspace.name }
          : {}),
      };
      this.view.webview.html = getPlatformViewIdleHtml(idleHtmlOptions);
    }
  }

  private onSnapshotFailed(allowErrors: boolean): void {
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
      return true;
    }
    return this.currentSessionId === sessionId;
  }

  private nextUiRevision(): number {
    this.uiRevision += 1;
    return this.uiRevision;
  }

  private async postSnapshot(
    command: 'debug80/tec1MemorySnapshot' | 'debug80/tec1gMemorySnapshot',
    payload: { views: Array<{ id: string; view: string; after: number; address?: number | undefined }> }
  ): Promise<void> {
    if (!this.view) {
      throw new Error('Debug80: view unavailable');
    }
    const target = this.currentSession ?? vscode.debug.activeDebugSession;
    if (!target || target.type !== 'z80') {
      throw new Error('Debug80: No active z80 session.');
    }
    const snapshot = (await target.customRequest(command, {
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

}
