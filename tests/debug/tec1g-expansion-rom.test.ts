import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadTec1gExpansionRomImage } from '../../src/platforms/tec1g/tec1g-expansion-rom';

const withTempDir = (run: (dir: string) => void): void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-expansion-rom-'));
  try {
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('TEC-1G expansion ROM boot detection', () => {
  it('returns boot entry when expansion ROM has payload', () => {
    withTempDir((dir) => {
      const expansionRomPath = path.join(dir, 'expansion.bin');
      fs.writeFileSync(expansionRomPath, Buffer.from([0xc3]));

      const image = loadTec1gExpansionRomImage(expansionRomPath);

      expect(image.bootEntry).toBe(0x8000);
      expect(image.memory[0x8000]).toBe(0xc3);
      expect(image.banks[0]?.[0]).toBe(0xc3);
    });
  });

  it('returns null boot entry when expansion ROM is empty', () => {
    withTempDir((dir) => {
      const expansionRomPath = path.join(dir, 'empty.bin');
      fs.writeFileSync(expansionRomPath, Buffer.alloc(0));

      const image = loadTec1gExpansionRomImage(expansionRomPath);

      expect(image.bootEntry).toBeNull();
    });
  });

  it('loads a 32K binary as two explicit 16K banks', () => {
    withTempDir((dir) => {
      const expansionRomPath = path.join(dir, 'expansion-32k.bin');
      const bank0 = Buffer.alloc(0x4000, 0x11);
      const bank1 = Buffer.alloc(0x4000, 0x22);
      fs.writeFileSync(expansionRomPath, Buffer.concat([bank0, bank1]));

      const image = loadTec1gExpansionRomImage(expansionRomPath);

      expect(image.windowAddress).toBe(0x8000);
      expect(image.windowSize).toBe(0x4000);
      expect(image.bankSize).toBe(0x4000);
      expect(image.bankCount).toBe(2);
      expect(image.initialBank).toBe(0);
      expect(image.banks).toHaveLength(2);
      expect(image.banks[0]?.[0]).toBe(0x11);
      expect(image.banks[1]?.[0]).toBe(0x22);
      expect(image.memory[0x8000]).toBe(0x11);
      expect(image.memory[0xc000]).toBe(0);
    });
  });

  it('loads a 144K binary as nine 16K banks', () => {
    withTempDir((dir) => {
      const expansionRomPath = path.join(dir, 'expansion-144k.bin');
      const banks = Array.from({ length: 9 }, (_, index) => Buffer.alloc(0x4000, index + 1));
      fs.writeFileSync(expansionRomPath, Buffer.concat(banks));

      const image = loadTec1gExpansionRomImage(expansionRomPath);

      expect(image.bankCount).toBe(9);
      expect(image.banks).toHaveLength(9);
      expect(image.banks[0]?.[0]).toBe(0x01);
      expect(image.banks[8]?.[0]).toBe(0x09);
    });
  });

  it('limits binary expansion ROMs to the supported nine banks', () => {
    withTempDir((dir) => {
      const expansionRomPath = path.join(dir, 'expansion-160k.bin');
      const banks = Array.from({ length: 10 }, (_, index) => Buffer.alloc(0x4000, index + 1));
      fs.writeFileSync(expansionRomPath, Buffer.concat(banks));

      const image = loadTec1gExpansionRomImage(expansionRomPath);

      expect(image.bankCount).toBe(9);
      expect(image.banks).toHaveLength(9);
      expect(image.banks[8]?.[0]).toBe(0x09);
    });
  });

  it('does not boot from payload that exists only in a non-initial bank', () => {
    withTempDir((dir) => {
      const expansionRomPath = path.join(dir, 'bank1-only.bin');
      const bank0 = Buffer.alloc(0x4000, 0x00);
      const bank1 = Buffer.alloc(0x4000, 0x22);
      fs.writeFileSync(expansionRomPath, Buffer.concat([bank0, bank1]));

      const image = loadTec1gExpansionRomImage(expansionRomPath);

      expect(image.bootEntry).toBeNull();
      expect(image.banks[1]?.[0]).toBe(0x22);
    });
  });

  it('loads Intel HEX expansion banks without booting from a non-initial bank', () => {
    withTempDir((dir) => {
      const expansionRomPath = path.join(dir, 'bank1-only.hex');
      fs.writeFileSync(expansionRomPath, ':01C00000221D\n:00000001FF\n');

      const image = loadTec1gExpansionRomImage(expansionRomPath);

      expect(image.bankCount).toBe(2);
      expect(image.banks[0]?.[0]).toBe(0);
      expect(image.banks[1]?.[0]).toBe(0x22);
      expect(image.memory[0x8000]).toBe(0);
      expect(image.memory[0xc000]).toBe(0);
      expect(image.bootEntry).toBeNull();
    });
  });
});
