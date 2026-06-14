import { describe, expect, it } from 'vitest';
import {
  clearOneShotMatrixMods,
  createMatrixMods,
  drainMatrixHeldKeys,
  holdMatrixKey,
  isHostReleaseChord,
  matrixClickModsForKey,
  matrixKeyId,
  matrixModifierForKey,
  releaseMatrixKey,
  resolvePhysicalMatrixKey,
  type MatrixHeldKey,
  type MatrixKeyMods,
} from '../../webview/tec1g/matrix-state';

function keyEvent(
  key: string,
  options?: {
    code?: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  }
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    code: options?.code ?? '',
    shiftKey: options?.shiftKey ?? false,
    ctrlKey: options?.ctrlKey ?? false,
    altKey: options?.altKey ?? false,
    metaKey: options?.metaKey ?? false,
  });
}

describe('tec1g matrix keyboard pure state helpers', () => {
  it('maps only matrix modifier key names to one-shot modifier fields', () => {
    expect(matrixModifierForKey('Shift')).toBe('shift');
    expect(matrixModifierForKey('Control')).toBe('ctrl');
    expect(matrixModifierForKey('Fn')).toBe('fn');
    expect(matrixModifierForKey('Alt')).toBe('alt');
    expect(matrixModifierForKey('CapsLock')).toBeUndefined();
    expect(matrixModifierForKey('a')).toBeUndefined();
  });

  it('builds click modifiers from armed one-shot state and caps lock', () => {
    const armed: MatrixKeyMods = { shift: false, ctrl: true, fn: false, alt: true };

    expect(matrixClickModsForKey('a', armed, true)).toEqual({
      shift: true,
      ctrl: true,
      fn: false,
      alt: true,
    });
    expect(matrixClickModsForKey('1', armed, true)).toEqual({
      shift: false,
      ctrl: true,
      fn: false,
      alt: true,
    });
  });

  it('clears all one-shot modifiers without mutating the source state', () => {
    const armed: MatrixKeyMods = { shift: true, ctrl: true, fn: true, alt: true };

    expect(clearOneShotMatrixMods(armed)).toEqual(createMatrixMods());
    expect(armed).toEqual({ shift: true, ctrl: true, fn: true, alt: true });
  });

  it('uses physical key code for modified host keys when event.key is transformed', () => {
    expect(resolvePhysicalMatrixKey(keyEvent('ß', { code: 'KeyS', altKey: true }))).toBe('s');
    expect(resolvePhysicalMatrixKey(keyEvent('S', { code: 'KeyS', shiftKey: true }))).toBe('s');
    expect(resolvePhysicalMatrixKey(keyEvent('ArrowUp', { code: 'ArrowUp', metaKey: true }))).toBe(
      'ArrowUp'
    );
  });

  it('preserves unmodified event.key values when no host modifier is involved', () => {
    expect(resolvePhysicalMatrixKey(keyEvent('A', { code: 'KeyA' }))).toBe('A');
    expect(resolvePhysicalMatrixKey(keyEvent('Escape', { code: 'Escape' }))).toBe('Escape');
  });

  it('does not map Meta into any matrix modifier state', () => {
    expect(createMatrixMods({ metaKey: true })).toEqual({
      shift: false,
      ctrl: false,
      fn: false,
      alt: false,
    });
    expect(createMatrixMods({ ctrlKey: true, metaKey: true, altKey: true })).toEqual({
      shift: false,
      ctrl: true,
      fn: false,
      alt: true,
    });
  });

  it('recognizes only Ctrl-Escape as the host keyboard capture release chord', () => {
    expect(isHostReleaseChord('Escape', { metaKey: true, ctrlKey: false })).toBe(false);
    expect(isHostReleaseChord('Escape', { metaKey: false, ctrlKey: true })).toBe(true);
    expect(isHostReleaseChord('Escape', { metaKey: false, ctrlKey: false })).toBe(false);
    expect(isHostReleaseChord('s', { metaKey: true, ctrlKey: false })).toBe(false);
  });

  it('uses the same key id format as matrix-ui held-key tracking', () => {
    expect(matrixKeyId('a', { shift: false, ctrl: false, fn: false, alt: false })).toBe('a|0000');
    expect(matrixKeyId('a', { shift: true, ctrl: false, fn: true, alt: true })).toBe('a|1011');
  });

  it('tracks held-key press and release transitions by key plus modifier state', () => {
    const heldKeys = new Map<string, MatrixHeldKey>();
    const mods: MatrixKeyMods = { shift: true, ctrl: false, fn: false, alt: true };

    expect(holdMatrixKey(heldKeys, 's', mods)).toEqual({ keyId: 's|1001', changed: true });
    expect(holdMatrixKey(heldKeys, 's', mods)).toEqual({ keyId: 's|1001', changed: false });
    expect(holdMatrixKey(heldKeys, 's', createMatrixMods())).toEqual({
      keyId: 's|0000',
      changed: true,
    });
    expect(releaseMatrixKey(heldKeys, 's', mods)).toEqual({ keyId: 's|1001', changed: true });
    expect(releaseMatrixKey(heldKeys, 's', mods)).toEqual({ keyId: 's|1001', changed: false });
    expect(heldKeys.has('s|0000')).toBe(true);
  });

  it('stores an immutable modifier snapshot for held keys and drains them in insertion order', () => {
    const heldKeys = new Map<string, MatrixHeldKey>();
    const mods: MatrixKeyMods = { shift: false, ctrl: true, fn: false, alt: false };

    holdMatrixKey(heldKeys, 'q', mods);
    mods.ctrl = false;
    holdMatrixKey(heldKeys, 'ArrowLeft', createMatrixMods());

    expect(drainMatrixHeldKeys(heldKeys)).toEqual([
      { key: 'q', mods: { shift: false, ctrl: true, fn: false, alt: false } },
      { key: 'ArrowLeft', mods: createMatrixMods() },
    ]);
    expect(heldKeys.size).toBe(0);
  });
});
