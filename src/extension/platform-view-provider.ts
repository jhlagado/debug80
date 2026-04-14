/**
 * @file WebviewViewProvider for the Debug80 sidebar platform view.
 */

import * as vscode from 'vscode';
import type { DebugSessionStatus } from '../debug/session-status';
import { Tec1PanelTab, getTec1Html } from '../platforms/tec1/ui-panel-html';
import { createMemoryViewState as createTec1MemoryViewState } from '../platforms/tec1/ui-panel-memory';
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
import {
  serializeTec1ClearFromUiState,
  serializeTec1UpdateFromUiState,
} from '../platforms/tec1/serialize-update-payload';
import { Tec1gPanelTab, getTec1gHtml } from '../platforms/tec1g/ui-panel-html';
import { createMemoryViewState as createTec1gMemoryViewState } from '../platforms/tec1g/ui-panel-memory';
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
import {
  serializeTec1gClearPanelUpdateFromUiState,
  serializeTec1gUpdateFromUiState,
} from '../platforms/tec1g/serialize-ui-update-payload';
import { listProjectTargetChoices } from './project-target-selection';
import { resolveProjectStatusSummary } from './project-status';
import { findProjectConfigPath } from './project-config';
import { handlePlatformViewMessage } from './platform-view-messages';
import {
  handlePlatformSerialSave,
  handlePlatformSerialSendFile,
} from './platform-view-serial-actions';
import type {
  PlatformId,
  PlatformViewInboundMessage,
  ProjectStatusPayload,
} from '../contracts/platform-view';

export class PlatformViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug80.platformView';

  private view: vscode.WebviewView | undefined;
  private currentPlatform: PlatformId | undefined;
  private currentSession: vscode.DebugSession | undefined;
  private currentSessionId: string | undefined;
  private uiRevision = 0;
  private selectedWorkspace: vscode.WorkspaceFolder | undefined;
  private hasProject = false;
  private readonly workspaceState: vscode.Memento | undefined;
  private readonly extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri, workspaceState?: vscode.Memento) {
    this.extensionUri = extensionUri;
    this.workspaceState = workspaceState;
  }

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
  private sessionStatus: DebugSessionStatus = 'not running';
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

  setSelectedWorkspace(folder: vscode.WorkspaceFolder | undefined): void {
    this.selectedWorkspace = folder;
    this.refreshProjectStatus();
  }

  setHasProject(value: boolean): void {
    this.hasProject = value;
    this.refreshProjectStatus();
  }

  refreshIdleView(): void {
    this.refreshProjectStatus();
  }

  refreshProjectStatus(): void {
    if (!this.currentPlatform) {
      this.renderCurrentView(true);
      return;
    }
    this.postProjectStatus();
  }

  setPlatform(
    platform: PlatformId,
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; tab?: Tec1PanelTab   }
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

  setSessionStatus(status: DebugSessionStatus): void {
    this.sessionStatus = status;
    if (!this.currentPlatform) {
      return;
    }
    this.postMessage({ type: 'sessionStatus', status });
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
      uiRevision: this.nextUiRevision(),
      ...serializeTec1UpdateFromUiState(this.tec1UiState, payload.speakerHz),
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
      uiRevision: this.nextUiRevision(),
      ...serializeTec1gUpdateFromUiState(this.tec1gUiState, payload.speakerHz),
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
    this.tec1MemoryViews = createTec1MemoryViewState();
    resetTec1gUiState(this.tec1gUiState);
    clearTec1gSerialBuffer(this.tec1gSerialBuffer);
    this.tec1gMemoryViews = createTec1gMemoryViewState();
    if (this.currentPlatform === 'tec1') {
      this.postMessage({
        type: 'update',
        uiRevision: this.nextUiRevision(),
        ...serializeTec1ClearFromUiState(this.tec1UiState),
      });
      this.postMessage({ type: 'serialClear' });
    } else if (this.currentPlatform === 'tec1g') {
      this.postMessage({
        type: 'update',
        uiRevision: this.nextUiRevision(),
        ...serializeTec1gClearPanelUpdateFromUiState(this.tec1gUiState),
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
    this.setSessionStatus('not running');
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
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')],
    };

    webviewView.webview.onDidReceiveMessage(async (msg: PlatformViewInboundMessage) => {
      await handlePlatformViewMessage(msg, {
        handleCreateProject: async (args) => {
          await vscode.commands.executeCommand('debug80.createProject', args);
        },
        handleOpenWorkspaceFolder: async () => {
          await vscode.commands.executeCommand('vscode.openFolder');
        },
        handleSelectProject: async (args) => {
          await vscode.commands.executeCommand('debug80.selectWorkspaceFolder', args);
        },
        handleConfigureProject: async () => {
          await vscode.commands.executeCommand('debug80.openProjectConfigPanel');
        },
        handleSelectTarget: async (args) => {
          await vscode.commands.executeCommand('debug80.selectTarget', args);
        },
        handleRestartDebug: async () => {
          await vscode.commands.executeCommand('debug80.restartDebug');
        },
        handleSetEntrySource: async () => {
          await vscode.commands.executeCommand('debug80.setEntrySource');
        },
        currentPlatform: () => this.currentPlatform,
        handleStartDebug: async (args) => {
          await vscode.commands.executeCommand('debug80.startDebug', args);
        },
        handleSerialSendFile: async () => {
          await handlePlatformSerialSendFile({
            getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
            getPlatform: () => this.currentPlatform,
          });
        },
        handleSerialSave: async (text) => {
          await handlePlatformSerialSave(text);
        },
        clearSerialBuffer: (platform) => {
          if (platform === 'tec1') {
            clearSerialBuffer(this.tec1SerialBuffer);
          } else if (platform === 'tec1g') {
            clearTec1gSerialBuffer(this.tec1gSerialBuffer);
          }
        },
        handlePlatformMessage: async (platform, platformMsg) => {
          if (platform === 'tec1') {
            await handleTec1Message(platformMsg as Tec1Message, {
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
            return;
          }
          await handleTec1gMessage(platformMsg as Tec1gMessage, {
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
        },
      });
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
      this.view.webview.html = getTec1Html(this.tec1ActiveTab, this.view.webview, this.extensionUri);
      this.postProjectStatus();
      this.postSessionStatus();
      this.postMessage({
        type: 'update',
        uiRevision: this.nextUiRevision(),
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
      this.view.webview.html = getTec1gHtml(this.tec1gActiveTab, this.view.webview, this.extensionUri);
      this.postProjectStatus();
      this.postSessionStatus();
      this.postMessage({
        type: 'update',
        uiRevision: this.nextUiRevision(),
        digits: this.tec1gUiState.digits,
        matrix: this.tec1gUiState.matrix,
        matrixGreen: this.tec1gUiState.matrixGreen,
        matrixBlue: this.tec1gUiState.matrixBlue,
        glcd: this.tec1gUiState.glcd,
        glcdDdram: this.tec1gUiState.glcdDdram,
        glcdState: this.tec1gUiState.glcdState,
        speaker: this.tec1gUiState.speaker,
        matrixBrightness: this.tec1gUiState.matrixBrightness,
        matrixBrightnessG: this.tec1gUiState.matrixBrightnessG,
        matrixBrightnessB: this.tec1gUiState.matrixBrightnessB,
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
      this.view.webview.html = getTec1gHtml(this.tec1gActiveTab, this.view.webview, this.extensionUri);
      this.postProjectStatus();
      this.postSessionStatus();
    }
  }

  private postProjectStatus(): void {
    if (!this.view) {
      return;
    }
    this.postMessage({ type: 'projectStatus', ...this.getProjectStatusPayload() });
  }

  private postSessionStatus(): void {
    if (!this.view || !this.currentPlatform) {
      return;
    }
    this.postMessage({ type: 'sessionStatus', status: this.sessionStatus });
  }

  private getProjectStatusPayload(): ProjectStatusPayload {
    const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      name: folder.name,
      path: folder.uri.fsPath,
      hasProject: this.selectedWorkspace?.uri.fsPath === folder.uri.fsPath
        ? this.hasProject
        : findProjectConfigPath(folder) !== undefined,
    }));
    const folder = this.selectedWorkspace;
    if (folder === undefined) {
      return {
        roots,
        targets: [],
      };
    }

    const projectConfigPath = findProjectConfigPath(folder);
    const projectStatus =
      this.workspaceState !== undefined
        ? resolveProjectStatusSummary(this.workspaceState, folder)
        : undefined;
    if (projectStatus === undefined || projectConfigPath === undefined) {
      return {
        roots,
        targets: [],
        rootName: folder.name,
        rootPath: folder.uri.fsPath,
        hasProject: false,
      };
    }

    return {
      roots,
      targets: listProjectTargetChoices(projectConfigPath),
      rootName: folder.name,
      rootPath: folder.uri.fsPath,
      hasProject: true,
      ...(projectStatus.targetName !== undefined ? { targetName: projectStatus.targetName } : {}),
      ...(projectStatus.entrySource !== undefined ? { entrySource: projectStatus.entrySource } : {}),
    };
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

  private buildSnapshotPayload(memoryViews: {
    viewModes: Record<string, string | undefined>;
    viewAfter: Record<string, number | undefined>;
    viewAddress: Record<string, number | undefined>;
  }): {
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
    await this.postSnapshot('debug80/tec1MemorySnapshot', payload);
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
    await this.postSnapshot('debug80/tec1gMemorySnapshot', payload);
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
