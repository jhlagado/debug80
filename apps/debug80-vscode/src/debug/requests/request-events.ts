import { OutputEvent, StoppedEvent, TerminatedEvent } from '@vscode/debugadapter';
import { emitDebugSessionStatus } from '../session/session-status';

export type RequestEventSender = (event: unknown) => void;

export function emitSourceMapMissing(sendEvent: RequestEventSender): void {
  sendEvent(new OutputEvent('Debug80: Source map missing. Build the target first.\n', 'console'));
}

export function emitConsoleDiagnostic(sendEvent: RequestEventSender, text: string): void {
  sendEvent(new OutputEvent(text.endsWith('\n') ? text : `${text}\n`, 'console'));
}

export function emitInvalidConditionalBreakpoint(
  sendEvent: RequestEventSender,
  condition: string,
  err: unknown
): void {
  sendEvent(new OutputEvent(formatConditionalBreakpointError(condition, err), 'console'));
}

export function emitHaltStopped(sendEvent: RequestEventSender, threadId: number): void {
  emitDebugSessionStatus(sendEvent, 'paused');
  sendEvent(new StoppedEvent('halt', threadId));
}

export function emitStepStopped(sendEvent: RequestEventSender, threadId: number): void {
  sendEvent(new StoppedEvent('step', threadId));
}

export function emitTerminated(sendEvent: RequestEventSender): void {
  sendEvent(new TerminatedEvent());
}

function formatConditionalBreakpointError(condition: string, err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  return [
    `Debug80: Invalid conditional breakpoint expression "${condition}".`,
    `Reason: ${detail}`,
    'Use registers, flags, symbols, memory reads such as [PACMO_LIVES], and comparisons such as BC = $1001.',
    '',
  ].join('\n');
}
