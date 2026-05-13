/**
 * @file Matrix request handler unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  selectMatrixCombo,
  expandMatrixCombo,
  parseMatrixKeyPayload,
  resolveMatrixAscii,
  buildMatrixKeyId,
} from '../../src/debug/requests/matrix-request';
import type { MatrixKeyCombo } from '../../src/platforms/tec1g/matrix-keymap';

describe('matrix-request', () => {
  describe('selectMatrixCombo', () => {
    const plain: MatrixKeyCombo = { row: 3, col: 2 };
    const shifted: MatrixKeyCombo = { row: 3, col: 2, modifier: 'shift' };
    const ctrl: MatrixKeyCombo = { row: 3, col: 2, modifier: 'ctrl' };
    const fn: MatrixKeyCombo = { row: 3, col: 2, modifier: 'fn' };
    const capsOnly: MatrixKeyCombo = { row: 4, col: 1, capsLock: true };
    const noCaps: MatrixKeyCombo = { row: 4, col: 1, capsLock: false };

    it('prefers unmodified combo when no modifier keys pressed', () => {
      const result = selectMatrixCombo([shifted, plain, ctrl], { key: 'a', pressed: true }, false);
      expect(result).toBe(plain);
    });

    it('prefers shift combo when shift is pressed', () => {
      const result = selectMatrixCombo(
        [plain, shifted, ctrl],
        { key: 'a', pressed: true, shift: true },
        false
      );
      expect(result).toBe(shifted);
    });

    it('prefers ctrl combo when ctrl is pressed', () => {
      const result = selectMatrixCombo(
        [plain, shifted, ctrl],
        { key: 'a', pressed: true, ctrl: true },
        false
      );
      expect(result).toBe(ctrl);
    });

    it('prefers fn combo when alt is pressed', () => {
      const result = selectMatrixCombo([plain, fn], { key: 'a', pressed: true, alt: true }, false);
      expect(result).toBe(fn);
    });

    it('respects capsLock state', () => {
      const result = selectMatrixCombo([noCaps, capsOnly], { key: 'a', pressed: true }, true);
      expect(result).toBe(capsOnly);
    });

    it('falls back to first combo when nothing else matches', () => {
      const onlyShifted: MatrixKeyCombo = { row: 1, col: 1, modifier: 'shift' };
      const result = selectMatrixCombo([onlyShifted], { key: 'a', pressed: true }, false);
      expect(result).toBe(onlyShifted);
    });
  });

  describe('expandMatrixCombo', () => {
    it('returns single entry for unmodified combo', () => {
      const result = expandMatrixCombo({ row: 3, col: 2 });
      expect(result).toEqual([{ row: 3, col: 2 }]);
    });

    it('adds shift modifier row for shift combo', () => {
      const result = expandMatrixCombo({ row: 3, col: 2, modifier: 'shift' });
      expect(result).toEqual([
        { row: 3, col: 2 },
        { row: 0, col: 0 },
      ]);
    });

    it('adds ctrl modifier row for ctrl combo', () => {
      const result = expandMatrixCombo({ row: 3, col: 2, modifier: 'ctrl' });
      expect(result).toEqual([
        { row: 3, col: 2 },
        { row: 0, col: 1 },
      ]);
    });

    it('adds fn modifier row for fn combo', () => {
      const result = expandMatrixCombo({ row: 3, col: 2, modifier: 'fn' });
      expect(result).toEqual([
        { row: 3, col: 2 },
        { row: 0, col: 2 },
      ]);
    });
  });

  describe('parseMatrixKeyPayload', () => {
    it('parses valid payload', () => {
      const result = parseMatrixKeyPayload({ key: 'a', pressed: true, shift: true });
      expect(result).toEqual({ key: 'a', pressed: true, shift: true });
    });

    it('returns null for missing key', () => {
      expect(parseMatrixKeyPayload({ pressed: true })).toBeNull();
    });

    it('returns null for non-object', () => {
      expect(parseMatrixKeyPayload('string')).toBeNull();
      expect(parseMatrixKeyPayload(null)).toBeNull();
    });
  });

  describe('resolveMatrixAscii', () => {
    it('maps single characters to char codes', () => {
      expect(resolveMatrixAscii('A')).toBe(0x41);
    });

    it('maps Enter to CR', () => {
      expect(resolveMatrixAscii('Enter')).toBe(0x0d);
    });

    it('maps Escape to ESC', () => {
      expect(resolveMatrixAscii('Escape')).toBe(0x1b);
    });

    it('returns undefined for unknown keys', () => {
      expect(resolveMatrixAscii('ArrowUp')).toBeUndefined();
    });
  });

  describe('buildMatrixKeyId', () => {
    it('encodes modifier flags', () => {
      expect(buildMatrixKeyId({ key: 'a', pressed: true })).toBe('a|000');
      expect(buildMatrixKeyId({ key: 'a', pressed: true, shift: true })).toBe('a|100');
      expect(buildMatrixKeyId({ key: 'a', pressed: true, ctrl: true })).toBe('a|010');
      expect(buildMatrixKeyId({ key: 'a', pressed: true, alt: true })).toBe('a|001');
    });
  });
});
