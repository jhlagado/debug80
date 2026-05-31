import { describe, expect, it } from 'vitest';
import { createTec1gRuntime, TEC1G_FAST_HZ } from '../../../src/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../../../src/platforms/types';
import { millisecondsToClocks } from '../../../src/platforms/tec-common';
import { serializeTec1gUpdateFromRuntimeState } from '../../../src/platforms/tec1g/update-controller';

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
    const value = rt.ioHandlers.read(0xf7fe);
    expect(value & (1 << 5)).toBe(0);
  });

  it('decodes each active-low matrix keyboard row address', () => {
    const rt = makeRuntime(true);
    const rowPorts = [0xfefe, 0xfdfe, 0xfbfe, 0xf7fe, 0xeffe, 0xdffe, 0xbffe, 0x7ffe];

    for (let row = 0; row < rowPorts.length; row += 1) {
      rt.applyMatrixKey(row, row, true);
    }

    rowPorts.forEach((port, row) => {
      expect(rt.ioHandlers.read(port) & (1 << row)).toBe(0);
    });
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
    // Brightness commits on idle (~40ms) or when all 8 row lines have been selected — not on every OUT.
    const idleCycles = millisecondsToClocks(TEC1G_FAST_HZ, 45) + 1000;
    rt.recordCycles(idleCycles);
    expect(rt.state.display.ledMatrixBrightnessR[17]).toBe(0);
    expect(rt.state.display.ledMatrixBrightnessR[22]).toBe(255);
    expect(rt.ioHandlers.read(0xfbfe) & (1 << 4)).toBe(0);
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

    expect(rt.state.display.ledMatrixRedRows).toEqual([
      0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    rt.ioHandlers.write(0x06, 0x02);
    expect(rt.state.display.ledMatrixRedRows).toEqual([
      0x02, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    rt.ioHandlers.write(0x05, 0x04);
    expect(rt.state.display.ledMatrixRedRows).toEqual([
      0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    rt.recordCycles(4096 * 300);
    expect(rt.state.display.ledMatrixRedRows).toEqual([
      0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
  });

  it('renders a completed scan as one-eighth duty brightness per row', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0xff);
    rt.ioHandlers.write(0x05, 0x01);
    for (let i = 1; i < 8; i += 1) {
      rt.recordCycles(100);
      rt.ioHandlers.write(0x05, 1 << i);
    }
    expect(rt.state.display.ledMatrixBrightnessR[0]).toBe(0);

    rt.recordCycles(100);
    rt.ioHandlers.write(0x05, 0x01);
    for (let i = 0; i < 64; i += 1) {
      expect(rt.state.display.ledMatrixBrightnessR[i]).toBe(32);
    }
  });

  it('renders longer row dwell as brighter matrix pixels', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0xff);
    rt.ioHandlers.write(0x05, 0x01);
    rt.recordCycles(1000);
    for (let i = 1; i < 8; i += 1) {
      rt.ioHandlers.write(0x05, 1 << i);
      rt.recordCycles(100);
    }
    rt.ioHandlers.write(0x05, 0x01);

    expect(rt.state.display.ledMatrixBrightnessR[0]).toBe(150);
    expect(rt.state.display.ledMatrixBrightnessR[8]).toBe(15);
  });

  it('does not publish partial matrix duty during unrelated UI serialization', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0xff);
    rt.ioHandlers.write(0x05, 0x01);
    rt.recordCycles(1000);
    const payload = serializeTec1gUpdateFromRuntimeState(rt.state);

    expect(payload.matrixBrightness?.[0]).toBe(0);
    rt.ioHandlers.write(0x05, 0x02);
    expect(rt.state.display.matrixDutyR[0]).toBe(1000);
  });

  it('does not commit on eight row writes if only one physical row was revisited', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0xff);
    for (let i = 0; i < 8; i += 1) {
      rt.ioHandlers.write(0x05, 0x01);
    }
    expect(rt.state.display.matrixRowsVisitedMask).toBe(0x01);
    expect(rt.state.display.ledMatrixBrightnessR[0]).toBe(0);

    const idleCycles = millisecondsToClocks(TEC1G_FAST_HZ, 45) + 1000;
    rt.recordCycles(idleCycles);
    expect(rt.state.display.ledMatrixBrightnessR[0]).toBe(255);
  });

  it('commits partial staging after idle when scan stalls (debug / slow code)', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0x03);
    rt.ioHandlers.write(0x05, 0x01);
    expect(rt.state.display.ledMatrixBrightnessR[0]).toBe(0);

    const idleCycles = millisecondsToClocks(TEC1G_FAST_HZ, 45) + 1000;
    rt.recordCycles(idleCycles);
    expect(rt.state.display.ledMatrixBrightnessR[0]).toBe(0);
    expect(rt.state.display.ledMatrixBrightnessR[5]).toBe(0);
    expect(rt.state.display.ledMatrixBrightnessR[6]).toBe(255);
    expect(rt.state.display.ledMatrixBrightnessR[7]).toBe(255);
  });

  it('mirrors hardware columns into visible 8x8 brightness columns', () => {
    const rightmostRt = makeRuntime(true);

    rightmostRt.ioHandlers.write(0x06, 0x01);
    rightmostRt.ioHandlers.write(0x05, 0x01);
    rightmostRt.recordCycles(millisecondsToClocks(TEC1G_FAST_HZ, 45) + 1000);

    expect(rightmostRt.state.display.ledMatrixBrightnessR[0]).toBe(0);
    expect(rightmostRt.state.display.ledMatrixBrightnessR[7]).toBe(255);

    const leftmostRt = makeRuntime(true);

    leftmostRt.ioHandlers.write(0x06, 0x80);
    leftmostRt.ioHandlers.write(0x05, 0x01);
    leftmostRt.recordCycles(millisecondsToClocks(TEC1G_FAST_HZ, 45) + 1000);

    expect(leftmostRt.state.display.ledMatrixBrightnessR[0]).toBe(255);
    expect(leftmostRt.state.display.ledMatrixBrightnessR[7]).toBe(0);
  });

  it('allows explicit keypad input while matrix mode is enabled', () => {
    const rt = makeRuntime(true);
    rt.applyKey(0x12);
    expect(rt.state.input.nmiPending).toBe(true);
    expect(rt.state.input.keyValue).toBe(0x12);
  });
});
