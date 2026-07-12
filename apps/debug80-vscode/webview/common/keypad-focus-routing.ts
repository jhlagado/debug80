import type { TecKeypadShortcut } from './tec-keyboard-shortcuts';

export type KeypadFocusTarget = {
  focusKeypad(): void;
};

export type KeypadKeyTarget = KeypadFocusTarget & {
  getShiftLatched(): boolean;
  sendKey(code: number): void;
  setShiftLatched(value: boolean): void;
};

export function isKeyboardControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.closest('input, select, textarea, button, [contenteditable="true"]') !== null;
}

export function wireKeypadFocusPanels(
  panels: Array<HTMLElement | null>,
  keypad: KeypadFocusTarget
): void {
  for (const panel of panels) {
    panel?.addEventListener('mousedown', (event) => {
      if (isKeyboardControlTarget(event.target)) {
        return;
      }
      event.preventDefault();
      keypad.focusKeypad();
    });
  }
}

export function routeTecKeypadShortcut(
  event: KeyboardEvent,
  shortcut: TecKeypadShortcut,
  keypad: KeypadKeyTarget,
  reset: () => void
): boolean {
  if (event.defaultPrevented || event.repeat || isKeyboardControlTarget(event.target)) {
    return false;
  }
  if (shortcut.kind === 'key') {
    keypad.sendKey(shortcut.code);
  } else if (shortcut.kind === 'reset') {
    keypad.setShiftLatched(false);
    reset();
  } else if (shortcut.kind === 'shift') {
    keypad.setShiftLatched(shortcut.latched);
  } else {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function routeTecKeypadKeyup(event: KeyboardEvent, keypad: KeypadKeyTarget): boolean {
  if (event.defaultPrevented || isKeyboardControlTarget(event.target)) {
    return false;
  }
  if (event.key === 'Shift' && keypad.getShiftLatched()) {
    keypad.setShiftLatched(false);
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  return false;
}
