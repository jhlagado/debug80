/**
 * @file Configuration validation for debug80 launch configurations.
 * @description Provides runtime validation of launch request arguments with
 * detailed error messages for invalid configurations.
 * @module debug/config-validation
 */

import {
  ConfigurationError,
  MissingConfigError,
  UnsupportedPlatformError,
} from '../session/errors';
import { LaunchRequestArguments } from '../session/types';
import type { TerminalConfig } from '../session/terminal-types';
import {
  Tec1PlatformConfig,
  Tec1gPlatformConfig,
  SimplePlatformConfig,
} from '@jhlagado/debug80-runtime/platforms/types';
import { validateTec1gRomArtifacts } from './tec1g-rom-artifact-validation';
import {
  ADDRESS_MAX,
  ADDRESS_MIN,
  VALID_PLATFORMS,
  invalidResult,
  mergeResults,
  validResult,
  validateAddress,
  validateBoolean,
  validateInstructionLimit,
  validateOptionalObject,
  validatePath,
  validatePlatform,
  validatePort,
  validateStringArray,
  type ValidPlatform,
  type ValidationResult,
} from './config-value-validation';

export {
  VALID_PLATFORMS,
  validateAddress,
  validateBoolean,
  validateInstructionLimit,
  validatePath,
  validatePlatform,
  validatePort,
  validateStringArray,
} from './config-value-validation';
export type { ValidPlatform, ValidationResult } from './config-value-validation';

// ============================================================================
// Constants
// ============================================================================

const LAUNCH_PATH_FIELDS = [
  'asm',
  'sourceFile',
  'hex',
  'outputDir',
  'artifactBase',
  'projectConfig',
  'target',
] as const;

const LAUNCH_BOOLEAN_FIELDS = ['stopOnEntry', 'assemble'] as const;

const LAUNCH_INSTRUCTION_LIMIT_FIELDS = [
  'stepOverMaxInstructions',
  'stepOutMaxInstructions',
] as const;

// ============================================================================
// Compound Validators
// ============================================================================

/**
 * Validates terminal configuration.
 * @param config - Terminal config to validate
 * @returns Validation result
 */
export function validateTerminalConfig(config: unknown): ValidationResult {
  const objectResult = validateOptionalObject<TerminalConfig>(config, 'terminal');
  if (objectResult.result !== undefined) {
    return objectResult.result;
  }

  const tc = objectResult.value;

  return mergeResults([
    validatePort(tc.txPort, 'terminal.txPort'),
    validatePort(tc.rxPort, 'terminal.rxPort'),
    validatePort(tc.statusPort, 'terminal.statusPort'),
    validateBoolean(tc.interrupt, 'terminal.interrupt'),
  ]);
}

function validateSimpleBinaryRange(binFrom: unknown, binTo: unknown): ValidationResult {
  const hasFrom = binFrom !== undefined && binFrom !== null;
  const hasTo = binTo !== undefined && binTo !== null;
  if (hasFrom !== hasTo) {
    return invalidResult('simple.binFrom and simple.binTo must be specified together');
  }
  if (
    typeof binFrom === 'number' &&
    Number.isInteger(binFrom) &&
    binFrom >= ADDRESS_MIN &&
    binFrom <= ADDRESS_MAX &&
    typeof binTo === 'number' &&
    Number.isInteger(binTo) &&
    binTo >= ADDRESS_MIN &&
    binTo <= ADDRESS_MAX &&
    binFrom > binTo
  ) {
    return invalidResult(
      `simple.binFrom must be less than or equal to simple.binTo, got ${binFrom} > ${binTo}`
    );
  }
  return validResult();
}

/**
 * Validates simple platform configuration.
 * @param config - Simple config to validate
 * @returns Validation result
 */
export function validateSimpleConfig(config: unknown): ValidationResult {
  if (config === null) {
    return invalidResult('simple must be an object, got null');
  }
  const objectResult = validateOptionalObject<SimplePlatformConfig>(config, 'simple');
  if (objectResult.result !== undefined) {
    return objectResult.result;
  }

  const sc = objectResult.value;

  return mergeResults([
    validateAddress(sc.appStart, 'simple.appStart'),
    validateAddress(sc.entry, 'simple.entry'),
    validateAddress(sc.binFrom, 'simple.binFrom'),
    validateAddress(sc.binTo, 'simple.binTo'),
    validateSimpleBinaryRange(sc.binFrom, sc.binTo),
  ]);
}

/**
 * Validates TEC-1 platform configuration.
 * @param config - TEC-1 config to validate
 * @returns Validation result
 */
export function validateTec1Config(config: unknown): ValidationResult {
  if (config === null) {
    return invalidResult('tec1 must be an object, got null');
  }
  const objectResult = validateOptionalObject<Tec1PlatformConfig>(config, 'tec1');
  if (objectResult.result !== undefined) {
    return objectResult.result;
  }

  const tc = objectResult.value;

  return mergeResults([
    validatePath(tc.romHex, 'tec1.romHex'),
    validateAddress(tc.appStart, 'tec1.appStart'),
    validateAddress(tc.entry, 'tec1.entry'),
  ]);
}

/**
 * Validates TEC-1G platform configuration.
 * @param config - TEC-1G config to validate
 * @returns Validation result
 */
export function validateTec1gConfig(config: unknown): ValidationResult {
  if (config === null) {
    return invalidResult('tec1g must be an object, got null');
  }
  const objectResult = validateOptionalObject<Tec1gPlatformConfig>(config, 'tec1g');
  if (objectResult.result !== undefined) {
    return objectResult.result;
  }

  const tc = objectResult.value;

  return mergeResults([
    Object.prototype.hasOwnProperty.call(tc, 'cartridgeHex')
      ? invalidResult('tec1g.cartridgeHex is no longer supported; use tec1g.expansionRomHex')
      : validResult(),
    validatePath(tc.romHex, 'tec1g.romHex'),
    validatePath(tc.expansionRomHex, 'tec1g.expansionRomHex'),
    validateTec1gRomArtifacts(tc.romArtifacts),
    validateAddress(tc.appStart, 'tec1g.appStart'),
    validateAddress(tc.entry, 'tec1g.entry'),
  ]);
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validates complete launch request arguments.
 * @param args - Launch arguments to validate
 * @returns Validation result with all errors and warnings
 */
export function validateLaunchArgs(args: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (args === undefined || args === null) {
    errors.push('Launch arguments are required');
    return { valid: false, errors, warnings };
  }

  if (typeof args !== 'object') {
    errors.push(`Launch arguments must be an object, got ${typeof args}`);
    return { valid: false, errors, warnings };
  }

  const la = args as LaunchRequestArguments;
  return mergeResults(collectLaunchValidationResults(la));
}

/**
 * Validates launch arguments and throws on error.
 * @param args - Launch arguments to validate
 * @throws {ConfigurationError} If validation fails
 */
export function assertValidLaunchArgs(args: unknown): asserts args is LaunchRequestArguments {
  const result = validateLaunchArgs(args);
  if (!result.valid) {
    throw new ConfigurationError(`Invalid launch configuration:\n- ${result.errors.join('\n- ')}`);
  }
}

/**
 * Checks if platform is valid and throws a specific error if not.
 * @param platform - Platform name to validate
 * @throws {UnsupportedPlatformError} If platform is invalid
 */
export function assertValidPlatform(platform: string): asserts platform is ValidPlatform {
  const normalized = platform.trim().toLowerCase();
  if (!VALID_PLATFORMS.includes(normalized as ValidPlatform)) {
    throw new UnsupportedPlatformError(platform, [...VALID_PLATFORMS]);
  }
}

/**
 * Checks if required source paths are provided.
 * @param args - Launch arguments to check
 * @throws {MissingConfigError} If no source paths are provided
 */
export function assertHasSourcePaths(args: LaunchRequestArguments): void {
  const hasAsm = args.asm !== undefined && args.asm !== '';
  const hasHex = args.hex !== undefined && args.hex !== '';

  if (!hasAsm && !hasHex) {
    throw new MissingConfigError(
      'No source files specified. Provide "asm" (assembly source) or "hex" paths.',
      ['asm', 'hex']
    );
  }
}

function collectLaunchValidationResults(args: LaunchRequestArguments): ValidationResult[] {
  return [
    ...LAUNCH_PATH_FIELDS.map((field) => validatePath(args[field], field)),
    validateAddress(args.entry, 'entry'),
    ...LAUNCH_BOOLEAN_FIELDS.map((field) => validateBoolean(args[field], field)),
    validatePlatform(args.platform),
    validateStringArray(args.sourceRoots, 'sourceRoots'),
    validateStringArray(args.debugMaps, 'debugMaps'),
    ...LAUNCH_INSTRUCTION_LIMIT_FIELDS.map((field) => validateInstructionLimit(args[field], field)),
    validateTerminalConfig(args.terminal),
    validateSimpleConfig(args.simple),
    validateTec1Config(args.tec1),
    validateTec1gConfig(args.tec1g),
  ];
}
