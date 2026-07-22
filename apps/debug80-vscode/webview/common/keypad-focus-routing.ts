import type { TecKeypadShortcut } from './tec-keyboard-shortcuts';
import type { KeypadPressHandle } from './keypad-core';

export type KeypadFocusTarget = {
  focusKeypad(): void;
};

export type KeypadKeyTarget = KeypadFocusTarget & {
  getShiftLatched(): boolean;
  pressKey(code: number): KeypadPressHandle;
  releaseKey(press: KeypadPressHandle): void;
  releaseAllKeys(): void;
  setShiftLatched(value: boolean): void;
};

/** Physical keys currently held, by stable KeyboardEvent.code, with the adjusted
 * keypad code each press latched. */
const heldPhysicalKeys = new Map<string, KeypadPressHandle>();
const heldPhysicalShiftKeys = new Set<string>();

export function releaseAllTecKeypadKeys(keypad: KeypadKeyTarget): void {
  heldPhysicalKeys.clear();
  heldPhysicalShiftKeys.clear();
  keypad.releaseAllKeys();
  if (keypad.getShiftLatched()) {
    keypad.setShiftLatched(false);
  }
}

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
  reset: (state: { fn: boolean }) => void
): boolean {
  if (event.defaultPrevented || event.repeat || isKeyboardControlTarget(event.target)) {
    return false;
  }
  if (shortcut.kind === 'key') {
    heldPhysicalKeys.set(event.code || event.key, keypad.pressKey(shortcut.code));
  } else if (shortcut.kind === 'reset') {
    const fn = keypad.getShiftLatched();
    keypad.setShiftLatched(false);
    reset({ fn });
  } else if (shortcut.kind === 'shift') {
    heldPhysicalShiftKeys.add(event.code || event.key);
    keypad.setShiftLatched(shortcut.latched);
  } else {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function routeTecKeypadKeyup(event: KeyboardEvent, keypad: KeypadKeyTarget): boolean {
  const physicalKey = event.code || event.key;
  const heldPress = heldPhysicalKeys.get(physicalKey);
  if (heldPress !== undefined) {
    heldPhysicalKeys.delete(physicalKey);
    keypad.releaseKey(heldPress);
    if (!event.defaultPrevented && !isKeyboardControlTarget(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
    return true;
  }
  if (heldPhysicalShiftKeys.delete(physicalKey)) {
    if (heldPhysicalShiftKeys.size === 0 && keypad.getShiftLatched()) {
      keypad.setShiftLatched(false);
    }
    if (!event.defaultPrevented && !isKeyboardControlTarget(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
    return true;
  }
  return false;
}
