/**
 * @file Shared performance diagnostics helpers.
 */

export function isPerformanceLoggingEnabled(): boolean {
  const value = process.env.DEBUG80_PERF;
  return value === '1' || value === 'true' || value === 'yes';
}
