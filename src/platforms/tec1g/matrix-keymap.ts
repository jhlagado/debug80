/**
 * @file Matrix keyboard mapping helpers aligned with MON-3 routines.
 */

export type MatrixModifier = 'shift' | 'ctrl' | 'fn';

export type MatrixKeyCombo = {
  row: number;
  col: number;
  modifier?: MatrixModifier;
  capsLock?: boolean;
};

const MOD_TABLE: Array<{ key: number; ascii: number }> = [
  { key: 0x0a, ascii: 0x0d }, // CR
  { key: 0x0c, ascii: 0x1b }, // ESC
  { key: 0x0d, ascii: 0x20 }, // SPACE
  { key: 0x0e, ascii: 0x27 }, // '
  { key: 0x3f, ascii: 0x5c }, // \
];

const SHIFT_TABLE: number[] = [
  '<'.charCodeAt(0),
  '_'.charCodeAt(0),
  '>'.charCodeAt(0),
  '?'.charCodeAt(0),
  ')'.charCodeAt(0),
  '!'.charCodeAt(0),
  '@'.charCodeAt(0),
  '#'.charCodeAt(0),
  '$'.charCodeAt(0),
  '%'.charCodeAt(0),
  '^'.charCodeAt(0),
  '&'.charCodeAt(0),
  '*'.charCodeAt(0),
  '('.charCodeAt(0),
  ' '.charCodeAt(0),
  ':'.charCodeAt(0),
  ' '.charCodeAt(0),
  '+'.charCodeAt(0),
  '|'.charCodeAt(0),
  '"'.charCodeAt(0),
];

const SHIFT_SECONDARY = 0x00;
const CTRL_SECONDARY = 0x01;
const FN_SECONDARY = 0x02;
const NO_SECONDARY = 0xff;

const SECONDARY_TO_MOD: Array<[number, MatrixModifier | undefined]> = [
  [NO_SECONDARY, undefined],
  [SHIFT_SECONDARY, 'shift'],
  [CTRL_SECONDARY, 'ctrl'],
  [FN_SECONDARY, 'fn'],
];

const ASCII_MIN = 0x20;
const ASCII_MAX = 0x7e;
const ASCII_CR = 0x0d;
const ASCII_ESC = 0x1b;

const keyToModAscii = new Map<number, number>();
for (const entry of MOD_TABLE) {
  keyToModAscii.set(entry.key, entry.ascii);
}

/**
 * Converts a matrix key index + modifier to ASCII using MON-3 logic.
 */
function matrixScanAscii(key: number, secondary: number, capsLock: boolean): number {
  const modAscii = keyToModAscii.get(key);
  if (modAscii !== undefined) {
    if (modAscii < 0x26) {
      return modAscii;
    }
    if (secondary !== SHIFT_SECONDARY) {
      return modAscii;
    }
    if (key === 0x0e) {
      return SHIFT_TABLE[19] ?? modAscii;
    }
    if (key === 0x3f) {
      return SHIFT_TABLE[18] ?? modAscii;
    }
    return modAscii;
  }

  if (key < 0x21 && key >= 0x0f) {
    const base = key + 0x1d;
    if (secondary !== SHIFT_SECONDARY) {
      return base;
    }
    const shiftIndex = base - 0x2c;
    return SHIFT_TABLE[shiftIndex] ?? base;
  }

  if (key < 0x24) {
    return key & 0xff;
  }

  const alpha = key + 0x3d;
  if (secondary === CTRL_SECONDARY) {
    return (alpha - 0x60) & 0xff;
  }
  if (capsLock || secondary === SHIFT_SECONDARY) {
    return (alpha - 0x20) & 0xff;
  }
  return alpha & 0xff;
}

/**
 * Builds a matrix combo from a key index.
 */
function toCombo(key: number, modifier?: MatrixModifier, capsLock?: boolean): MatrixKeyCombo {
  return {
    row: (key >> 3) & 0x0f,
    col: key & 0x07,
    ...(modifier !== undefined ? { modifier } : {}),
    ...(capsLock === true ? { capsLock } : {}),
  };
}

/**
 * Mapping from ASCII characters to matrix key combos.
 */
export const MATRIX_ASCII_MAP: Record<string, MatrixKeyCombo[]> = ((): Record<
  string,
  MatrixKeyCombo[]
> => {
  const map = new Map<number, MatrixKeyCombo[]>();
  const keys = Array.from({ length: 64 }, (_, idx) => idx);
  for (const capsLock of [false, true]) {
    for (const [secondary, modifier] of SECONDARY_TO_MOD) {
      for (const key of keys) {
        const ascii = matrixScanAscii(key, secondary, capsLock);
        const isPrintable = ascii >= ASCII_MIN && ascii <= ASCII_MAX;
        const isControl = ascii === ASCII_CR || ascii === ASCII_ESC;
        if (!isPrintable && !isControl) {
          continue;
        }
        const combo = toCombo(key, modifier, capsLock);
        const existing = map.get(ascii);
        if (existing) {
          existing.push(combo);
        } else {
          map.set(ascii, [combo]);
        }
      }
    }
  }
  const result: Record<string, MatrixKeyCombo[]> = {};
  for (const [ascii, combos] of map.entries()) {
    result[String.fromCharCode(ascii)] = combos;
  }
  const fallbacks: Record<string, string> = {
    ']': '[',
    '}': '{',
    '`': "'",
    '~': '"',
  };
  for (const [target, source] of Object.entries(fallbacks)) {
    if (!result[target]) {
      const sourceCombos = result[source] ?? [];
      result[target] = sourceCombos.map((combo) => ({ ...combo }));
    }
  }
  return result;
})();

/**
 * Returns matrix combos for a single character.
 */
export function getMatrixCombosForChar(ch: string): MatrixKeyCombo[] {
  if (!ch) {
    return [];
  }
  return MATRIX_ASCII_MAP[ch] ?? [];
}

/**
 * Returns matrix combos for an ASCII code.
 */
export function getMatrixCombosForAscii(ascii: number): MatrixKeyCombo[] {
  if (!Number.isFinite(ascii)) {
    return [];
  }
  return MATRIX_ASCII_MAP[String.fromCharCode(ascii & 0xff)] ?? [];
}
