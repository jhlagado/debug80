/**
 * @fileoverview Debug adapter UI helpers.
 */

import { OutputEvent, Event as DapEvent } from '@vscode/debugadapter';

export type EventSender = (event: unknown) => void;

export function emitConsoleOutput(
  sendEvent: EventSender,
  message: string,
  options?: { newline?: boolean }
): void {
  const newline = options?.newline !== false;
  const text = newline ? `${message}\n` : message;
  sendEvent(new OutputEvent(text, 'console'));
}

export function emitMainSource(sendEvent: EventSender, sourcePath: string): void {
  sendEvent(new DapEvent('debug80/mainSource', { path: sourcePath }));
}
