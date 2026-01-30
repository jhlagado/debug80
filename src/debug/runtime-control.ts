/**
 * @fileoverview Runtime execution helpers for stepping and stopping.
 */

import { OutputEvent, StoppedEvent } from '@vscode/debugadapter';
import type { Z80Runtime } from '../z80/runtime';
import type { StepInfo } from '../z80/types';
import type { Tec1Runtime } from '../platforms/tec1/runtime';
import type { Tec1gRuntime } from '../platforms/tec1g/runtime';
import type { StopReason } from './session-state';

export interface RuntimeControlContext {
  getRuntime: () => Z80Runtime | undefined;
  getTec1Runtime: () => Tec1Runtime | undefined;
  getTec1gRuntime: () => Tec1gRuntime | undefined;
  getActivePlatform: () => string;
  getCallDepth: () => number;
  setCallDepth: (value: number) => void;
  getPauseRequested: () => boolean;
  setPauseRequested: (value: boolean) => void;
  getSkipBreakpointOnce: () => number | null;
  setSkipBreakpointOnce: (value: number | null) => void;
  getHaltNotified: () => boolean;
  setHaltNotified: (value: boolean) => void;
  setLastStopReason: (reason: StopReason) => void;
  setLastBreakpointAddress: (address: number | null) => void;
  isBreakpointAddress: (address: number | null) => boolean;
  handleHaltStop: () => void;
  sendEvent: (event: unknown) => void;
}

export function applyStepInfo(context: RuntimeControlContext, trace: StepInfo): void {
  if (!trace.kind || !trace.taken) {
    return;
  }
  if (trace.kind === 'call' || trace.kind === 'rst') {
    context.setCallDepth(context.getCallDepth() + 1);
    return;
  }
  if (trace.kind === 'ret') {
    context.setCallDepth(Math.max(0, context.getCallDepth() - 1));
  }
}

export async function runUntilStopAsync(
  context: RuntimeControlContext,
  options?: {
    extraBreakpoints?: Set<number>;
    maxInstructions?: number;
    limitLabel?: string;
  }
): Promise<void> {
  const runtime = context.getRuntime();
  if (runtime === undefined) {
    return;
  }
  const extraBreakpoints = options?.extraBreakpoints;
  const maxInstructions = options?.maxInstructions;
  const limitLabel = options?.limitLabel ?? 'step';
  const CHUNK = 1000;
  const trace: StepInfo = { taken: false };
  let executed = 0;
  let cyclesSinceThrottle = 0;
  let lastThrottleMs = Date.now();
  const yieldMs =
    context.getActivePlatform() === 'tec1'
      ? (context.getTec1Runtime()?.state.yieldMs ?? 0)
      : context.getActivePlatform() === 'tec1g'
        ? (context.getTec1gRuntime()?.state.yieldMs ?? 0)
        : 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (let i = 0; i < CHUNK; i += 1) {
      const activeRuntime = context.getRuntime();
      if (activeRuntime === undefined) {
        return;
      }
      if (context.getPauseRequested()) {
        context.setPauseRequested(false);
        context.setHaltNotified(false);
        context.setLastStopReason('pause');
        context.setLastBreakpointAddress(null);
        context.getTec1Runtime()?.silenceSpeaker();
        context.getTec1gRuntime()?.silenceSpeaker();
        context.sendEvent(new StoppedEvent('pause', 1));
        return;
      }
      if (
        context.getSkipBreakpointOnce() !== null &&
        activeRuntime.getPC() === context.getSkipBreakpointOnce()
      ) {
        context.setSkipBreakpointOnce(null);
        const stepped = activeRuntime.step({ trace });
        applyStepInfo(context, trace);
        executed += 1;
        cyclesSinceThrottle += stepped.cycles ?? 0;
        context.getTec1Runtime()?.recordCycles(stepped.cycles ?? 0);
        context.getTec1gRuntime()?.recordCycles(stepped.cycles ?? 0);
        if (stepped.halted) {
          context.handleHaltStop();
          return;
        }
        continue;
      }
      const pc = activeRuntime.getPC();
      if (context.isBreakpointAddress(pc)) {
        context.setHaltNotified(false);
        context.setLastStopReason('breakpoint');
        context.setLastBreakpointAddress(pc);
        context.sendEvent(new StoppedEvent('breakpoint', 1));
        return;
      }
      if (extraBreakpoints !== undefined && extraBreakpoints.has(pc)) {
        context.setHaltNotified(false);
        context.setLastStopReason('step');
        context.setLastBreakpointAddress(null);
        context.sendEvent(new StoppedEvent('step', 1));
        return;
      }
      const result = activeRuntime.step({ trace });
      applyStepInfo(context, trace);
      executed += 1;
      cyclesSinceThrottle += result.cycles ?? 0;
      context.getTec1Runtime()?.recordCycles(result.cycles ?? 0);
      context.getTec1gRuntime()?.recordCycles(result.cycles ?? 0);
      if (result.halted) {
        context.handleHaltStop();
        return;
      }
      if (maxInstructions !== undefined && maxInstructions > 0 && executed >= maxInstructions) {
        context.setHaltNotified(false);
        context.setLastStopReason('step');
        context.setLastBreakpointAddress(null);
        context.sendEvent(
          new OutputEvent(
            `Debug80: ${limitLabel} stopped after ${maxInstructions} instructions (target not reached).\n`
          )
        );
        context.sendEvent(new StoppedEvent('step', 1));
        return;
      }
    }
    if (context.getActivePlatform() === 'tec1' || context.getActivePlatform() === 'tec1g') {
      const clockHz =
        context.getActivePlatform() === 'tec1'
          ? (context.getTec1Runtime()?.state.clockHz ?? 0)
          : (context.getTec1gRuntime()?.state.clockHz ?? 0);
      if (clockHz > 0) {
        const targetMs = (cyclesSinceThrottle / clockHz) * 1000;
        const now = Date.now();
        const elapsed = now - lastThrottleMs;
        const waitMs = targetMs - elapsed;
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else if (yieldMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, yieldMs));
        } else {
          await new Promise((resolve) => setImmediate(resolve));
        }
        lastThrottleMs = Date.now();
        cyclesSinceThrottle = 0;
        continue;
      }
    }
    cyclesSinceThrottle = 0;
    lastThrottleMs = Date.now();
    if (yieldMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, yieldMs));
    } else {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

export async function runUntilReturnAsync(
  context: RuntimeControlContext,
  baselineDepth: number,
  maxInstructions: number
): Promise<void> {
  const runtime = context.getRuntime();
  if (runtime === undefined) {
    return;
  }
  const CHUNK = 1000;
  const trace: StepInfo = { taken: false };
  let executed = 0;
  let cyclesSinceThrottle = 0;
  let lastThrottleMs = Date.now();
  const yieldMs =
    context.getActivePlatform() === 'tec1'
      ? (context.getTec1Runtime()?.state.yieldMs ?? 0)
      : context.getActivePlatform() === 'tec1g'
        ? (context.getTec1gRuntime()?.state.yieldMs ?? 0)
        : 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (let i = 0; i < CHUNK; i += 1) {
      const activeRuntime = context.getRuntime();
      if (activeRuntime === undefined) {
        return;
      }
      if (context.getPauseRequested()) {
        context.setPauseRequested(false);
        context.setHaltNotified(false);
        context.setLastStopReason('pause');
        context.setLastBreakpointAddress(null);
        context.getTec1Runtime()?.silenceSpeaker();
        context.getTec1gRuntime()?.silenceSpeaker();
        context.sendEvent(new StoppedEvent('pause', 1));
        return;
      }
      if (
        context.getSkipBreakpointOnce() !== null &&
        activeRuntime.getPC() === context.getSkipBreakpointOnce()
      ) {
        context.setSkipBreakpointOnce(null);
        const stepped = activeRuntime.step({ trace });
        applyStepInfo(context, trace);
        executed += 1;
        cyclesSinceThrottle += stepped.cycles ?? 0;
        if (stepped.halted) {
          context.handleHaltStop();
          return;
        }
      } else {
        const pc = activeRuntime.getPC();
        if (context.isBreakpointAddress(pc)) {
          context.setHaltNotified(false);
          context.setLastStopReason('breakpoint');
          context.setLastBreakpointAddress(pc);
          context.sendEvent(new StoppedEvent('breakpoint', 1));
          return;
        }
        const result = activeRuntime.step({ trace });
        applyStepInfo(context, trace);
        executed += 1;
        cyclesSinceThrottle += result.cycles ?? 0;
        context.getTec1Runtime()?.recordCycles(result.cycles ?? 0);
        context.getTec1gRuntime()?.recordCycles(result.cycles ?? 0);
        if (result.halted) {
          context.handleHaltStop();
          return;
        }
      }

      if (trace.kind === 'ret' && trace.taken) {
        if (baselineDepth === 0 || context.getCallDepth() < baselineDepth) {
          context.setHaltNotified(false);
          context.setLastStopReason('step');
          context.setLastBreakpointAddress(null);
          context.sendEvent(new StoppedEvent('step', 1));
          return;
        }
      }

      if (maxInstructions > 0 && executed >= maxInstructions) {
        context.setHaltNotified(false);
        context.setLastStopReason('step');
        context.setLastBreakpointAddress(null);
        context.sendEvent(
          new OutputEvent(
            `Debug80: step out stopped after ${maxInstructions} instructions (return not observed).\n`
          )
        );
        context.sendEvent(new StoppedEvent('step', 1));
        return;
      }
    }
    if (context.getActivePlatform() === 'tec1' || context.getActivePlatform() === 'tec1g') {
      const clockHz =
        context.getActivePlatform() === 'tec1'
          ? (context.getTec1Runtime()?.state.clockHz ?? 0)
          : (context.getTec1gRuntime()?.state.clockHz ?? 0);
      if (clockHz > 0) {
        const targetMs = (cyclesSinceThrottle / clockHz) * 1000;
        const now = Date.now();
        const elapsed = now - lastThrottleMs;
        const waitMs = targetMs - elapsed;
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else if (yieldMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, yieldMs));
        } else {
          await new Promise((resolve) => setImmediate(resolve));
        }
        lastThrottleMs = Date.now();
        cyclesSinceThrottle = 0;
        continue;
      }
    }
    cyclesSinceThrottle = 0;
    lastThrottleMs = Date.now();
    if (yieldMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, yieldMs));
    } else {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}
