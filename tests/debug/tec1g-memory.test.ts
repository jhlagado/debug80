import { describe, expect, it } from 'vitest';
import { createTec1gMemoryHooks } from '../../src/debug/tec1g-memory';
import { createTec1gRuntime } from '../../src/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../../src/platforms/types';

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

  it('restores default bank selection on reset', () => {
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
      expansionBankHi: true,
      matrixMode: false,
      rtcEnabled: false,
      sdEnabled: false,
    };
    const runtime = createTec1gRuntime(config, () => {});
    runtime.state.bankA14 = false;
    runtime.resetState();
    expect(runtime.state.bankA14).toBe(true);
  });
});
