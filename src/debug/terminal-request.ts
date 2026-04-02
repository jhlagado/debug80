/**
 * @fileoverview Terminal request handlers extracted from the debug adapter.
 */

import { DebugProtocol } from '@vscode/debugprotocol';
import { applyTerminalBreak, applyTerminalInput } from './io-requests';
import type { TerminalState } from './types';

export type TerminalRequestDeps = {
  getTerminalState: () => TerminalState | undefined;
  sendResponse: (response: DebugProtocol.Response) => void;
  sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string) => void;
};

export function handleTerminalInput(
  response: DebugProtocol.Response,
  args: unknown,
  deps: TerminalRequestDeps,
): boolean {
  const terminalState = deps.getTerminalState();
  if (terminalState === undefined) {
    deps.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
    return true;
  }
  applyTerminalInput(args, terminalState);
  deps.sendResponse(response);
  return true;
}

export function handleTerminalBreak(
  response: DebugProtocol.Response,
  deps: TerminalRequestDeps,
): boolean {
  const terminalState = deps.getTerminalState();
  if (terminalState === undefined) {
    deps.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
    return true;
  }
  applyTerminalBreak(terminalState);
  deps.sendResponse(response);
  return true;
}
