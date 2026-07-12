/**
 * @fileoverview Runtime execution helpers for stepping and stopping.
 */

import type { DebugProtocol } from '@vscode/debugprotocol';
import type { Z80Runtime } from '../../z80/runtime';
import type { StepInfo } from '../../z80/types';
import type { Tec1Runtime } from '../../platforms/tec1/runtime';
import type { Tec1gRuntime } from '../../platforms/tec1g/runtime';
import type { Logger } from '../../util/logger';
import type { MatrixKeyCombo } from '../../platforms/tec1g/matrix-keymap';
import type { SourceStateManager } from '../mapping/source-state-manager';
import type { PlatformRegistry } from './platform-registry';
import type { SessionStateShape, StopReason } from './session-state';
import type { LaunchSequenceContext } from '../launch/launch-sequence';
import type { LaunchSessionArtifacts } from '../launch/launch-sequence';
import type { BreakpointManager } from '../mapping/breakpoint-manager';
import type { CpuStateSnapshot } from '../../z80/runtime';
import type { SourceAddressSpace } from '../../mapping/types';
import { createRuntimePerformanceMonitor } from './performance-monitor';
import {
  emitChangedBreakpoints,
  emitRuntimeLimitStopped,
  emitRuntimeRunning,
  emitRuntimeStopped,
  markRuntimeStopped,
  stopRuntimeAndEmit,
} from './runtime-events';

const HOST_FAIRNESS_YIELD_MS = 0;

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
  getRunning: () => boolean;
  setRunning: (value: boolean) => void;
  getSkipBreakpointOnce: () => number | null;
  setSkipBreakpointOnce: (value: number | null) => void;
  getSkipBreakpointAddressSpace: () => SourceAddressSpace | undefined;
  setSkipBreakpointAddressSpace: (value: SourceAddressSpace | undefined) => void;
  getHaltNotified: () => boolean;
  setHaltNotified: (value: boolean) => void;
  setLastStopReason: (reason: StopReason) => void;
  setLastBreakpointAddress: (address: number | null) => void;
  setLastBreakpointAddressSpace: (addressSpace: SourceAddressSpace | undefined) => void;
  getAddressSpace: (address: number) => SourceAddressSpace | undefined;
  getBreakpointAddressSpace: (address: number) => SourceAddressSpace | undefined;
  isBreakpointAddress: (address: number | null) => boolean;
  handleHaltStop: () => void;
  sendEvent: (event: unknown) => void;
  getLogger?: () => Logger;
}

export type RuntimeStopTarget = {
  address: number;
  addressSpace?: SourceAddressSpace;
};

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
  getAddressSpace?: (address: number) => SourceAddressSpace | undefined;
  getBreakpointAddressSpace?: (address: number) => SourceAddressSpace | undefined;
  handleHaltStop: () => void;
  sendEvent: (event: unknown) => void;
  logger: Logger;
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
    getRunning: () => runState.isRunning,
    setRunning: (value: boolean): void => {
      runState.isRunning = value;
    },
    getSkipBreakpointOnce: () => runState.skipBreakpointOnce,
    setSkipBreakpointOnce: (value: number | null): void => {
      runState.skipBreakpointOnce = value;
    },
    getSkipBreakpointAddressSpace: () => runState.skipBreakpointAddressSpace,
    setSkipBreakpointAddressSpace: (value: SourceAddressSpace | undefined): void => {
      runState.skipBreakpointAddressSpace = value;
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
    setLastBreakpointAddressSpace: (addressSpace: SourceAddressSpace | undefined): void => {
      runState.lastBreakpointAddressSpace = addressSpace;
    },
    getAddressSpace: (address: number): SourceAddressSpace | undefined =>
      input.getAddressSpace?.(address),
    getBreakpointAddressSpace: (address: number): SourceAddressSpace | undefined =>
      input.getBreakpointAddressSpace?.(address),
    isBreakpointAddress: (address: number | null): boolean => input.isBreakpointAddress(address),
    handleHaltStop: (): void => input.handleHaltStop(),
    sendEvent: (event: unknown): void => input.sendEvent(event),
    getLogger: (): Logger => input.logger,
  };
}

function createRuntimeControlCapabilities(options: {
  activePlatform: string;
  tec1Runtime: Tec1Runtime | undefined;
  tec1gRuntime: Tec1gRuntime | undefined;
}): RuntimeControlCapabilities | undefined {
  if (options.activePlatform === 'tec1') {
    const runtime = options.tec1Runtime;
    if (runtime === undefined) {
      return undefined;
    }
    return createPlatformRuntimeCapabilities(
      (cycles) => runtime.recordCycles(cycles),
      () => runtime.silenceSpeaker(),
      () => runtime.state.clockHz,
      () => runtime.state.yieldMs
    );
  }
  if (options.activePlatform === 'tec1g') {
    const runtime = options.tec1gRuntime;
    if (runtime === undefined) {
      return undefined;
    }
    return createPlatformRuntimeCapabilities(
      (cycles) => runtime.recordCycles(cycles),
      () => runtime.silenceSpeaker(),
      () => runtime.state.timing.clockHz,
      () => runtime.state.timing.yieldMs
    );
  }
  return undefined;
}

function createPlatformRuntimeCapabilities(
  recordCycles: (cycles: number) => void,
  silenceSpeaker: () => void,
  getClockHz: () => number,
  getYieldMs: () => number
): RuntimeControlCapabilities {
  return { recordCycles, silenceSpeaker, getClockHz, getYieldMs };
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
  const source = target.sessionState.source;
  const runtimeState = target.sessionState.runtimeState;
  const platform = target.sessionState.platform;
  const launch = target.sessionState.launch;
  const ui = target.sessionState.ui;

  target.platformState.active = artifacts.platform;
  source.mapping = artifacts.mapping;
  source.mappingIndex = artifacts.mappingIndex;
  source.sourceRoots = artifacts.sourceRoots;
  source.symbolAnchors = artifacts.symbolAnchors;
  source.symbolList = artifacts.symbolList;
  source.sourceMapSymbols = artifacts.sourceMapSymbols;
  source.romSourcePaths = artifacts.romSourcePaths;
  source.autoOpenRomSourcePaths = artifacts.autoOpenRomSourcePaths;
  runtimeState.execution = artifacts.runtime;
  ui.terminalState = artifacts.terminalState;
  platform.tec1Runtime = artifacts.tec1Runtime;
  platform.tec1gRuntime = artifacts.tec1gRuntime;
  platform.platformRuntime = artifacts.platformRuntime;
  platform.tec1gConfig = artifacts.tec1gConfig;
  launch.loadedProgram = artifacts.loadedProgram;
  launch.loadedEntry = artifacts.loadedEntry;
  launch.restartCaptureAddress = artifacts.restartCaptureAddress;
  launch.entryCpuState = undefined;
  target.sessionState.runState.callDepth = 0;
  target.sessionState.runState.stepOverMaxInstructions = artifacts.stepOverMaxInstructions;
  target.sessionState.runState.stepOutMaxInstructions = artifacts.stepOutMaxInstructions;
}

function yieldToTimer(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function yieldToImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function monitoredYield(
  monitor: ReturnType<typeof createRuntimePerformanceMonitor>,
  waitMs: number
): Promise<void> {
  const startedMs = Date.now();
  if (waitMs > 0) {
    await yieldToTimer(waitMs);
  } else {
    await yieldToImmediate();
  }
  monitor.recordYield(waitMs, Date.now() - startedMs);
}

const nullPerformanceLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function getPerformanceLogger(context: RuntimeControlContext): Logger {
  return context.getLogger?.() ?? nullPerformanceLogger;
}

export interface LaunchBreakpointsTarget {
  mappingIndex: LaunchSessionArtifacts['mappingIndex'] | undefined;
}

export function applyLaunchBreakpoints(
  breakpointManager: BreakpointManager,
  target: LaunchBreakpointsTarget,
  sendEvent: (event: DebugProtocol.Event) => void
): void {
  const applied = breakpointManager.applyAll(target.mappingIndex);
  emitChangedBreakpoints(sendEvent, applied);
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
  const getRestartCaptureAddress = (context as Partial<RuntimeControlContext>)
    .getRestartCaptureAddress;
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

type RuntimeStepResult = {
  halted: boolean;
  cycles: number;
};

type RuntimeLoopMode = 'run' | 'step-out';

type RuntimeStepOptions = {
  recordCycles: boolean;
  captureEntry: boolean;
};

type RuntimeLoopState = {
  executed: number;
  cyclesSinceThrottle: number;
  lastThrottleMs: number;
};

type RuntimeLoopMonitor = ReturnType<typeof createRuntimePerformanceMonitor>;
type RuntimeLoopResult = 'continue' | 'stop';
type RuntimeLoopIteration = (options: RuntimeLoopIterationOptions) => RuntimeLoopResult;

type RuntimeLoopIterationOptions = {
  context: RuntimeControlContext;
  runtime: Z80Runtime;
  trace: StepInfo;
  monitor: RuntimeLoopMonitor;
  state: RuntimeLoopState;
};

const RUN_STEP_OPTIONS: RuntimeStepOptions = { recordCycles: true, captureEntry: true };
const STEP_OUT_SKIP_OPTIONS: RuntimeStepOptions = { recordCycles: false, captureEntry: false };
const STEP_OUT_STEP_OPTIONS: RuntimeStepOptions = { recordCycles: true, captureEntry: false };
const RUNTIME_LOOP_CHUNK = 1000;

function stepRuntimeOnce(options: {
  context: RuntimeControlContext;
  runtime: Z80Runtime;
  trace: StepInfo;
  monitor: RuntimeLoopMonitor;
  recordCycles: boolean;
  captureEntry: boolean;
}): RuntimeStepResult {
  const result = options.runtime.step({ trace: options.trace });
  applyStepInfo(options.context, options.trace);
  if (options.captureEntry) {
    captureEntryCpuStateIfNeeded(options.context);
  }
  const cycles = result.cycles ?? 0;
  options.monitor.recordStep(cycles);
  if (options.recordCycles) {
    options.context.getRuntimeCapabilities()?.recordCycles(cycles);
  }
  return { halted: result.halted, cycles };
}

function handlePauseIfRequested(context: RuntimeControlContext): boolean {
  if (!context.getPauseRequested()) {
    return false;
  }
  context.setPauseRequested(false);
  markRuntimeStopped(context, 'pause', null);
  context.getRuntimeCapabilities()?.silenceSpeaker();
  emitRuntimeStopped(context, 'pause');
  return true;
}

function handleHaltedStep(context: RuntimeControlContext, mode: RuntimeLoopMode): void {
  if (mode === 'run') {
    context.setRunning(false);
  }
  context.handleHaltStop();
}

function handleSkipBreakpointStep(options: {
  context: RuntimeControlContext;
  runtime: Z80Runtime;
  trace: StepInfo;
  monitor: RuntimeLoopMonitor;
  state: RuntimeLoopState;
  stepOptions: RuntimeStepOptions;
  mode: RuntimeLoopMode;
}): RuntimeStepResult | undefined {
  const skipAddress = options.context.getSkipBreakpointOnce();
  if (skipAddress === null || options.runtime.getPC() !== skipAddress) {
    return undefined;
  }
  const skipAddressSpace = options.context.getSkipBreakpointAddressSpace();
  if (
    skipAddressSpace !== undefined &&
    !addressSpacesEqual(options.context.getAddressSpace(skipAddress), skipAddressSpace)
  ) {
    return undefined;
  }
  options.context.setSkipBreakpointOnce(null);
  options.context.setSkipBreakpointAddressSpace(undefined);
  return stepRuntimeAndTrack(options);
}

function addressSpacesEqual(
  actual: SourceAddressSpace | undefined,
  expected: SourceAddressSpace
): boolean {
  return actual?.kind === expected.kind && actual.physicalBank === expected.physicalBank;
}

function handleBreakpointStop(options: {
  context: RuntimeControlContext;
  runtime: Z80Runtime;
  extraBreakpoints?: RuntimeStopTarget[];
}): boolean {
  const pc = options.runtime.getPC();
  if (options.context.isBreakpointAddress(pc)) {
    stopRuntimeAndEmit(
      options.context,
      'breakpoint',
      'breakpoint',
      pc,
      options.context.getBreakpointAddressSpace(pc)
    );
    return true;
  }
  if (matchesExtraBreakpoint(pc, options.extraBreakpoints, options.context)) {
    stopRuntimeAndEmit(options.context, 'step', 'step', null);
    return true;
  }
  return false;
}

function matchesExtraBreakpoint(
  pc: number,
  extraBreakpoints: RuntimeStopTarget[] | undefined,
  context: RuntimeControlContext
): boolean {
  if (extraBreakpoints === undefined) {
    return false;
  }
  const addressSpace = context.getAddressSpace(pc);
  return extraBreakpoints.some(
    (target) =>
      target.address === pc &&
      (target.addressSpace === undefined || addressSpacesEqual(addressSpace, target.addressSpace))
  );
}

function stepRuntimeAndTrack(options: {
  context: RuntimeControlContext;
  runtime: Z80Runtime;
  trace: StepInfo;
  monitor: RuntimeLoopMonitor;
  state: RuntimeLoopState;
  stepOptions: RuntimeStepOptions;
  mode: RuntimeLoopMode;
}): RuntimeStepResult {
  const result = stepRuntimeOnce({
    context: options.context,
    runtime: options.runtime,
    trace: options.trace,
    monitor: options.monitor,
    recordCycles: options.stepOptions.recordCycles,
    captureEntry: options.stepOptions.captureEntry,
  });
  options.state.executed += 1;
  options.state.cyclesSinceThrottle += result.cycles;
  if (result.halted) {
    handleHaltedStep(options.context, options.mode);
  }
  return result;
}

async function throttleRuntimeLoop(options: {
  context: RuntimeControlContext;
  monitor: RuntimeLoopMonitor;
  state: RuntimeLoopState;
  chunkStartedMs: number;
}): Promise<void> {
  const capabilities = options.context.getRuntimeCapabilities();
  if (isClockThrottledPlatform(options.context) && (capabilities?.getClockHz() ?? 0) > 0) {
    await yieldForPlatformClock({ ...options, capabilities });
    resetRuntimeLoopThrottle(options.state);
    return;
  }

  resetRuntimeLoopThrottle(options.state);
  await yieldForHost(options.monitor, capabilities?.getYieldMs() ?? 0);
}

function resetRuntimeLoopThrottle(state: RuntimeLoopState): void {
  state.cyclesSinceThrottle = 0;
  state.lastThrottleMs = Date.now();
}

function isClockThrottledPlatform(context: RuntimeControlContext): boolean {
  const platform = context.getActivePlatform();
  return platform === 'tec1' || platform === 'tec1g';
}

async function yieldForPlatformClock(options: {
  monitor: RuntimeLoopMonitor;
  state: RuntimeLoopState;
  chunkStartedMs: number;
  capabilities: RuntimeControlCapabilities | undefined;
}): Promise<void> {
  const clockHz = options.capabilities?.getClockHz() ?? 0;
  const targetMs = (options.state.cyclesSinceThrottle / clockHz) * 1000;
  const now = Date.now();
  const elapsed = now - options.state.lastThrottleMs;
  const waitMs = targetMs - elapsed;
  options.monitor.recordChunk(now - options.chunkStartedMs, targetMs);
  await monitoredYield(options.monitor, selectRuntimeYieldMs(waitMs, options.capabilities));
}

function selectRuntimeYieldMs(
  waitMs: number,
  capabilities: RuntimeControlCapabilities | undefined
): number {
  if (waitMs > 0) {
    return waitMs;
  }
  const yieldMs = capabilities?.getYieldMs() ?? 0;
  if (yieldMs > 0) {
    return yieldMs;
  }
  return HOST_FAIRNESS_YIELD_MS;
}

async function yieldForHost(monitor: RuntimeLoopMonitor, yieldMs: number): Promise<void> {
  await monitoredYield(monitor, yieldMs > 0 ? yieldMs : 0);
}

function createRuntimeLoopState(): RuntimeLoopState {
  return {
    executed: 0,
    cyclesSinceThrottle: 0,
    lastThrottleMs: Date.now(),
  };
}

function createRuntimeLoopMonitor(
  context: RuntimeControlContext,
  label: string
): RuntimeLoopMonitor {
  const initialCapabilities = context.getRuntimeCapabilities();
  return createRuntimePerformanceMonitor({
    logger: getPerformanceLogger(context),
    label,
    platform: context.getActivePlatform(),
    clockHz: initialCapabilities?.getClockHz() ?? 0,
  });
}

async function runRuntimeLoop(options: {
  context: RuntimeControlContext;
  label: string;
  iterate: RuntimeLoopIteration;
}): Promise<void> {
  if (options.context.getRuntime() === undefined) {
    return;
  }
  const trace: StepInfo = { taken: false };
  const state = createRuntimeLoopState();
  const monitor = createRuntimeLoopMonitor(options.context, options.label);
  emitRuntimeRunning(options.context);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const chunkStartedMs = Date.now();
    for (let i = 0; i < RUNTIME_LOOP_CHUNK; i += 1) {
      const runtime = options.context.getRuntime();
      if (runtime === undefined) {
        return;
      }
      const result = options.iterate({
        context: options.context,
        runtime,
        trace,
        monitor,
        state,
      });
      if (result === 'stop') {
        return;
      }
    }
    await throttleRuntimeLoop({ context: options.context, monitor, state, chunkStartedMs });
  }
}

export async function runUntilStopAsync(
  context: RuntimeControlContext,
  options?: {
    extraBreakpoints?: RuntimeStopTarget[];
    maxInstructions?: number;
    limitLabel?: string;
  }
): Promise<void> {
  const extraBreakpoints = options?.extraBreakpoints;
  const maxInstructions = options?.maxInstructions;
  const limitLabel = options?.limitLabel ?? 'step';

  await runRuntimeLoop({
    context,
    label: 'run',
    iterate: (iteration) =>
      runUntilStopIteration({
        ...iteration,
        extraBreakpoints,
        maxInstructions,
        limitLabel,
      }),
  });
}

export async function runUntilReturnAsync(
  context: RuntimeControlContext,
  baselineDepth: number,
  maxInstructions: number
): Promise<void> {
  await runRuntimeLoop({
    context,
    label: 'step-out',
    iterate: (iteration) =>
      runUntilReturnIteration({
        ...iteration,
        baselineDepth,
        maxInstructions,
      }),
  });
}

function runUntilStopIteration(
  options: RuntimeLoopIterationOptions & {
    extraBreakpoints: RuntimeStopTarget[] | undefined;
    maxInstructions: number | undefined;
    limitLabel: string;
  }
): RuntimeLoopResult {
  captureEntryCpuStateIfNeeded(options.context);
  if (handlePauseIfRequested(options.context)) {
    return 'stop';
  }
  const skipped = handleSkipBreakpointStep({
    context: options.context,
    runtime: options.runtime,
    trace: options.trace,
    monitor: options.monitor,
    state: options.state,
    stepOptions: RUN_STEP_OPTIONS,
    mode: 'run',
  });
  if (skipped !== undefined) {
    return skipped.halted ? 'stop' : 'continue';
  }
  if (
    handleBreakpointStop({
      context: options.context,
      runtime: options.runtime,
      ...(options.extraBreakpoints !== undefined
        ? { extraBreakpoints: options.extraBreakpoints }
        : {}),
    })
  ) {
    return 'stop';
  }
  const result = stepRuntimeAndTrack({
    context: options.context,
    runtime: options.runtime,
    trace: options.trace,
    monitor: options.monitor,
    state: options.state,
    stepOptions: RUN_STEP_OPTIONS,
    mode: 'run',
  });
  if (result.halted) {
    return 'stop';
  }
  return stopIfInstructionLimitReached({
    context: options.context,
    state: options.state,
    maxInstructions: options.maxInstructions,
    message: (maxInstructions) =>
      `Debug80: ${options.limitLabel} stopped after ${maxInstructions} instructions (target not reached).\n`,
  });
}

function runUntilReturnIteration(
  options: RuntimeLoopIterationOptions & {
    baselineDepth: number;
    maxInstructions: number;
  }
): RuntimeLoopResult {
  if (handlePauseIfRequested(options.context)) {
    return 'stop';
  }
  const skipped = handleSkipBreakpointStep({
    context: options.context,
    runtime: options.runtime,
    trace: options.trace,
    monitor: options.monitor,
    state: options.state,
    stepOptions: STEP_OUT_SKIP_OPTIONS,
    mode: 'step-out',
  });
  if (skipped !== undefined && skipped.halted) {
    return 'stop';
  }
  if (skipped === undefined && stepOutNormalInstruction(options) === 'stop') {
    return 'stop';
  }
  if (isReturnPastBaseline(options.context, options.trace, options.baselineDepth)) {
    stopRuntimeAndEmit(options.context, 'step', 'step', null);
    return 'stop';
  }
  return stopIfInstructionLimitReached({
    context: options.context,
    state: options.state,
    maxInstructions: options.maxInstructions,
    message: (maxInstructions) =>
      `Debug80: step out stopped after ${maxInstructions} instructions (return not observed).\n`,
  });
}

function stepOutNormalInstruction(options: RuntimeLoopIterationOptions): RuntimeLoopResult {
  if (handleBreakpointStop({ context: options.context, runtime: options.runtime })) {
    return 'stop';
  }
  const result = stepRuntimeAndTrack({
    context: options.context,
    runtime: options.runtime,
    trace: options.trace,
    monitor: options.monitor,
    state: options.state,
    stepOptions: STEP_OUT_STEP_OPTIONS,
    mode: 'run',
  });
  return result.halted ? 'stop' : 'continue';
}

function isReturnPastBaseline(
  context: RuntimeControlContext,
  trace: StepInfo,
  baselineDepth: number
): boolean {
  return (
    trace.kind === 'ret' &&
    trace.taken &&
    (baselineDepth === 0 || context.getCallDepth() < baselineDepth)
  );
}

function stopIfInstructionLimitReached(options: {
  context: RuntimeControlContext;
  state: RuntimeLoopState;
  maxInstructions: number | undefined;
  message: (maxInstructions: number) => string;
}): RuntimeLoopResult {
  if (
    options.maxInstructions === undefined ||
    options.maxInstructions <= 0 ||
    options.state.executed < options.maxInstructions
  ) {
    return 'continue';
  }
  emitRuntimeLimitStopped(options.context, options.message(options.maxInstructions));
  return 'stop';
}
