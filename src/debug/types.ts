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
 * Debug80 platform ids supported by the project manifest.
 */
export type Debug80PlatformId = 'simple' | 'tec1' | 'tec1g';

/**
 * Reference to a bundled asset shipped with the extension.
 */
export interface BundledAssetReference {
  /** Stable bundle id, for example `tec1g/mon3/v1` */
  bundleId: string;
  /** Path inside the bundle directory */
  path: string;
  /** Optional workspace-relative destination for materialization */
  destination?: string;
}

/**
 * Named project profile in the next-generation manifest.
 */
export interface ProjectProfileConfig {
  /** Optional display note for the profile */
  description?: string;
  /** Baseline platform id for this profile */
  platform?: string;
  /** Bundled assets attached to this profile */
  bundledAssets?: Record<string, BundledAssetReference>;
}

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
  /** Enable verbose diagnostics in the Debug Console */
  diagnostics?: boolean;
}

/**
 * Configuration file structure for debug80.json.
 */
export interface ProjectConfig {
  /** Schema version for the Debug80 project manifest/config model */
  projectVersion?: 1 | 2;
  /** Project-level platform identity chosen at project creation time */
  projectPlatform?: string;
  /** Named reusable profiles for the next-generation manifest */
  profiles?: Record<string, ProjectProfileConfig>;
  /** Shared bundled asset references, keyed by logical name */
  bundledAssets?: Record<string, BundledAssetReference>;
  /** Default profile name when the manifest uses profiles */
  defaultProfile?: string;
  /** Default target to use when none specified */
  defaultTarget?: string;
  /** Alternative name for defaultTarget */
  target?: string;
  /** Named target configurations */
  targets?: Record<
    string,
    Partial<LaunchRequestArguments> & { source?: string; profile?: string }
  >;
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
