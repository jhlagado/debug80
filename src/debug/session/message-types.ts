/**
 * @fileoverview Custom request and message payload types.
 */

/**
 * Custom request types for the debug adapter.
 */
export type CustomRequestType =
  | 'debug80/terminalInput'
  | 'debug80/terminalBreak'
  | 'debug80/tec1Key'
  | 'debug80/tec1gKey'
  | 'debug80/tec1gMatrixKey'
  | 'debug80/tec1gMatrixMode'
  | 'debug80/tec1Reset'
  | 'debug80/tec1gReset'
  | 'debug80/tec1Speed'
  | 'debug80/tec1gSpeed'
  | 'debug80/tec1SerialInput'
  | 'debug80/tec1gSerialInput'
  | 'debug80/memorySnapshot'
  | 'debug80/registerWrite'
  | 'debug80/memoryWrite'
  | 'debug80/rebuildWarm'
  | 'debug80/romSources';

/**
 * Payload for terminal input request.
 */
export interface TerminalInputPayload {
  text: string;
}

/**
 * Payload for key press request.
 */
export interface KeyPressPayload {
  code: number;
}

/**
 * Payload for matrix key press/release.
 */
export interface MatrixKeyPayload {
  key: string;
  pressed: boolean;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

/**
 * Payload for matrix mode toggle.
 */
export interface MatrixModePayload {
  enabled: boolean;
}

/**
 * Payload for speed change request.
 */
export interface SpeedChangePayload {
  mode: 'slow' | 'fast';
}

/**
 * Payload for serial input request.
 */
export interface SerialInputPayload {
  text: string;
}

/**
 * ROM source file entry for listing.
 */
export interface RomSourceEntry {
  /** Display label */
  label: string;
  /** Absolute file path */
  path: string;
  /** Type of source */
  kind: 'listing' | 'source';
}

export interface RebuildIssueLocation {
  path: string;
  line: number;
  column?: number;
  sourceLine?: string;
}

export interface WarmRebuildResult {
  ok: boolean;
  summary: string;
  detail?: string;
  rebuiltPath?: string;
  location?: RebuildIssueLocation;
}

export function isWarmRebuildResult(value: unknown): value is WarmRebuildResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const payload = value as Partial<WarmRebuildResult>;
  return typeof payload.ok === 'boolean' && typeof payload.summary === 'string';
}

/**
 * Checks if value is a valid TerminalInputPayload.
 */
export function isTerminalInputPayload(value: unknown): value is TerminalInputPayload {
  return typeof value === 'object' && value !== null && 'text' in value;
}

/**
 * Extracts text from a TerminalInputPayload-like object.
 * Returns empty string if invalid.
 */
export function extractTerminalText(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const payload = value as { text?: unknown };
    return typeof payload.text === 'string' ? payload.text : '';
  }
  return '';
}

/**
 * Checks if value is a valid KeyPressPayload.
 */
export function isKeyPressPayload(value: unknown): value is KeyPressPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as KeyPressPayload).code === 'number'
  );
}

/**
 * Extracts key code from a KeyPressPayload-like object.
 * Returns undefined if invalid.
 */
export function extractKeyCode(value: unknown): number | undefined {
  if (typeof value === 'object' && value !== null) {
    const payload = value as { code?: unknown };
    return Number.isFinite(payload.code) ? (payload.code as number) : undefined;
  }
  return undefined;
}

/**
 * Extracts matrix key payload from unknown value.
 */
export function extractMatrixKeyPayload(value: unknown): MatrixKeyPayload | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const payload = value as Partial<MatrixKeyPayload>;
  if (typeof payload.key !== 'string' || typeof payload.pressed !== 'boolean') {
    return undefined;
  }
  return {
    key: payload.key,
    pressed: payload.pressed,
    ...(payload.shift !== undefined ? { shift: payload.shift === true } : {}),
    ...(payload.ctrl !== undefined ? { ctrl: payload.ctrl === true } : {}),
    ...(payload.alt !== undefined ? { alt: payload.alt === true } : {}),
  };
}

/**
 * Extracts matrix mode enabled flag from unknown value.
 */
export function extractMatrixModeEnabled(value: unknown): boolean | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const payload = value as Partial<MatrixModePayload>;
  return typeof payload.enabled === 'boolean' ? payload.enabled : undefined;
}

/**
 * Checks if value is a valid SpeedChangePayload.
 */
export function isSpeedChangePayload(value: unknown): value is SpeedChangePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const mode = (value as SpeedChangePayload).mode;
  return mode === 'slow' || mode === 'fast';
}

/**
 * Extracts speed mode from a SpeedChangePayload-like object.
 * Returns undefined if invalid.
 */
export function extractSpeedMode(value: unknown): 'slow' | 'fast' | undefined {
  if (typeof value === 'object' && value !== null) {
    const payload = value as { mode?: unknown };
    return payload.mode === 'slow' || payload.mode === 'fast' ? payload.mode : undefined;
  }
  return undefined;
}

/**
 * Checks if value is a valid SerialInputPayload.
 */
export function isSerialInputPayload(value: unknown): value is SerialInputPayload {
  return typeof value === 'object' && value !== null && 'text' in value;
}

/**
 * Extracts text from a SerialInputPayload-like object.
 * Returns empty string if invalid.
 */
export function extractSerialText(value: unknown): string {
  return extractTerminalText(value);
}