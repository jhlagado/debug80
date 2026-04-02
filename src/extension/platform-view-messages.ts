/**
 * @file Message routing helpers for the Debug80 platform view webview.
 */

import type { Tec1Message } from '../platforms/tec1/ui-panel-messages';
import type { Tec1gMessage } from '../platforms/tec1g/ui-panel-messages';

export type PlatformViewPlatform = 'tec1' | 'tec1g' | 'simple';

export type PlatformViewMessage = Tec1Message | Tec1gMessage | { type?: string; text?: string };

export interface PlatformViewMessageDependencies {
  currentPlatform: () => PlatformViewPlatform | undefined;
  handleStartDebug: () => PromiseLike<void>;
  handleSerialSendFile: () => PromiseLike<void>;
  handleSerialSave: (text: string) => PromiseLike<void>;
  clearSerialBuffer: (platform: Exclude<PlatformViewPlatform, 'simple'>) => void;
  handleTec1Message: (msg: Tec1Message) => PromiseLike<void>;
  handleTec1gMessage: (msg: Tec1gMessage) => PromiseLike<void>;
}

export async function handlePlatformViewMessage(
  msg: PlatformViewMessage,
  deps: PlatformViewMessageDependencies
): Promise<void> {
  if (msg?.type === 'startDebug') {
    await deps.handleStartDebug();
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
    if (platform === 'tec1' || platform === 'tec1g') {
      deps.clearSerialBuffer(platform);
    }
    return;
  }

  const platform = deps.currentPlatform();
  if (platform === 'tec1') {
    await deps.handleTec1Message(msg as Tec1Message);
    return;
  }
  if (platform === 'tec1g') {
    await deps.handleTec1gMessage(msg as Tec1gMessage);
  }
}
