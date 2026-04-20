/**
 * @file WebviewViewProvider for the Debug80 sidebar platform view.
 *
 * All platform-specific behaviour is accessed through {@link PlatformUiModules}
 * loaded from the manifest registry via {@link loadPlatformUi}.  Adding a new
 * platform requires only registering it with {@link registerExtensionPlatform}
 * in extension.ts; no changes are needed here.
 */

import * as vscode from 'vscode';
import type { DebugSessionStatus } from '../debug/session-status';
import type { Tec1UpdatePayload } from '../platforms/tec1/types';
import type { Tec1gUpdatePayload } from '../platforms/tec1g/types';
import {
  appendSerialText,
  clearSerialBuffer,
  createSerialBuffer,
  type SerialBuffer,
} from '../platforms/panel-serial';
import {
  createRefreshController,
  refreshSnapshot,
  startAutoRefresh,
  stopAutoRefresh,
  type RefreshController,
  type SnapshotRequest,
} from '../platforms/panel-refresh';
import type { MemoryViewState } from '../platforms/panel-memory';
import type { PanelTab } from '../platforms/panel-html';
import { getTec1gHtml } from '../platforms/tec1g/ui-panel-html';
import { listProjectTargetChoices } from './project-target-selection';
import { resolveProjectStatusSummary } from './project-status';
import {
  findProjectConfigPath,
  readProjectConfig,
  resolveProjectPlatform,
} from './project-config';
import { handlePlatformViewMessage } from './platform-view-messages';
import {
  handlePlatformSerialSave,
  handlePlatformSerialSendFile,
} from './platform-view-serial-actions';
import {
  loadPlatformUi,
  listPlatformUis,
  type PlatformUiModules,
} from './platform-view-manifest';
import type {
  PlatformId,
  PlatformViewInboundMessage,
  ProjectStatusPayload,
} from '../contracts/platform-view';

// ---------------------------------------------------------------------------
// Per-platform runtime state
// ---------------------------------------------------------------------------

/**
 * Mutable state held by the provider for each loaded platform.
 * One instance exists per registered platform for the lifetime of the provider.
 */
interface PerPlatformState {
  activeTab: PanelTab;
  uiState: unknown;
  serialBuffer: SerialBuffer;
  memoryViews: MemoryViewState;
  refreshController: RefreshController;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class PlatformViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug80.platformView';

  private view: vscode.WebviewView | undefined;
  private currentPlatform: PlatformId | undefined;
  private currentSession: vscode.DebugSession | undefined;
  private currentSessionId: string | undefined;
  private uiRevision = 0;
  private selectedWorkspace: vscode.WorkspaceFolder | undefined;
  private sessionStatus: DebugSessionStatus = 'not running';
  private readonly workspaceState: vscode.Memento | undefined;
  private readonly extensionUri: vscode.Uri;

  /** Cached loaded modules, keyed by platform id. */
  private readonly loadedModules = new Map<string, PlatformUiModules>();
  /** Per-platform mutable state, keyed by platform id. */
  private readonly platformStates = new Map<string, PerPlatformState>();

  /** TEC-1G only: visibility overrides sent to the webview. */
  private tec1gUiVisibilityOverride: Record<string, boolean> | undefined;

  /** Global stop-on-entry toggle — session-scoped, not persisted per project. */
  public stopOnEntry = false;

  constructor(extensionUri: vscode.Uri, workspaceState?: vscode.Memento) {
    this.extensionUri = extensionUri;
    this.workspaceState = workspaceState;
  }

  // -------------------------------------------------------------------------
  // Public API — called from the adapter, extension commands, and tests
  // -------------------------------------------------------------------------

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
    void value;
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
    options?: { focus?: boolean; reveal?: boolean; tab?: PanelTab }
  ): void {
    this.currentPlatform = platform;
    if (session !== undefined) {
      this.currentSession = session;
      this.currentSessionId = session.id;
    }
    if (options?.tab === 'ui' || options?.tab === 'memory') {
      const bundle = this.getActiveBundle(platform);
      if (bundle !== undefined) {
        bundle.state.activeTab = options.tab;
      }
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
    if (!this.shouldAcceptSession(sessionId) || this.currentPlatform !== 'tec1') {
      return;
    }
    const bundle = this.getActiveBundle('tec1');
    if (bundle === undefined) {
      return;
    }
    const updateFields = bundle.modules.applyUpdate(bundle.state.uiState, payload);
    this.postMessage({ type: 'update', uiRevision: this.nextUiRevision(), ...updateFields });
  }

  updateTec1g(payload: Tec1gUpdatePayload, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId) || this.currentPlatform !== 'tec1g') {
      return;
    }
    const bundle = this.getActiveBundle('tec1g');
    if (bundle === undefined) {
      return;
    }
    const updateFields = bundle.modules.applyUpdate(bundle.state.uiState, payload);
    this.postMessage({ type: 'update', uiRevision: this.nextUiRevision(), ...updateFields });
  }

  appendTec1Serial(text: string, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId) || text.length === 0) {
      return;
    }
    const bundle = this.getActiveBundle('tec1');
    if (bundle === undefined) {
      return;
    }
    appendSerialText(bundle.state.serialBuffer, text);
    if (this.currentPlatform === 'tec1') {
      this.postMessage({ type: 'serial', text });
    }
  }

  appendSimpleTerminal(text: string, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId) || text.length === 0) {
      return;
    }
    const bundle = this.getActiveBundle('simple');
    if (bundle === undefined) {
      return;
    }
    appendSerialText(bundle.state.serialBuffer, text);
    if (this.currentPlatform === 'simple') {
      this.postMessage({ type: 'serial', text });
    }
  }

  appendTec1gSerial(text: string, sessionId?: string): void {
    if (!this.shouldAcceptSession(sessionId) || text.length === 0) {
      return;
    }
    const bundle = this.getActiveBundle('tec1g');
    if (bundle === undefined) {
      return;
    }
    appendSerialText(bundle.state.serialBuffer, text);
    if (this.currentPlatform === 'tec1g') {
      this.postMessage({ type: 'serial', text });
    }
  }

  clear(): void {
    for (const [id, state] of this.platformStates) {
      const modules = this.loadedModules.get(id);
      if (modules !== undefined) {
        modules.resetUiState(state.uiState);
        state.memoryViews = modules.createMemoryViewState();
      }
      clearSerialBuffer(state.serialBuffer);
    }
    const bundle = this.getCurrentBundle();
    if (bundle !== undefined) {
      this.postMessage(bundle.modules.buildClearMessage(bundle.state.uiState, this.nextUiRevision()));
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
    this.stopAllPlatformRefresh();
    this.clear();
  }

  // -------------------------------------------------------------------------
  // WebviewViewProvider
  // -------------------------------------------------------------------------

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
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
          await vscode.commands.executeCommand('debug80.addWorkspaceFolder');
        },
        handleSelectProject: async (args) => {
          await vscode.commands.executeCommand('debug80.selectWorkspaceFolder', args);
        },
        handleConfigureProject: () => {
          return Promise.resolve();
        },
        handleSaveProjectConfig: (platform) => {
          this.handleSaveProjectConfig(platform);
          return Promise.resolve();
        },
        handleSetStopOnEntry: (value) => {
          this.handleSetStopOnEntry(value);
          return Promise.resolve();
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
          const bundle = this.getActiveBundle(platform);
          if (bundle !== undefined) {
            clearSerialBuffer(bundle.state.serialBuffer);
          }
        },
        handlePlatformMessage: async (platform, platformMsg) => {
          const bundle = this.getActiveBundle(platform);
          if (bundle === undefined) {
            return;
          }
          await bundle.modules.handleMessage(platformMsg, {
            getSession: () => this.currentSession ?? vscode.debug.activeDebugSession,
            refreshController: bundle.state.refreshController,
            autoRefreshMs: 150,
            setActiveTab: (tab) => {
              bundle.state.activeTab = tab;
            },
            getActiveTab: () => bundle.state.activeTab,
            isPanelVisible: () => this.view?.visible === true,
            memoryViews: bundle.state.memoryViews,
          });
        },
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

    // Load all registered platform UIs eagerly so subsequent synchronous
    // operations (updateTec1, clear, etc.) can access modules without async.
    return this.preloadAllPlatforms().then(() => {
      this.renderCurrentView(false);
    });
  }

  // -------------------------------------------------------------------------
  // Private — rendering and module management
  // -------------------------------------------------------------------------

  private renderCurrentView(rehydrate: boolean): void {
    if (!this.view) {
      return;
    }
    const bundle = this.getCurrentBundle();
    if (bundle !== undefined) {
      this.view.webview.html = bundle.modules.getHtml(
        bundle.state.activeTab,
        this.view.webview,
        this.extensionUri
      );
      this.postProjectStatus();
      this.postSessionStatus();
      this.postMessage(
        bundle.modules.buildUpdateMessage(bundle.state.uiState, this.nextUiRevision())
      );
      if (this.currentPlatform === 'tec1g' && this.tec1gUiVisibilityOverride) {
        this.postMessage({
          type: 'uiVisibility',
          visibility: this.tec1gUiVisibilityOverride,
          persist: false,
        });
      }
      if (bundle.state.serialBuffer.text.length > 0) {
        this.postMessage({ type: 'serialInit', text: bundle.state.serialBuffer.text });
      }
      this.postMessage({ type: 'selectTab', tab: bundle.state.activeTab });
      this.syncMemoryRefresh(bundle, rehydrate);
      return;
    }
    if (rehydrate || this.view.webview.html.length === 0) {
      this.view.webview.html = getTec1gHtml('ui', this.view.webview, this.extensionUri);
      this.postProjectStatus();
      this.postSessionStatus();
    }
  }

  /**
   * Loads all registered platform UI modules and initialises per-platform
   * state for each.  Subsequent synchronous operations can rely on the
   * Maps being populated.
   */
  private async preloadAllPlatforms(): Promise<void> {
    await Promise.all(
      listPlatformUis().map(async (entry) => {
        if (!this.loadedModules.has(entry.id)) {
          const modules = await loadPlatformUi(entry.id);
          this.loadedModules.set(entry.id, modules);
          this.initPlatformState(entry.id, modules);
        }
      })
    );
  }

  /**
   * Creates and caches the {@link PerPlatformState} for a platform whose
   * modules have just been loaded.
   */
  private initPlatformState(id: string, modules: PlatformUiModules): PerPlatformState {
    const existing = this.platformStates.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const state: PerPlatformState = {
      activeTab: 'ui' as PanelTab,
      uiState: modules.createUiState(),
      serialBuffer: createSerialBuffer(),
      memoryViews: modules.createMemoryViewState(),
      // refreshController is created separately so its snapshotPayload
      // closure captures the state object reference (not a stale copy).
      refreshController: null as unknown as RefreshController,
    };
    state.refreshController = createRefreshController(
      () => this.buildSnapshotPayload(state.memoryViews),
      {
        postSnapshot: (payload) => this.postSnapshot(modules.snapshotCommand, payload),
        onSnapshotPosted: () => undefined,
        onSnapshotFailed: (allowErrors) => this.onSnapshotFailed(allowErrors),
      }
    );
    this.platformStates.set(id, state);
    return state;
  }

  /** Returns the loaded modules + state bundle for the given platform id, or undefined. */
  private getActiveBundle(
    id: string
  ): { modules: PlatformUiModules; state: PerPlatformState } | undefined {
    const modules = this.loadedModules.get(id);
    const state = this.platformStates.get(id);
    if (modules === undefined || state === undefined) {
      return undefined;
    }
    return { modules, state };
  }

  /** Returns the bundle for the currently active platform, or undefined. */
  private getCurrentBundle():
    | { modules: PlatformUiModules; state: PerPlatformState }
    | undefined {
    if (this.currentPlatform === undefined) {
      return undefined;
    }
    return this.getActiveBundle(this.currentPlatform);
  }

  private syncMemoryRefresh(
    bundle: { modules: PlatformUiModules; state: PerPlatformState },
    rehydrate: boolean
  ): void {
    if (this.view?.visible !== true) {
      return;
    }
    if (bundle.state.activeTab !== 'memory') {
      stopAutoRefresh(bundle.state.refreshController.state);
      return;
    }
    startAutoRefresh(bundle.state.refreshController.state, 150, () => {
      void refreshSnapshot(
        bundle.state.refreshController.state,
        bundle.state.refreshController.handlers,
        bundle.state.refreshController.snapshotPayload(),
        { allowErrors: false }
      );
    });
    if (rehydrate) {
      void refreshSnapshot(
        bundle.state.refreshController.state,
        bundle.state.refreshController.handlers,
        bundle.state.refreshController.snapshotPayload(),
        { allowErrors: true }
      );
    }
  }

  private stopAllPlatformRefresh(): void {
    for (const state of this.platformStates.values()) {
      stopAutoRefresh(state.refreshController.state);
    }
  }

  // -------------------------------------------------------------------------
  // Private — config
  // -------------------------------------------------------------------------

  /** Applies the shared platform selector only for uninitialized workspaces. */
  private handleSaveProjectConfig(platform: string): void {
    const folder = this.selectedWorkspace ?? vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) {
      void vscode.window.showErrorMessage('Debug80: No workspace folder selected.');
      return;
    }
    const configPath = findProjectConfigPath(folder);
    if (configPath === undefined) {
      const normalized = this.normalizePlatformId(platform);
      if (normalized !== undefined) {
        this.currentPlatform = normalized;
        this.renderCurrentView(true);
        return;
      }
      void vscode.window.showErrorMessage('Debug80: No project config found in workspace.');
      return;
    }
    this.postProjectStatus();
  }

  private normalizePlatformId(platform: string): PlatformId | undefined {
    const normalized = platform.trim().toLowerCase();
    if (normalized === 'simple' || normalized === 'tec1' || normalized === 'tec1g') {
      return normalized;
    }
    return undefined;
  }

  private handleSetStopOnEntry(value: boolean): void {
    this.stopOnEntry = value;
    this.postProjectStatus();
  }

  // -------------------------------------------------------------------------
  // Private — status and messaging
  // -------------------------------------------------------------------------

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
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const roots = workspaceFolders.map((folder) => ({
      name: folder.name,
      path: folder.uri.fsPath,
      hasProject: findProjectConfigPath(folder) !== undefined,
    }));
    const folder =
      this.selectedWorkspace ??
      (workspaceFolders.length === 1 ? workspaceFolders[0] : undefined);
    if (folder === undefined) {
      return {
        roots,
        targets: [],
        projectState: roots.length === 0 ? 'noWorkspace' : 'uninitialized',
        hasProject: false,
        platform: this.currentPlatform ?? 'simple',
        stopOnEntry: this.stopOnEntry,
      };
    }

    const projectConfigPath = findProjectConfigPath(folder);
    const hasProject = projectConfigPath !== undefined;
    const projectStatus =
      hasProject && this.workspaceState !== undefined
        ? resolveProjectStatusSummary(this.workspaceState, folder)
        : undefined;
    if (!hasProject) {
      return {
        roots,
        targets: [],
        rootName: folder.name,
        rootPath: folder.uri.fsPath,
        projectState: 'uninitialized',
        hasProject: false,
        platform: this.currentPlatform ?? 'simple',
        stopOnEntry: this.stopOnEntry,
      };
    }

    const config = readProjectConfig(projectConfigPath);
    const platform = resolveProjectPlatform(config) ?? 'simple';

    return {
      roots,
      targets: listProjectTargetChoices(projectConfigPath),
      rootName: folder.name,
      rootPath: folder.uri.fsPath,
      projectState: 'initialized',
      hasProject: true,
      platform,
      stopOnEntry: this.stopOnEntry,
      ...(projectStatus?.targetName !== undefined ? { targetName: projectStatus.targetName } : {}),
      ...(projectStatus?.entrySource !== undefined
        ? { entrySource: projectStatus.entrySource }
        : {}),
    };
  }

  private buildSnapshotPayload(memoryViews: MemoryViewState): SnapshotRequest {
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

  private onSnapshotFailed(allowErrors: boolean): void {
    if (!allowErrors || !this.view) {
      return;
    }
    this.postMessage({ type: 'snapshotError', message: 'No active z80 session.' });
  }

  private postMessage(payload: Record<string, unknown>): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage(payload);
  }

  private shouldAcceptSession(sessionId?: string): boolean {
    if (sessionId === undefined || this.currentSessionId === undefined) {
      return true;
    }
    return this.currentSessionId === sessionId;
  }

  private nextUiRevision(): number {
    this.uiRevision += 1;
    return this.uiRevision;
  }

  private async postSnapshot(
    command: 'debug80/memorySnapshot',
    payload: SnapshotRequest
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
    this.postMessage({ type: 'snapshot', ...(snapshot as Record<string, unknown>) });
  }
}
