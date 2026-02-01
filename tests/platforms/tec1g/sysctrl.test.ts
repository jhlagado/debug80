import { describe, expect, it } from 'vitest';
import { decodeSysCtrl } from '../../../src/platforms/tec1g/sysctrl';

describe('decodeSysCtrl', () => {
  it('enables shadow when bit 0 is clear', () => {
    expect(decodeSysCtrl(0x00).shadowEnabled).toBe(true);
    expect(decodeSysCtrl(0x01).shadowEnabled).toBe(false);
  });

  it('decodes protect and expand bits', () => {
    const state = decodeSysCtrl(0x06);
    expect(state.protectEnabled).toBe(true);
    expect(state.expandEnabled).toBe(true);
  });

  it('decodes bank A14 (bit 3)', () => {
    expect(decodeSysCtrl(0x00).bankA14).toBe(false);
    expect(decodeSysCtrl(0x08).bankA14).toBe(true);
  });

  it('decodes caps lock (bit 5)', () => {
    expect(decodeSysCtrl(0x00).capsLock).toBe(false);
    expect(decodeSysCtrl(0x20).capsLock).toBe(true);
  });

  it('decodes reserved bits (ffD4, ffD5, ffD6)', () => {
    expect(decodeSysCtrl(0x10).ffD4).toBe(true);
    expect(decodeSysCtrl(0x40).ffD5).toBe(true);
    expect(decodeSysCtrl(0x80).ffD6).toBe(true);
  });

  it('decodes all bits from 0xFF', () => {
    const state = decodeSysCtrl(0xff);
    expect(state.shadowEnabled).toBe(false);
    expect(state.protectEnabled).toBe(true);
    expect(state.expandEnabled).toBe(true);
    expect(state.bankA14).toBe(true);
    expect(state.ffD4).toBe(true);
    expect(state.capsLock).toBe(true);
    expect(state.ffD5).toBe(true);
    expect(state.ffD6).toBe(true);
  });

  it('decodes all bits from 0x00', () => {
    const state = decodeSysCtrl(0x00);
    expect(state.shadowEnabled).toBe(true);
    expect(state.protectEnabled).toBe(false);
    expect(state.expandEnabled).toBe(false);
    expect(state.bankA14).toBe(false);
    expect(state.ffD4).toBe(false);
    expect(state.capsLock).toBe(false);
    expect(state.ffD5).toBe(false);
    expect(state.ffD6).toBe(false);
  });
});
