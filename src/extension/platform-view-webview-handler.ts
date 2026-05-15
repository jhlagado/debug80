/**
 * @file Webview inbound message handler construction for the platform view.
 */

import * as vscode from 'vscode';
import type { PlatformId, PlatformViewInboundMessage } from '../contracts/platform-view';
import type { PanelTab } from '../platforms/panel-html';
import { MEMORY_REFRESH_INTERVAL_MS } from './platform-view-constants';
import { handlePlatformViewMessage } from './platform-view-messages';
import {
  handlePlatformSerialSave,
  handlePlatformSerialSendFile,
} from './platform-view-serial-actions';
import type { PlatformViewSessionState } from './platform-view-session-state';
import { resolvePlatformViewDebugSession } from './platform-view-session-state';
import { clearPlatformSerial } from './platform-view-serial-state';
import type { PlatformViewBundle } from './platform-view-registry';

export interface PlatformViewWebviewHandlerContext {
  currentPlatform: () => PlatformId | undefined;
  sessionState: PlatformViewSessionState;
  getActiveBundle: (platform: PlatformId) => PlatformViewBundle | undefined;
  handleSaveProjectConfig: (platform: string) => void;
  handleSetStopOnEntry: (value: boolean) => void;
  persistTec1gPanelVisibility: (
    visibility: Record<string, boolean>,
    targetNameFromWebview?: string
  ) => void;
  isPanelVisible: () => boolean;
}

export function createPlatformViewWebviewHandler(
  context: PlatformViewWebviewHandlerContext
): (msg: PlatformViewInboundMessage) => Promise<void> {
  return async (msg: PlatformViewInboundMessage): Promise<void> => {
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
        context.handleSaveProjectConfig(platform);
        return Promise.resolve();
      },
      handleSetStopOnEntry: (value) => {
        context.handleSetStopOnEntry(value);
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
      currentPlatform: context.currentPlatform,
      handleSaveTec1gPanelVisibility: (args) => {
        context.persistTec1gPanelVisibility(args.visibility, args.targetName);
      },
      handleStartDebug: async (args) => {
        await vscode.commands.executeCommand('debug80.startDebug', args);
      },
      handleSerialSendFile: async () => {
        await handlePlatformSerialSendFile({
          getSession: () =>
            resolvePlatformViewDebugSession(context.sessionState, vscode.debug.activeDebugSession),
          getPlatform: context.currentPlatform,
        });
      },
      handleSerialSave: async (text) => {
        await handlePlatformSerialSave(text);
      },
      clearSerialBuffer: (platform) => {
        const bundle = context.getActiveBundle(platform);
        if (bundle !== undefined) {
          clearPlatformSerial(bundle.state.serialBuffer);
        }
      },
      handlePlatformMessage: async (platform, platformMsg) => {
        const bundle = context.getActiveBundle(platform);
        if (bundle === undefined) {
          return;
        }
        await bundle.modules.handleMessage(platformMsg, {
          getSession: () =>
            resolvePlatformViewDebugSession(context.sessionState, vscode.debug.activeDebugSession),
          refreshController: bundle.state.refreshController,
          autoRefreshMs: MEMORY_REFRESH_INTERVAL_MS,
          setActiveTab: (tab: PanelTab) => {
            bundle.state.activeTab = tab;
          },
          getActiveTab: () => bundle.state.activeTab,
          isPanelVisible: context.isPanelVisible,
          memoryViews: bundle.state.memoryViews,
        });
      },
    });
  };
}
