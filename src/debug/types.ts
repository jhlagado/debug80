/**
 * @fileoverview Launch and project configuration types for the Z80 debug adapter.
 */

import type { DebugProtocol } from '@vscode/debugprotocol';
import type {
  SimplePlatformConfig,
  Tec1PlatformConfig,
  Tec1gPlatformConfig,
} from '../platforms/types';
import type { TerminalConfig } from './terminal-types';

/**
 * Launch request arguments for the Z80 debug adapter.
 * Extends the standard DAP launch request with Z80-specific options.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  /** Path to the main assembly source file */
  asm?: string;
  /** Assembler backend to use (default: asm80) */
  assembler?: string;
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
  assembler?: string;
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

