/**
 * @file Webview inbound message handler construction for the platform view.
 */

import * as vscode from 'vscode';
import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterContractsMode,
  AzmSymbolCaseMode,
  PlatformId,
  PlatformViewInboundMessage,
} from '../contracts/platform-view';
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
import type { Logger } from '../util/logger';

export interface PlatformViewWebviewHandlerContext {
  currentPlatform: () => PlatformId | undefined;
  sessionState: PlatformViewSessionState;
  getActiveBundle: (platform: PlatformId) => PlatformViewBundle | undefined;
  handleSaveProjectConfig: (platform: string) => void;
  handleSetStopOnEntry: (value: boolean) => void;
  handleSetAzmOptions: (
    registerContractsMode: AzmPanelRegisterContractsMode,
    contractUpdateMode: AzmPanelContractUpdateMode
  ) => void;
  handleSetAzmSymbolCase: (symbolCase: AzmSymbolCaseMode) => void;
  handleSetHardwareStatus: (message: string | undefined) => void;
  handleRequestProjectStatus: () => void;
  isPanelVisible: () => boolean;
  logger: Logger;
}

export function createPlatformViewWebviewHandler(
  context: PlatformViewWebviewHandlerContext
): (msg: PlatformViewInboundMessage) => Promise<void> {
  return async (msg: PlatformViewInboundMessage): Promise<void> => {
    await handlePlatformViewMessage(msg, {
      handleCreateProject: async (args) => {
        await vscode.commands.executeCommand('debug80.createProject', args);
      },
      handleOpenWorkspaceFolder: async (args) => {
        if (args === undefined) {
          await vscode.commands.executeCommand('debug80.addWorkspaceFolder');
          return;
        }
        await vscode.commands.executeCommand('debug80.addWorkspaceFolder', args);
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
      handleSetAzmOptions: (registerContractsMode, contractUpdateMode) => {
        context.handleSetAzmOptions(registerContractsMode, contractUpdateMode);
        return Promise.resolve();
      },
      handleSetAzmSymbolCase: (symbolCase) => {
        context.handleSetAzmSymbolCase(symbolCase);
        return Promise.resolve();
      },
      handleSelectTarget: async (args) => {
        await vscode.commands.executeCommand('debug80.selectTarget', args);
      },
      handleAddTarget: async (args) => {
        await vscode.commands.executeCommand('debug80.addTarget', args);
      },
      handleRemoveTarget: async (args) => {
        await vscode.commands.executeCommand('debug80.removeTarget', args);
      },
      handleTestCoolTermConnection: async () => {
        context.handleSetHardwareStatus('Checking CoolTerm remote socket...');
        await vscode.commands.executeCommand('debug80.testCoolTermConnection');
      },
      handleSendHexViaCoolTerm: async (args) => {
        context.handleSetHardwareStatus('Checking CoolTerm before sending...');
        await vscode.commands.executeCommand('debug80.sendHexViaCoolTerm', args);
      },
      handleRestartDebug: async () => {
        await vscode.commands.executeCommand('debug80.restartDebug');
      },
      handleSetEntrySource: async () => {
        await vscode.commands.executeCommand('debug80.setEntrySource');
      },
      currentPlatform: context.currentPlatform,
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
      handleRequestProjectStatus: () => {
        context.handleRequestProjectStatus();
        return Promise.resolve();
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
          logger: context.logger,
        });
      },
    });
  };
}
