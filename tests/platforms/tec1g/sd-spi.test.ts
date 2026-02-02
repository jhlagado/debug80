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
  for (let i = 0; i < 8; i += 1) {
    pulse(spi, (value >> i) & 1);
  }
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
});
