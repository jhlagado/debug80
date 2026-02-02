import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '../../../src/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../../../src/platforms/types';

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
    rtcEnabled: false,
    sdEnabled: false,
  };
  return createTec1gRuntime(config, () => {});
}

describe('TEC-1G GLCD instruction handling', () => {
  it('writes and reads DDRAM in text mode', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x80); // DDRAM addr
    rt.ioHandlers.write(0x87, 0x41);
    rt.ioHandlers.write(0x07, 0x80);
    const value = rt.ioHandlers.read(0x87);
    expect(value).toBe(0x41);
  });

  it('writes and reads GDRAM in graphics mode', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x26); // function set: RE=1, G=1
    rt.ioHandlers.write(0x07, 0x80); // row 0
    rt.ioHandlers.write(0x07, 0x80); // column 0
    rt.ioHandlers.write(0x87, 0xaa);
    expect(rt.state.glcdGraphics).toBe(true);
    expect(rt.state.glcd[0]).toBe(0xaa);
    rt.state.glcdRowAddr = 0;
    rt.state.glcdRowBase = 0;
    rt.state.glcdCol = 0;
    rt.state.glcdGdramPhase = 0;
    const value = rt.ioHandlers.read(0x87);
    expect(value).toBe(0xaa);
  });

  it('busy flag clears after cycles', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x80);
    rt.ioHandlers.write(0x87, 0x41);
    expect(rt.ioHandlers.read(0x07) & 0x80).toBe(0x80);
    rt.recordCycles(rt.state.clockHz);
    expect(rt.ioHandlers.read(0x07) & 0x80).toBe(0x00);
  });
});
