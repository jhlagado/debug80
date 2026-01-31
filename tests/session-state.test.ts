/**
 * @file Session state tests.
 */

import { describe, it, expect } from 'vitest';
import { createSessionState, resetSessionState } from '../src/debug/session-state';

describe('session-state', () => {
  it('resets mutable state to defaults', () => {
    const state = createSessionState();
    state.runState.haltNotified = true;
    state.symbolAnchors.push({ symbol: 'X', address: 1, file: 'x', line: 1 });
    state.symbolList.push({ name: 'X', address: 1 });
    state.sourceRoots.push('tmp');
    state.baseDir = '/tmp';
    state.runState.lastBreakpointAddress = 1234;
    state.runState.skipBreakpointOnce = 5678;
    state.runState.pauseRequested = true;
    state.runState.stepOverMaxInstructions = 99;
    state.runState.stepOutMaxInstructions = 88;

    resetSessionState(state);

    expect(state.runState.haltNotified).toBe(false);
    expect(state.symbolAnchors.length).toBe(0);
    expect(state.symbolList.length).toBe(0);
    expect(state.sourceRoots.length).toBe(0);
    expect(state.baseDir).toBe(process.cwd());
    expect(state.runState.lastBreakpointAddress).toBeNull();
    expect(state.runState.skipBreakpointOnce).toBeNull();
    expect(state.runState.pauseRequested).toBe(false);
    expect(state.runState.stepOverMaxInstructions).toBe(0);
    expect(state.runState.stepOutMaxInstructions).toBe(0);
  });
});
