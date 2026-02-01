import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '../../../src/platforms/tec1g/runtime';

function makeRuntime() {
  return createTec1gRuntime(
    {
      regions: [
        { start: 0x0000, end: 0x7fff, kind: 'ram' as const },
        { start: 0xc000, end: 0xffff, kind: 'rom' as const },
      ],
      romRanges: [{ start: 0xc000, end: 0xffff }],
      appStart: 0x0000,
      entry: 0x0000,
      updateMs: 100,
      yieldMs: 10,
    },
    () => {}
  );
}

describe('port 0x03 (SYS_INPUT)', () => {
  it('bit 3 (CART) is 0 when no cartridge present', () => {
    const rt = makeRuntime();
    rt.state.cartridgePresent = false;
    const value = rt.ioHandlers.read(0x03);
    expect(value & 0x08).toBe(0);
  });

  it('bit 3 (CART) is 1 when cartridge present', () => {
    const rt = makeRuntime();
    rt.state.cartridgePresent = true;
    const value = rt.ioHandlers.read(0x03);
    expect(value & 0x08).toBe(0x08);
  });

  it('bit 3 (CART) is independent of expand state', () => {
    const rt = makeRuntime();

    // expand on, no cartridge → bit 3 should be 0
    rt.state.expandEnabled = true;
    rt.state.cartridgePresent = false;
    expect(rt.ioHandlers.read(0x03) & 0x08).toBe(0);

    // expand off, cartridge present → bit 3 should be 1
    rt.state.expandEnabled = false;
    rt.state.cartridgePresent = true;
    expect(rt.ioHandlers.read(0x03) & 0x08).toBe(0x08);
  });

  it('bit 2 (EXPAND) is independent of cartridge state', () => {
    const rt = makeRuntime();

    rt.state.expandEnabled = true;
    rt.state.cartridgePresent = false;
    expect(rt.ioHandlers.read(0x03) & 0x04).toBe(0x04);

    rt.state.expandEnabled = false;
    rt.state.cartridgePresent = true;
    expect(rt.ioHandlers.read(0x03) & 0x04).toBe(0);
  });
});
