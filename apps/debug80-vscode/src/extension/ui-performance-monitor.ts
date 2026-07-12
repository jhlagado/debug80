/**
 * @file Opt-in UI/webview performance diagnostics for Debug80.
 */

import type { Logger } from '../util/logger';
import { isPerformanceLoggingEnabled } from '../util/performance';

const REPORT_INTERVAL_MS = 5000;
const LARGE_MESSAGE_BYTES = 256 * 1024;
const WARN_INTERVAL_MS = 5000;

export interface UiPerformanceMonitor {
  recordMessage(type: string, payload?: Record<string, unknown>): void;
  finish(): void;
}

export function createUiPerformanceMonitor(options: {
  logger: Logger;
  label: string;
  enabled?: boolean;
  now?: () => number;
}): UiPerformanceMonitor {
  return new DefaultUiPerformanceMonitor(options);
}

class DefaultUiPerformanceMonitor implements UiPerformanceMonitor {
  private readonly logger: Logger;
  private readonly label: string;
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly startedMs: number;
  private lastReportMs: number;
  private lastWarnMs = Number.NEGATIVE_INFINITY;
  private messages = 0;
  private updates = 0;
  private snapshots = 0;
  private serialMessages = 0;
  private totalBytes = 0;
  private maxBytes = 0;

  public constructor(options: {
    logger: Logger;
    label: string;
    enabled?: boolean;
    now?: () => number;
  }) {
    this.logger = options.logger;
    this.label = options.label;
    this.enabled = options.enabled ?? isPerformanceLoggingEnabled();
    this.now = options.now ?? Date.now;
    this.startedMs = this.now();
    this.lastReportMs = this.startedMs;
  }

  public recordMessage(type: string, payload?: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    this.messages += 1;
    if (type === 'update') {
      this.updates += 1;
    } else if (type === 'snapshot') {
      this.snapshots += 1;
    } else if (type === 'serial') {
      this.serialMessages += 1;
    }
    const byteCount = estimatePayloadBytes(payload);
    this.totalBytes += byteCount;
    this.maxBytes = Math.max(this.maxBytes, byteCount);
    if (byteCount >= LARGE_MESSAGE_BYTES) {
      this.warn(
        `Debug80 performance: ${this.label} posted a large ${type} message (${formatBytes(
          byteCount
        )}).`
      );
    }
    this.maybeReport(this.now(), false);
  }

  public finish(): void {
    if (!this.enabled) {
      return;
    }
    this.maybeReport(this.now(), true);
  }

  private maybeReport(nowMs: number, force: boolean): void {
    if (!force && nowMs - this.lastReportMs < REPORT_INTERVAL_MS) {
      return;
    }
    const elapsedMs = Math.max(1, nowMs - this.startedMs);
    const seconds = elapsedMs / 1000;
    this.logger.info(
      `Debug80 perf ${this.label}: messages/s=${(this.messages / seconds).toFixed(
        1
      )} updates/s=${(this.updates / seconds).toFixed(1)} snapshots/s=${(
        this.snapshots / seconds
      ).toFixed(1)} serial/s=${(this.serialMessages / seconds).toFixed(
        1
      )} avgPayload=${formatBytes(this.messages > 0 ? this.totalBytes / this.messages : 0)} maxPayload=${formatBytes(
        this.maxBytes
      )}`
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

function estimatePayloadBytes(payload: Record<string, unknown> | undefined): number {
  if (payload === undefined) {
    return 0;
  }
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    return 0;
  }
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)}MiB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)}KiB`;
  }
  return `${Math.round(value)}B`;
}
