/**
 * @fileoverview Matrix keyboard request handlers extracted from the debug adapter.
 */

import {
  getMatrixCombosForAscii,
  type MatrixKeyCombo,
  type MatrixModifier,
} from '@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap';

export type MatrixKeyPayload = {
  key: string;
  pressed: boolean;
  shift?: boolean;
  ctrl?: boolean;
  fn?: boolean;
  alt?: boolean;
};

export type MatrixRuntime = {
  state: { matrixModeEnabled: boolean; capsLock: boolean };
  setMatrixMode: (enabled: boolean) => void;
  applyMatrixKey: (row: number, col: number, pressed: boolean) => void;
};

function parseMatrixModeEnabled(args: unknown): boolean | undefined {
  if (typeof args !== 'object' || args === null) {
    return undefined;
  }
  const candidate = (args as { enabled?: unknown }).enabled;
  return typeof candidate === 'boolean' ? candidate : undefined;
}

export function parseMatrixKeyPayload(args: unknown): MatrixKeyPayload | null {
  if (typeof args !== 'object' || args === null) {
    return null;
  }
  const candidate = args as {
    key?: unknown;
    pressed?: unknown;
    shift?: unknown;
    ctrl?: unknown;
    fn?: unknown;
    alt?: unknown;
  };
  if (typeof candidate.key !== 'string' || typeof candidate.pressed !== 'boolean') {
    return null;
  }
  const payload: MatrixKeyPayload = {
    key: candidate.key,
    pressed: candidate.pressed,
  };
  if (candidate.shift === true) {
    payload.shift = true;
  }
  if (candidate.ctrl === true) {
    payload.ctrl = true;
  }
  if (candidate.fn === true) {
    payload.fn = true;
  }
  if (candidate.alt === true) {
    payload.alt = true;
  }
  return payload;
}

export function resolveMatrixAscii(key: string): number | undefined {
  if (key.length === 1) {
    return key.charCodeAt(0);
  }
  if (key === 'ArrowUp') {
    return 0x03;
  }
  if (key === 'ArrowDown') {
    return 0x04;
  }
  if (key === 'ArrowLeft') {
    return 0x05;
  }
  if (key === 'ArrowRight') {
    return 0x06;
  }
  if (key === 'Backspace') {
    return 0x08;
  }
  if (key === 'Tab') {
    return 0x09;
  }
  if (key === 'Enter') {
    return 0x0d;
  }
  if (key === 'Escape') {
    return 0x1b;
  }
  return undefined;
}

const SHIFTED_KEY_ASCII: Record<string, string> = {
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
  '[': '{',
  ']': '}',
  '\\': '|',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
};

export function resolveMatrixPayloadAscii(payload: MatrixKeyPayload): number | undefined {
  if (
    payload.shift === true &&
    payload.ctrl !== true &&
    payload.fn !== true &&
    payload.alt !== true
  ) {
    if (/^[a-z]$/.test(payload.key)) {
      return payload.key.toUpperCase().charCodeAt(0);
    }
    const shifted = SHIFTED_KEY_ASCII[payload.key];
    if (shifted !== undefined) {
      return shifted.charCodeAt(0);
    }
  }
  return resolveMatrixAscii(payload.key);
}

export function buildMatrixKeyId(payload: MatrixKeyPayload): string {
  return (
    payload.key +
    '|' +
    (payload.shift === true ? '1' : '0') +
    (payload.ctrl === true ? '1' : '0') +
    (payload.fn === true ? '1' : '0') +
    (payload.alt === true ? '1' : '0')
  );
}

const SPECIAL_MATRIX_KEYS: Record<string, MatrixKeyCombo[]> = {
  CapsLock: [{ row: 0, col: 7 }],
  Shift: [{ row: 0, col: 0 }],
  Control: [{ row: 0, col: 1 }],
  Fn: [{ row: 0, col: 2 }],
  Alt: [{ row: 0, col: 3 }],
};

const MODIFIER_KEY_NAMES: Record<MatrixModifier, string> = {
  shift: 'Shift',
  ctrl: 'Control',
  fn: 'Fn',
  alt: 'Alt',
};

function matchesCapsLock(combo: MatrixKeyCombo, capsLock: boolean): boolean {
  return combo.capsLock === undefined || combo.capsLock === capsLock;
}

function selectCtrlLetterCombo(
  payload: MatrixKeyPayload,
  capsLock: boolean
): MatrixKeyCombo | undefined {
  if (payload.ctrl !== true || !/^[a-z]$/i.test(payload.key)) {
    return undefined;
  }
  const combos = getMatrixCombosForAscii(payload.key.toLowerCase().charCodeAt(0));
  const unmodifiedLetterCombo = combos.find(
    (combo) => combo.modifier === undefined && matchesCapsLock(combo, capsLock)
  );
  return unmodifiedLetterCombo === undefined
    ? undefined
    : { ...unmodifiedLetterCombo, modifier: 'ctrl' };
}

export function selectMatrixCombo(
  combos: MatrixKeyCombo[],
  payload: MatrixKeyPayload,
  capsLock: boolean
): MatrixKeyCombo | undefined {
  const preferred =
    payload.ctrl === true
      ? 'ctrl'
      : payload.shift === true
        ? 'shift'
        : payload.fn === true
          ? 'fn'
          : payload.alt === true
            ? 'alt'
            : undefined;
  if (preferred !== undefined) {
    const preferredMatch = combos.find(
      (combo) => combo.modifier === preferred && matchesCapsLock(combo, capsLock)
    );
    if (preferredMatch) {
      return preferredMatch;
    }
  }
  const unmodified = combos.find(
    (combo) => combo.modifier === undefined && matchesCapsLock(combo, capsLock)
  );
  if (unmodified) {
    return unmodified;
  }
  const capsMatch = combos.find((combo) => matchesCapsLock(combo, capsLock));
  return capsMatch ?? combos[0];
}

export function expandMatrixCombo(combo: MatrixKeyCombo): Array<{ row: number; col: number }> {
  const entries = [{ row: combo.row, col: combo.col }];
  if (combo.modifier === 'shift') {
    entries.push({ row: 0, col: 0 });
  } else if (combo.modifier === 'ctrl') {
    entries.push({ row: 0, col: 1 });
  } else if (combo.modifier === 'fn') {
    entries.push({ row: 0, col: 2 });
  } else if (combo.modifier === 'alt') {
    entries.push({ row: 0, col: 3 });
  }
  return entries;
}

function isRawModifierHeld(
  heldKeys: Map<string, MatrixKeyCombo[]>,
  modifier: MatrixModifier | undefined
): boolean {
  if (modifier === undefined) {
    return false;
  }
  const payload: MatrixKeyPayload = {
    key: MODIFIER_KEY_NAMES[modifier],
    pressed: true,
    ...(modifier === 'shift' ? { shift: true } : {}),
    ...(modifier === 'ctrl' ? { ctrl: true } : {}),
    ...(modifier === 'fn' ? { fn: true } : {}),
    ...(modifier === 'alt' ? { alt: true } : {}),
  };
  return heldKeys.has(buildMatrixKeyId(payload));
}

function orderMatrixTransitions(
  entries: Array<{ row: number; col: number }>,
  pressed: boolean
): Array<{ row: number; col: number }> {
  if (entries.length < 2) {
    return entries;
  }
  const first = entries[0]!;
  const second = entries[1]!;
  return pressed ? [second, first] : entries;
}

export function handleMatrixModeRequest(
  runtime: MatrixRuntime | undefined,
  args: unknown
): string | null {
  if (!runtime) {
    return 'Debug80: Platform not active.';
  }
  const enabled = parseMatrixModeEnabled(args);
  if (enabled === undefined) {
    return 'Debug80: Missing matrix mode flag.';
  }
  runtime.setMatrixMode(enabled);
  return null;
}

export function handleMatrixKeyRequest(
  runtime: MatrixRuntime | undefined,
  heldKeys: Map<string, MatrixKeyCombo[]>,
  args: unknown
): string | null {
  if (!runtime) {
    return 'Debug80: Platform not active.';
  }
  const payload = parseMatrixKeyPayload(args);
  if (!payload) {
    return 'Debug80: Missing matrix key payload.';
  }
  const keyId = buildMatrixKeyId(payload);
  const specialCombos = SPECIAL_MATRIX_KEYS[payload.key];
  if (specialCombos) {
    if (payload.pressed) {
      if (!heldKeys.has(keyId)) {
        heldKeys.set(keyId, specialCombos);
        specialCombos.forEach((entry) => runtime.applyMatrixKey(entry.row, entry.col, true));
      }
      return null;
    }
    const held = heldKeys.get(keyId) ?? specialCombos;
    held.forEach((entry) => runtime.applyMatrixKey(entry.row, entry.col, false));
    heldKeys.delete(keyId);
    return null;
  }
  const ctrlLetterCombo = selectCtrlLetterCombo(payload, runtime.state.capsLock);
  const combo =
    ctrlLetterCombo ??
    ((): MatrixKeyCombo | undefined => {
      const ascii = resolveMatrixPayloadAscii(payload);
      if (ascii === undefined) {
        return undefined;
      }
      const combos = getMatrixCombosForAscii(ascii);
      if (combos.length === 0) {
        return undefined;
      }
      return selectMatrixCombo(combos, payload, runtime.state.capsLock);
    })();
  if (!combo) {
    return null;
  }
  const applied = expandMatrixCombo(combo);
  const effectiveApplied =
    combo.modifier !== undefined && isRawModifierHeld(heldKeys, combo.modifier)
      ? applied.slice(0, 1)
      : applied;
  if (payload.pressed) {
    if (!heldKeys.has(keyId)) {
      heldKeys.set(keyId, effectiveApplied);
      orderMatrixTransitions(effectiveApplied, true).forEach((entry) =>
        runtime.applyMatrixKey(entry.row, entry.col, true)
      );
    }
    return null;
  }
  const held = heldKeys.get(keyId) ?? effectiveApplied;
  orderMatrixTransitions(held, false).forEach((entry) =>
    runtime.applyMatrixKey(entry.row, entry.col, false)
  );
  heldKeys.delete(keyId);
  return null;
}
