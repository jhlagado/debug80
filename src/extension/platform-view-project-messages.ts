/**
 * @file Project and build-session platform-view message handlers.
 */

import {
  contractUpdateModeFrom,
  registerCareModeFrom,
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
  openWorkspaceFolder: async (_msg, deps) => deps.handleOpenWorkspaceFolder(),
  configureProject: async (_msg, deps) => deps.handleConfigureProject(),
  saveProjectConfig: handleSaveProjectConfigMessage,
  setStopOnEntry: handleSetStopOnEntryMessage,
  setAzmOptions: handleSetAzmOptionsMessage,
  selectTarget: handleSelectTargetMessage,
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
  await deps.handleSelectProject(rootPath !== undefined ? { rootPath } : undefined);
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
  const registerCareMode = registerCareModeFrom(
    (msg as { registerCareMode?: unknown }).registerCareMode
  );
  const contractUpdateMode = contractUpdateModeFrom(
    (msg as { contractUpdateMode?: unknown }).contractUpdateMode
  );
  if (registerCareMode !== undefined && contractUpdateMode !== undefined) {
    await deps.handleSetAzmOptions(registerCareMode, contractUpdateMode);
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

