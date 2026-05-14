/**
 * @file Debug session state helpers for the Debug80 platform view.
 */

import type * as vscode from 'vscode';
import type { DebugSessionStatus } from '../debug/session/session-status';

export interface PlatformViewSessionState {
  currentSession: vscode.DebugSession | undefined;
  currentSessionId: string | undefined;
  sessionStatus: DebugSessionStatus;
}

/**
 * Creates the provider's initial debug session state.
 */
export function createPlatformViewSessionState(): PlatformViewSessionState {
  return {
    currentSession: undefined,
    currentSessionId: undefined,
    sessionStatus: 'not running',
  };
}

/**
 * Tracks a newly associated platform debug session.
 */
export function setPlatformViewSession(
  state: PlatformViewSessionState,
  session: vscode.DebugSession
): void {
  state.currentSession = session;
  state.currentSessionId = session.id;
}

/**
 * Clears the currently tracked platform debug session.
 */
export function clearPlatformViewSession(state: PlatformViewSessionState): void {
  state.currentSession = undefined;
  state.currentSessionId = undefined;
}

/**
 * Updates the tracked session status.
 */
export function setPlatformViewSessionStatus(
  state: PlatformViewSessionState,
  status: DebugSessionStatus
): void {
  state.sessionStatus = status;
}

/**
 * Returns true when an incoming event belongs to the tracked session.
 */
export function isCurrentPlatformViewSession(
  state: PlatformViewSessionState,
  sessionId: string
): boolean {
  return state.currentSessionId === sessionId;
}

/**
 * Returns true when an optional event session id should be accepted.
 */
export function shouldAcceptPlatformViewSession(
  state: PlatformViewSessionState,
  sessionId?: string
): boolean {
  if (sessionId === undefined || state.currentSessionId === undefined) {
    return true;
  }
  return state.currentSessionId === sessionId;
}

/**
 * Resolves the best debug session for platform webview requests.
 */
export function resolvePlatformViewDebugSession(
  state: PlatformViewSessionState,
  activeSession: vscode.DebugSession | undefined
): vscode.DebugSession | undefined {
  return state.currentSession ?? activeSession;
}

/**
 * Builds the session status message for the webview.
 */
export function buildPlatformViewSessionStatusMessage(
  state: PlatformViewSessionState
): Record<string, unknown> {
  return { type: 'sessionStatus', status: state.sessionStatus };
}
