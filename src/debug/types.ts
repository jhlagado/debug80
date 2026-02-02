/**
 * @fileoverview Type definitions for the Z80 debug adapter.
 * Contains all interfaces and types used across debug adapter modules.
 */

import { DebugProtocol } from '@vscode/debugprotocol';
import { SimplePlatformConfig, Tec1PlatformConfig, Tec1gPlatformConfig } from '../platforms/types';

/**
 * Terminal configuration for serial I/O emulation.
 */
export interface TerminalConfig {
  /** Port number for transmitting data (default: 0) */
  txPort?: number;
  /** Port number for receiving data (default: 1) */
  rxPort?: number;
  /** Port number for status register (default: 2) */
  statusPort?: number;
  /** Whether to trigger interrupts on input (default: false) */
  interrupt?: boolean;
}

/**
 * Normalized terminal configuration with all values required.
 */
export interface TerminalConfigNormalized {
  txPort: number;
  rxPort: number;
  statusPort: number;
  interrupt: boolean;
}

/**
 * Runtime state for terminal emulation.
 */
export interface TerminalState {
  config: TerminalConfigNormalized;
  input: number[];
  breakRequested?: boolean;
}

/**
 * Launch request arguments for the Z80 debug adapter.
 * Extends the standard DAP launch request with Z80-specific options.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  /** Path to the main assembly source file */
  asm?: string;
  /** Alternative path to the source file (alias for asm) */
  sourceFile?: string;
  /** Path to the Intel HEX file */
  hex?: string;
  /** Path to the listing file */
  listing?: string;
  /** Output directory for build artifacts */
  outputDir?: string;
  /** Base name for output artifacts (default: derived from asm filename) */
  artifactBase?: string;
  /** Entry point address (default: start of program) */
  entry?: number;
  /** Whether to stop at the entry point (default: false) */
  stopOnEntry?: boolean;
  /** Path to project configuration file */
  projectConfig?: string;
  /** Target name from the configuration */
  target?: string;
  /** Platform type: 'simple', 'tec1', or 'tec1g' */
  platform?: string;
  /** Whether to run the assembler before debugging (default: true) */
  assemble?: boolean;
  /** Additional directories to search for source files */
  sourceRoots?: string[];
  /** Maximum instructions to execute during step over (0 = unlimited) */
  stepOverMaxInstructions?: number;
  /** Maximum instructions to execute during step out (0 = unlimited) */
  stepOutMaxInstructions?: number;
  /** Terminal I/O configuration */
  terminal?: TerminalConfig;
  /** Simple platform configuration */
  simple?: SimplePlatformConfig;
  /** TEC-1 platform configuration */
  tec1?: Tec1PlatformConfig;
  /** TEC-1G platform configuration */
  tec1g?: Tec1gPlatformConfig;
}

/**
 * Configuration file structure for debug80.json.
 */
export interface ProjectConfig {
  /** Default target to use when none specified */
  defaultTarget?: string;
  /** Alternative name for defaultTarget */
  target?: string;
  /** Named target configurations */
  targets?: Record<string, Partial<LaunchRequestArguments> & { source?: string }>;
  /** Fields that can be specified at the root level */
  asm?: string;
  sourceFile?: string;
  source?: string;
  hex?: string;
  listing?: string;
  outputDir?: string;
  artifactBase?: string;
  entry?: number;
  stopOnEntry?: boolean;
  platform?: string;
  assemble?: boolean;
  sourceRoots?: string[];
  stepOverMaxInstructions?: number;
  stepOutMaxInstructions?: number;
  terminal?: TerminalConfig;
  simple?: SimplePlatformConfig;
  tec1?: Tec1PlatformConfig;
  tec1g?: Tec1gPlatformConfig;
}

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
  | 'debug80/tec1MemorySnapshot'
  | 'debug80/tec1gMemorySnapshot'
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
 * Memory view configuration for snapshot requests.
 */
export interface MemoryViewRequest {
  /** Unique identifier for this view */
  id?: string;
  /** Register or 'absolute' for the view target */
  view?: string;
  /** Number of bytes to show after the focus address */
  after?: number;
  /** Absolute address (only used when view is 'absolute') */
  address?: number;
}

/**
 * Payload for memory snapshot request.
 */
export interface MemorySnapshotPayload {
  /** Number of bytes to show before the focus address */
  before?: number;
  /** Row size (8 or 16) */
  rowSize?: 8 | 16;
  /** View configurations */
  views?: MemoryViewRequest[];
}

/**
 * Result of reading a memory window.
 */
export interface MemoryWindow {
  /** Start address of the window */
  start: number;
  /** Bytes in the window */
  bytes: number[];
  /** Offset of the focus address within the window */
  focus: number;
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

// ============================================================================
// Type Guards for Custom Request Payloads
// ============================================================================

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

/**
 * Checks if value is a valid MemoryViewRequest.
 */
export function isMemoryViewRequest(value: unknown): value is MemoryViewRequest {
  return typeof value === 'object' && value !== null;
}

/**
 * Extracts memory snapshot payload from unknown value.
 * Provides defaults for missing fields.
 */
export function extractMemorySnapshotPayload(value: unknown): MemorySnapshotPayload {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const payload = value as Record<string, unknown>;
  const result: MemorySnapshotPayload = {};

  if (typeof payload.before === 'number') {
    result.before = payload.before;
  }
  if (payload.rowSize === 8 || payload.rowSize === 16) {
    result.rowSize = payload.rowSize;
  }
  if (Array.isArray(payload.views)) {
    result.views = payload.views.filter(isMemoryViewRequest);
  }
  return result;
}

/**
 * Normalized view entry with all fields resolved.
 */
export interface NormalizedViewEntry {
  /** Unique identifier for this view */
  id: string;
  /** Register name or 'absolute' */
  view: string;
  /** Number of bytes to show after */
  after: number;
  /** Address value (only for 'absolute' views) */
  address: number | null;
}

/**
 * Extracts and normalizes a view entry from unknown value.
 */
export function extractViewEntry(
  entry: MemoryViewRequest,
  clampFn: (val: unknown, defaultVal: number) => number
): NormalizedViewEntry {
  const id = typeof entry.id === 'string' ? entry.id : 'view';
  const view = typeof entry.view === 'string' ? entry.view : 'hl';
  const after = clampFn(entry.after, 16);
  const address = Number.isFinite(entry.address) ? (entry.address as number) & 0xffff : null;
  return { id, view, after, address };
}
