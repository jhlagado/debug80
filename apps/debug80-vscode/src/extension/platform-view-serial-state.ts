import {
  appendSerialText,
  clearSerialBuffer,
  createSerialBuffer,
  type SerialBuffer,
} from '../platforms/panel-serial';
import type { PlatformId } from '../contracts/platform-view';

export { createSerialBuffer, type SerialBuffer };

export type PlatformViewSerialMessage =
  | { type: 'serial'; text: string }
  | { type: 'serialClear' }
  | { type: 'serialInit'; text: string };

export function appendPlatformSerial(
  serialBuffer: SerialBuffer,
  text: string,
  options: { platform: PlatformId; currentPlatform: PlatformId | undefined }
): PlatformViewSerialMessage | undefined {
  if (text.length === 0) {
    return undefined;
  }
  appendSerialText(serialBuffer, text);
  return options.currentPlatform === options.platform ? { type: 'serial', text } : undefined;
}

export function clearPlatformSerial(serialBuffer: SerialBuffer): void {
  clearSerialBuffer(serialBuffer);
}

export function buildSerialInitMessage(
  serialBuffer: SerialBuffer
): PlatformViewSerialMessage | undefined {
  return serialBuffer.text.length > 0 ? { type: 'serialInit', text: serialBuffer.text } : undefined;
}
