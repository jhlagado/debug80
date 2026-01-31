/**
 * @file Runtime control helpers tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { OutputEvent, StoppedEvent } from '@vscode/debugadapter';
import { applyStepInfo, runUntilReturnAsync, runUntilStopAsync } from '../../src/debug/runtime-control';
import type { RuntimeControlContext } from '../../src/debug/runtime-control';
import type { StepInfo } from '../../src/z80/types';
import type { Z80Runtime } from '../../src/z80/runtime';

const makeContext = (options?: {
  pauseRequested?: boolean;
  pc?: number;
  runtimeStep?: (trace: StepInfo) => { halted: boolean; cycles?: number };
  isBreakpointAddress?: (address: number | null) => boolean;
}): RuntimeControlContext => {
  let callDepth = 0;
  let pauseRequested = options?.pauseRequested ?? false;
  let skipBreakpointOnce: number | null = null;
  let haltNotified = false;
  const events: unknown[] = [];
  const pc = options?.pc ?? 0x1000;
  const runtime = {
    getPC: () => pc,
    step({ trace }: { trace: StepInfo }) {
      if (options?.runtimeStep) {
        return options.runtimeStep(trace);
      }
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
    isBreakpointAddress: (address) => options?.isBreakpointAddress?.(address) ?? false,
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
    const ignoredTrace: StepInfo = { taken: false, kind: 'call' };
    applyStepInfo(context, ignoredTrace);
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

  it('skips one breakpoint address and halts', async () => {
    const context = makeContext({
      pc: 0x2000,
      runtimeStep: (trace) => {
        trace.kind = 'nop';
        trace.taken = true;
        return { halted: true, cycles: 2 };
      },
    });
    context.setSkipBreakpointOnce(0x2000);
    await runUntilStopAsync(context);
    expect(context.getSkipBreakpointOnce()).toBeNull();
  });

  it('stops on breakpoint address', async () => {
    let stopReason: string | undefined;
    let stopAddress: number | null | undefined;
    const context = makeContext({
      pc: 0x1234,
      isBreakpointAddress: () => true,
      runtimeStep: (trace) => {
        trace.kind = 'nop';
        trace.taken = true;
        return { halted: false, cycles: 1 };
      },
    });
    context.setLastStopReason = (reason) => {
      stopReason = reason;
    };
    context.setLastBreakpointAddress = (address) => {
      stopAddress = address;
    };
    const events: unknown[] = [];
    context.sendEvent = (event) => events.push(event);
    await runUntilStopAsync(context);
    expect(stopReason).toBe('breakpoint');
    expect(stopAddress).toBe(0x1234);
    expect(events.some((e) => e instanceof StoppedEvent)).toBe(true);
  });

  it('stops on extra breakpoint', async () => {
    let stopReason: string | undefined;
    const context = makeContext({
      pc: 0x4000,
      runtimeStep: (trace) => {
        trace.kind = 'nop';
        trace.taken = true;
        return { halted: false, cycles: 1 };
      },
    });
    context.setLastStopReason = (reason) => {
      stopReason = reason;
    };
    const events: unknown[] = [];
    context.sendEvent = (event) => events.push(event);
    await runUntilStopAsync(context, { extraBreakpoints: new Set([0x4000]) });
    expect(stopReason).toBe('step');
    expect(events.some((e) => e instanceof StoppedEvent)).toBe(true);
  });

  it('stops after hitting max instructions', async () => {
    const context = makeContext({
      pc: 0x5000,
      runtimeStep: (trace) => {
        trace.kind = 'nop';
        trace.taken = true;
        return { halted: false, cycles: 1 };
      },
    });
    const events: unknown[] = [];
    context.sendEvent = (event) => events.push(event);
    await runUntilStopAsync(context, { maxInstructions: 1, limitLabel: 'step over' });
    expect(events.some((e) => e instanceof OutputEvent)).toBe(true);
    expect(events.some((e) => e instanceof StoppedEvent)).toBe(true);
  });

  it('stops step-out on instruction limit', async () => {
    const context = makeContext({
      pc: 0x6000,
      runtimeStep: (trace) => {
        trace.kind = 'call';
        trace.taken = true;
        return { halted: false, cycles: 1 };
      },
    });
    const events: unknown[] = [];
    context.sendEvent = (event) => events.push(event);
    await runUntilReturnAsync(context, 1, 1);
    expect(events.some((e) => e instanceof OutputEvent)).toBe(true);
    expect(events.some((e) => e instanceof StoppedEvent)).toBe(true);
  });

  it('pauses during step-out', async () => {
    const context = makeContext({
      pauseRequested: true,
      runtimeStep: (trace) => {
        trace.kind = 'nop';
        trace.taken = true;
        return { halted: false, cycles: 1 };
      },
    });
    await runUntilReturnAsync(context, 0, 0);
    expect(context.getPauseRequested()).toBe(false);
  });

  it('stops on breakpoint during step-out', async () => {
    let stopReason: string | undefined;
    const context = makeContext({
      pc: 0x7000,
      isBreakpointAddress: () => true,
      runtimeStep: (trace) => {
        trace.kind = 'nop';
        trace.taken = true;
        return { halted: false, cycles: 1 };
      },
    });
    context.setLastStopReason = (reason) => {
      stopReason = reason;
    };
    await runUntilReturnAsync(context, 0, 0);
    expect(stopReason).toBe('breakpoint');
  });

  it('stops on ret when call depth drops below baseline', async () => {
    const context = makeContext({
      runtimeStep: (trace) => {
        trace.kind = 'ret';
        trace.taken = true;
        return { halted: false, cycles: 1 };
      },
    });
    context.setCallDepth(0);
    await runUntilReturnAsync(context, 1, 0);
    expect(context.getCallDepth()).toBe(0);
  });

  it('yields when running on tec1 with yieldMs', async () => {
    vi.useFakeTimers();
    let runtimeCalls = 0;
    const runtime = {
      getPC: () => 0x8000,
      step({ trace }: { trace: StepInfo }) {
        trace.kind = 'nop';
        trace.taken = true;
        return { halted: false, cycles: 1 };
      },
    } as unknown as Z80Runtime;
    const tec1Runtime = {
      state: { yieldMs: 1, clockHz: 0 },
      recordCycles: () => undefined,
      silenceSpeaker: () => undefined,
    };
    const ctx: RuntimeControlContext = {
      getRuntime: () => {
        runtimeCalls += 1;
        return runtimeCalls <= 1000 ? runtime : undefined;
      },
      getTec1Runtime: () => tec1Runtime as unknown as never,
      getTec1gRuntime: () => undefined,
      getActivePlatform: () => 'tec1',
      getCallDepth: () => 0,
      setCallDepth: () => undefined,
      getPauseRequested: () => false,
      setPauseRequested: () => undefined,
      getSkipBreakpointOnce: () => null,
      setSkipBreakpointOnce: () => undefined,
      getHaltNotified: () => false,
      setHaltNotified: () => undefined,
      setLastStopReason: () => undefined,
      setLastBreakpointAddress: () => undefined,
      isBreakpointAddress: () => false,
      handleHaltStop: () => undefined,
      sendEvent: () => undefined,
    };
    const promise = runUntilStopAsync(ctx);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    vi.useRealTimers();
  });

  it('returns early when runtime is unavailable', async () => {
    const ctx: RuntimeControlContext = {
      getRuntime: () => undefined,
      getTec1Runtime: () => undefined,
      getTec1gRuntime: () => undefined,
      getActivePlatform: () => 'simple',
      getCallDepth: () => 0,
      setCallDepth: () => undefined,
      getPauseRequested: () => false,
      setPauseRequested: () => undefined,
      getSkipBreakpointOnce: () => null,
      setSkipBreakpointOnce: () => undefined,
      getHaltNotified: () => false,
      setHaltNotified: () => undefined,
      setLastStopReason: () => undefined,
      setLastBreakpointAddress: () => undefined,
      isBreakpointAddress: () => false,
      handleHaltStop: () => undefined,
      sendEvent: () => undefined,
    };
    await runUntilStopAsync(ctx);
    await runUntilReturnAsync(ctx, 0, 0);
  });
});
