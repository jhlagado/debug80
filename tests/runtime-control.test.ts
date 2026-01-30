/**
 * @file Runtime control helpers tests.
 */

import { describe, it, expect } from 'vitest';
import { applyStepInfo, runUntilReturnAsync, runUntilStopAsync } from '../src/debug/runtime-control';
import type { RuntimeControlContext } from '../src/debug/runtime-control';
import type { StepInfo } from '../src/z80/types';
import type { Z80Runtime } from '../src/z80/runtime';

const makeContext = (options?: { pauseRequested?: boolean }): RuntimeControlContext => {
  let callDepth = 0;
  let pauseRequested = options?.pauseRequested ?? false;
  let skipBreakpointOnce: number | null = null;
  let haltNotified = false;
  const events: unknown[] = [];
  const pc = 0x1000;
  const runtime = {
    getPC: () => pc,
    step({ trace }: { trace: StepInfo }) {
      trace.kind = 'ret';
      trace.taken = true;
      return { halted: true, cycles: 1 };
    },
  } as unknown as Z80Runtime;
  return {
    getRuntime: () => runtime,
    getTec1Runtime: () => undefined,
    getTec1gRuntime: () => undefined,
    getActivePlatform: () => 'simple',
    getCallDepth: () => callDepth,
    setCallDepth: (value) => {
      callDepth = value;
    },
    getPauseRequested: () => pauseRequested,
    setPauseRequested: (value) => {
      pauseRequested = value;
    },
    getSkipBreakpointOnce: () => skipBreakpointOnce,
    setSkipBreakpointOnce: (value) => {
      skipBreakpointOnce = value;
    },
    getHaltNotified: () => haltNotified,
    setHaltNotified: (value) => {
      haltNotified = value;
    },
    setLastStopReason: () => {},
    setLastBreakpointAddress: () => {},
    isBreakpointAddress: () => false,
    handleHaltStop: () => {
      events.push('halt');
    },
    sendEvent: (event) => {
      events.push(event);
    },
  };
};

describe('runtime-control', () => {
  it('updates call depth for call/ret traces', () => {
    const context = makeContext();
    const callTrace: StepInfo = { taken: true, kind: 'call' };
    applyStepInfo(context, callTrace);
    expect(context.getCallDepth()).toBe(1);
    const retTrace: StepInfo = { taken: true, kind: 'ret' };
    applyStepInfo(context, retTrace);
    expect(context.getCallDepth()).toBe(0);
  });

  it('stops on pause request', async () => {
    const context = makeContext({ pauseRequested: true });
    await runUntilStopAsync(context);
    expect(context.getPauseRequested()).toBe(false);
  });

  it('returns after a ret when stepping out', async () => {
    const context = makeContext();
    await runUntilReturnAsync(context, 0, 0);
    expect(context.getCallDepth()).toBe(0);
  });
});
