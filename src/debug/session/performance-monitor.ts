/**
 * @file Runtime performance telemetry for Debug80.
 */

import type { Logger } from '../../util/logger';
import { isPerformanceLoggingEnabled } from '../../util/performance';

const REPORT_INTERVAL_MS = 5000;
const SLOW_CHUNK_MS = 50;
const SLOW_YIELD_OVERHEAD_MS = 200;
const WARN_INTERVAL_MS = 5000;

export interface RuntimePerformanceMonitor {
  recordStep(cycles: number): void;
  recordChunk(elapsedMs: number, requestedTargetMs: number): void;
  recordYield(requestedMs: number, elapsedMs: number): void;
  finish(): void;
}

export function createRuntimePerformanceMonitor(options: {
  logger: Logger;
  label: string;
  platform: string;
  clockHz: number;
  enabled?: boolean;
  now?: () => number;
}): RuntimePerformanceMonitor {
  return new DefaultRuntimePerformanceMonitor(options);
}

class DefaultRuntimePerformanceMonitor implements RuntimePerformanceMonitor {
  private readonly logger: Logger;
  private readonly label: string;
  private readonly platform: string;
  private readonly clockHz: number;
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly startedMs: number;
  private lastReportMs: number;
  private lastWarnMs = 0;
  private instructions = 0;
  private cycles = 0;
  private yields = 0;
  private requestedWaitMs = 0;
  private actualYieldMs = 0;
  private maxChunkMs = 0;
  private maxYieldOverheadMs = 0;

  public constructor(options: {
    logger: Logger;
    label: string;
    platform: string;
    clockHz: number;
    enabled?: boolean;
    now?: () => number;
  }) {
    this.logger = options.logger;
    this.label = options.label;
    this.platform = options.platform;
    this.clockHz = options.clockHz;
    this.enabled = options.enabled ?? isPerformanceLoggingEnabled();
    this.now = options.now ?? Date.now;
    this.startedMs = this.now();
    this.lastReportMs = this.startedMs;
  }

  public recordStep(cycles: number): void {
    this.instructions += 1;
    this.cycles += cycles;
    this.maybeReport(this.now(), false);
  }

  public recordChunk(elapsedMs: number, requestedTargetMs: number): void {
    this.maxChunkMs = Math.max(this.maxChunkMs, elapsedMs);
    if (elapsedMs >= SLOW_CHUNK_MS) {
      this.warn(
        `Debug80 performance: ${this.label} chunk took ${elapsedMs.toFixed(
          1
        )}ms before yielding; target slice was ${requestedTargetMs.toFixed(1)}ms.`
      );
    }
  }

  public recordYield(requestedMs: number, elapsedMs: number): void {
    this.yields += 1;
    this.requestedWaitMs += Math.max(0, requestedMs);
    this.actualYieldMs += Math.max(0, elapsedMs);
    const overheadMs = Math.max(0, elapsedMs - Math.max(0, requestedMs));
    this.maxYieldOverheadMs = Math.max(this.maxYieldOverheadMs, overheadMs);
    if (overheadMs >= SLOW_YIELD_OVERHEAD_MS) {
      this.warn(
        `Debug80 performance: ${this.label} yield resumed ${overheadMs.toFixed(
          1
        )}ms late; extension host may be starved.`
      );
    }
    this.maybeReport(this.now(), false);
  }

  public finish(): void {
    this.maybeReport(this.now(), true);
  }

  private maybeReport(nowMs: number, force: boolean): void {
    if (!this.enabled) {
      return;
    }
    if (!force && nowMs - this.lastReportMs < REPORT_INTERVAL_MS) {
      return;
    }
    const elapsedMs = Math.max(1, nowMs - this.startedMs);
    const seconds = elapsedMs / 1000;
    const instrPerSec = this.instructions / seconds;
    const cyclesPerSec = this.cycles / seconds;
    const effectivePct = this.clockHz > 0 ? (cyclesPerSec / this.clockHz) * 100 : 0;
    const yieldsPerSec = this.yields / seconds;
    this.logger.info(
      `Debug80 perf ${this.label}: platform=${this.platform} instr/s=${Math.round(
        instrPerSec
      )} cycles/s=${Math.round(cyclesPerSec)} effective=${effectivePct.toFixed(
        1
      )}% yields/s=${yieldsPerSec.toFixed(1)} wait=${Math.round(
        this.requestedWaitMs
      )}ms actualYield=${Math.round(this.actualYieldMs)}ms maxChunk=${this.maxChunkMs.toFixed(
        1
      )}ms maxYieldLag=${this.maxYieldOverheadMs.toFixed(1)}ms`
    );
    this.lastReportMs = nowMs;
  }

  private warn(message: string): void {
    const nowMs = this.now();
    if (nowMs - this.lastWarnMs < WARN_INTERVAL_MS) {
      return;
    }
    this.lastWarnMs = nowMs;
    this.logger.warn(message);
  }
}
