/**
 * @file Project and build-session platform-view message handlers.
 */

import {
  contractUpdateModeFrom,
  platformFrom,
  registerContractsModeFrom,
  symbolCaseModeFrom,
  rootPathFrom,
  targetNameFrom,
  type PlatformViewMessage,
  type PlatformViewMessageDependencies,
} from './platform-view-message-types';

type ProjectMessageHandler = (
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
) => Promise<void>;

const PROJECT_MESSAGE_HANDLERS: Record<string, ProjectMessageHandler> = {
  requestProjectStatus: async (_msg, deps) => deps.handleRequestProjectStatus(),
  createProject: handleCreateProjectMessage,
  selectProject: handleSelectProjectMessage,
  openWorkspaceFolder: handleOpenWorkspaceFolderMessage,
  configureProject: async (_msg, deps) => deps.handleConfigureProject(),
  saveProjectConfig: handleSaveProjectConfigMessage,
  setStopOnEntry: handleSetStopOnEntryMessage,
  setAzmOptions: handleSetAzmOptionsMessage,
  setAzmSymbolCase: handleSetAzmSymbolCaseMessage,
  selectTarget: handleSelectTargetMessage,
  addTarget: handleAddTargetMessage,
  removeTarget: handleRemoveTargetMessage,
  sendHexViaCoolTerm: handleSendHexViaCoolTermMessage,
  testCoolTermConnection: async (_msg, deps) => deps.handleTestCoolTermConnection(),
  restartDebug: async (_msg, deps) => deps.handleRestartDebug(),
  setEntrySource: async (_msg, deps) => deps.handleSetEntrySource(),
  startDebug: handleStartDebugMessage,
};

export async function handleProjectViewMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<boolean> {
  const type = typeof msg?.type === 'string' ? msg.type : undefined;
  const handler = type !== undefined ? PROJECT_MESSAGE_HANDLERS[type] : undefined;
  if (handler === undefined) {
    return false;
  }
  await handler(msg, deps);
  return true;
}

async function handleCreateProjectMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const rootPath = rootPathFrom(msg);
  const platformRaw = (msg as { platform?: unknown }).platform;
  const platform =
    typeof platformRaw === 'string' && platformRaw.length > 0 ? platformRaw : undefined;
  await deps.handleCreateProject({
    ...(rootPath !== undefined ? { rootPath } : {}),
    ...(platform !== undefined ? { platform } : {}),
  });
}

async function handleSelectProjectMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const rootPath = rootPathFrom(msg);
  const platform = platformFrom(msg);
  await deps.handleSelectProject({
    ...(rootPath !== undefined ? { rootPath } : {}),
    ...(platform !== undefined ? { platform } : {}),
  });
}

async function handleOpenWorkspaceFolderMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const platform = platformFrom(msg);
  await deps.handleOpenWorkspaceFolder(platform !== undefined ? { platform } : undefined);
}

async function handleSaveProjectConfigMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const platform = (msg as { platform?: unknown }).platform;
  if (typeof platform === 'string') {
    await deps.handleSaveProjectConfig(platform);
  }
}

async function handleSetStopOnEntryMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const stopOnEntry = (msg as { stopOnEntry?: unknown }).stopOnEntry;
  if (typeof stopOnEntry === 'boolean') {
    await deps.handleSetStopOnEntry(stopOnEntry);
  }
}

async function handleSetAzmOptionsMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const registerContractsMode = registerContractsModeFrom(
    (msg as { registerContractsMode?: unknown }).registerContractsMode
  );
  const contractUpdateMode = contractUpdateModeFrom(
    (msg as { contractUpdateMode?: unknown }).contractUpdateMode
  );
  if (registerContractsMode !== undefined && contractUpdateMode !== undefined) {
    await deps.handleSetAzmOptions(registerContractsMode, contractUpdateMode);
  }
}

async function handleSetAzmSymbolCaseMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const symbolCase = symbolCaseModeFrom((msg as { symbolCase?: unknown }).symbolCase);
  if (symbolCase !== undefined) {
    await deps.handleSetAzmSymbolCase(symbolCase);
  }
}

async function handleSelectTargetMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const rootPath = rootPathFrom(msg);
  const targetName = targetNameFrom(msg);
  await deps.handleSelectTarget({
    ...(rootPath !== undefined ? { rootPath } : {}),
    ...(targetName !== undefined ? { targetName } : {}),
  });
}

async function handleAddTargetMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const rootPath = rootPathFrom(msg);
  await deps.handleAddTarget(rootPath !== undefined ? { rootPath } : undefined);
}

async function handleRemoveTargetMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const rootPath = rootPathFrom(msg);
  const targetName = targetNameFrom(msg);
  await deps.handleRemoveTarget({
    ...(rootPath !== undefined ? { rootPath } : {}),
    ...(targetName !== undefined ? { targetName } : {}),
  });
}

async function handleSendHexViaCoolTermMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const rootPath = rootPathFrom(msg);
  const targetName = targetNameFrom(msg);
  await deps.handleSendHexViaCoolTerm({
    ...(rootPath !== undefined ? { rootPath } : {}),
    ...(targetName !== undefined ? { targetName } : {}),
  });
}

async function handleStartDebugMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const rootPath = rootPathFrom(msg);
  await deps.handleStartDebug(rootPath !== undefined ? { rootPath } : undefined);
}
