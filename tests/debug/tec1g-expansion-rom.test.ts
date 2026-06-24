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
});
