/**
 * @fileoverview Debug adapter UI helpers.
 */

import { OutputEvent, Event as DapEvent } from '@vscode/debugadapter';
import type { AssemblyDiagnostic } from './assembler';

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

/** Notifies the host to show an assembly error squiggle without focusing the editor. */
export function emitAssemblyFailed(
  sendEvent: EventSender,
  payload: { diagnostic?: AssemblyDiagnostic; error?: string }
): void {
  sendEvent(new DapEvent('debug80/assemblyFailed', payload));
}
