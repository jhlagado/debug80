/**
 * @file Runtime performance monitor tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRuntimePerformanceMonitor } from '../../src/debug/session/performance-monitor';
import type { Logger } from '../../src/util/logger';

function createLogger(): Logger & { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('runtime performance monitor', () => {
  it('logs enabled periodic summaries with throughput counters', () => {
    let now = 0;
    const logger = createLogger();
    const monitor = createRuntimePerformanceMonitor({
      logger,
      label: 'run',
      platform: 'tec1g',
      clockHz: 1_000_000,
      enabled: true,
      now: () => now,
    });

    monitor.recordStep(1000);
    now = 5000;
    monitor.recordStep(1000);

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0]?.[0]).toContain('Debug80 perf run');
    expect(logger.info.mock.calls[0]?.[0]).toContain('platform=tec1g');
  });

  it('warns when a runtime chunk runs too long before yielding', () => {
    const logger = createLogger();
    const monitor = createRuntimePerformanceMonitor({
      logger,
      label: 'run',
      platform: 'tec1g',
      clockHz: 1_000_000,
      enabled: false,
      now: () => 10_000,
    });

    monitor.recordChunk(75, 10);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('chunk took 75.0ms before yielding')
    );
  });

  it('warns when host scheduling resumes much later than requested', () => {
    const logger = createLogger();
    const monitor = createRuntimePerformanceMonitor({
      logger,
      label: 'run',
      platform: 'tec1g',
      clockHz: 1_000_000,
      enabled: false,
      now: () => 10_000,
    });

    monitor.recordYield(1, 250);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('yield resumed 249.0ms late'));
  });
});
