/**
 * @file Direct tests for the TEC-1G TMS9918/TMS9929 video device model.
 */

import { describe, expect, it } from 'vitest';
import {
  TMS9918_CONTROL_PORT,
  TMS9918_DATA_PORT,
  createTms9918,
} from '../../../src/platforms/tec1g/tms9918';

describe('TEC-1G TMS9918 video device', () => {
  it('writes registers through the two-byte control port protocol', () => {
    const vdp = createTms9918();

    vdp.writeControl(0xc2);
    vdp.writeControl(0x81);

    expect(vdp.snapshot().registers[1]).toBe(0xc2);
  });

  it('writes and reads VRAM through the data port with auto-increment', () => {
    const vdp = createTms9918();

    vdp.writeControl(0x34);
    vdp.writeControl(0x40 | 0x12);
    vdp.writeData(0xab);
    vdp.writeData(0xcd);

    expect(vdp.snapshot().vram[0x1234]).toBe(0xab);
    expect(vdp.snapshot().vram[0x1235]).toBe(0xcd);

    vdp.writeControl(0x34);
    vdp.writeControl(0x12);

    expect(vdp.readData()).toBe(0xab);
    expect(vdp.readData()).toBe(0xcd);
  });

  it('reports frame interrupts at PAL cadence and clears them on status read', () => {
    const vdp = createTms9918({ videoStandard: 'pal' });
    vdp.writeControl(0x20);
    vdp.writeControl(0x81);

    vdp.advanceCycles(79_999);
    expect(vdp.consumeNmi()).toBe(false);

    vdp.advanceCycles(1);
    expect(vdp.peekStatus() & 0x80).toBe(0x80);
    expect(vdp.consumeNmi()).toBe(true);
    expect(vdp.consumeNmi()).toBe(false);

    expect(vdp.readStatus() & 0x80).toBe(0x80);
    expect(vdp.peekStatus() & 0x80).toBe(0);
  });

  it('disconnects from the bus without clearing VRAM state', () => {
    const vdp = createTms9918();

    vdp.writeControl(0x00);
    vdp.writeControl(0x40);
    vdp.writeData(0x5a);

    vdp.setActive(false);
    vdp.writeData(0xa5);
    expect(vdp.readData()).toBe(0xff);
    expect(vdp.readStatus()).toBe(0xff);

    vdp.setActive(true);
    vdp.writeControl(0x00);
    vdp.writeControl(0x00);
    expect(vdp.readData()).toBe(0x5a);
  });

  it('documents the TEC-1G fixed video ports', () => {
    expect(TMS9918_DATA_PORT).toBe(0xbe);
    expect(TMS9918_CONTROL_PORT).toBe(0xbf);
  });
});
