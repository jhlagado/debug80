/**
 * @file Configuration validation for debug80 launch configurations.
 * @description Provides runtime validation of launch request arguments with
 * detailed error messages for invalid configurations.
 * @module debug/config-validation
 */

import { ConfigurationError, MissingConfigError, UnsupportedPlatformError } from './errors';
import { LaunchRequestArguments, TerminalConfig } from './types';
import { Tec1PlatformConfig, Tec1gPlatformConfig, SimplePlatformConfig } from '../platforms/types';

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
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof value !== 'number') {
    errors.push(`${fieldName} must be a number, got ${typeof value}`);
    return { valid: false, errors, warnings };
  }

  if (!Number.isInteger(value)) {
    errors.push(`${fieldName} must be an integer, got ${value}`);
    return { valid: false, errors, warnings };
  }

  if (value < PORT_MIN || value > PORT_MAX) {
    errors.push(`${fieldName} must be between ${PORT_MIN} and ${PORT_MAX}, got ${value}`);
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings };
}

/**
 * Validates a memory address is within the valid Z80 range (0-65535).
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result
 */
export function validateAddress(value: unknown, fieldName: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof value !== 'number') {
    errors.push(`${fieldName} must be a number, got ${typeof value}`);
    return { valid: false, errors, warnings };
  }

  if (!Number.isInteger(value)) {
    errors.push(`${fieldName} must be an integer, got ${value}`);
    return { valid: false, errors, warnings };
  }

  if (value < ADDRESS_MIN || value > ADDRESS_MAX) {
    errors.push(
      `${fieldName} must be between ${ADDRESS_MIN} and 0x${ADDRESS_MAX.toString(16)}, got ${value} (0x${value.toString(16)})`
    );
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings };
}

/**
 * Validates an instruction limit value.
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result
 */
export function validateInstructionLimit(value: unknown, fieldName: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (value === undefined || value === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof value !== 'number') {
    errors.push(`${fieldName} must be a number, got ${typeof value}`);
    return { valid: false, errors, warnings };
  }

  if (!Number.isInteger(value)) {
    errors.push(`${fieldName} must be an integer, got ${value}`);
    return { valid: false, errors, warnings };
  }

  if (value < INSTRUCTION_LIMIT_MIN) {
    errors.push(`${fieldName} must be non-negative, got ${value}`);
    return { valid: false, errors, warnings };
  }

  if (value > INSTRUCTION_LIMIT_MAX) {
    warnings.push(`${fieldName} is very large (${value}). This may cause performance issues.`);
  }

  return { valid: true, errors, warnings };
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
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config === undefined || config === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof config !== 'object') {
    errors.push(`terminal must be an object, got ${typeof config}`);
    return { valid: false, errors, warnings };
  }

  const tc = config as TerminalConfig;

  const txResult = validatePort(tc.txPort, 'terminal.txPort');
  const rxResult = validatePort(tc.rxPort, 'terminal.rxPort');
  const statusResult = validatePort(tc.statusPort, 'terminal.statusPort');
  const interruptResult = validateBoolean(tc.interrupt, 'terminal.interrupt');

  return mergeResults([txResult, rxResult, statusResult, interruptResult]);
}

/**
 * Validates simple platform configuration.
 * @param config - Simple config to validate
 * @returns Validation result
 */
export function validateSimpleConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config === undefined || config === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof config !== 'object') {
    errors.push(`simple must be an object, got ${typeof config}`);
    return { valid: false, errors, warnings };
  }

  const sc = config as SimplePlatformConfig;

  const appStartResult = validateAddress(sc.appStart, 'simple.appStart');
  const entryResult = validateAddress(sc.entry, 'simple.entry');
  const binFromResult = validateAddress(sc.binFrom, 'simple.binFrom');
  const binToResult = validateAddress(sc.binTo, 'simple.binTo');

  return mergeResults([appStartResult, entryResult, binFromResult, binToResult]);
}

/**
 * Validates TEC-1 platform configuration.
 * @param config - TEC-1 config to validate
 * @returns Validation result
 */
export function validateTec1Config(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config === undefined || config === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof config !== 'object') {
    errors.push(`tec1 must be an object, got ${typeof config}`);
    return { valid: false, errors, warnings };
  }

  const tc = config as Tec1PlatformConfig;

  const romHexResult = validatePath(tc.romHex, 'tec1.romHex');
  const appStartResult = validateAddress(tc.appStart, 'tec1.appStart');
  const entryResult = validateAddress(tc.entry, 'tec1.entry');

  return mergeResults([romHexResult, appStartResult, entryResult]);
}

/**
 * Validates TEC-1G platform configuration.
 * @param config - TEC-1G config to validate
 * @returns Validation result
 */
export function validateTec1gConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config === undefined || config === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof config !== 'object') {
    errors.push(`tec1g must be an object, got ${typeof config}`);
    return { valid: false, errors, warnings };
  }

  const tc = config as Tec1gPlatformConfig;

  const romHexResult = validatePath(tc.romHex, 'tec1g.romHex');
  const appStartResult = validateAddress(tc.appStart, 'tec1g.appStart');
  const entryResult = validateAddress(tc.entry, 'tec1g.entry');

  return mergeResults([romHexResult, appStartResult, entryResult]);
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
  const results: ValidationResult[] = [];

  // Validate paths
  results.push(validatePath(la.asm, 'asm'));
  results.push(validatePath(la.sourceFile, 'sourceFile'));
  results.push(validatePath(la.hex, 'hex'));
  results.push(validatePath(la.listing, 'listing'));
  results.push(validatePath(la.outputDir, 'outputDir'));
  results.push(validatePath(la.artifactBase, 'artifactBase'));
  results.push(validatePath(la.projectConfig, 'projectConfig'));
  results.push(validatePath(la.target, 'target'));

  // Validate address
  results.push(validateAddress(la.entry, 'entry'));

  // Validate booleans
  results.push(validateBoolean(la.stopOnEntry, 'stopOnEntry'));
  results.push(validateBoolean(la.assemble, 'assemble'));

  // Validate platform
  results.push(validatePlatform(la.platform));

  // Validate arrays
  results.push(validateStringArray(la.sourceRoots, 'sourceRoots'));

  // Validate instruction limits
  results.push(validateInstructionLimit(la.stepOverMaxInstructions, 'stepOverMaxInstructions'));
  results.push(validateInstructionLimit(la.stepOutMaxInstructions, 'stepOutMaxInstructions'));

  // Validate nested configs
  results.push(validateTerminalConfig(la.terminal));
  results.push(validateSimpleConfig(la.simple));
  results.push(validateTec1Config(la.tec1));
  results.push(validateTec1gConfig(la.tec1g));

  return mergeResults(results);
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
  const hasListing = args.listing !== undefined && args.listing !== '';

  if (!hasAsm && !hasHex && !hasListing) {
    throw new MissingConfigError(
      'No source files specified. Provide "asm" (assembly source) or "hex" and "listing" paths.',
      ['asm', 'hex', 'listing']
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
