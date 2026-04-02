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
    protectOnReset: false,
    rtcEnabled: false,
    sdEnabled: false,
    sdHighCapacity: true,
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
    expect(rt.state.display.glcdCtrl.glcdGraphics).toBe(true);
    expect(rt.state.display.glcdCtrl.glcd[0]).toBe(0xaa);
    rt.state.display.glcdCtrl.glcdRowAddr = 0;
    rt.state.display.glcdCtrl.glcdRowBase = 0;
    rt.state.display.glcdCtrl.glcdCol = 0;
    rt.state.display.glcdCtrl.glcdGdramPhase = 0;
    const dummy = rt.ioHandlers.read(0x87);
    const value = rt.ioHandlers.read(0x87);
    expect(dummy).toBe(0x00);
    expect(value).toBe(0xaa);
  });

  it('toggles reverse line mask in extended mode', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x24); // function set: RE=1, G=0
    rt.ioHandlers.write(0x07, 0x04); // reverse line 0
    expect(rt.state.display.glcdCtrl.glcdReverseMask & 0x01).toBe(0x01);
    rt.ioHandlers.write(0x07, 0x04); // toggle off
    expect(rt.state.display.glcdCtrl.glcdReverseMask & 0x01).toBe(0x00);
    rt.ioHandlers.write(0x07, 0x20); // back to basic
  });

  it('busy flag clears after cycles', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x80);
    rt.ioHandlers.write(0x87, 0x41);
    expect(rt.ioHandlers.read(0x07) & 0x80).toBe(0x80);
    rt.recordCycles(rt.state.timing.clockHz);
    expect(rt.ioHandlers.read(0x07) & 0x80).toBe(0x00);
  });

  it('clear command resets DDRAM and entry state', () => {
    const rt = makeRuntime();
    // Write a byte to DDRAM first
    rt.ioHandlers.write(0x07, 0x80); // set DDRAM addr
    rt.ioHandlers.write(0x87, 0x41); // write 'A'
    rt.recordCycles(rt.state.timing.clockHz); // clear busy
    // Issue clear command (0x01)
    rt.ioHandlers.write(0x07, 0x01);
    rt.recordCycles(rt.state.timing.clockHz); // clear busy
    // DDRAM should be filled with spaces (0x20)
    expect(rt.state.display.glcdCtrl.glcdDdram[0]).toBe(0x20);
    // Entry mode should be reset to increment, no shift
    expect(rt.state.display.glcdCtrl.glcdEntryIncrement).toBe(true);
    expect(rt.state.display.glcdCtrl.glcdEntryShift).toBe(false);
    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(0);
  });

  it('display on/off command toggles display and cursor', () => {
    const rt = makeRuntime();
    // Turn off display: 0x08 (display base, all flags off)
    rt.ioHandlers.write(0x07, 0x08);
    expect(rt.state.display.glcdCtrl.glcdDisplayOn).toBe(false);
    expect(rt.state.display.glcdCtrl.glcdCursorOn).toBe(false);
    // Turn on display + cursor: 0x0E (0x08 | 0x04 | 0x02)
    rt.ioHandlers.write(0x07, 0x0e);
    expect(rt.state.display.glcdCtrl.glcdDisplayOn).toBe(true);
    expect(rt.state.display.glcdCtrl.glcdCursorOn).toBe(true);
  });

  it('scroll/shift right moves display shift', () => {
    const rt = makeRuntime();
    // Shift display right: 0x1C (0x10 | 0x08 | 0x04)
    rt.ioHandlers.write(0x07, 0x1c);
    // Shift right = shiftDisplay(-1)
    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(-1);
    // Shift display left: 0x18 (0x10 | 0x08)
    rt.ioHandlers.write(0x07, 0x18);
    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(0);
  });

  it('scroll mode enable/disable in extended mode', () => {
    const rt = makeRuntime();
    // Enter RE mode
    rt.ioHandlers.write(0x07, 0x24); // function set: RE=1, G=0
    // Enable scroll mode: 0x03 (scroll base 0x02 | shift bit 0x01)
    rt.ioHandlers.write(0x07, 0x03);
    expect(rt.state.display.glcdCtrl.glcdScrollMode).toBe(true);
    // Disable scroll mode: 0x02 (scroll base, no shift bit)
    rt.ioHandlers.write(0x07, 0x02);
    expect(rt.state.display.glcdCtrl.glcdScrollMode).toBe(false);
    // Back to basic
    rt.ioHandlers.write(0x07, 0x20);
  });

  it('applies scroll address only while scroll mode is enabled', () => {
    const rt = makeRuntime();

    rt.ioHandlers.write(0x07, 0x24); // function set: RE=1, G=0
    rt.ioHandlers.write(0x07, 0x4a); // scroll address 10 without scroll mode
    expect(rt.state.display.glcdCtrl.glcdScroll).toBe(0);

    rt.ioHandlers.write(0x07, 0x03); // enable scroll mode
    rt.ioHandlers.write(0x07, 0x4a); // scroll address 10
    expect(rt.state.display.glcdCtrl.glcdScroll).toBe(10);
  });

  it('shifts text after a complete DDRAM write when entry shift is enabled', () => {
    const rt = makeRuntime();

    rt.ioHandlers.write(0x07, 0x07); // entry mode: increment with shift
    rt.ioHandlers.write(0x07, 0x80); // DDRAM addr
    rt.ioHandlers.write(0x87, 0x41); // first byte, phase only
    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(0);

    rt.recordCycles(rt.state.timing.clockHz);
    rt.ioHandlers.write(0x87, 0x42); // second byte completes the character cell

    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(1);
    expect(rt.state.display.glcdCtrl.glcdDdramAddr).toBe(0x81);
    expect(rt.state.display.glcdCtrl.glcdDdramPhase).toBe(0);
  });
});
