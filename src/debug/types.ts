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
