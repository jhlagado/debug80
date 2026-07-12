/**
 * @file Platform-specific platform-view message delegation.
 */

import type {
  PlatformViewMessage,
  PlatformViewMessageDependencies,
} from './platform-view-message-types';

export async function handleActivePlatformViewMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  const platform = deps.currentPlatform();
  if (platform !== undefined && platform !== 'simple') {
    await deps.handlePlatformMessage(platform, msg);
  }
}

