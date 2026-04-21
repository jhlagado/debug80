/**
 * @file Shared keypad layout for TEC-1 and TEC-1G webviews (same MON codes and grid).
 */

export const TEC1G_SHIFT_BIT = 0x20;

export const TEC1G_DIGITS = 6;

/** Maps keypad labels and keyboard keys to MON port codes (with shift bit handled at send time). */
export const TEC1G_KEY_MAP: Record<string, number> = {
  '0': 0x00,
  '1': 0x01,
  '2': 0x02,
  '3': 0x03,
  '4': 0x04,
  '5': 0x05,
  '6': 0x06,
  '7': 0x07,
  '8': 0x08,
  '9': 0x09,
  A: 0x0a,
  B: 0x0b,
  C: 0x0c,
  D: 0x0d,
  E: 0x0e,
  F: 0x0f,
  AD: 0x13,
  RIGHT: 0x10,
  GO: 0x12,
  LEFT: 0x11,
};

export const TEC1G_CONTROL_ORDER = ['AD', 'GO', 'LEFT', 'RIGHT'] as const;

export const TEC1G_CONTROL_LABELS: Record<string, string> = {
  AD: 'AD',
  GO: 'GO',
  LEFT: '◀',
  RIGHT: '▶',
};

export const TEC1G_HEX_ORDER = [
  'C',
  'D',
  'E',
  'F',
  '8',
  '9',
  'A',
  'B',
  '4',
  '5',
  '6',
  '7',
  '0',
  '1',
  '2',
  '3',
];
