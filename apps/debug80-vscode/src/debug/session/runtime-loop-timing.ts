import type { Logger } from '../../util/logger';
import { createRuntimePerformanceMonitor } from './performance-monitor';
import type { RuntimeControlCapabilities, RuntimeControlContext } from './runtime-control-context';

const HOST_FAIRNESS_YIELD_MS = 0;

export type RuntimeLoopMonitor = ReturnType<typeof createRuntimePerformanceMonitor>;
export interface RuntimeThrottleState {
  cyclesSinceThrottle: number;
  lastThrottleMs: number;
}

function yieldToTimer(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function yieldToImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function monitoredYield(monitor: RuntimeLoopMonitor, waitMs: number): Promise<void> {
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

export async function throttleRuntimeLoop(options: {
  context: RuntimeControlContext;
  monitor: RuntimeLoopMonitor;
  state: RuntimeThrottleState;
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

function resetRuntimeLoopThrottle(state: RuntimeThrottleState): void {
  state.cyclesSinceThrottle = 0;
  state.lastThrottleMs = Date.now();
}

function isClockThrottledPlatform(context: RuntimeControlContext): boolean {
  const platform = context.getActivePlatform();
  return platform === 'tec1' || platform === 'tec1g';
}

async function yieldForPlatformClock(options: {
  monitor: RuntimeLoopMonitor;
  state: RuntimeThrottleState;
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

export function createRuntimeLoopMonitor(
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
