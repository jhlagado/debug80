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
    protectOnReset: false,
    rtcEnabled: false,
    sdEnabled: false,
    sdHighCapacity: true,
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

  it('drives the 8x8 display from red port 0x06 and row 0x05 independently of keyboard state', () => {
    const rt = makeRuntime(true);

    rt.applyMatrixKey(2, 4, true);
    rt.ioHandlers.write(0x06, 0xaa);
    rt.ioHandlers.write(0x05, 0x04);

    expect(rt.state.display.ledMatrixRedLatch).toBe(0xaa);
    expect(rt.state.display.ledMatrixRowLatch).toBe(0x04);
    expect(rt.state.display.ledMatrixRedRows[2]).toBe(0xaa);
    expect(rt.state.display.ledMatrixRedRows[0]).toBe(0x00);
    rt.recordCycles(4096);
    expect(rt.state.display.ledMatrixBrightnessR[17]).toBeGreaterThan(0);
    expect(rt.ioHandlers.read(0x02fe) & (1 << 4)).toBe(0);
  });

  it('drives green and blue column latches on 0xF8 and 0xF9', () => {
    const rt = makeRuntime(true);
    rt.ioHandlers.write(0xf8, 0x0f);
    rt.ioHandlers.write(0xf9, 0xf0);
    expect(rt.state.display.ledMatrixGreenLatch).toBe(0x0f);
    expect(rt.state.display.ledMatrixBlueLatch).toBe(0xf0);
    rt.ioHandlers.write(0x05, 0x01);
    expect(rt.state.display.ledMatrixGreenRows[0]).toBe(0x0f);
    expect(rt.state.display.ledMatrixBlueRows[0]).toBe(0xf0);
  });

  it('returns 0xff when matrix mode is disabled', () => {
    const rt = makeRuntime(false);
    rt.applyMatrixKey(1, 2, true);
    const value = rt.ioHandlers.read(0x01fe);
    expect(value).toBe(0xff);
  });

  it('clears the 8x8 display state on reset', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0x5a);
    rt.ioHandlers.write(0x05, 0x01);
    rt.resetState();

    expect(rt.state.display.ledMatrixRowLatch).toBe(0);
    expect(rt.state.display.ledMatrixRedLatch).toBe(0);
    expect(rt.state.display.ledMatrixRedRows).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rt.state.display.ledMatrixBrightnessR).toEqual(Array.from({ length: 64 }, () => 0));
    expect(rt.state.display.ledMatrixBrightnessG).toEqual(Array.from({ length: 64 }, () => 0));
    expect(rt.state.display.ledMatrixBrightnessB).toEqual(Array.from({ length: 64 }, () => 0));
  });

  it('treats the visible matrix as the direct result of row and data latches', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0x01);
    rt.ioHandlers.write(0x05, 0x03);

    expect(rt.state.display.ledMatrixRedRows).toEqual([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    rt.ioHandlers.write(0x06, 0x02);
    expect(rt.state.display.ledMatrixRedRows).toEqual([0x02, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    rt.ioHandlers.write(0x05, 0x04);
    expect(rt.state.display.ledMatrixRedRows).toEqual([0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00]);

    rt.recordCycles(4096 * 300);
    expect(rt.state.display.ledMatrixRedRows).toEqual([0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00]);
  });

  it('accumulates brightness while a row is selected and decays after the scan moves on', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0x01);
    rt.ioHandlers.write(0x05, 0x01);
    rt.recordCycles(1);
    const firstLevel = rt.state.display.ledMatrixBrightnessR[0];

    expect(firstLevel).toBeGreaterThan(0);
    expect(firstLevel).toBeLessThan(250);

    rt.recordCycles(4096);
    expect(rt.state.display.ledMatrixBrightnessR[0]).toBeGreaterThan(firstLevel);

    rt.ioHandlers.write(0x05, 0x02);
    rt.recordCycles(4096);
    expect(rt.state.display.ledMatrixBrightnessR[0]).toBeLessThan(255);
    expect(rt.state.display.ledMatrixBrightnessR[8]).toBeGreaterThan(0);

    rt.recordCycles(4096 * 1000);
    expect(rt.state.display.ledMatrixBrightnessR[0]).toBeLessThan(0.001);
  });

  it('suppresses keypad NMI when matrix mode is enabled', () => {
    const rt = makeRuntime(true);
    rt.applyKey(0x12);
    expect(rt.state.input.nmiPending).toBe(false);
    expect(rt.state.input.keyValue).toBe(0x7f);
  });
});
