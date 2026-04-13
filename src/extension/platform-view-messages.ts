/**
 * @file Message routing helpers for the Debug80 platform view webview.
 */

import type {
  PlatformId as PlatformViewPlatform,
  PlatformViewInboundMessage as PlatformViewMessage,
} from '../contracts/platform-view';
export type { PlatformViewPlatform, PlatformViewMessage };

function rootPathFrom(msg: PlatformViewMessage): string | undefined {
  const value = (msg as { rootPath?: unknown }).rootPath;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function targetNameFrom(msg: PlatformViewMessage): string | undefined {
  const value = (msg as { targetName?: unknown }).targetName;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export interface PlatformViewMessageDependencies {
  handleCreateProject: (args?: { rootPath?: string }) => PromiseLike<void>;
  handleOpenWorkspaceFolder: () => PromiseLike<void>;
  handleSelectProject: (args?: { rootPath?: string }) => PromiseLike<void>;
  handleConfigureProject: () => PromiseLike<void>;
  handleSelectTarget: (args?: { rootPath?: string; targetName?: string }) => PromiseLike<void>;
  handleRestartDebug: () => PromiseLike<void>;
  handleSetEntrySource: () => PromiseLike<void>;
  currentPlatform: () => PlatformViewPlatform | undefined;
  handleStartDebug: (args?: { rootPath?: string }) => PromiseLike<void>;
  handleSerialSendFile: () => PromiseLike<void>;
  handleSerialSave: (text: string) => PromiseLike<void>;
  clearSerialBuffer: (platform: PlatformViewPlatform) => void;
  handlePlatformMessage: (
    platform: PlatformViewPlatform,
    msg: PlatformViewMessage
  ) => PromiseLike<void>;
}

export async function handlePlatformViewMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  if (msg?.type === 'createProject') {
    const rootPath = rootPathFrom(msg);
    await deps.handleCreateProject(rootPath !== undefined ? { rootPath } : undefined);
    return;
  }
  if (msg?.type === 'selectProject') {
    const rootPath = rootPathFrom(msg);
    await deps.handleSelectProject(rootPath !== undefined ? { rootPath } : undefined);
    return;
  }
  if (msg?.type === 'openWorkspaceFolder') {
    await deps.handleOpenWorkspaceFolder();
    return;
  }
  if (msg?.type === 'configureProject') {
    await deps.handleConfigureProject();
    return;
  }
  if (msg?.type === 'selectTarget') {
    const rootPath = rootPathFrom(msg);
    const targetName = targetNameFrom(msg);
    await deps.handleSelectTarget({
      ...(rootPath !== undefined ? { rootPath } : {}),
      ...(targetName !== undefined ? { targetName } : {}),
    });
    return;
  }
  if (msg?.type === 'restartDebug') {
    await deps.handleRestartDebug();
    return;
  }
  if (msg?.type === 'setEntrySource') {
    await deps.handleSetEntrySource();
    return;
  }
  if (msg?.type === 'startDebug') {
    const rootPath = rootPathFrom(msg);
    await deps.handleStartDebug(rootPath !== undefined ? { rootPath } : undefined);
    return;
  }
  if (msg?.type === 'serialSendFile') {
    await deps.handleSerialSendFile();
    return;
  }
  if (msg?.type === 'serialSave' && typeof msg.text === 'string') {
    await deps.handleSerialSave(msg.text);
    return;
  }
  if (msg?.type === 'serialClear') {
    const platform = deps.currentPlatform();
    if (platform !== undefined && platform !== 'simple') {
      deps.clearSerialBuffer(platform);
    }
    return;
  }

  const platform = deps.currentPlatform();
  if (platform !== undefined && platform !== 'simple') {
    await deps.handlePlatformMessage(platform, msg);
  }
}
