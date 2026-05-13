/**
 * @file Lazy platform UI manifest for the Debug80 platform sidebar.
 */

import type * as vscode from 'vscode';
import type { PanelTab } from '../platforms/panel-html';
import type { MemoryViewState } from '../platforms/panel-memory';
import type { RefreshController } from '../platforms/panel-refresh';
import type { PlatformViewMessage } from './platform-view-messages';

export interface PlatformUiMessageContext {
  getSession: () => vscode.DebugSession | undefined;
  refreshController: RefreshController;
  autoRefreshMs: number;
  setActiveTab: (tab: PanelTab) => void;
  getActiveTab: () => PanelTab;
  isPanelVisible: () => boolean;
  memoryViews: MemoryViewState;
}

export interface PlatformUiModules<TUiState = unknown> {
  getHtml: (tab: PanelTab, webview: vscode.Webview, extensionUri: vscode.Uri) => string;
  createUiState: () => TUiState;
  resetUiState: (state: TUiState) => void;
  applyUpdate: (state: TUiState, payload: unknown) => Record<string, unknown>;
  createMemoryViewState: () => MemoryViewState;
  handleMessage: (message: PlatformViewMessage, context: PlatformUiMessageContext) => Promise<void>;
  buildUpdateMessage: (state: TUiState, uiRevision: number) => Record<string, unknown>;
  buildClearMessage: (state: TUiState, uiRevision: number) => Record<string, unknown>;
  snapshotCommand: 'debug80/memorySnapshot';
}

export interface PlatformUiEntry {
  id: string;
  loadUiModules: () => Promise<PlatformUiModules>;
}

const uiRegistry = new Map<string, PlatformUiEntry>();

export function registerPlatformUi(entry: PlatformUiEntry): void {
  uiRegistry.set(entry.id, entry);
}

export function listPlatformUis(): PlatformUiEntry[] {
  return Array.from(uiRegistry.values());
}

export async function loadPlatformUi(id: string): Promise<PlatformUiModules> {
  const entry = uiRegistry.get(id);
  if (entry === undefined) {
    throw new Error(`No UI registered for platform: ${id}`);
  }
  return entry.loadUiModules();
}
