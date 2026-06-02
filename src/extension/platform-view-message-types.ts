/**
 * @file Shared types and parsing helpers for Debug80 platform-view messages.
 */

import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterCareMode,
  PlatformId as PlatformViewPlatform,
  PlatformViewInboundMessage as PlatformViewMessage,
} from '../contracts/platform-view';

export type { PlatformViewPlatform, PlatformViewMessage };

export interface PlatformViewMessageDependencies {
  handleCreateProject: (args?: { rootPath?: string; platform?: string }) => PromiseLike<void>;
  handleOpenWorkspaceFolder: () => PromiseLike<void>;
  handleSelectProject: (args?: { rootPath?: string }) => PromiseLike<void>;
  handleConfigureProject: () => PromiseLike<void>;
  handleSaveProjectConfig: (platform: string) => PromiseLike<void>;
  handleSetStopOnEntry: (value: boolean) => PromiseLike<void>;
  handleSetAzmOptions: (
    registerCareMode: AzmPanelRegisterCareMode,
    contractUpdateMode: AzmPanelContractUpdateMode
  ) => PromiseLike<void>;
  handleSelectTarget: (args?: { rootPath?: string; targetName?: string }) => PromiseLike<void>;
  handleTestCoolTermConnection: () => PromiseLike<void>;
  handleSendHexViaCoolTerm: (args?: {
    rootPath?: string;
    targetName?: string;
  }) => PromiseLike<void>;
  handleRestartDebug: () => PromiseLike<void>;
  handleSetEntrySource: () => PromiseLike<void>;
  currentPlatform: () => PlatformViewPlatform | undefined;
  handleStartDebug: (args?: { rootPath?: string }) => PromiseLike<void>;
  handleSerialSendFile: () => PromiseLike<void>;
  handleSerialSave: (text: string) => PromiseLike<void>;
  clearSerialBuffer: (platform: PlatformViewPlatform) => void;
  handleRequestProjectStatus: () => PromiseLike<void>;
  handlePlatformMessage: (
    platform: PlatformViewPlatform,
    msg: PlatformViewMessage
  ) => PromiseLike<void>;
}

export function rootPathFrom(msg: PlatformViewMessage): string | undefined {
  const value = (msg as { rootPath?: unknown }).rootPath;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function targetNameFrom(msg: PlatformViewMessage): string | undefined {
  const value = (msg as { targetName?: unknown }).targetName;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function registerCareModeFrom(value: unknown): AzmPanelRegisterCareMode | undefined {
  return value === 'enforce' || value === 'audit' || value === 'off' ? value : undefined;
}

export function contractUpdateModeFrom(value: unknown): AzmPanelContractUpdateMode | undefined {
  return value === 'ask' || value === 'auto' || value === 'never' ? value : undefined;
}

