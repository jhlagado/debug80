export type MatrixKeyMods = {
  shift: boolean;
  ctrl: boolean;
  fn: boolean;
  alt: boolean;
};

export type MatrixModifier = keyof MatrixKeyMods;

type HostModifierState = {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

const PHYSICAL_CODE_TO_MATRIX_KEY: Record<string, string> = {
  Backquote: '`',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Digit0: '0',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: ' ',
  Tab: 'Tab',
  Enter: 'Enter',
  Escape: 'Escape',
  Backspace: 'Backspace',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  CapsLock: 'CapsLock',
};

for (let code = 65; code <= 90; code += 1) {
  const letter = String.fromCharCode(code);
  PHYSICAL_CODE_TO_MATRIX_KEY[`Key${letter}`] = letter.toLowerCase();
}

export function createMatrixMods(mods: HostModifierState = {}): MatrixKeyMods {
  return {
    shift: mods.shiftKey === true,
    ctrl: mods.ctrlKey === true || mods.metaKey === true,
    fn: false,
    alt: mods.altKey === true,
  };
}

export function cloneMatrixMods(mods: MatrixKeyMods): MatrixKeyMods {
  return {
    shift: mods.shift,
    ctrl: mods.ctrl,
    fn: mods.fn,
    alt: mods.alt,
  };
}

export function clearOneShotMatrixMods(_mods: MatrixKeyMods): MatrixKeyMods {
  return createMatrixMods();
}

export function isLetterKey(key: string): boolean {
  return /^[a-z]$/i.test(key);
}

export function matrixClickModsForKey(
  key: string,
  armedMods: MatrixKeyMods,
  capsLockEnabled: boolean
): MatrixKeyMods {
  return {
    shift: armedMods.shift || (capsLockEnabled && isLetterKey(key)),
    ctrl: armedMods.ctrl,
    fn: armedMods.fn,
    alt: armedMods.alt,
  };
}

export function matrixModifierForKey(key: string): MatrixModifier | undefined {
  if (key === 'Shift') {
    return 'shift';
  }
  if (key === 'Control') {
    return 'ctrl';
  }
  if (key === 'Fn') {
    return 'fn';
  }
  if (key === 'Alt') {
    return 'alt';
  }
  return undefined;
}

export function matrixKeyId(key: string, mods: MatrixKeyMods): string {
  return (
    key +
    '|' +
    (mods.shift ? '1' : '0') +
    (mods.ctrl ? '1' : '0') +
    (mods.fn ? '1' : '0') +
    (mods.alt ? '1' : '0')
  );
}

export function resolvePhysicalMatrixKey(event: KeyboardEvent): string {
  const usesModifier =
    event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.key === 'CapsLock';
  if (usesModifier) {
    const mapped = PHYSICAL_CODE_TO_MATRIX_KEY[event.code];
    if (mapped !== undefined) {
      return mapped;
    }
  }
  return event.key;
}

export function isHostReleaseChord(key: string, mods: HostModifierState): boolean {
  return key === 'Escape' && (mods.metaKey === true || mods.ctrlKey === true);
}
