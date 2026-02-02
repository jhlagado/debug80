import { describe, expect, it } from 'vitest';
import { Ds1302 } from '../../../src/platforms/tec1g/ds1302';

const CE_BIT = 0x10;
const CLK_BIT = 0x40;
const IO_BIT = 0x01;

function pulse(ds: Ds1302, bit: number): void {
  const io = bit ? IO_BIT : 0;
  ds.write(CE_BIT | io);
  ds.write(CE_BIT | CLK_BIT | io);
  ds.write(CE_BIT | io);
}

function writeByte(ds: Ds1302, value: number): void {
  for (let i = 0; i < 8; i += 1) {
    pulse(ds, (value >> i) & 1);
  }
}

function readByte(ds: Ds1302): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    ds.write(CE_BIT);
    ds.write(CE_BIT | CLK_BIT);
    const bit = ds.read() & 1;
    ds.write(CE_BIT);
    value |= bit << i;
  }
  return value & 0xff;
}

describe('Ds1302', () => {
  it('writes then reads a register value', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    const addr = 0x02;
    const cmdWrite = (addr << 1) | 0x00;
    writeByte(ds, cmdWrite);
    writeByte(ds, 0xa5);
    ds.write(0x00);

    ds.write(CE_BIT);
    const cmdRead = (addr << 1) | 0x01;
    writeByte(ds, cmdRead);
    const value = readByte(ds);
    ds.write(0x00);
    expect(value).toBe(0xa5);
  });

  it('returns BCD time values', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    const cmdRead = (0x00 << 1) | 0x01;
    writeByte(ds, cmdRead);
    const value = readByte(ds);
    ds.write(0x00);
    const tens = (value >> 4) & 0x0f;
    const ones = value & 0x0f;
    expect(tens).toBeGreaterThanOrEqual(0);
    expect(tens).toBeLessThan(6);
    expect(ones).toBeGreaterThanOrEqual(0);
    expect(ones).toBeLessThan(10);
  });

  it('writes and reads PRAM when not write protected', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    const cmdWrite = (0x20 << 1) | 0x00;
    writeByte(ds, cmdWrite);
    writeByte(ds, 0x5a);
    ds.write(0x00);

    ds.write(CE_BIT);
    const cmdRead = (0x20 << 1) | 0x01;
    writeByte(ds, cmdRead);
    const value = readByte(ds);
    ds.write(0x00);
    expect(value).toBe(0x5a);
  });

  it('honors write protect', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    const cmdWp = (0x07 << 1) | 0x00;
    writeByte(ds, cmdWp);
    writeByte(ds, 0x80);
    ds.write(0x00);

    ds.write(CE_BIT);
    const cmdWrite = (0x20 << 1) | 0x00;
    writeByte(ds, cmdWrite);
    writeByte(ds, 0x12);
    ds.write(0x00);

    ds.write(CE_BIT);
    const cmdRead = (0x20 << 1) | 0x01;
    writeByte(ds, cmdRead);
    const value = readByte(ds);
    ds.write(0x00);
    expect(value).toBe(0x00);
  });

  it('supports burst read for sequential registers', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    writeByte(ds, (0x01 << 1) | 0x00);
    writeByte(ds, 0x11);
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, (0x02 << 1) | 0x00);
    writeByte(ds, 0x22);
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, 0xbf);
    const first = readByte(ds);
    const second = readByte(ds);
    ds.write(0x00);
    expect(first).toBe(0x11);
    expect(second).toBe(0x22);
  });
});
