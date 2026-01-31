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

  it('ignores bits outside the low three', () => {
    const state = decodeSysCtrl(0xff);
    expect(state.shadowEnabled).toBe(false);
    expect(state.protectEnabled).toBe(true);
    expect(state.expandEnabled).toBe(true);
  });
});
