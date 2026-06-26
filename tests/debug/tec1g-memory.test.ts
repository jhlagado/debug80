import { describe, expect, it } from 'vitest';
import {
  applyExpansionRomMemory,
  createTec1gMemoryHooks,
} from '../../src/platforms/tec1g/tec1g-memory';
import { loadTec1gExpansionRomImage } from '../../src/platforms/tec1g/tec1g-expansion-rom';
import { createTec1gRuntime } from '../../src/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../../src/platforms/types';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
      sdHighCapacity: true,
    };
    const runtime = createTec1gRuntime(config, () => {});
    runtime.state.system.bankA14 = false;
    runtime.resetState();
    expect(runtime.state.system.bankA14).toBe(true);
  });

  it('loads expansion ROM data into expansion banks', () => {
    const baseMemory = new Uint8Array(0x10000);
    const state = {
      shadowEnabled: false,
      protectEnabled: false,
      expandEnabled: true,
      bankA14: false,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [], state);
    const expansionRom = new Uint8Array(0x10000);
    expansionRom[0x8000] = 0x11;
    expansionRom[0xc000] = 0x22;
    applyExpansionRomMemory(hooks.expandBanks, expansionRom);

    expect(hooks.memRead(0x8000)).toBe(0x11);
    state.bankA14 = true;
    expect(hooks.memRead(0x8000)).toBe(0x22);
  });

  it('loads explicit expansion ROM banks without requiring bank 1 in monitor memory', () => {
    const baseMemory = new Uint8Array(0x10000);
    const state = {
      shadowEnabled: false,
      protectEnabled: false,
      expandEnabled: true,
      bankA14: false,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [], state);
    const memory = new Uint8Array(0x10000);
    memory[0x8000] = 0x11;
    const bank0 = new Uint8Array(0x4000);
    const bank1 = new Uint8Array(0x4000);
    bank0[0] = 0x11;
    bank1[0] = 0x22;

    applyExpansionRomMemory(hooks.expandBanks, { banks: [bank0, bank1], memory });

    expect(hooks.memRead(0x8000)).toBe(0x11);
    expect(memory[0xc000]).toBe(0);
    state.bankA14 = true;
    expect(hooks.memRead(0x8000)).toBe(0x22);
  });

  it('selects additional expansion banks from the decoded memory expansion value', () => {
    const baseMemory = new Uint8Array(0x10000);
    const state = {
      shadowEnabled: false,
      protectEnabled: false,
      expandEnabled: true,
      bankA14: false,
      memoryExpansionBankValue: 8,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [], state);

    hooks.memWrite(0x8000, 0x88);
    state.memoryExpansionBankValue = 0;
    hooks.memWrite(0x8000, 0x11);

    expect(hooks.memRead(0x8000)).toBe(0x11);
    state.memoryExpansionBankValue = 8;
    expect(hooks.memRead(0x8000)).toBe(0x88);
  });

  it('does not alias unsupported expansion bank values onto slot 8', () => {
    const baseMemory = new Uint8Array(0x10000);
    const state = {
      shadowEnabled: false,
      protectEnabled: false,
      expandEnabled: true,
      bankA14: false,
      memoryExpansionBankValue: 8,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [], state);

    hooks.memWrite(0x8000, 0x88);
    state.memoryExpansionBankValue = 15;
    hooks.memWrite(0x8000, 0xff);

    expect(hooks.memRead(0x8000)).toBe(0x00);
    state.memoryExpansionBankValue = 8;
    expect(hooks.memRead(0x8000)).toBe(0x88);
  });

  it('loads and applies a 144K expansion ROM image into slot 8', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-expansion-memory-'));
    try {
      const expansionPath = path.join(tempDir, 'expansion.bin');
      const banks = Array.from({ length: 9 }, (_, index) => Buffer.alloc(0x4000, index + 1));
      fs.writeFileSync(expansionPath, Buffer.concat(banks));
      const image = loadTec1gExpansionRomImage(expansionPath);
      const baseMemory = new Uint8Array(0x10000);
      const state = {
        shadowEnabled: false,
        protectEnabled: false,
        expandEnabled: true,
        bankA14: false,
        memoryExpansionBankValue: 8,
      };
      const hooks = createTec1gMemoryHooks(baseMemory, [], state);

      applyExpansionRomMemory(hooks.expandBanks, image);

      expect(hooks.memRead(0x8000)).toBe(0x09);
      state.memoryExpansionBankValue = 1;
      expect(hooks.memRead(0x8000)).toBe(0x02);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
