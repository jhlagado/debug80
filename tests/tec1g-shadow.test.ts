import { describe, expect, it } from 'vitest';
import { ensureTec1gShadowRom } from '../src/debug/tec1g-shadow';

const makeMemory = (): Uint8Array => new Uint8Array(0x10000);

describe('ensureTec1gShadowRom', () => {
  it('does nothing when ROM already covers 0xC000-0xC7FF', () => {
    const memory = makeMemory();
    memory[0x0000] = 0x11;
    memory[0xc000] = 0x22;
    const info = ensureTec1gShadowRom(memory, [{ start: 0xc000, end: 0xc7ff }]);

    expect(info.shadowCopied).toBe(false);
    expect(memory[0x0000]).toBe(0x11);
    expect(memory[0xc000]).toBe(0x22);
  });

  it('copies low ROM into 0xC000-0xC7FF when only low ROM is present', () => {
    const memory = makeMemory();
    memory[0x0000] = 0xaa;
    memory[0x07ff] = 0xbb;
    memory[0xc000] = 0x00;
    const info = ensureTec1gShadowRom(memory, [{ start: 0x0000, end: 0x07ff }]);

    expect(info.shadowCopied).toBe(true);
    expect(memory[0xc000]).toBe(0xaa);
    expect(memory[0xc7ff]).toBe(0xbb);
    expect(memory[0x0000]).toBe(0x00);
    expect(memory[0x07ff]).toBe(0x00);
  });

  it('does nothing when there is no low ROM', () => {
    const memory = makeMemory();
    memory[0x0000] = 0x12;
    memory[0xc000] = 0x34;
    const info = ensureTec1gShadowRom(memory, [{ start: 0xd000, end: 0xd7ff }]);

    expect(info.shadowCopied).toBe(false);
    expect(memory[0x0000]).toBe(0x12);
    expect(memory[0xc000]).toBe(0x34);
  });
});
