import { describe, expect, it } from 'vitest';
import { MATRIX_ASCII_MAP } from '../../../src/platforms/tec1g/matrix-keymap';

describe('TEC-1G matrix keymap', () => {
  it('covers all printable ASCII characters', () => {
    for (let code = 0x20; code <= 0x7e; code += 1) {
      const ch = String.fromCharCode(code);
      const combos = MATRIX_ASCII_MAP[ch];
      expect(combos?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('returns combos within matrix bounds', () => {
    for (const combos of Object.values(MATRIX_ASCII_MAP)) {
      for (const combo of combos) {
        expect(combo.row).toBeGreaterThanOrEqual(0);
        expect(combo.row).toBeLessThan(16);
        expect(combo.col).toBeGreaterThanOrEqual(0);
        expect(combo.col).toBeLessThan(8);
      }
    }
  });
});
