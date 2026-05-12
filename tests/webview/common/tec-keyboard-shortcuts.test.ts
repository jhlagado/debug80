import { describe, expect, it } from 'vitest';
import { resolveTecKeypadShortcut } from '../../../webview/common/tec-keyboard-shortcuts';

describe('TEC keypad keyboard shortcuts', () => {
  it('does not reset or consume Caps Lock', () => {
    expect(resolveTecKeypadShortcut('CapsLock')).toEqual({ kind: 'none' });
  });

  it('maps Escape to reset', () => {
    expect(resolveTecKeypadShortcut('Escape')).toEqual({ kind: 'reset' });
  });

  it('maps arrow keys to four distinct monitor controls', () => {
    expect(resolveTecKeypadShortcut('ArrowLeft')).toEqual({ kind: 'key', code: 0x11 });
    expect(resolveTecKeypadShortcut('ArrowRight')).toEqual({ kind: 'key', code: 0x10 });
    expect(resolveTecKeypadShortcut('ArrowUp')).toEqual({ kind: 'key', code: 0x13 });
    expect(resolveTecKeypadShortcut('ArrowDown')).toEqual({ kind: 'key', code: 0x12 });
  });
});
