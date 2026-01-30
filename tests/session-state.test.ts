/**
 * @file Session state tests.
 */

import { describe, it, expect } from 'vitest';
import { createSessionState, resetSessionState } from '../src/debug/session-state';

describe('session-state', () => {
  it('resets mutable state to defaults', () => {
    const state = createSessionState();
    state.haltNotified = true;
    state.symbolAnchors.push({ symbol: 'X', address: 1, file: 'x', line: 1 });
    state.symbolList.push({ name: 'X', address: 1 });
    state.sourceRoots.push('tmp');
    state.baseDir = '/tmp';
    state.lastBreakpointAddress = 1234;
    state.skipBreakpointOnce = 5678;
    state.pauseRequested = true;
    state.stepOverMaxInstructions = 99;
    state.stepOutMaxInstructions = 88;

    resetSessionState(state);

    expect(state.haltNotified).toBe(false);
    expect(state.symbolAnchors.length).toBe(0);
    expect(state.symbolList.length).toBe(0);
    expect(state.sourceRoots.length).toBe(0);
    expect(state.baseDir).toBe(process.cwd());
    expect(state.lastBreakpointAddress).toBeNull();
    expect(state.skipBreakpointOnce).toBeNull();
    expect(state.pauseRequested).toBe(false);
    expect(state.stepOverMaxInstructions).toBe(0);
    expect(state.stepOutMaxInstructions).toBe(0);
  });
});
