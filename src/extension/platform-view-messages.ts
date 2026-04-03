/**
 * @file Message routing helpers for the Debug80 platform view webview.
 */

export type PlatformViewPlatform = string;

export type PlatformViewMessage = {
  type?: string;
  text?: string;
  [key: string]: unknown;
};

export interface PlatformViewMessageDependencies {
  currentPlatform: () => PlatformViewPlatform | undefined;
  handleStartDebug: () => PromiseLike<void>;
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
