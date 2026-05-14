/**
 * @file Platform view debug session state helper tests.
 */

import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import {
  buildPlatformViewSessionStatusMessage,
  clearPlatformViewSession,
  createPlatformViewSessionState,
  isCurrentPlatformViewSession,
  resolvePlatformViewDebugSession,
  setPlatformViewSession,
  setPlatformViewSessionStatus,
  shouldAcceptPlatformViewSession,
} from '../../src/extension/platform-view-session-state';

describe('platform-view-session-state', () => {
  it('tracks and clears the current debug session', () => {
    const state = createPlatformViewSessionState();
    const session = createSession('session-1');

    setPlatformViewSession(state, session);

    expect(state.currentSession).toBe(session);
    expect(state.currentSessionId).toBe('session-1');
    expect(isCurrentPlatformViewSession(state, 'session-1')).toBe(true);
    expect(isCurrentPlatformViewSession(state, 'session-2')).toBe(false);

    clearPlatformViewSession(state);

    expect(state.currentSession).toBeUndefined();
    expect(state.currentSessionId).toBeUndefined();
  });

  it('accepts unscoped events and filters scoped events by tracked session id', () => {
    const state = createPlatformViewSessionState();

    expect(shouldAcceptPlatformViewSession(state)).toBe(true);
    expect(shouldAcceptPlatformViewSession(state, 'session-1')).toBe(true);

    setPlatformViewSession(state, createSession('session-1'));

    expect(shouldAcceptPlatformViewSession(state)).toBe(true);
    expect(shouldAcceptPlatformViewSession(state, 'session-1')).toBe(true);
    expect(shouldAcceptPlatformViewSession(state, 'session-2')).toBe(false);
  });

  it('prefers the tracked session over the active debug session', () => {
    const state = createPlatformViewSessionState();
    const tracked = createSession('tracked');
    const active = createSession('active');

    expect(resolvePlatformViewDebugSession(state, active)).toBe(active);

    setPlatformViewSession(state, tracked);

    expect(resolvePlatformViewDebugSession(state, active)).toBe(tracked);
  });

  it('builds session status messages from tracked status', () => {
    const state = createPlatformViewSessionState();

    expect(buildPlatformViewSessionStatusMessage(state)).toEqual({
      type: 'sessionStatus',
      status: 'not running',
    });

    setPlatformViewSessionStatus(state, 'running');

    expect(buildPlatformViewSessionStatusMessage(state)).toEqual({
      type: 'sessionStatus',
      status: 'running',
    });
  });
});

function createSession(id: string): vscode.DebugSession {
  return { id, type: 'z80' } as vscode.DebugSession;
}
