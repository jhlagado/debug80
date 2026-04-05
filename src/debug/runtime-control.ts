/**
 * @fileoverview Runtime execution helpers for stepping and stopping.
 */

import { BreakpointEvent, OutputEvent, StoppedEvent } from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { Z80Runtime } from '../z80/runtime';
import type { StepInfo } from '../z80/types';
import type { Tec1Runtime } from '../platforms/tec1/runtime';
import type { Tec1gRuntime } from '../platforms/tec1g/runtime';
import type { Logger } from '../util/logger';
import type { MatrixKeyCombo } from '../platforms/tec1g/matrix-keymap';
import type { SourceStateManager } from './source-state-manager';
import type { PlatformRegistry } from './platform-registry';
import type { SessionStateShape, StopReason } from './session-state';
import type { LaunchSequenceContext } from './launch-sequence';
import type { LaunchSessionArtifacts } from './launch-sequence';
import type { BreakpointManager } from './breakpoint-manager';
import type { CpuStateSnapshot } from '../z80/runtime';

export interface RuntimeControlContext {
  getRuntime: () => Z80Runtime | undefined;
  getRuntimeCapabilities: () => RuntimeControlCapabilities | undefined;
  getRestartCaptureAddress: () => number | undefined;
  getEntryCpuState: () => CpuStateSnapshot | undefined;
  setEntryCpuState: (snapshot: CpuStateSnapshot | undefined) => void;
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

export interface RuntimeControlCapabilities {
  recordCycles: (cycles: number) => void;
  silenceSpeaker: () => void;
  getClockHz: () => number;
  getYieldMs: () => number;
}

export interface RuntimeControlContextInput {
  sessionState: SessionStateShape;
  activePlatform: () => string;
  isBreakpointAddress: (address: number | null) => boolean;
  handleHaltStop: () => void;
  sendEvent: (event: unknown) => void;
}

export interface LaunchSequenceContextInput {
  logger: Logger;
  sessionState: SessionStateShape;
  sourceState: SourceStateManager;
  platformRegistry: PlatformRegistry;
  matrixHeldKeys: Map<string, MatrixKeyCombo[]>;
  emitEvent: (event: DebugProtocol.Event) => void;
  emitDapEvent: (name: string, payload: unknown) => void;
  sendResponse: (response: DebugProtocol.Response) => void;
  sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string) => void;
}

export function createRuntimeControlContext(
  input: RuntimeControlContextInput
): RuntimeControlContext {
  const runState = input.sessionState.runState;
  return {
    getRuntime: () => input.sessionState.runtime,
    getRuntimeCapabilities: () =>
      createRuntimeControlCapabilities({
        activePlatform: input.activePlatform(),
        tec1Runtime: input.sessionState.tec1Runtime,
        tec1gRuntime: input.sessionState.tec1gRuntime,
      }),
    getRestartCaptureAddress: () => input.sessionState.restartCaptureAddress,
    getEntryCpuState: () => input.sessionState.entryCpuState,
    setEntryCpuState: (snapshot: CpuStateSnapshot | undefined): void => {
      input.sessionState.entryCpuState = snapshot;
    },
    getActivePlatform: () => input.activePlatform(),
    getCallDepth: () => runState.callDepth,
    setCallDepth: (value: number): void => {
      runState.callDepth = value;
    },
    getPauseRequested: () => runState.pauseRequested,
    setPauseRequested: (value: boolean): void => {
      runState.pauseRequested = value;
    },
    getSkipBreakpointOnce: () => runState.skipBreakpointOnce,
    setSkipBreakpointOnce: (value: number | null): void => {
      runState.skipBreakpointOnce = value;
    },
    getHaltNotified: () => runState.haltNotified,
    setHaltNotified: (value: boolean): void => {
      runState.haltNotified = value;
    },
    setLastStopReason: (reason: StopReason): void => {
      runState.lastStopReason = reason;
    },
    setLastBreakpointAddress: (address: number | null): void => {
      runState.lastBreakpointAddress = address;
    },
    isBreakpointAddress: (address: number | null): boolean => input.isBreakpointAddress(address),
    handleHaltStop: (): void => input.handleHaltStop(),
    sendEvent: (event: unknown): void => input.sendEvent(event),
  };
}

export function createRuntimeControlCapabilities(options: {
  activePlatform: string;
  tec1Runtime: Tec1Runtime | undefined;
  tec1gRuntime: Tec1gRuntime | undefined;
}): RuntimeControlCapabilities | undefined {
  if (options.activePlatform === 'tec1') {
    const runtime = options.tec1Runtime;
    if (runtime === undefined) {
      return undefined;
    }
    return {
      recordCycles: (cycles: number): void => runtime.recordCycles(cycles),
      silenceSpeaker: (): void => runtime.silenceSpeaker(),
      getClockHz: (): number => runtime.state.clockHz,
      getYieldMs: (): number => runtime.state.yieldMs,
    };
  }
  if (options.activePlatform === 'tec1g') {
    const runtime = options.tec1gRuntime;
    if (runtime === undefined) {
      return undefined;
    }
    return {
      recordCycles: (cycles: number): void => runtime.recordCycles(cycles),
      silenceSpeaker: (): void => runtime.silenceSpeaker(),
      getClockHz: (): number => runtime.state.timing.clockHz,
      getYieldMs: (): number => runtime.state.timing.yieldMs,
    };
  }
  return undefined;
}

export function createLaunchSequenceContext(
  input: LaunchSequenceContextInput
): LaunchSequenceContext {
  return input;
}

export interface LaunchArtifactsTarget {
  platformState: { active: string };
  sessionState: SessionStateShape;
}

export function applyLaunchSessionArtifacts(
  target: LaunchArtifactsTarget,
  artifacts: LaunchSessionArtifacts
): void {
  target.platformState.active = artifacts.platform;
  target.sessionState.listing = artifacts.listing;
  target.sessionState.listingPath = artifacts.listingPath;
  target.sessionState.mapping = artifacts.mapping;
  target.sessionState.mappingIndex = artifacts.mappingIndex;
  target.sessionState.sourceRoots = artifacts.sourceRoots;
  target.sessionState.extraListingPaths = artifacts.extraListingPaths;
  target.sessionState.symbolAnchors = artifacts.symbolAnchors;
  target.sessionState.symbolList = artifacts.symbolList;
  target.sessionState.runtime = artifacts.runtime;
  target.sessionState.terminalState = artifacts.terminalState;
  target.sessionState.tec1Runtime = artifacts.tec1Runtime;
  target.sessionState.tec1gRuntime = artifacts.tec1gRuntime;
  target.sessionState.platformRuntime = artifacts.platformRuntime;
  target.sessionState.tec1gConfig = artifacts.tec1gConfig;
  target.sessionState.loadedProgram = artifacts.loadedProgram;
  target.sessionState.loadedEntry = artifacts.loadedEntry;
  target.sessionState.restartCaptureAddress = artifacts.restartCaptureAddress;
  target.sessionState.entryCpuState = undefined;
  target.sessionState.runState.callDepth = 0;
  target.sessionState.runState.stepOverMaxInstructions = artifacts.stepOverMaxInstructions;
  target.sessionState.runState.stepOutMaxInstructions = artifacts.stepOutMaxInstructions;
}

export interface LaunchBreakpointsTarget {
  listing: LaunchSessionArtifacts['listing'] | undefined;
  listingPath: string | undefined;
  mappingIndex: LaunchSessionArtifacts['mappingIndex'] | undefined;
}

export function applyLaunchBreakpoints(
  breakpointManager: BreakpointManager,
  target: LaunchBreakpointsTarget,
  sendEvent: (event: DebugProtocol.Event) => void
): void {
  if (target.listing === undefined) {
    return;
  }
  const applied = breakpointManager.applyAll(
    target.listing,
    target.listingPath,
    target.mappingIndex
  );
  for (const bp of applied) {
    sendEvent(new BreakpointEvent('changed', bp));
  }
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

export function captureEntryCpuStateIfNeeded(context: RuntimeControlContext): void {
  const getEntryCpuState = (context as Partial<RuntimeControlContext>).getEntryCpuState;
  const getRestartCaptureAddress =
    (context as Partial<RuntimeControlContext>).getRestartCaptureAddress;
  const setEntryCpuState = (context as Partial<RuntimeControlContext>).setEntryCpuState;
  if (
    typeof getEntryCpuState !== 'function' ||
    typeof getRestartCaptureAddress !== 'function' ||
    typeof setEntryCpuState !== 'function'
  ) {
    return;
  }
  if (getEntryCpuState.call(context) !== undefined) {
    return;
  }
  const runtime = context.getRuntime();
  const captureAddress = getRestartCaptureAddress.call(context);
  if (
    runtime === undefined ||
    captureAddress === undefined ||
    typeof runtime.captureCpuState !== 'function'
  ) {
    return;
  }
  if (runtime.getPC() !== captureAddress) {
    return;
  }
  setEntryCpuState.call(context, runtime.captureCpuState());
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
  const getRuntimeCapabilities = (): RuntimeControlCapabilities | undefined =>
    context.getRuntimeCapabilities();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (let i = 0; i < CHUNK; i += 1) {
      const activeRuntime = context.getRuntime();
      if (activeRuntime === undefined) {
        return;
      }
      captureEntryCpuStateIfNeeded(context);
      if (context.getPauseRequested()) {
        context.setPauseRequested(false);
        context.setHaltNotified(false);
        context.setLastStopReason('pause');
        context.setLastBreakpointAddress(null);
        getRuntimeCapabilities()?.silenceSpeaker();
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
        captureEntryCpuStateIfNeeded(context);
        executed += 1;
        cyclesSinceThrottle += stepped.cycles ?? 0;
        getRuntimeCapabilities()?.recordCycles(stepped.cycles ?? 0);
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
      captureEntryCpuStateIfNeeded(context);
      executed += 1;
      cyclesSinceThrottle += result.cycles ?? 0;
      getRuntimeCapabilities()?.recordCycles(result.cycles ?? 0);
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
      const capabilities = getRuntimeCapabilities();
      const clockHz = capabilities?.getClockHz() ?? 0;
      if (clockHz > 0) {
        const targetMs = (cyclesSinceThrottle / clockHz) * 1000;
        const now = Date.now();
        const elapsed = now - lastThrottleMs;
        const waitMs = targetMs - elapsed;
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else if ((capabilities?.getYieldMs() ?? 0) > 0) {
          await new Promise((resolve) => setTimeout(resolve, capabilities?.getYieldMs() ?? 0));
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
    const yieldMs = getRuntimeCapabilities()?.getYieldMs() ?? 0;
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
  const getRuntimeCapabilities = (): RuntimeControlCapabilities | undefined =>
    context.getRuntimeCapabilities();
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
        getRuntimeCapabilities()?.silenceSpeaker();
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
        getRuntimeCapabilities()?.recordCycles(result.cycles ?? 0);
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
      const capabilities = getRuntimeCapabilities();
      const clockHz = capabilities?.getClockHz() ?? 0;
      if (clockHz > 0) {
        const targetMs = (cyclesSinceThrottle / clockHz) * 1000;
        const now = Date.now();
        const elapsed = now - lastThrottleMs;
        const waitMs = targetMs - elapsed;
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else if ((capabilities?.getYieldMs() ?? 0) > 0) {
          await new Promise((resolve) => setTimeout(resolve, capabilities?.getYieldMs() ?? 0));
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
    const yieldMs = getRuntimeCapabilities()?.getYieldMs() ?? 0;
    if (yieldMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, yieldMs));
    } else {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}
