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
} from '../../platforms/types';

// ============================================================================
// Constants
// ============================================================================

/** Valid platform names */
export const VALID_PLATFORMS = ['simple', 'tec1', 'tec1g'] as const;
export type ValidPlatform = (typeof VALID_PLATFORMS)[number];

/** Valid port range for I/O configuration */
const PORT_MIN = 0;
const PORT_MAX = 255;

/** Valid address range for Z80 */
const ADDRESS_MIN = 0;
const ADDRESS_MAX = 0xffff;

/** Valid instruction limit range */
const INSTRUCTION_LIMIT_MIN = 0;
const INSTRUCTION_LIMIT_MAX = 1_000_000_000;

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
// Validation Result Types
// ============================================================================

/**
 * Validation result containing all issues found.
 */
export interface ValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** List of error messages */
  errors: string[];
  /** List of warning messages */
  warnings: string[];
}

type OptionalObjectValidation<T extends object> =
  | { value: T; result?: undefined }
  | { value?: undefined; result: ValidationResult };

function validResult(warnings: string[] = []): ValidationResult {
  return { valid: true, errors: [], warnings };
}

function invalidResult(message: string): ValidationResult {
  return { valid: false, errors: [message], warnings: [] };
}

function validateOptionalInteger(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null) {
    return validResult();
  }

  if (typeof value !== 'number') {
    return invalidResult(`${fieldName} must be a number, got ${typeof value}`);
  }

  if (!Number.isInteger(value)) {
    return invalidResult(`${fieldName} must be an integer, got ${value}`);
  }

  return validResult();
}

function validateOptionalObject<T extends object>(
  value: unknown,
  fieldName: string
): OptionalObjectValidation<T> {
  if (value === undefined || value === null) {
    return { result: validResult() };
  }

  if (typeof value !== 'object') {
    return { result: invalidResult(`${fieldName} must be an object, got ${typeof value}`) };
  }

  return { value: value as T };
}

// ============================================================================
// Individual Validators
// ============================================================================

/**
 * Validates platform name.
 * @param platform - Platform name to validate
 * @returns Validation result
 */
export function validatePlatform(platform: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (platform === undefined || platform === null || platform === '') {
    // Platform is optional, defaults to 'simple'
    return { valid: true, errors, warnings };
  }

  if (typeof platform !== 'string') {
    errors.push(`platform must be a string, got ${typeof platform}`);
    return { valid: false, errors, warnings };
  }

  const normalized = platform.trim().toLowerCase();
  if (!VALID_PLATFORMS.includes(normalized as ValidPlatform)) {
    errors.push(
      `Unsupported platform "${platform}". Valid platforms: ${VALID_PLATFORMS.join(', ')}`
    );
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings };
}

/**
 * Validates a port number is within the valid range (0-255).
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result
 */
export function validatePort(value: unknown, fieldName: string): ValidationResult {
  const integerResult = validateOptionalInteger(value, fieldName);
  if (!integerResult.valid || value === undefined || value === null) {
    return integerResult;
  }
  const numberValue = value as number;

  if (numberValue < PORT_MIN || numberValue > PORT_MAX) {
    return invalidResult(
      `${fieldName} must be between ${PORT_MIN} and ${PORT_MAX}, got ${numberValue}`
    );
  }

  return validResult();
}

/**
 * Validates a memory address is within the valid Z80 range (0-65535).
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result
 */
export function validateAddress(value: unknown, fieldName: string): ValidationResult {
  const integerResult = validateOptionalInteger(value, fieldName);
  if (!integerResult.valid || value === undefined || value === null) {
    return integerResult;
  }
  const numberValue = value as number;

  if (numberValue < ADDRESS_MIN || numberValue > ADDRESS_MAX) {
    return invalidResult(
      `${fieldName} must be between ${ADDRESS_MIN} and 0x${ADDRESS_MAX.toString(16)}, got ${numberValue} (0x${numberValue.toString(16)})`
    );
  }

  return validResult();
}

/**
 * Validates an instruction limit value.
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result
 */
export function validateInstructionLimit(value: unknown, fieldName: string): ValidationResult {
  const integerResult = validateOptionalInteger(value, fieldName);
  if (!integerResult.valid || value === undefined || value === null) {
    return integerResult;
  }
  const numberValue = value as number;

  if (numberValue < INSTRUCTION_LIMIT_MIN) {
    return invalidResult(`${fieldName} must be non-negative, got ${numberValue}`);
  }

  if (numberValue > INSTRUCTION_LIMIT_MAX) {
    return validResult([
      `${fieldName} is very large (${numberValue}). This may cause performance issues.`,
    ]);
  }

  return validResult();
}

/**
 * Validates a file path string.
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @param required - Whether the field is required
 * @returns Validation result
 */
export function validatePath(
  value: unknown,
  fieldName: string,
  required = false
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null || value === '') {
    if (required) {
      errors.push(`${fieldName} is required`);
      return { valid: false, errors, warnings };
    }
    return { valid: true, errors, warnings };
  }

  if (typeof value !== 'string') {
    errors.push(`${fieldName} must be a string, got ${typeof value}`);
    return { valid: false, errors, warnings };
  }

  // Basic path validation - check for suspicious characters
  if (value.includes('\0')) {
    errors.push(`${fieldName} contains invalid null character`);
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings };
}

/**
 * Validates a string array.
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result
 */
export function validateStringArray(value: unknown, fieldName: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null) {
    return { valid: true, errors, warnings };
  }

  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array, got ${typeof value}`);
    return { valid: false, errors, warnings };
  }

  for (let i = 0; i < value.length; i++) {
    const item: unknown = value[i];
    if (typeof item !== 'string') {
      errors.push(`${fieldName}[${i}] must be a string, got ${typeof item}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates a boolean value.
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result
 */
export function validateBoolean(value: unknown, fieldName: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof value !== 'boolean') {
    errors.push(`${fieldName} must be a boolean, got ${typeof value}`);
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings };
}

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

/**
 * Validates simple platform configuration.
 * @param config - Simple config to validate
 * @returns Validation result
 */
export function validateSimpleConfig(config: unknown): ValidationResult {
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
  ]);
}

/**
 * Validates TEC-1 platform configuration.
 * @param config - TEC-1 config to validate
 * @returns Validation result
 */
export function validateTec1Config(config: unknown): ValidationResult {
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
  const objectResult = validateOptionalObject<Tec1gPlatformConfig>(config, 'tec1g');
  if (objectResult.result !== undefined) {
    return objectResult.result;
  }

  const tc = objectResult.value;

  return mergeResults([
    validatePath(tc.romHex, 'tec1g.romHex'),
    validatePath(tc.cartridgeHex, 'tec1g.cartridgeHex'),
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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Merges multiple validation results into one.
 * @param results - Array of validation results
 * @returns Combined validation result
 */
function mergeResults(results: ValidationResult[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let valid = true;

  for (const result of results) {
    if (!result.valid) {
      valid = false;
    }
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { valid, errors, warnings };
}

function collectLaunchValidationResults(args: LaunchRequestArguments): ValidationResult[] {
  return [
    ...LAUNCH_PATH_FIELDS.map((field) => validatePath(args[field], field)),
    validateAddress(args.entry, 'entry'),
    ...LAUNCH_BOOLEAN_FIELDS.map((field) => validateBoolean(args[field], field)),
    validatePlatform(args.platform),
    validateStringArray(args.sourceRoots, 'sourceRoots'),
    ...LAUNCH_INSTRUCTION_LIMIT_FIELDS.map((field) =>
      validateInstructionLimit(args[field], field)
    ),
    validateTerminalConfig(args.terminal),
    validateSimpleConfig(args.simple),
    validateTec1Config(args.tec1),
    validateTec1gConfig(args.tec1g),
  ];
}
