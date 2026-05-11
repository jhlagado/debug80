/**
 * @file UI performance monitor tests.
 */

import { describe, expect, it } from 'vitest';
import { createUiPerformanceMonitor } from '../../src/extension/ui-performance-monitor';
import type { Logger } from '../../src/util/logger';

class CapturingLogger implements Logger {
  public readonly infos: string[] = [];
  public readonly warnings: string[] = [];

  public debug(): void {}

  public info(message: string): void {
    this.infos.push(message);
  }

  public warn(message: string): void {
    this.warnings.push(message);
  }

  public error(): void {}
}

describe('ui performance monitor', () => {
  it('does nothing when disabled', () => {
    let now = 0;
    const logger = new CapturingLogger();
    const monitor = createUiPerformanceMonitor({
      logger,
      label: 'test-view',
      enabled: false,
      now: () => now,
    });

    monitor.recordMessage('update', { type: 'update', digits: [1, 2, 3] });
    now = 6000;
    monitor.finish();

    expect(logger.infos).toEqual([]);
    expect(logger.warnings).toEqual([]);
  });

  it('reports message rates and payload sizes when enabled', () => {
    let now = 0;
    const logger = new CapturingLogger();
    const monitor = createUiPerformanceMonitor({
      logger,
      label: 'test-view',
      enabled: true,
      now: () => now,
    });

    monitor.recordMessage('update', { type: 'update', digits: [1, 2, 3] });
    monitor.recordMessage('snapshot', { type: 'snapshot', views: [] });
    now = 5000;
    monitor.recordMessage('serial', { type: 'serial', text: 'hello' });

    expect(logger.infos).toHaveLength(1);
    expect(logger.infos[0]).toContain('Debug80 perf test-view:');
    expect(logger.infos[0]).toContain('messages/s=0.6');
    expect(logger.infos[0]).toContain('updates/s=0.2');
    expect(logger.infos[0]).toContain('snapshots/s=0.2');
    expect(logger.infos[0]).toContain('serial/s=0.2');
    expect(logger.infos[0]).toContain('maxPayload=');
  });

  it('warns for large payloads without spamming', () => {
    let now = 0;
    const logger = new CapturingLogger();
    const monitor = createUiPerformanceMonitor({
      logger,
      label: 'test-view',
      enabled: true,
      now: () => now,
    });
    const largePayload = { type: 'snapshot', text: 'x'.repeat(260 * 1024) };

    monitor.recordMessage('snapshot', largePayload);
    now = 1000;
    monitor.recordMessage('snapshot', largePayload);
    now = 6000;
    monitor.recordMessage('snapshot', largePayload);

    expect(logger.warnings).toHaveLength(2);
    expect(logger.warnings[0]).toContain('large snapshot message');
  });
});
