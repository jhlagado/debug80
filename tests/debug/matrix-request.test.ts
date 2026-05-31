/**
 * @file Matrix request handler unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  selectMatrixCombo,
  expandMatrixCombo,
  parseMatrixKeyPayload,
  resolveMatrixAscii,
  resolveMatrixPayloadAscii,
  buildMatrixKeyId,
  handleMatrixModeRequest,
  handleMatrixKeyRequest,
} from '../../src/debug/requests/matrix-request';
import type { MatrixKeyCombo } from '../../src/platforms/tec1g/matrix-keymap';
import type { MatrixRuntime } from '../../src/debug/requests/matrix-request';

describe('matrix-request', () => {
  describe('handleMatrixModeRequest', () => {
    it('clears stale held keys when matrix mode is restored enabled', () => {
      const released: Array<{ row: number; col: number; pressed: boolean }> = [];
      const runtime: MatrixRuntime = {
        state: { matrixModeEnabled: false, capsLock: false },
        setMatrixMode: (enabled) => {
          runtime.state.matrixModeEnabled = enabled;
        },
        applyMatrixKey: (row, col, pressed) => {
          released.push({ row, col, pressed });
        },
      };
      const heldKeys = new Map<string, MatrixKeyCombo[]>();
      heldKeys.set('a|0000', [{ row: 3, col: 2 }]);

      expect(handleMatrixModeRequest(runtime, heldKeys, { enabled: true })).toBeNull();

      expect(runtime.state.matrixModeEnabled).toBe(true);
      expect(heldKeys.size).toBe(0);
      expect(released).toEqual([{ row: 3, col: 2, pressed: false }]);
    });
  });

  describe('selectMatrixCombo', () => {
    const plain: MatrixKeyCombo = { row: 3, col: 2 };
    const shifted: MatrixKeyCombo = { row: 3, col: 2, modifier: 'shift' };
    const ctrl: MatrixKeyCombo = { row: 3, col: 2, modifier: 'ctrl' };
    const fn: MatrixKeyCombo = { row: 3, col: 2, modifier: 'fn' };
    const alt: MatrixKeyCombo = { row: 3, col: 2, modifier: 'alt' };
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

    it('prefers fn combo when fn is pressed', () => {
      const result = selectMatrixCombo([plain, fn], { key: 'a', pressed: true, fn: true }, false);
      expect(result).toBe(fn);
    });

    it('prefers alt combo when alt is pressed', () => {
      const result = selectMatrixCombo(
        [plain, fn, alt],
        { key: 'a', pressed: true, alt: true },
        false
      );
      expect(result).toBe(alt);
    });

    it('does not treat alt as the MON-3 fn modifier', () => {
      const result = selectMatrixCombo([plain, fn], { key: 'a', pressed: true, alt: true }, false);
      expect(result).toBe(plain);
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

    it('adds raw alt modifier row for alt combo', () => {
      const result = expandMatrixCombo({ row: 3, col: 2, modifier: 'alt' });
      expect(result).toEqual([
        { row: 3, col: 2 },
        { row: 0, col: 3 },
      ]);
    });
  });

  describe('parseMatrixKeyPayload', () => {
    it('parses valid payload', () => {
      const result = parseMatrixKeyPayload({ key: 'a', pressed: true, shift: true, fn: true });
      expect(result).toEqual({ key: 'a', pressed: true, shift: true, fn: true });
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

  describe('resolveMatrixPayloadAscii', () => {
    it('capitalizes letters when the matrix shift latch is active', () => {
      expect(resolveMatrixPayloadAscii({ key: 'a', pressed: true, shift: true })).toBe(0x41);
    });

    it('maps shifted number and punctuation keys to their shifted ASCII characters', () => {
      expect(resolveMatrixPayloadAscii({ key: '1', pressed: true, shift: true })).toBe(0x21);
      expect(resolveMatrixPayloadAscii({ key: '/', pressed: true, shift: true })).toBe(0x3f);
      expect(resolveMatrixPayloadAscii({ key: ';', pressed: true, shift: true })).toBe(0x3a);
    });

    it('leaves physical shifted key values alone when the browser already supplied them', () => {
      expect(resolveMatrixPayloadAscii({ key: 'A', pressed: true, shift: true })).toBe(0x41);
      expect(resolveMatrixPayloadAscii({ key: '!', pressed: true, shift: true })).toBe(0x21);
    });
  });

  describe('buildMatrixKeyId', () => {
    it('encodes modifier flags', () => {
      expect(buildMatrixKeyId({ key: 'a', pressed: true })).toBe('a|0000');
      expect(buildMatrixKeyId({ key: 'a', pressed: true, shift: true })).toBe('a|1000');
      expect(buildMatrixKeyId({ key: 'a', pressed: true, ctrl: true })).toBe('a|0100');
      expect(buildMatrixKeyId({ key: 'a', pressed: true, fn: true })).toBe('a|0010');
      expect(buildMatrixKeyId({ key: 'a', pressed: true, alt: true })).toBe('a|0001');
    });
  });

  describe('handleMatrixKeyRequest', () => {
    it('enables matrix mode when a matrix key arrives after a missed startup mode sync', () => {
      const applied: Array<{ row: number; col: number; pressed: boolean }> = [];
      const runtime: MatrixRuntime = {
        state: { matrixModeEnabled: false, capsLock: false },
        setMatrixMode: (enabled) => {
          runtime.state.matrixModeEnabled = enabled;
        },
        applyMatrixKey: (row, col, pressed) => {
          applied.push({ row, col, pressed });
        },
      };
      const heldKeys = new Map<string, MatrixKeyCombo[]>();

      expect(handleMatrixKeyRequest(runtime, heldKeys, { key: 'a', pressed: true })).toBeNull();

      expect(runtime.state.matrixModeEnabled).toBe(true);
      expect(applied.length).toBeGreaterThan(0);
      expect(applied.some((entry) => entry.pressed)).toBe(true);
    });

    it('routes CapsLock to the MON-3 matrix caps key position', () => {
      const applied: Array<{ row: number; col: number; pressed: boolean }> = [];
      const runtime: MatrixRuntime = {
        state: { matrixModeEnabled: true, capsLock: false },
        setMatrixMode: () => {},
        applyMatrixKey: (row, col, pressed) => {
          applied.push({ row, col, pressed });
        },
      };
      const heldKeys = new Map<string, MatrixKeyCombo[]>();

      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 'CapsLock', pressed: true })
      ).toBeNull();
      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 'CapsLock', pressed: false })
      ).toBeNull();

      expect(applied).toEqual([
        { row: 0, col: 7, pressed: true },
        { row: 0, col: 7, pressed: false },
      ]);
    });
  });
});
