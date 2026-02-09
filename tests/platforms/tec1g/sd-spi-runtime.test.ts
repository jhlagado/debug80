import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '../../../src/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../../../src/platforms/types';

const MOSI_BIT = 0x01;
const CLK_BIT = 0x02;

function makeRuntime(image?: Uint8Array) {
  let sdImagePath: string | undefined;
  if (image) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-sd-'));
    sdImagePath = path.join(dir, 'sd.img');
    fs.writeFileSync(sdImagePath, image);
  }
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
    sdEnabled: true,
    sdHighCapacity: true,
    ...(sdImagePath ? { sdImagePath } : {}),
  };
  return createTec1gRuntime(config, () => {});
}

function writePort(rt: ReturnType<typeof makeRuntime>, value: number): void {
  rt.ioHandlers.write(0xfd, value & 0xff);
}

function readPort(rt: ReturnType<typeof makeRuntime>): number {
  return rt.ioHandlers.read(0xfd) & 0xff;
}

function pulse(rt: ReturnType<typeof makeRuntime>, bit: number): void {
  const io = bit ? MOSI_BIT : 0;
  writePort(rt, io);
  writePort(rt, io | CLK_BIT);
  writePort(rt, io);
}

function writeByte(rt: ReturnType<typeof makeRuntime>, value: number): void {
  for (let i = 7; i >= 0; i -= 1) {
    pulse(rt, (value >> i) & 1);
  }
}

function readByte(rt: ReturnType<typeof makeRuntime>): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    writePort(rt, MOSI_BIT);
    writePort(rt, MOSI_BIT | CLK_BIT);
    const bit = readPort(rt) & 1;
    writePort(rt, MOSI_BIT);
    value = ((value << 1) | bit) & 0xff;
  }
  return value & 0xff;
}

function readResponse(rt: ReturnType<typeof makeRuntime>): number {
  for (let i = 0; i < 8; i += 1) {
    const value = readByte(rt);
    if (value !== 0xff) {
      return value;
    }
  }
  return 0xff;
}

function sendCommand(rt: ReturnType<typeof makeRuntime>, bytes: number[]): void {
  bytes.forEach((byte) => writeByte(rt, byte));
}

describe('TEC-1G SD SPI runtime', () => {
  it('initializes and reads a block through port 0xFD', () => {
    const image = new Uint8Array(1024);
    image[0x0201] = 0xab;
    const rt = makeRuntime(image);
    writePort(rt, 0x00);
    sendCommand(rt, [0x40, 0x00, 0x00, 0x00, 0x00, 0x95]);
    expect(readResponse(rt)).toBe(0x01);
    sendCommand(rt, [0x48, 0x00, 0x00, 0x01, 0xaa, 0x87]);
    expect(readResponse(rt)).toBe(0x01);
    sendCommand(rt, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponse(rt);
    sendCommand(rt, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponse(rt);
    sendCommand(rt, [0x7a, 0x00, 0x00, 0x00, 0x00, 0xfd]);
    expect(readResponse(rt)).toBe(0x00);
    expect(readByte(rt)).toBe(0x40);
    sendCommand(rt, [0x51, 0x00, 0x00, 0x00, 0x01, 0xff]);
    expect(readResponse(rt)).toBe(0x00);
    expect(readByte(rt)).toBe(0xfe);
    expect(readByte(rt)).toBe(0x00);
    expect(readByte(rt)).toBe(0xab);
  });
});
