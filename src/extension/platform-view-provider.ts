/**
 * @file WebviewViewProvider for the Debug80 sidebar platform view.
 */

import * as vscode from 'vscode';
import {
  createRefreshController,
} from '../platforms/panel-refresh';
import { appendSerialText, clearSerialBuffer, createSerialBuffer } from '../platforms/panel-serial';
import type { Tec1UpdatePayload } from '../platforms/tec1/types';
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
import {
  loadPlatformUi,
  type PlatformUiMessageContext,
  type PlatformUiModules,
} from './platform-view-manifest';
import { resolveProjectStatusSummary } from './project-status';

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
  private readonly workspaceState: vscode.Memento;
  private readonly platformStates = new Map<PlatformViewPlatform, PlatformViewState<unknown>>();
  private readonly platformStateLoads = new Map<
    PlatformViewPlatform,
    Promise<PlatformViewState<unknown> | undefined>
  >();

  constructor(extensionUri: vscode.Uri, workspaceState: vscode.Memento) {
    this.extensionUri = extensionUri;
    this.workspaceState = workspaceState;
  }

  private tec1gUiVisibilityOverride: Record<string, boolean> | undefined;

  private getPlatformState(
    platform: PlatformViewPlatform | undefined,
  ): PlatformViewState<unknown> | undefined {
    if (platform === undefined || platform === 'simple') {
      return undefined;
    }
    return this.platformStates.get(platform);
  }

  private async ensurePlatformState(
    platform: PlatformViewPlatform | undefined,
  ): Promise<PlatformViewState<unknown> | undefined> {
    if (platform === undefined || platform === 'simple') {
      return undefined;
    }
    const existing = this.platformStates.get(platform);
    if (existing !== undefined) {
      return existing;
    }
    const pending = this.platformStateLoads.get(platform);
    if (pending !== undefined) {
      return pending;
    }
    const load = this.loadPlatformState(platform);
    this.platformStateLoads.set(platform, load);
    try {
      const state = await load;
      if (state !== undefined) {
        this.platformStates.set(platform, state);
      }
      return state;
    } finally {
      this.platformStateLoads.delete(platform);
    }
  }

  private async loadPlatformState(
    platform: PlatformViewPlatform,
  ): Promise<PlatformViewState<unknown>> {
    const modules = await loadPlatformUi(platform);
    return this.buildPlatformState(modules);
  }

  private buildPlatformState<TUiState>(
    modules: PlatformUiModules<TUiState>,
  ): PlatformViewState<TUiState> {
    const platformState: PlatformViewState<TUiState> = {
      activeTab: 'home',
      uiState: modules.createUiState(),
      serialBuffer: createSerialBuffer(),
      memoryViews: modules.createMemoryViewState(),
      snapshotCommand: modules.snapshotCommand,
      getHtml: modules.getHtml,
      applyUpdate: modules.applyUpdate,
      handleMessage: modules.handleMessage,
      resetUiState: modules.resetUiState,
      clearSerialBuffer: clearSerialBuffer,
      createMemoryViewState: modules.createMemoryViewState,
      buildUpdateMessage: modules.buildUpdateMessage,
      buildClearMessage: modules.buildClearMessage,
      refreshController: undefined as never,
    };
    const refreshController = createRefreshController(
      () => buildSnapshotPayload(platformState.memoryViews),
      {
        postSnapshot: async (payload) => this.postSnapshot(modules.snapshotCommand, payload),
        onSnapshotPosted: () => undefined,
        onSnapshotFailed: (allowErrors) => this.onSnapshotFailed(allowErrors),
      },
    );
    platformState.refreshController = refreshController;
    return platformState;
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
    if (this.currentPlatform === undefined) {
      this.renderCurrentView(true);
      return;
    }
    this.postProjectStatus();
  }

  setHasProject(value: boolean): void {
    this.hasProject = value;
    if (this.currentPlatform === undefined) {
      this.renderCurrentView(true);
    }
  }

  refreshIdleView(): void {
    if (this.currentPlatform === undefined) {
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
    void this.applyPlatformSelection(platform, options);
  }

  private async applyPlatformSelection(
    platform: PlatformViewPlatform,
    options?: { focus?: boolean; reveal?: boolean; tab?: PanelTab }
  ): Promise<void> {
    try {
      const ps = await this.ensurePlatformState(platform);
      if (ps && (options?.tab === 'home' || options?.tab === 'ui' || options?.tab === 'memory')) {
        ps.activeTab = options.tab;
      }
      if (options?.reveal !== false) {
        this.reveal(options?.focus ?? false);
      }
      this.renderCurrentView(true);
    } catch (err) {
      void vscode.window.showErrorMessage(`Debug80: Failed to load ${platform} UI: ${String(err)}`);
    }
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
    void this.applyPlatformUpdate('tec1', payload, sessionId);
  }

  updateTec1g(payload: Tec1gUpdatePayload, sessionId?: string): void {
    void this.applyPlatformUpdate('tec1g', payload, sessionId);
  }

  private async applyPlatformUpdate(
    platform: PlatformViewPlatform,
    payload: unknown,
    sessionId?: string,
  ): Promise<void> {
    if (!this.shouldAcceptSession(sessionId)) {
      return;
    }
    const ps = await this.ensurePlatformState(platform);
    if (!ps) {
      return;
    }
    const updateMessage = ps.applyUpdate(ps.uiState, payload);
    if (this.currentPlatform !== platform) {
      return;
    }
    this.postMessage({
      type: 'update',
      uiRevision: this.nextUiRevision(),
      ...updateMessage,
    });
  }

  appendTec1Serial(text: string, sessionId?: string): void {
    void this.appendPlatformSerial('tec1', text, sessionId);
  }

  appendTec1gSerial(text: string, sessionId?: string): void {
    void this.appendPlatformSerial('tec1g', text, sessionId);
  }

  private async appendPlatformSerial(
    platform: PlatformViewPlatform,
    text: string,
    sessionId?: string,
  ): Promise<void> {
    if (!this.shouldAcceptSession(sessionId)) {
      return;
    }
    if (text.length === 0) {
      return;
    }
    const ps = await this.ensurePlatformState(platform);
    if (!ps) {
      return;
    }
    appendSerialText(ps.serialBuffer, text);
    if (this.currentPlatform === platform) {
      this.postMessage({ type: 'serial', text });
    }
  }

  clear(): void {
    for (const ps of this.platformStates.values()) {
      clearPlatformState(ps);
    }
    const ps = this.getPlatformState(this.currentPlatform);
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
    this.stopAllPlatformRefresh();
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
        handleCreateProject: () => vscode.commands.executeCommand('debug80.createProject'),
        handleSelectProject: () =>
          vscode.commands.executeCommand('debug80.selectWorkspaceFolder'),
        handleSelectTarget: () => vscode.commands.executeCommand('debug80.selectTarget'),
        handleRestartDebug: () => vscode.commands.executeCommand('debug80.restartDebug'),
        handleSetEntrySource: () =>
          vscode.commands.executeCommand('debug80.setEntrySource'),
        currentPlatform: () => this.currentPlatform,
        handleStartDebug: () => vscode.commands.executeCommand('debug80.startDebug'),
        handleSerialSendFile: () =>
          handlePlatformSerialSendFile({
            getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
            getPlatform: () => this.currentPlatform,
          }),
        handleSerialSave: (text) => handlePlatformSerialSave(text),
        clearSerialBuffer: (platform) => {
          const ps = this.getPlatformState(platform);
          if (ps) {clearSerialBuffer(ps.serialBuffer);}
        },
        handlePlatformMessage: (platform, message) =>
          this.handlePlatformMessage(platform, message),
      });
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.stopAllPlatformRefresh();
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.renderCurrentView(true);
        return;
      }
      this.stopAllPlatformRefresh();
    });

    this.renderCurrentView(false);
  }

  private async handlePlatformMessage(
    platform: PlatformViewPlatform,
    message: PlatformViewMessage,
  ): Promise<void> {
    const ps = await this.ensurePlatformState(platform);
    if (!ps) {
      return;
    }
    const context: PlatformUiMessageContext = {
      getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
      refreshController: ps.refreshController,
      autoRefreshMs: 150,
      setActiveTab: (tab) => {
        ps.activeTab = tab;
      },
      getActiveTab: () => ps.activeTab,
      isPanelVisible: () => this.view?.visible === true,
      memoryViews: ps.memoryViews,
    };
    await ps.handleMessage(message, context);
  }

  private stopAllPlatformRefresh(): void {
    for (const ps of this.platformStates.values()) {
      stopPlatformRefresh(ps);
    }
  }

  private renderCurrentView(rehydrate: boolean): void {
    void this.renderCurrentViewAsync(rehydrate);
  }

  private async renderCurrentViewAsync(rehydrate: boolean): Promise<void> {
    if (!this.view) {
      return;
    }
    const platform = this.currentPlatform;
    try {
      const ps = await this.ensurePlatformState(platform);
      if (this.view === undefined || this.currentPlatform !== platform) {
        return;
      }
      if (ps !== undefined) {
        this.view.webview.html = ps.getHtml(ps.activeTab, this.view.webview, this.extensionUri);
        this.postMessage(ps.buildUpdateMessage(ps.uiState, this.nextUiRevision()));
        if (platform === 'tec1g' && this.tec1gUiVisibilityOverride !== undefined) {
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
        this.postProjectStatus();
        syncPlatformMemoryRefresh(ps, this.view.visible, rehydrate);
        return;
      }
    } catch (err) {
      if (platform !== undefined && platform !== 'simple') {
        void vscode.window.showErrorMessage(`Debug80: Failed to load ${platform} UI: ${String(err)}`);
      }
    }
    if (rehydrate || this.view.webview.html.length === 0) {
      const status = resolveProjectStatusSummary(this.workspaceState, this.selectedWorkspace);
      const idleHtmlOptions = {
        hasProject: this.hasProject,
        multiRoot: (vscode.workspace.workspaceFolders ?? []).length > 1,
        ...(this.selectedWorkspace?.name !== undefined
          ? { selectedWorkspaceName: this.selectedWorkspace.name }
          : {}),
        ...(status?.projectName !== undefined ? { projectName: status.projectName } : {}),
        ...(status?.targetName !== undefined ? { targetName: status.targetName } : {}),
        ...(status?.entrySource !== undefined ? { entrySource: status.entrySource } : {}),
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

  private postProjectStatus(): void {
    const summary = resolveProjectStatusSummary(this.workspaceState, this.selectedWorkspace);
    this.postMessage({
      type: 'projectStatus',
      rootName: this.selectedWorkspace?.name,
      hasProject: summary !== undefined,
      projectName: summary?.projectName,
      targetName: summary?.targetName,
      entrySource: summary?.entrySource,
    });
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
