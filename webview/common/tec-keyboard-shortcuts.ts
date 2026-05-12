import { TEC1G_KEY_MAP } from './tec-keypad-layout';

export type TecKeypadShortcut =
  | { kind: 'key'; code: number }
  | { kind: 'reset' }
  | { kind: 'shift'; latched: boolean }
  | { kind: 'none' };

export function resolveTecKeypadShortcut(key: string): TecKeypadShortcut {
  if (key === 'CapsLock') {
    return { kind: 'none' };
  }
  if (key === ' ') {
    return { kind: 'key', code: TEC1G_KEY_MAP['0'] };
  }
  if (key === 'Escape') {
    return { kind: 'reset' };
  }
  if (key === 'Shift') {
    return { kind: 'shift', latched: true };
  }
  if (key === 'Enter') {
    return { kind: 'key', code: TEC1G_KEY_MAP.GO };
  }
  if (key === 'ArrowLeft') {
    return { kind: 'key', code: TEC1G_KEY_MAP.LEFT };
  }
  if (key === 'ArrowRight') {
    return { kind: 'key', code: TEC1G_KEY_MAP.RIGHT };
  }
  if (key === 'ArrowUp') {
    return { kind: 'key', code: TEC1G_KEY_MAP.AD };
  }
  if (key === 'ArrowDown') {
    return { kind: 'key', code: TEC1G_KEY_MAP.GO };
  }
  if (key === 'Tab') {
    return { kind: 'key', code: TEC1G_KEY_MAP.AD };
  }

  const mapped = TEC1G_KEY_MAP[key.toUpperCase()];
  return mapped !== undefined ? { kind: 'key', code: mapped } : { kind: 'none' };
}
