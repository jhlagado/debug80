/**
 * @file Message routing helpers for the Debug80 platform view webview.
 */

import { handleActivePlatformViewMessage } from './platform-view-platform-messages';
import { handleProjectViewMessage } from './platform-view-project-messages';
import { handleSerialViewMessage } from './platform-view-serial-messages';
import type {
  PlatformViewMessage,
  PlatformViewMessageDependencies,
  PlatformViewPlatform,
} from './platform-view-message-types';

export type { PlatformViewPlatform, PlatformViewMessage, PlatformViewMessageDependencies };

export async function handlePlatformViewMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  if (await handleProjectViewMessage(msg, deps)) {
    return;
  }
  if (await handleSerialViewMessage(msg, deps)) {
    return;
  }

  await handleActivePlatformViewMessage(msg, deps);
}
