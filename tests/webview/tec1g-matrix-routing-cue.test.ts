import { afterEach, describe, expect, it } from 'vitest';
import { applyMatrixRoutingCue } from '../../webview/tec1g/matrix-routing-cue';

describe('tec1g matrix routing cue', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete document.body.dataset.matrixKeyboardActive;
  });

  it('disables the keypad while the matrix keyboard owns monitor input', () => {
    const appRoot = document.createElement('div');
    const keypad = document.createElement('div');
    const cue = document.createElement('div');
    const header = document.createElement('button');
    cue.id = 'keypadRoutingCue';
    document.body.append(appRoot, keypad, cue, header);

    applyMatrixRoutingCue({ appRoot, keypad, cue, header }, true);

    expect(document.body.dataset.matrixKeyboardActive).toBe('true');
    expect(appRoot.dataset.matrixKeyboardActive).toBe('true');
    expect(keypad.classList.contains('keypad--matrix-attached-disabled')).toBe(true);
    expect(keypad.getAttribute('data-scanned-keys-disabled')).toBe('true');
    expect(keypad.hasAttribute('aria-disabled')).toBe(false);
    expect(keypad.getAttribute('aria-describedby')).toBe('keypadRoutingCue');
    expect(cue.hidden).toBe(false);
    expect(header.classList.contains('matrix-keyboard-active')).toBe(true);

    applyMatrixRoutingCue({ appRoot, keypad, cue, header }, false);

    expect(document.body.dataset.matrixKeyboardActive).toBe('false');
    expect(appRoot.dataset.matrixKeyboardActive).toBe('false');
    expect(keypad.classList.contains('keypad--matrix-attached-disabled')).toBe(false);
    expect(keypad.hasAttribute('data-scanned-keys-disabled')).toBe(false);
    expect(keypad.hasAttribute('aria-describedby')).toBe(false);
    expect(cue.hidden).toBe(true);
    expect(header.classList.contains('matrix-keyboard-active')).toBe(false);
  });

  it('distinguishes matrix attachment from physical keyboard capture', () => {
    const appRoot = document.createElement('div');
    const keypad = document.createElement('div');
    const cue = document.createElement('div');
    const header = document.createElement('button');
    document.body.append(appRoot, keypad, cue, header);

    applyMatrixRoutingCue({ appRoot, keypad, cue, header }, true, false);

    expect(appRoot.dataset.matrixKeyboardActive).toBe('true');
    expect(appRoot.dataset.matrixKeyboardCaptured).toBe('false');
    expect(cue.textContent).toContain('Keyboard released');
    expect(cue.textContent).toContain('click emulator to capture');
    expect(header.classList.contains('matrix-keyboard-captured')).toBe(false);

    applyMatrixRoutingCue({ appRoot, keypad, cue, header }, true, true);

    expect(appRoot.dataset.matrixKeyboardCaptured).toBe('true');
    expect(cue.textContent).toContain('Keyboard captured');
    expect(cue.textContent).toContain('click outside to release');
    expect(header.classList.contains('matrix-keyboard-captured')).toBe(true);
  });

  it('shows joystick ownership while the matrix keyboard remains attached', () => {
    const appRoot = document.createElement('div');
    const keypad = document.createElement('div');
    const cue = document.createElement('div');
    const header = document.createElement('button');
    document.body.append(appRoot, keypad, cue, header);

    applyMatrixRoutingCue({ appRoot, keypad, cue, header }, true, false, 'joystick');

    expect(appRoot.dataset.matrixKeyboardActive).toBe('true');
    expect(appRoot.dataset.matrixKeyboardCaptured).toBe('false');
    expect(cue.textContent).toContain('Joystick controls active');
    expect(cue.textContent).toContain('click Matrix Keyboard to type');
    expect(header.classList.contains('matrix-keyboard-captured')).toBe(false);
  });
});
