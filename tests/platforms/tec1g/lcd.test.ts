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

describe('TEC-1G LCD instruction handling', () => {
  it('entry mode decrement moves cursor backward', () => {
    const rt = makeRuntime();
    rt.state.lcdAddr = 0x80;
    rt.ioHandlers.write(0x04, 0x04); // entry mode: decrement, no shift
    rt.ioHandlers.write(0x84, 0x41);
    expect(rt.state.lcdAddr).toBe(0xe7);
  });

  it('entry mode shift updates display offset on write', () => {
    const rt = makeRuntime();
    rt.state.lcdDisplayShift = 0;
    rt.ioHandlers.write(0x04, 0x07); // entry mode: increment + shift
    rt.ioHandlers.write(0x84, 0x41);
    expect(rt.state.lcdDisplayShift).toBe(1);
  });

  it('display on/off control toggles state', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x04, 0x08); // display off
    expect(rt.state.lcdDisplayOn).toBe(false);
    rt.ioHandlers.write(0x04, 0x0c); // display on, cursor off
    expect(rt.state.lcdDisplayOn).toBe(true);
  });

  it('display control updates cursor and blink state', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x04, 0x0f); // display on, cursor on, blink on
    expect(rt.state.lcdCursorOn).toBe(true);
    expect(rt.state.lcdCursorBlink).toBe(true);
  });

  it('cursor shift updates address', () => {
    const rt = makeRuntime();
    rt.state.lcdAddr = 0x80;
    rt.ioHandlers.write(0x04, 0x10); // cursor move left
    expect(rt.state.lcdAddr).toBe(0xe7);
  });

  it('display shift updates display offset', () => {
    const rt = makeRuntime();
    rt.state.lcdDisplayShift = 0;
    rt.ioHandlers.write(0x04, 0x18); // display shift left
    expect(rt.state.lcdDisplayShift).toBe(19);
  });

  it('function set updates stored state', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x04, 0x38); // 8-bit, 2-line, 5x8
    expect(rt.state.lcdFunction.dataLength8).toBe(true);
    expect(rt.state.lcdFunction.lines2).toBe(true);
    expect(rt.state.lcdFunction.font5x8).toBe(true);
  });

  it('cgram read/write uses cgram address', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x04, 0x40); // set CGRAM addr 0
    rt.ioHandlers.write(0x84, 0x1f);
    rt.ioHandlers.write(0x04, 0x40); // reset addr
    const value = rt.ioHandlers.read(0x84);
    expect(value).toBe(0x1f);
  });

  it('lcd status read ignores high byte of port address', () => {
    const rt = makeRuntime();
    const low = rt.ioHandlers.read(0x0004);
    const high = rt.ioHandlers.read(0x1204);
    expect(high).toBe(low);
  });

  it('clear command resets DDRAM and clears busy flag after time', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x04, 0x80); // set DDRAM addr
    rt.ioHandlers.write(0x84, 0x41);
    rt.ioHandlers.write(0x04, 0x01); // clear display
    expect(rt.ioHandlers.read(0x04) & 0x80).toBe(0x80);
    rt.recordCycles(rt.state.clockHz);
    expect(rt.ioHandlers.read(0x04) & 0x80).toBe(0x00);
    expect(rt.state.lcd[0]).toBe(0x20);
    expect(rt.state.lcdAddr).toBe(0x80);
  });

  it('home command resets address and display shift', () => {
    const rt = makeRuntime();
    rt.state.lcdAddr = 0x94;
    rt.state.lcdDisplayShift = 3;
    rt.ioHandlers.write(0x04, 0x02); // home
    expect(rt.state.lcdAddr).toBe(0x80);
    expect(rt.state.lcdDisplayShift).toBe(0);
  });

  it('ddram read/write returns stored data', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x04, 0x80);
    rt.ioHandlers.write(0x84, 0x5a);
    rt.ioHandlers.write(0x04, 0x80);
    const value = rt.ioHandlers.read(0x84);
    expect(value).toBe(0x5a);
  });
});
