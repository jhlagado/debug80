/**
 * @file Session state tests.
 */

import { describe, it, expect } from 'vitest';
import * as os from 'os';
import { createSessionState, resetSessionState } from '../../src/debug/session/session-state';
import type { CpuStateSnapshot } from '@jhlagado/debug80-runtime/z80/runtime';

function createEntryCpuState(): CpuStateSnapshot {
  return {
    pc: 0x4000,
    sp: 0xd000,
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    e: 0,
    h: 0,
    l: 0,
    a_prime: 0,
    b_prime: 0,
    c_prime: 0,
    d_prime: 0,
    e_prime: 0,
    h_prime: 0,
    l_prime: 0,
    ix: 0,
    iy: 0,
    i: 0,
    r: 0,
    flags: { S: 0, Z: 0, Y: 0, H: 0, X: 0, P: 0, N: 0, C: 0 },
    flags_prime: { S: 0, Z: 0, Y: 0, H: 0, X: 0, P: 0, N: 0, C: 0 },
    imode: 0,
    iff1: 0,
    iff2: 0,
    halted: false,
    do_delayed_di: false,
    do_delayed_ei: false,
    cycle_counter: 0,
  };
}

describe('session-state', () => {
  it('resets mutable state to defaults', () => {
    const state = createSessionState();
    state.runState.haltNotified = true;
    state.symbolAnchors.push({ symbol: 'X', address: 1, file: 'x', line: 1 });
    state.symbolList.push({ name: 'X', address: 1 });
    state.sourceRoots.push('tmp');
    state.baseDir = os.tmpdir();
    state.runState.lastBreakpointAddress = 1234;
    state.runState.skipBreakpointOnce = 5678;
    state.runState.pauseRequested = true;
    state.runState.stepOverMaxInstructions = 99;
    state.runState.stepOutMaxInstructions = 88;
    state.restartCaptureAddress = 0x4000;
    state.entryCpuState = createEntryCpuState();
    state.runState.lastBreakpointAddressSpace = { kind: 'tec1g-expansion', physicalBank: 0 };
    state.runState.skipBreakpointAddressSpace = { kind: 'tec1g-expansion', physicalBank: 0 };

    resetSessionState(state);

    expect(state.runState.haltNotified).toBe(false);
    expect(state.symbolAnchors.length).toBe(0);
    expect(state.symbolList.length).toBe(0);
    expect(state.sourceRoots.length).toBe(0);
    expect(state.baseDir).toBe(process.cwd());
    expect(state.runState.lastBreakpointAddress).toBeNull();
    expect(state.runState.lastBreakpointAddressSpace).toBeUndefined();
    expect(state.runState.skipBreakpointOnce).toBeNull();
    expect(state.runState.skipBreakpointAddressSpace).toBeUndefined();
    expect(state.runState.pauseRequested).toBe(false);
    expect(state.runState.stepOverMaxInstructions).toBe(0);
    expect(state.runState.stepOutMaxInstructions).toBe(0);
    expect(state.restartCaptureAddress).toBeUndefined();
    expect(state.entryCpuState).toBeUndefined();
  });

  it('preserves runState object identity across reset', () => {
    const state = createSessionState();
    const captured = state.runState;
    state.runState.haltNotified = true;

    resetSessionState(state);

    expect(state.runState).toBe(captured);
    expect(captured.haltNotified).toBe(false);
  });

  it('preserves desired TEC-1G TMS9918 panel state across launch reset', () => {
    const state = createSessionState();
    state.ui.tec1gTms9918Active = true;
    state.ui.tec1gTms9918VideoStandard = 'ntsc';

    resetSessionState(state);

    expect(state.ui.tec1gTms9918Active).toBe(true);
    expect(state.ui.tec1gTms9918VideoStandard).toBe('ntsc');
  });
});
