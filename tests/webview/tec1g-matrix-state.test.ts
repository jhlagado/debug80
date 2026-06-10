import { describe, expect, it } from 'vitest';
import {
  clearOneShotMatrixMods,
  createMatrixMods,
  isHostReleaseChord,
  matrixClickModsForKey,
  matrixKeyId,
  matrixModifierForKey,
  resolvePhysicalMatrixKey,
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

  it('treats Meta as matrix Ctrl without making Meta a separate hardware modifier', () => {
    expect(createMatrixMods({ metaKey: true })).toEqual({
      shift: false,
      ctrl: true,
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

  it('recognizes only modified Escape as the host keyboard capture release chord', () => {
    expect(isHostReleaseChord('Escape', { metaKey: true, ctrlKey: false })).toBe(true);
    expect(isHostReleaseChord('Escape', { metaKey: false, ctrlKey: true })).toBe(true);
    expect(isHostReleaseChord('Escape', { metaKey: false, ctrlKey: false })).toBe(false);
    expect(isHostReleaseChord('s', { metaKey: true, ctrlKey: false })).toBe(false);
  });

  it('uses the same key id format as matrix-ui held-key tracking', () => {
    expect(matrixKeyId('a', { shift: false, ctrl: false, fn: false, alt: false })).toBe('a|0000');
    expect(matrixKeyId('a', { shift: true, ctrl: false, fn: true, alt: true })).toBe('a|1011');
  });
});
