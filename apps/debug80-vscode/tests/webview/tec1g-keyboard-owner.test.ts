import { describe, expect, it, vi } from 'vitest';
import {
  createKeyboardOwnerController,
  isNativeKeyboardTarget,
  releaseDepartedKeyboardOwner,
  shouldBypassEmulatorKeyboardTarget,
  type KeyboardOwner,
} from '../../webview/tec1g/keyboard-owner';

describe('TEC-1G keyboard owner controller', () => {
  it('uses accordion visibility to choose default keyboard ownership', () => {
    const controller = createKeyboardOwnerController();

    controller.syncVisibility({ keypad: true, matrixKeyboard: false, joystick: false });
    expect(controller.getOwner()).toBe('keypad');

    controller.syncVisibility({ keypad: true, matrixKeyboard: false, joystick: true });
    expect(controller.getOwner()).toBe('joystick');

    controller.syncVisibility({ keypad: true, matrixKeyboard: true, joystick: true });
    expect(controller.getOwner()).toBe('matrixKeyboard');
  });

  it('lets pointer intent switch between matrix keyboard and joystick while both are visible', () => {
    const controller = createKeyboardOwnerController();
    controller.syncVisibility({ keypad: true, matrixKeyboard: true, joystick: true });

    controller.selectOwner('joystick');
    expect(controller.getOwner()).toBe('joystick');

    controller.syncVisibility({ keypad: true, matrixKeyboard: true, joystick: true });
    expect(controller.getOwner()).toBe('joystick');

    controller.selectOwner('matrixKeyboard');
    expect(controller.getOwner()).toBe('matrixKeyboard');
  });

  it('falls back when the current owner is no longer visible', () => {
    const controller = createKeyboardOwnerController();
    controller.syncVisibility({ keypad: true, matrixKeyboard: true, joystick: true });
    controller.selectOwner('joystick');

    controller.syncVisibility({ keypad: true, matrixKeyboard: true, joystick: false });
    expect(controller.getOwner()).toBe('matrixKeyboard');

    controller.syncVisibility({ keypad: true, matrixKeyboard: false, joystick: false });
    expect(controller.getOwner()).toBe('keypad');

    controller.syncVisibility({ keypad: false, matrixKeyboard: false, joystick: false });
    expect(controller.getOwner()).toBeNull();
  });

  it('ignores owner selection for hidden hardware surfaces', () => {
    const controller = createKeyboardOwnerController();
    controller.syncVisibility({ keypad: true, matrixKeyboard: false, joystick: false });

    controller.selectOwner('joystick');

    expect(controller.getOwner()).toBe<KeyboardOwner>('keypad');
  });

  it('identifies native keyboard targets that should bypass emulator routing', () => {
    document.body.innerHTML = `
      <main>
        <input id="input" />
        <select id="select"></select>
        <textarea id="textarea"></textarea>
        <button id="button"></button>
        <div id="editable" contenteditable="true"></div>
        <div id="surface"></div>
      </main>
    `;

    expect(isNativeKeyboardTarget(document.getElementById('input'))).toBe(true);
    expect(isNativeKeyboardTarget(document.getElementById('select'))).toBe(true);
    expect(isNativeKeyboardTarget(document.getElementById('textarea'))).toBe(true);
    expect(isNativeKeyboardTarget(document.getElementById('button'))).toBe(true);
    expect(isNativeKeyboardTarget(document.getElementById('editable'))).toBe(true);
    expect(isNativeKeyboardTarget(document.getElementById('surface'))).toBe(false);
  });

  it('bypasses native panel controls unless they are explicit hardware controls', () => {
    document.body.innerHTML = `
      <section id="joystick">
        <input id="latch" type="checkbox" />
        <button id="fire" data-joystick-bit="64"></button>
        <button id="arrowMode" data-joystick-arrow-mode="fire"></button>
        <div id="matrixKey" class="matrix-key"></div>
        <div id="keycap" class="keycap"></div>
      </section>
    `;

    expect(shouldBypassEmulatorKeyboardTarget(document.getElementById('latch'))).toBe(true);
    expect(shouldBypassEmulatorKeyboardTarget(document.getElementById('fire'))).toBe(false);
    expect(shouldBypassEmulatorKeyboardTarget(document.getElementById('arrowMode'))).toBe(false);
    expect(shouldBypassEmulatorKeyboardTarget(document.getElementById('matrixKey'))).toBe(false);
    expect(shouldBypassEmulatorKeyboardTarget(document.getElementById('keycap'))).toBe(false);
  });

  it('notifies when keyboard ownership changes', () => {
    const onOwnerChange = vi.fn();
    const controller = createKeyboardOwnerController({ onOwnerChange });

    controller.syncVisibility({ keypad: true, matrixKeyboard: false, joystick: false });
    controller.syncVisibility({ keypad: true, matrixKeyboard: true, joystick: false });
    controller.selectOwner('keypad');

    expect(onOwnerChange).toHaveBeenNthCalledWith(1, 'keypad', null);
    expect(onOwnerChange).toHaveBeenNthCalledWith(2, 'matrixKeyboard', 'keypad');
    expect(onOwnerChange).toHaveBeenNthCalledWith(3, 'keypad', 'matrixKeyboard');
  });

  it.each([
    ['keypad', 'matrixKeyboard'],
    ['matrixKeyboard', 'joystick'],
    ['joystick', 'keypad'],
  ] as const)('releases %s state when ownership moves to %s', (previousOwner, owner) => {
    const handlers = {
      keypad: vi.fn(),
      matrixKeyboard: vi.fn(),
      joystick: vi.fn(),
    };

    releaseDepartedKeyboardOwner(previousOwner, owner, handlers);

    expect(handlers[previousOwner]).toHaveBeenCalledTimes(1);
    expect(handlers[owner]).not.toHaveBeenCalled();
  });
});
