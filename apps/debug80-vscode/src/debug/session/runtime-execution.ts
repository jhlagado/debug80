import type { Z80Runtime } from '@jhlagado/debug80-runtime/z80/runtime';
import type { StepInfo } from '@jhlagado/debug80-runtime/z80/types';
import { sourceAddressSpacesEqual } from '../mapping/debug-addressing';
import type { RuntimeControlContext, RuntimeStopTarget } from './runtime-control-context';
import {
  createRuntimeLoopMonitor,
  throttleRuntimeLoop,
  type RuntimeLoopMonitor,
} from './runtime-loop-timing';
import {
  emitRuntimeLimitStopped,
  emitRuntimeRunning,
  emitRuntimeStopped,
  markRuntimeStopped,
  stopRuntimeAndEmit,
} from './runtime-events';

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

function createRuntimeLoopState(): RuntimeLoopState {
  return {
    executed: 0,
    cyclesSinceThrottle: 0,
    lastThrottleMs: Date.now(),
  };
}

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
    !sourceAddressSpacesEqual(options.context.getAddressSpace(skipAddress), skipAddressSpace)
  ) {
    return undefined;
  }
  options.context.setSkipBreakpointOnce(null);
  options.context.setSkipBreakpointAddressSpace(undefined);
  return stepRuntimeAndTrack(options);
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
      (target.addressSpace === undefined ||
        sourceAddressSpacesEqual(addressSpace, target.addressSpace))
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
