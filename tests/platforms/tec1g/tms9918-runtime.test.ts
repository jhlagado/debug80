/**
 * @file Runtime-level tests for the TEC-1G TMS9918/TMS9929 card.
 */

import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '../../../src/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../../../src/platforms/types';
import { TMS9918_CONTROL_PORT, TMS9918_DATA_PORT } from '../../../src/platforms/tec1g/tms9918';

function makeRuntime() {
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
    matrixMode: false,
    protectOnReset: false,
    rtcEnabled: false,
    sdEnabled: false,
    sdHighCapacity: true,
  };
  return createTec1gRuntime(config, () => {});
}

describe('TEC-1G TMS9918 runtime integration', () => {
  it('keeps the video card detached until the panel activates it', () => {
    const rt = makeRuntime();

    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write(TMS9918_DATA_PORT, 0x44);
    expect(rt.ioHandlers.read(TMS9918_DATA_PORT)).toBe(0xff);

    rt.setTms9918Active(true);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write(TMS9918_DATA_PORT, 0x44);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    expect(rt.ioHandlers.read(TMS9918_DATA_PORT)).toBe(0x44);
  });

  it('raises NMI from the PAL frame cadence when TMS interrupts are enabled', () => {
    const rt = makeRuntime();
    rt.setTms9918Active(true);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x20);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x81);

    rt.recordCycles(79_999);
    expect(rt.ioHandlers.tick?.()).toBeUndefined();

    rt.recordCycles(1);
    expect(rt.ioHandlers.tick?.()).toEqual({
      interrupt: { nonMaskable: true, data: 0x66 },
    });
    expect(rt.ioHandlers.tick?.()).toBeUndefined();
  });

  it('resets the video device while preserving panel attachment', () => {
    const rt = makeRuntime();
    rt.setTms9918Active(true);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write(TMS9918_DATA_PORT, 0x44);
    expect(rt.state.display.tms9918.snapshot().vram[0]).toBe(0x44);

    rt.resetState();

    const resetSnapshot = rt.state.display.tms9918.snapshot();
    expect(resetSnapshot.active).toBe(true);
    expect(resetSnapshot.vram[0]).toBe(0x00);
    expect(resetSnapshot.registers).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);

    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write(TMS9918_DATA_PORT, 0x55);
    expect(rt.state.display.tms9918.snapshot().vram[0]).toBe(0x55);
  });
});
