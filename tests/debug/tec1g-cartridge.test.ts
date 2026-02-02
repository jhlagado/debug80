import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadTec1gCartridgeImage } from '../../src/debug/tec1g-cartridge';

const withTempDir = (run: (dir: string) => void): void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-cart-'));
  try {
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('TEC-1G cartridge boot detection', () => {
  it('returns boot entry when cartridge has payload', () => {
    withTempDir((dir) => {
      const cartridgePath = path.join(dir, 'cart.bin');
      fs.writeFileSync(cartridgePath, Buffer.from([0xc3]));

      const image = loadTec1gCartridgeImage(cartridgePath);

      expect(image.bootEntry).toBe(0x8000);
      expect(image.memory[0x8000]).toBe(0xc3);
    });
  });

  it('returns null boot entry when cartridge is empty', () => {
    withTempDir((dir) => {
      const cartridgePath = path.join(dir, 'empty.bin');
      fs.writeFileSync(cartridgePath, Buffer.alloc(0));

      const image = loadTec1gCartridgeImage(cartridgePath);

      expect(image.bootEntry).toBeNull();
    });
  });
});
