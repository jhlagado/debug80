/**
 * @file Serial platform-view message handlers.
 */

import type {
  PlatformViewMessage,
  PlatformViewMessageDependencies,
} from './platform-view-message-types';

export async function handleSerialViewMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<boolean> {
  if (msg?.type === 'serialSendFile') {
    await deps.handleSerialSendFile();
    return true;
  }
  if (msg?.type === 'serialSave' && typeof msg.text === 'string') {
    await deps.handleSerialSave(msg.text);
    return true;
  }
  if (msg?.type === 'serialClear') {
    const platform = deps.currentPlatform();
    if (platform !== undefined && platform !== 'simple') {
      deps.clearSerialBuffer(platform);
    }
    return true;
  }
  return false;
}

