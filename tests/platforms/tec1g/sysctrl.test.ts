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

  it('decodes caps lock (bit 7)', () => {
    expect(decodeSysCtrl(0x00).capsLock).toBe(false);
    expect(decodeSysCtrl(0x20).capsLock).toBe(false);
    expect(decodeSysCtrl(0x80).capsLock).toBe(true);
  });

  it('decodes memory expansion bank bits (bits 3-6)', () => {
    const state = decodeSysCtrl(0x78);
    expect(state.memoryExpansionBankBits).toEqual([true, true, true, true]);
    expect(state.memoryExpansionBankValue).toBe(0x0f);
  });

  it('decodes all bits from 0xFF', () => {
    const state = decodeSysCtrl(0xff);
    expect(state.shadowEnabled).toBe(false);
    expect(state.protectEnabled).toBe(true);
    expect(state.expandEnabled).toBe(true);
    expect(state.bankA14).toBe(true);
    expect(state.memoryExpansionBankBits).toEqual([true, true, true, true]);
    expect(state.memoryExpansionBankValue).toBe(0x0f);
    expect(state.capsLock).toBe(true);
  });

  it('decodes all bits from 0x00', () => {
    const state = decodeSysCtrl(0x00);
    expect(state.shadowEnabled).toBe(true);
    expect(state.protectEnabled).toBe(false);
    expect(state.expandEnabled).toBe(false);
    expect(state.bankA14).toBe(false);
    expect(state.memoryExpansionBankBits).toEqual([false, false, false, false]);
    expect(state.memoryExpansionBankValue).toBe(0);
    expect(state.capsLock).toBe(false);
  });
});
