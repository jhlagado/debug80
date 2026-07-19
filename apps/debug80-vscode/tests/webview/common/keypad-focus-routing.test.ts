import { describe, expect, it, vi } from 'vitest';
import {
  isKeyboardControlTarget,
  routeTecKeypadKeyup,
  routeTecKeypadShortcut,
  wireKeypadFocusPanels,
  type KeypadKeyTarget,
} from '../../../webview/common/keypad-focus-routing';

function createKeypad(): KeypadKeyTarget & {
  focusKeypad: ReturnType<typeof vi.fn>;
  sendKey: ReturnType<typeof vi.fn>;
  pressKey: ReturnType<typeof vi.fn>;
  releaseKey: ReturnType<typeof vi.fn>;
  setShiftLatched: ReturnType<typeof vi.fn>;
  shiftLatched: boolean;
} {
  let shiftLatched = false;
  const keypad = {
    focusKeypad: vi.fn(),
    sendKey: vi.fn(),
    pressKey: vi.fn((code: number) => code | 0x20),
    releaseKey: vi.fn(),
    setShiftLatched: vi.fn((value: boolean) => {
      shiftLatched = value;
    }),
    getShiftLatched: () => shiftLatched,
    get shiftLatched() {
      return shiftLatched;
    },
    set shiftLatched(value: boolean) {
      shiftLatched = value;
    },
  };
  return keypad;
}

function dispatchKeyboardEvent(target: EventTarget, type: string, key: string): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key,
  });
  target.dispatchEvent(event);
  return event;
}

describe('keypad focus routing', () => {
  it('identifies native keyboard controls', () => {
    document.body.innerHTML =
      '<section><input id="i"><button id="b"></button><div id="d"></div></section>';

    expect(isKeyboardControlTarget(document.getElementById('i'))).toBe(true);
    expect(isKeyboardControlTarget(document.getElementById('b'))).toBe(true);
    expect(isKeyboardControlTarget(document.getElementById('d'))).toBe(false);
  });

  it('focuses the keypad when a routed panel background is clicked', () => {
    document.body.innerHTML =
      '<section id="panel"><div id="surface"></div><input id="input"></section>';
    const localKeypad = createKeypad();
    wireKeypadFocusPanels([document.getElementById('panel')], localKeypad);

    document
      .getElementById('surface')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    document
      .getElementById('input')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(localKeypad.focusKeypad).toHaveBeenCalledTimes(1);
  });

  it('routes shortcut keys from non-control targets', () => {
    document.body.innerHTML = '<main id="surface"></main>';
    const localKeypad = createKeypad();
    const event = dispatchKeyboardEvent(document.getElementById('surface')!, 'keydown', 'A');

    const consumed = routeTecKeypadShortcut(
      event,
      { kind: 'key', code: 0x0a },
      localKeypad,
      vi.fn()
    );

    expect(consumed).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(localKeypad.pressKey).toHaveBeenCalledWith(0x0a);

    // The matching keyup releases the same adjusted code the press latched.
    const upEvent = dispatchKeyboardEvent(document.getElementById('surface')!, 'keyup', 'A');
    expect(routeTecKeypadKeyup(upEvent, localKeypad)).toBe(true);
    expect(localKeypad.releaseKey).toHaveBeenCalledWith(0x0a | 0x20);
  });

  it('does not route shortcut keys from controls or already-consumed events', () => {
    document.body.innerHTML = '<input id="input"><main id="surface"></main>';
    const localKeypad = createKeypad();
    const inputEvent = dispatchKeyboardEvent(document.getElementById('input')!, 'keydown', 'A');
    const consumedEvent = dispatchKeyboardEvent(
      document.getElementById('surface')!,
      'keydown',
      'A'
    );
    consumedEvent.preventDefault();

    expect(
      routeTecKeypadShortcut(inputEvent, { kind: 'key', code: 0x0a }, localKeypad, vi.fn())
    ).toBe(false);
    expect(
      routeTecKeypadShortcut(consumedEvent, { kind: 'key', code: 0x0a }, localKeypad, vi.fn())
    ).toBe(false);
    expect(localKeypad.sendKey).not.toHaveBeenCalled();
    expect(localKeypad.pressKey).not.toHaveBeenCalled();
  });

  it('unlatches shift on keyup when keypad routing owns the event', () => {
    document.body.innerHTML = '<main id="surface"></main>';
    const localKeypad = createKeypad();
    localKeypad.shiftLatched = true;
    const event = dispatchKeyboardEvent(document.getElementById('surface')!, 'keyup', 'Shift');

    expect(routeTecKeypadKeyup(event, localKeypad)).toBe(true);
    expect(localKeypad.setShiftLatched).toHaveBeenCalledWith(false);
    expect(event.defaultPrevented).toBe(true);
  });
});
