/**
 * @file WebviewViewProvider for the Debug80 sidebar platform view.
 *
 * All platform-specific behaviour is accessed through {@link PlatformUiModules}
 * loaded from the manifest registry via {@link loadPlatformUi}.  Adding a new
 * platform requires only registering it with {@link registerExtensionPlatform}
 * in extension.ts; no changes are needed here.
 */

import * as vscode from 'vscode';
import type { DebugSessionStatus } from '../debug/session/session-status';
import type { Tec1UpdatePayload } from '../platforms/tec1/types';
import type { Tec1gUpdatePayload } from '../platforms/tec1g/types';
import type { PanelTab } from '../platforms/panel-html';
import { getTec1gHtml } from '../platforms/tec1g/ui-panel-html';
import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterContractsMode,
  AzmSymbolCaseMode,
  PlatformId,
} from '../contracts/platform-view';
import { NullLogger, type Logger } from '../util/logger';
import { createUiPerformanceMonitor, type UiPerformanceMonitor } from './ui-performance-monitor';
import {
  buildPlatformViewProjectStatus,
  resolvePlatformViewWorkspace,
} from './platform-view-project-status';
import {
  buildMemorySnapshotPayload,
  stopMemoryRefresh,
  syncMemoryRefresh,
} from './platform-view-memory-refresh';
import { resolveSaveProjectConfigAction } from './platform-view-config-controls';
import {
  appendPlatformSerial,
  buildSerialInitMessage,
  clearPlatformSerial,
} from './platform-view-serial-state';
import {
  applyPlatformRuntimeUpdate,
  buildPlatformRuntimeClearMessage,
  buildPlatformRuntimeUpdateMessage,
  clearPlatformRuntimeState,
} from './platform-view-runtime-state';
import {
  buildPlatformViewSessionStatusMessage,
  clearPlatformViewSession,
  createPlatformViewSessionState,
  isCurrentPlatformViewSession,
  resolvePlatformViewDebugSession,
  setPlatformViewSession,
  setPlatformViewSessionStatus,
  shouldAcceptPlatformViewSession,
} from './platform-view-session-state';
import { revealPlatformView } from './platform-view-reveal';
import { PlatformViewRegistry, type PlatformViewBundle } from './platform-view-registry';
import { createPlatformViewWebviewHandler } from './platform-view-webview-handler';
import { MEMORY_REFRESH_INTERVAL_MS } from './platform-view-constants';
import { isCoolTermRemoteAvailable } from './coolterm/coolterm-send';
import { findProjectConfigPath, updateProjectAzmSymbolCase } from './project-config';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class PlatformViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug80.platformView';

  private view: vscode.WebviewView | undefined;
  private currentPlatform: PlatformId | undefined;
  private readonly sessionState = createPlatformViewSessionState();
  private uiRevision = 0;
  private selectedWorkspace: vscode.WorkspaceFolder | undefined;
  private readonly workspaceState: vscode.Memento | undefined;
  private readonly extensionUri: vscode.Uri;
  private readonly logger: Logger;
  private readonly performanceMonitor: UiPerformanceMonitor;
  private readonly registry: PlatformViewRegistry;
  private coolTermAvailable = false;
  private checkingCoolTerm = false;
  private hardwareStatusText: string | undefined;
  private hardwareStatusState: 'neutral' | 'error' = 'neutral';
  private coolTermPollTimer: ReturnType<typeof setInterval> | undefined;
  private panelLayoutResetPending = false;

  /** Global stop-on-entry toggle — session-scoped, not persisted per project. */
  public stopOnEntry = false;
  /** Session-scoped AZM register contracts mode. */
  public azmRegisterContractsMode: AzmPanelRegisterContractsMode = 'enforce';
  /** Session-scoped AZM contract-update preference. */
  public azmContractUpdateMode: AzmPanelContractUpdateMode = 'ask';

  constructor(
    extensionUri: vscode.Uri,
    workspaceState?: vscode.Memento,
    logger: Logger = new NullLogger()
  ) {
    this.extensionUri = extensionUri;
    this.workspaceState = workspaceState;
    this.logger = logger;
    this.performanceMonitor = createUiPerformanceMonitor({
      logger,
      label: 'platform-view',
    });
    this.registry = new PlatformViewRegistry({
      postSnapshot: (command, payload): Promise<void> => this.postSnapshot(command, payload),
      onSnapshotFailed: (allowErrors): void => this.onSnapshotFailed(allowErrors),
    });
  }

  // -------------------------------------------------------------------------
  // Public API — called from the adapter, extension commands, and tests
  // -------------------------------------------------------------------------

  reveal(focus = false): void {
    revealPlatformView({
      focusCommand: `${PlatformViewProvider.viewType}.focus`,
      fallbackCommand: 'workbench.view.debug',
      focus,
      target: () => this.view,
    });
  }

  resetPanelLayout(): void {
    this.panelLayoutResetPending = true;
    this.reveal(true);
    this.postPendingPanelLayoutReset();
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

  setHardwareStatus(message: string | undefined, state: 'neutral' | 'error' = 'neutral'): void {
    this.handleSetHardwareStatus(message, state);
  }

  refreshProjectStatus(): void {
    if (!this.currentPlatform) {
      this.renderCurrentView(true);
      return;
    }
    this.postProjectStatus();
    void this.refreshCoolTermAvailability();
  }

  setPlatform(
    platform: PlatformId,
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; tab?: PanelTab }
  ): void {
    this.currentPlatform = platform;
    if (session !== undefined) {
      setPlatformViewSession(this.sessionState, session);
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
    setPlatformViewSessionStatus(this.sessionState, status);
    if (!this.currentPlatform) {
      return;
    }
    this.postMessage(buildPlatformViewSessionStatusMessage(this.sessionState));
  }

  updateTec1(payload: Tec1UpdatePayload, sessionId?: string): void {
    if (
      !shouldAcceptPlatformViewSession(this.sessionState, sessionId) ||
      this.currentPlatform !== 'tec1'
    ) {
      return;
    }
    const bundle = this.getActiveBundle('tec1');
    if (bundle === undefined) {
      return;
    }
    this.postMessage(
      applyPlatformRuntimeUpdate(bundle.modules, bundle.state, payload, this.nextUiRevision())
    );
  }

  updateTec1g(payload: Tec1gUpdatePayload, sessionId?: string): void {
    if (
      !shouldAcceptPlatformViewSession(this.sessionState, sessionId) ||
      this.currentPlatform !== 'tec1g'
    ) {
      return;
    }
    const bundle = this.getActiveBundle('tec1g');
    if (bundle === undefined) {
      return;
    }
    this.postMessage(
      applyPlatformRuntimeUpdate(bundle.modules, bundle.state, payload, this.nextUiRevision())
    );
  }

  appendTec1Serial(text: string, sessionId?: string): void {
    this.appendSerial('tec1', text, sessionId);
  }

  appendSimpleTerminal(text: string, sessionId?: string): void {
    this.appendSerial('simple', text, sessionId);
  }

  appendTec1gSerial(text: string, sessionId?: string): void {
    this.appendSerial('tec1g', text, sessionId);
  }

  clear(): void {
    this.registry.forEachState((_id, state, modules) => {
      if (modules !== undefined) {
        clearPlatformRuntimeState(modules, state);
      } else {
        clearPlatformSerial(state.serialBuffer);
      }
    });
    const bundle = this.getCurrentBundle();
    if (bundle !== undefined) {
      this.postMessage(
        buildPlatformRuntimeClearMessage(bundle.modules, bundle.state, this.nextUiRevision())
      );
      this.postMessage({ type: 'serialClear' });
    }
  }

  handleSessionTerminated(sessionId: string): void {
    if (!isCurrentPlatformViewSession(this.sessionState, sessionId)) {
      return;
    }
    clearPlatformViewSession(this.sessionState);
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

    webviewView.webview.onDidReceiveMessage(
      createPlatformViewWebviewHandler({
        currentPlatform: () => this.currentPlatform,
        sessionState: this.sessionState,
        getActiveBundle: (platform) => this.getActiveBundle(platform),
        handleSaveProjectConfig: (platform) => this.handleSaveProjectConfig(platform),
        handleSetStopOnEntry: (value) => this.handleSetStopOnEntry(value),
        handleSetAzmOptions: (registerContractsMode, contractUpdateMode) =>
          this.handleSetAzmOptions(registerContractsMode, contractUpdateMode),
        handleSetAzmSymbolCase: (symbolCase) => this.handleSetAzmSymbolCase(symbolCase),
        handleSetHardwareStatus: (message) => this.handleSetHardwareStatus(message),
        handleRequestProjectStatus: () => this.postProjectStatus(),
        isPanelVisible: () => this.view?.visible === true,
        logger: this.logger,
      })
    );

    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.stopCoolTermPolling();
      this.stopAllPlatformRefresh();
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.renderCurrentView(true);
        this.startCoolTermPolling();
        return;
      }
      this.stopCoolTermPolling();
      this.stopAllPlatformRefresh();
    });

    // Load all registered platform UIs eagerly so subsequent synchronous
    // operations (updateTec1, clear, etc.) can access modules without async.
    return this.registry.preloadAll().then(() => {
      this.renderCurrentView(false);
      this.startCoolTermPolling();
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
      void this.refreshCoolTermAvailability();
      this.postSessionStatus();
      this.postMessage(
        buildPlatformRuntimeUpdateMessage(bundle.modules, bundle.state, this.nextUiRevision())
      );
      const serialInitMessage = buildSerialInitMessage(bundle.state.serialBuffer);
      if (serialInitMessage !== undefined) {
        this.postMessage(serialInitMessage);
      }
      this.postMessage({ type: 'selectTab', tab: bundle.state.activeTab });
      this.postPendingPanelLayoutReset();
      syncMemoryRefresh({
        visible: this.view.visible,
        activeTab: bundle.state.activeTab,
        refreshController: bundle.state.refreshController,
        intervalMs: MEMORY_REFRESH_INTERVAL_MS,
        rehydrate,
      });
      return;
    }
    if (rehydrate || this.view.webview.html.length === 0) {
      this.view.webview.html = getTec1gHtml('ui', this.view.webview, this.extensionUri);
      this.postProjectStatus();
      void this.refreshCoolTermAvailability();
      this.postSessionStatus();
      this.postPendingPanelLayoutReset();
    }
  }

  /** Returns the loaded modules + state bundle for the given platform id, or undefined. */
  private getActiveBundle(id: string): PlatformViewBundle | undefined {
    return this.registry.getBundle(id);
  }

  /** Returns the bundle for the currently active platform, or undefined. */
  private getCurrentBundle(): PlatformViewBundle | undefined {
    if (this.currentPlatform === undefined) {
      return undefined;
    }
    return this.getActiveBundle(this.currentPlatform);
  }

  private appendSerial(platform: PlatformId, text: string, sessionId?: string): void {
    if (!shouldAcceptPlatformViewSession(this.sessionState, sessionId)) {
      return;
    }
    const bundle = this.getActiveBundle(platform);
    if (bundle === undefined) {
      return;
    }
    const message = appendPlatformSerial(bundle.state.serialBuffer, text, {
      platform,
      currentPlatform: this.currentPlatform,
    });
    if (message !== undefined) {
      this.postMessage(message);
    }
  }

  private stopAllPlatformRefresh(): void {
    this.registry.forEachState((_id, state) => {
      stopMemoryRefresh(state.refreshController);
    });
  }

  // -------------------------------------------------------------------------
  // Private — config
  // -------------------------------------------------------------------------

  /** Applies the shared platform selector only for uninitialized workspaces. */
  private handleSaveProjectConfig(platform: string): void {
    const action = resolveSaveProjectConfigAction(platform, {
      resolveWorkspace: () => this.resolveSelectedWorkspace(),
    });
    if (action.kind === 'noWorkspace') {
      void vscode.window.showErrorMessage('Debug80: No workspace folder selected.');
      return;
    }
    if (action.kind === 'selectPlatform') {
      this.currentPlatform = action.platform;
      this.renderCurrentView(true);
      return;
    }
    if (action.kind === 'invalidPlatform') {
      void vscode.window.showErrorMessage('Debug80: No project config found in workspace.');
      return;
    }
    this.postProjectStatus();
  }

  private handleSetStopOnEntry(value: boolean): void {
    this.stopOnEntry = value;
    this.postProjectStatus();
  }

  private handleSetAzmOptions(
    registerContractsMode: AzmPanelRegisterContractsMode,
    contractUpdateMode: AzmPanelContractUpdateMode
  ): void {
    this.azmRegisterContractsMode = registerContractsMode;
    this.azmContractUpdateMode = contractUpdateMode;
    this.postProjectStatus();
  }

  private handleSetAzmSymbolCase(symbolCase: AzmSymbolCaseMode): void {
    const folder = this.resolveSelectedWorkspace();
    const projectConfigPath = folder !== undefined ? findProjectConfigPath(folder) : undefined;
    if (
      projectConfigPath === undefined ||
      !updateProjectAzmSymbolCase(projectConfigPath, symbolCase)
    ) {
      void vscode.window.showErrorMessage('Debug80: Failed to update AZM symbol case setting.');
      this.postProjectStatus();
      return;
    }
    this.postProjectStatus();
  }

  private handleSetHardwareStatus(
    message: string | undefined,
    state: 'neutral' | 'error' = 'neutral'
  ): void {
    this.hardwareStatusText = message;
    this.hardwareStatusState = message === undefined ? 'neutral' : state;
    this.postProjectStatus();
  }

  // -------------------------------------------------------------------------
  // Private — status and messaging
  // -------------------------------------------------------------------------

  private postProjectStatus(): void {
    if (!this.view) {
      return;
    }
    this.postMessage({
      type: 'projectStatus',
      ...buildPlatformViewProjectStatus({
        workspaceState: this.workspaceState,
        selectedWorkspace: this.selectedWorkspace,
        currentPlatform: this.currentPlatform,
        stopOnEntry: this.stopOnEntry,
        azmRegisterContractsMode: this.azmRegisterContractsMode,
        azmContractUpdateMode: this.azmContractUpdateMode,
        coolTermAvailable: this.coolTermAvailable,
        ...(this.hardwareStatusText !== undefined
          ? {
              hardwareStatusText: this.hardwareStatusText,
              hardwareStatusState: this.hardwareStatusState,
            }
          : {}),
      }),
    });
  }

  private async refreshCoolTermAvailability(): Promise<void> {
    if (this.checkingCoolTerm) {
      return;
    }
    this.checkingCoolTerm = true;
    try {
      const available = await isCoolTermRemoteAvailable();
      if (available !== this.coolTermAvailable) {
        this.coolTermAvailable = available;
        this.hardwareStatusText = undefined;
        this.hardwareStatusState = 'neutral';
        this.postProjectStatus();
      }
    } finally {
      this.checkingCoolTerm = false;
    }
  }

  private startCoolTermPolling(): void {
    if (this.coolTermPollTimer !== undefined) {
      return;
    }
    void this.refreshCoolTermAvailability();
    this.coolTermPollTimer = setInterval(() => {
      void this.refreshCoolTermAvailability();
    }, 3000);
  }

  private stopCoolTermPolling(): void {
    if (this.coolTermPollTimer === undefined) {
      return;
    }
    clearInterval(this.coolTermPollTimer);
    this.coolTermPollTimer = undefined;
  }

  private postSessionStatus(): void {
    if (!this.view || !this.currentPlatform) {
      return;
    }
    this.postMessage(buildPlatformViewSessionStatusMessage(this.sessionState));
  }

  private resolveSelectedWorkspace(
    folders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? []
  ): vscode.WorkspaceFolder | undefined {
    return resolvePlatformViewWorkspace(
      { workspaceState: this.workspaceState, selectedWorkspace: this.selectedWorkspace },
      folders
    );
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
    this.performanceMonitor.recordMessage(String(payload.type ?? 'unknown'), payload);
    void this.view.webview.postMessage(payload);
  }

  private postPendingPanelLayoutReset(): void {
    if (!this.panelLayoutResetPending || !this.view) {
      return;
    }
    this.panelLayoutResetPending = false;
    this.postMessage({ type: 'resetPanelLayout' });
  }

  private nextUiRevision(): number {
    this.uiRevision += 1;
    return this.uiRevision;
  }

  private async postSnapshot(
    command: 'debug80/memorySnapshot',
    payload: ReturnType<typeof buildMemorySnapshotPayload>
  ): Promise<void> {
    if (!this.view) {
      throw new Error('Debug80: view unavailable');
    }
    const target = resolvePlatformViewDebugSession(
      this.sessionState,
      vscode.debug.activeDebugSession
    );
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
