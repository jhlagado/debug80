import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '../../../src/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../../../src/platforms/types';

function makeRuntime(matrixMode = true) {
  const config: Tec1gPlatformConfigNormalized = {
    regions: [
      { start: 0x0000, end: 0x7fff, kind: 'ram' as const },
      { start: 0xc000, end: 0xffff, kind: 'rom' as const },
    ],
    romRanges: [{ start: 0xc000, end: 0xffff }],
    appStart: 0x0000,
    entry: 0x0000,
    updateMs: 100,
    yieldMs: 0,
    gimpSignal: false,
    expansionBankHi: false,
    matrixMode,
    rtcEnabled: false,
  };
  return createTec1gRuntime(config, () => {});
}

describe('TEC-1G matrix keyboard', () => {
  it('returns row data based on high byte when matrix mode is enabled', () => {
    const rt = makeRuntime(true);
    rt.applyMatrixKey(3, 5, true);
    const value = rt.ioHandlers.read(0x03fe);
    expect(value & (1 << 5)).toBe(0);
  });

  it('returns 0xff when matrix mode is disabled', () => {
    const rt = makeRuntime(false);
    rt.applyMatrixKey(1, 2, true);
    const value = rt.ioHandlers.read(0x01fe);
    expect(value).toBe(0xff);
  });

  it('suppresses keypad NMI when matrix mode is enabled', () => {
    const rt = makeRuntime(true);
    rt.applyKey(0x12);
    expect(rt.state.nmiPending).toBe(false);
    expect(rt.state.keyValue).toBe(0x7f);
  });
});
