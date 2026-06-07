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
    it('toggles MON-3 matrix mode without clearing held raw matrix keys', () => {
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
      expect(handleMatrixModeRequest(runtime, { enabled: true })).toBeNull();

      expect(runtime.state.matrixModeEnabled).toBe(true);
      expect(applied).toEqual([]);
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

    it('maps matrix arrows to MON-3 low control key codes', () => {
      expect(resolveMatrixAscii('ArrowUp')).toBe(0x03);
      expect(resolveMatrixAscii('ArrowDown')).toBe(0x04);
      expect(resolveMatrixAscii('ArrowLeft')).toBe(0x05);
      expect(resolveMatrixAscii('ArrowRight')).toBe(0x06);
    });

    it('maps matrix editing keys to MON-3 control key codes', () => {
      expect(resolveMatrixAscii('Backspace')).toBe(0x08);
      expect(resolveMatrixAscii('Tab')).toBe(0x09);
    });

    it('returns undefined for unknown keys', () => {
      expect(resolveMatrixAscii('Home')).toBeUndefined();
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

    it('maps physical Ctrl-letter chords to ASCII control codes', () => {
      for (let code = 1; code <= 26; code += 1) {
        const lower = String.fromCharCode(code + 0x60);
        const upper = String.fromCharCode(code + 0x40);

        expect(resolveMatrixPayloadAscii({ key: lower, pressed: true, ctrl: true })).toBe(code);
        expect(resolveMatrixPayloadAscii({ key: upper, pressed: true, ctrl: true })).toBe(code);
      }
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
    it('does not enable MON-3 matrix mode when a matrix key arrives', () => {
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

      expect(runtime.state.matrixModeEnabled).toBe(false);
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

    it('routes matrix arrows as raw matrix key positions', () => {
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
        handleMatrixKeyRequest(runtime, heldKeys, { key: 'ArrowUp', pressed: true })
      ).toBeNull();
      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 'ArrowUp', pressed: false })
      ).toBeNull();
      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 'ArrowRight', pressed: true })
      ).toBeNull();
      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 'ArrowRight', pressed: false })
      ).toBeNull();

      expect(applied).toEqual([
        { row: 0, col: 3, pressed: true },
        { row: 0, col: 3, pressed: false },
        { row: 0, col: 6, pressed: true },
        { row: 0, col: 6, pressed: false },
      ]);
    });

    it('routes physical Ctrl+S and Ctrl+Q as modifier combos, not plain letters', () => {
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
        handleMatrixKeyRequest(runtime, heldKeys, { key: 's', pressed: true, ctrl: true })
      ).toBeNull();
      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 's', pressed: false, ctrl: true })
      ).toBeNull();
      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 'q', pressed: true, ctrl: true })
      ).toBeNull();
      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 'q', pressed: false, ctrl: true })
      ).toBeNull();

      expect(applied).toEqual([
        { row: 6, col: 6, pressed: true },
        { row: 0, col: 1, pressed: true },
        { row: 6, col: 6, pressed: false },
        { row: 0, col: 1, pressed: false },
        { row: 6, col: 4, pressed: true },
        { row: 0, col: 1, pressed: true },
        { row: 6, col: 4, pressed: false },
        { row: 0, col: 1, pressed: false },
      ]);
    });

    it('routes Alt-letter chords through the native matrix Alt modifier', () => {
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
        handleMatrixKeyRequest(runtime, heldKeys, { key: 's', pressed: true, alt: true })
      ).toBeNull();
      expect(
        handleMatrixKeyRequest(runtime, heldKeys, { key: 's', pressed: false, alt: true })
      ).toBeNull();

      expect(applied).toEqual([
        { row: 6, col: 6, pressed: true },
        { row: 0, col: 3, pressed: true },
        { row: 6, col: 6, pressed: false },
        { row: 0, col: 3, pressed: false },
      ]);
    });

    it('routes every physical Ctrl-letter chord through the native matrix Control modifier', () => {
      for (let code = 1; code <= 26; code += 1) {
        const applied: Array<{ row: number; col: number; pressed: boolean }> = [];
        const runtime: MatrixRuntime = {
          state: { matrixModeEnabled: true, capsLock: false },
          setMatrixMode: () => {},
          applyMatrixKey: (row, col, pressed) => {
            applied.push({ row, col, pressed });
          },
        };
        const heldKeys = new Map<string, MatrixKeyCombo[]>();
        const key = String.fromCharCode(code + 0x60);

        expect(
          handleMatrixKeyRequest(runtime, heldKeys, { key, pressed: true, ctrl: true })
        ).toBeNull();
        expect(
          handleMatrixKeyRequest(runtime, heldKeys, { key, pressed: false, ctrl: true })
        ).toBeNull();

        const controlTransitions = applied.filter((entry) => entry.row === 0 && entry.col === 1);
        expect(controlTransitions.some((entry) => entry.pressed === true)).toBe(true);
        expect(controlTransitions.some((entry) => entry.pressed === false)).toBe(true);
      }
    });
  });
});
