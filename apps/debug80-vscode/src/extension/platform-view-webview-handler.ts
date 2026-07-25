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
  /**
   * Records a panel action before dispatching it. Without this a click that
   * never reaches a command is indistinguishable from a command that fails
   * silently, which makes "the button does nothing" reports unactionable.
   */
  const dispatch = async (action: string, command: string, ...args: unknown[]): Promise<void> => {
    context.logger.info(`panel action ${action} -> ${command}`, ...args);
    await vscode.commands.executeCommand(command, ...args);
  };

  return async (msg: PlatformViewInboundMessage): Promise<void> => {
    await handlePlatformViewMessage(msg, {
      handleCreateProject: async (args) => {
        await dispatch('createProject', 'debug80.createProject', args);
      },
      handleOpenWorkspaceFolder: async (args) => {
        if (args === undefined) {
          await vscode.commands.executeCommand('debug80.addWorkspaceFolder');
          return;
        }
        await vscode.commands.executeCommand('debug80.addWorkspaceFolder', args);
      },
      handleSelectProject: async (args) => {
        await dispatch('selectProject', 'debug80.selectWorkspaceFolder', args);
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
        await dispatch('selectTarget', 'debug80.selectTarget', args);
      },
      handleAddTarget: async (args) => {
        await dispatch('addTarget', 'debug80.addTarget', args);
      },
      handleRemoveTarget: async (args) => {
        await dispatch('removeTarget', 'debug80.removeTarget', args);
      },
      handleTestCoolTermConnection: async () => {
        context.handleSetHardwareStatus('Checking CoolTerm remote socket...');
        await dispatch('testCoolTerm', 'debug80.testCoolTermConnection');
      },
      handleSendHexViaCoolTerm: async (args) => {
        context.handleSetHardwareStatus('Checking CoolTerm before sending...');
        await dispatch('sendHex', 'debug80.sendHexViaCoolTerm', args);
      },
      handleRestartDebug: async () => {
        await dispatch('run', 'debug80.restartDebug');
      },
      handleBuildTarget: async () => {
        await dispatch('build', 'debug80.buildTarget');
      },
      handleRemoveWorkspaceFolder: async (rootPath) => {
        await dispatch('removeWorkspaceFolder', 'debug80.removeWorkspaceFolder', { rootPath });
      },
      handleSetEntrySource: async () => {
        await dispatch('setEntrySource', 'debug80.setEntrySource');
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
