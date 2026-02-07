import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '../../../src/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../../../src/platforms/types';

function makeRuntime(onByte: (byte: number) => void) {
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
  };
  return createTec1gRuntime(config, () => {}, onByte);
}

describe('TEC-1G serial bitbang', () => {
  it('decodes a transmitted byte on TX line', () => {
    const bytes: number[] = [];
    const rt = makeRuntime((byte) => bytes.push(byte));
    const cyclesPerBit = rt.state.clockHz / 4800;
    const writeSerial = (level: 0 | 1): void => {
      rt.ioHandlers.write(0x01, level ? 0x40 : 0x00);
    };
    const advance = (): void => {
      rt.recordCycles(Math.ceil(cyclesPerBit));
    };

    const value = 0x55;
    writeSerial(1); // idle
    writeSerial(0); // start bit
    advance();
    for (let i = 0; i < 8; i += 1) {
      const bit = ((value >> i) & 1) as 0 | 1;
      writeSerial(bit);
      advance();
    }
    writeSerial(1); // stop bits
    advance();
    advance();
    rt.recordCycles(Math.ceil(cyclesPerBit * 4));

    expect(bytes).toEqual([value]);
  });
});
