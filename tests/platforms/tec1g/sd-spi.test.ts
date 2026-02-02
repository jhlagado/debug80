import { describe, expect, it } from 'vitest';
import { SdSpi } from '../../../src/platforms/tec1g/sd-spi';

const MOSI_BIT = 0x01;
const CLK_BIT = 0x02;
const CS_BIT = 0x04;

function writeSpi(spi: SdSpi, value: number): void {
  spi.write(value & 0xff);
}

function pulse(spi: SdSpi, bit: number): void {
  const io = bit ? MOSI_BIT : 0;
  writeSpi(spi, io); // CS active low (bit clear)
  writeSpi(spi, io | CLK_BIT);
  writeSpi(spi, io);
}

function writeByte(spi: SdSpi, value: number): void {
  for (let i = 7; i >= 0; i -= 1) {
    pulse(spi, (value >> i) & 1);
  }
}

function readByte(spi: SdSpi): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    writeSpi(spi, MOSI_BIT);
    writeSpi(spi, MOSI_BIT | CLK_BIT);
    const bit = spi.read() & 1;
    writeSpi(spi, MOSI_BIT);
    value = ((value << 1) | bit) & 0xff;
  }
  return value & 0xff;
}

function readResponseByte(spi: SdSpi): number {
  for (let i = 0; i < 8; i += 1) {
    const value = readByte(spi);
    if (value !== 0xff) {
      return value;
    }
  }
  return 0xff;
}

function sendCommand(spi: SdSpi, bytes: number[]): void {
  bytes.forEach((byte) => writeByte(spi, byte));
}

describe('SdSpi', () => {
  it('returns 0xff when chip-select is inactive', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, CS_BIT);
    expect(spi.read()).toBe(0xff);
  });

  it('captures CMD0 command frames', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00); // CS active
    writeByte(spi, 0x40);
    writeByte(spi, 0x00);
    writeByte(spi, 0x00);
    writeByte(spi, 0x00);
    writeByte(spi, 0x00);
    writeByte(spi, 0x95);
    const cmd = spi.getLastCommand();
    expect(cmd).toBeDefined();
    expect(cmd?.cmd).toBe(0);
    expect(cmd?.arg).toBe(0);
    expect(cmd?.crc).toBe(0x95);
  });

  it('responds to CMD0 and CMD8 with R1/R7 bytes', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x40, 0x00, 0x00, 0x00, 0x00, 0x95]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x48, 0x00, 0x00, 0x01, 0xaa, 0x87]);
    expect(readResponseByte(spi)).toBe(0x01);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x01);
    expect(readByte(spi)).toBe(0xaa);
  });

  it('completes ACMD41 init sequence and supports CMD58', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    expect(readResponseByte(spi)).toBe(0x00);
    sendCommand(spi, [0x7a, 0x00, 0x00, 0x00, 0x00, 0xfd]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x40);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
  });

  it('responds to CMD17 with data token when ready', () => {
    const image = new Uint8Array(1024);
    image[0x0002] = 0x5a;
    const spi = new SdSpi({ csMask: CS_BIT, image });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x51, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xfe);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x5a);
  });
});
