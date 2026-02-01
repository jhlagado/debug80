import { describe, expect, it } from 'vitest';
import { createTec1gMemoryHooks } from '../../src/debug/tec1g-memory';

describe('TEC-1G expand bank switching', () => {
  it('reads and writes the selected expansion bank', () => {
    const baseMemory = new Uint8Array(0x10000);
    const state = {
      shadowEnabled: false,
      protectEnabled: false,
      expandEnabled: true,
      bankA14: false,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [], state);

    hooks.memWrite(0x8000, 0x11);
    state.bankA14 = true;
    hooks.memWrite(0x8000, 0x22);

    state.bankA14 = false;
    expect(hooks.memRead(0x8000)).toBe(0x11);
    state.bankA14 = true;
    expect(hooks.memRead(0x8000)).toBe(0x22);
  });

  it('falls back to base memory when expand is disabled', () => {
    const baseMemory = new Uint8Array(0x10000);
    const state = {
      shadowEnabled: false,
      protectEnabled: false,
      expandEnabled: false,
      bankA14: false,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [], state);

    hooks.memWrite(0x8000, 0x55);
    expect(baseMemory[0x8000]).toBe(0x55);
    expect(hooks.memRead(0x8000)).toBe(0x55);
  });
});
