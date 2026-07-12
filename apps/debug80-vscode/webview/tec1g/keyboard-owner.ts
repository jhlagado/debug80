export type KeyboardOwner = 'keypad' | 'matrixKeyboard' | 'joystick' | null;

export type KeyboardOwnerVisibility = {
  keypad: boolean;
  matrixKeyboard: boolean;
  joystick: boolean;
};

export type KeyboardOwnerController = {
  getOwner: () => KeyboardOwner;
  selectOwner: (owner: Exclude<KeyboardOwner, null>) => void;
  syncVisibility: (next: KeyboardOwnerVisibility) => void;
  isOwnerVisible: (owner: Exclude<KeyboardOwner, null>) => boolean;
};

export type KeyboardOwnerControllerOptions = {
  onOwnerChange?: (owner: KeyboardOwner, previousOwner: KeyboardOwner) => void;
};

const FALLBACK_ORDER: Array<Exclude<KeyboardOwner, null>> = [
  'matrixKeyboard',
  'joystick',
  'keypad',
];

export function isNativeKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.closest('input, select, textarea, button, [contenteditable="true"]') !== null;
}

export function shouldBypassEmulatorKeyboardTarget(target: EventTarget | null): boolean {
  if (!isNativeKeyboardTarget(target)) {
    return false;
  }
  if (!(target instanceof HTMLElement)) {
    return true;
  }
  return target.closest('[data-joystick-bit], [data-joystick-arrow-mode], .matrix-key, .keycap') === null;
}

export function createKeyboardOwnerController(
  options: KeyboardOwnerControllerOptions = {}
): KeyboardOwnerController {
  let owner: KeyboardOwner = null;
  let visibility: KeyboardOwnerVisibility = {
    keypad: false,
    matrixKeyboard: false,
    joystick: false,
  };

  function fallbackOwner(next: KeyboardOwnerVisibility): KeyboardOwner {
    return FALLBACK_ORDER.find((candidate) => next[candidate]) ?? null;
  }

  function isOwnerVisible(candidate: Exclude<KeyboardOwner, null>): boolean {
    return visibility[candidate];
  }

  function setOwner(nextOwner: KeyboardOwner): void {
    if (owner === nextOwner) {
      return;
    }
    const previousOwner = owner;
    owner = nextOwner;
    options.onOwnerChange?.(owner, previousOwner);
  }

  function selectOwner(nextOwner: Exclude<KeyboardOwner, null>): void {
    if (!isOwnerVisible(nextOwner)) {
      return;
    }
    setOwner(nextOwner);
  }

  function syncVisibility(next: KeyboardOwnerVisibility): void {
    const matrixOpened = !visibility.matrixKeyboard && next.matrixKeyboard;
    const joystickOpened = !visibility.joystick && next.joystick;
    visibility = { ...next };

    if (owner !== null && !visibility[owner]) {
      setOwner(fallbackOwner(visibility));
      return;
    }
    if (matrixOpened) {
      setOwner('matrixKeyboard');
      return;
    }
    if (joystickOpened && !visibility.matrixKeyboard) {
      setOwner('joystick');
      return;
    }
    if (owner === null) {
      setOwner(fallbackOwner(visibility));
    }
  }

  return {
    getOwner: () => owner,
    selectOwner,
    syncVisibility,
    isOwnerVisible,
  };
}
