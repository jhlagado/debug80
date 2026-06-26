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
  Tec1gRomArtifactRole,
  SimplePlatformConfig,
} from '../../platforms/types';
import { TEC1G_EXPAND_BANK_COUNT } from '../../platforms/tec-common';

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
const TEC1G_MONITOR_ADDRESS = 0xc000;
const TEC1G_MONITOR_SIZE = 0x4000;
const TEC1G_EXPANSION_WINDOW_ADDRESS = 0x8000;
const TEC1G_EXPANSION_WINDOW_SIZE = 0x4000;

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

function validateRequiredString(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return invalidResult(`${fieldName} is required`);
  }

  if (typeof value !== 'string') {
    return invalidResult(`${fieldName} must be a string, got ${typeof value}`);
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

function validateTec1gRomArtifacts(value: unknown): ValidationResult {
  if (value === undefined || value === null) {
    return validResult();
  }

  if (!Array.isArray(value)) {
    return invalidResult(`tec1g.romArtifacts must be an array, got ${typeof value}`);
  }

  const activeRoles = new Map<Tec1gRomArtifactRole, string>();
  const results: ValidationResult[] = [];

  value.forEach((artifact, index) => {
    const fieldName = `tec1g.romArtifacts[${index}]`;
    const objectResult = validateOptionalObject<Record<string, unknown>>(artifact, fieldName);
    if (objectResult.result !== undefined) {
      results.push(objectResult.result);
      return;
    }

    const artifactConfig = objectResult.value;
    const role = artifactConfig.role;
    const active = artifactConfig.active !== false;
    results.push(...validateTec1gRomArtifactShape(artifactConfig, fieldName));

    if (role === 'monitor') {
      results.push(...validateTec1gMonitorArtifactGeometry(artifactConfig, fieldName));
    } else if (role === 'expansion') {
      results.push(...validateTec1gExpansionArtifactGeometry(artifactConfig, fieldName));
    }

    if (active && (role === 'monitor' || role === 'expansion')) {
      const previousId = activeRoles.get(role);
      if (previousId !== undefined) {
        results.push(invalidResult(`${fieldName}.role duplicates active ${role} artifact ${previousId}`));
      } else {
        activeRoles.set(role, getArtifactDiagnosticId(artifactConfig, index));
      }
    }
  });

  return mergeResults(results);
}

function validateTec1gRomArtifactShape(
  artifact: Record<string, unknown>,
  fieldName: string
): ValidationResult[] {
  const multibankExpansion = artifact.banks !== undefined;
  const sourceBacked =
    artifact.sourceFile !== undefined ||
    artifact.outputBin !== undefined ||
    artifact.outputDebugMap !== undefined;
  const binaryOnly = artifact.binary !== undefined || artifact.debugMap !== undefined;
  const results: ValidationResult[] = [
    validateRequiredString(artifact.id, `${fieldName}.id`),
    validateTec1gRomArtifactRole(artifact.role, `${fieldName}.role`),
    validateBoolean(artifact.active, `${fieldName}.active`),
    validateBoolean(artifact.build, `${fieldName}.build`),
  ];

  if (multibankExpansion) {
    results.push(validatePath(artifact.outputBin, `${fieldName}.outputBin`, true));
    results.push(
      ...validateTec1gExpansionArtifactBanks(artifact.banks, `${fieldName}.banks`, artifact.bankCount)
    );
    if (artifact.role !== 'expansion') {
      results.push(invalidResult(`${fieldName}.banks is only supported for expansion artifacts`));
    }
    if (artifact.sourceFile !== undefined || artifact.outputDebugMap !== undefined) {
      results.push(
        invalidResult(`${fieldName} multibank artifacts must not specify sourceFile or outputDebugMap`)
      );
    }
    if (artifact.binary !== undefined || artifact.debugMap !== undefined) {
      results.push(
        invalidResult(`${fieldName} multibank artifacts must not specify binary or debugMap`)
      );
    }
  } else if (sourceBacked) {
    results.push(validatePath(artifact.sourceFile, `${fieldName}.sourceFile`, true));
    results.push(validatePath(artifact.outputBin, `${fieldName}.outputBin`, true));
    results.push(validatePath(artifact.outputDebugMap, `${fieldName}.outputDebugMap`));
    if (artifact.binary !== undefined) {
      results.push(invalidResult(`${fieldName} source-backed artifacts must not specify binary`));
    }
    if (artifact.debugMap !== undefined) {
      results.push(invalidResult(`${fieldName} source-backed artifacts must not specify debugMap`));
    }
  } else if (binaryOnly) {
    results.push(validatePath(artifact.binary, `${fieldName}.binary`, true));
    results.push(validatePath(artifact.debugMap, `${fieldName}.debugMap`));
    if (artifact.active !== false) {
      results.push(invalidResult(`${fieldName} active binary-only artifacts are deferred for Phase 2`));
    }
    if (artifact.sourceFile !== undefined || artifact.outputBin !== undefined) {
      results.push(
        invalidResult(`${fieldName} binary-only artifacts must not specify sourceFile or outputBin`)
      );
    }
  } else {
    results.push(invalidResult(`${fieldName} must specify sourceFile/outputBin or binary`));
  }

  return results;
}

function validateTec1gExpansionArtifactBanks(
  value: unknown,
  fieldName: string,
  bankCount: unknown
): ValidationResult[] {
  if (!Array.isArray(value)) {
    return [invalidResult(`${fieldName} must be an array`)];
  }

  const results: ValidationResult[] = [];
  if (value.length === 0) {
    results.push(invalidResult(`${fieldName} must contain at least one bank`));
  }
  const seen = new Set<number>();
  value.forEach((bank, index) => {
    const bankField = `${fieldName}[${index}]`;
    const objectResult = validateOptionalObject<Record<string, unknown>>(bank, bankField);
    if (objectResult.result !== undefined) {
      results.push(objectResult.result);
      return;
    }

    const config = objectResult.value;
    if (config.physicalBank === undefined || config.physicalBank === null) {
      results.push(invalidResult(`${bankField}.physicalBank is required`));
    } else {
      results.push(validateOptionalInteger(config.physicalBank, `${bankField}.physicalBank`));
    }
    if (
      typeof config.physicalBank === 'number' &&
      Number.isInteger(config.physicalBank) &&
      (config.physicalBank < 0 || config.physicalBank >= TEC1G_EXPAND_BANK_COUNT)
    ) {
      results.push(
        invalidResult(`${bankField}.physicalBank must be between 0 and ${TEC1G_EXPAND_BANK_COUNT - 1}`)
      );
    }
    if (typeof config.physicalBank === 'number' && Number.isInteger(config.physicalBank)) {
      if (
        typeof bankCount === 'number' &&
        Number.isInteger(bankCount) &&
        config.physicalBank >= 0 &&
        config.physicalBank < TEC1G_EXPAND_BANK_COUNT &&
        config.physicalBank >= bankCount
      ) {
        results.push(
          invalidResult(`${bankField}.physicalBank must be less than bankCount ${bankCount}`)
        );
      }
      if (seen.has(config.physicalBank)) {
        results.push(invalidResult(`${bankField}.physicalBank duplicates bank ${config.physicalBank}`));
      }
      seen.add(config.physicalBank);
    }

    results.push(validatePath(config.sourceFile, `${bankField}.sourceFile`, true));
    results.push(validatePath(config.outputBin, `${bankField}.outputBin`, true));
    results.push(validatePath(config.outputDebugMap, `${bankField}.outputDebugMap`));
  });

  return results;
}

function validateTec1gRomArtifactRole(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return invalidResult(`${fieldName} is required`);
  }

  if (value !== 'monitor' && value !== 'expansion') {
    return invalidResult(`${fieldName} must be "monitor" or "expansion", got ${String(value)}`);
  }

  return validResult();
}

function validateTec1gMonitorArtifactGeometry(
  artifact: Record<string, unknown>,
  fieldName: string
): ValidationResult[] {
  const results: ValidationResult[] = [
    validateOptionalInteger(artifact.address, `${fieldName}.address`),
    validateOptionalInteger(artifact.size, `${fieldName}.size`),
  ];

  if (artifact.address !== TEC1G_MONITOR_ADDRESS) {
    results.push(invalidResult(`${fieldName}.address must be 0xc000 for TEC-1G monitor artifacts`));
  }

  if (artifact.size !== TEC1G_MONITOR_SIZE) {
    results.push(invalidResult(`${fieldName}.size must be 0x4000 for TEC-1G monitor artifacts`));
  }

  return results;
}

function validateTec1gExpansionArtifactGeometry(
  artifact: Record<string, unknown>,
  fieldName: string
): ValidationResult[] {
  const results: ValidationResult[] = [
    validateOptionalInteger(artifact.windowAddress, `${fieldName}.windowAddress`),
    validateOptionalInteger(artifact.windowSize, `${fieldName}.windowSize`),
    validateOptionalInteger(artifact.imageSize, `${fieldName}.imageSize`),
    validateOptionalInteger(artifact.bankSize, `${fieldName}.bankSize`),
    validateOptionalInteger(artifact.bankCount, `${fieldName}.bankCount`),
  ];

  if (artifact.windowAddress !== TEC1G_EXPANSION_WINDOW_ADDRESS) {
    results.push(
      invalidResult(`${fieldName}.windowAddress must be 0x8000 for TEC-1G expansion artifacts`)
    );
  }

  if (artifact.windowSize !== TEC1G_EXPANSION_WINDOW_SIZE) {
    results.push(
      invalidResult(`${fieldName}.windowSize must be 0x4000 for TEC-1G expansion artifacts`)
    );
  }

  if (
    typeof artifact.imageSize !== 'number' ||
    typeof artifact.bankSize !== 'number' ||
    artifact.imageSize <= 0 ||
    artifact.bankSize <= 0 ||
    artifact.imageSize % artifact.bankSize !== 0
  ) {
    results.push(invalidResult(`${fieldName}.imageSize must be a positive multiple of bankSize`));
  }

  if (
    typeof artifact.imageSize === 'number' &&
    typeof artifact.bankSize === 'number' &&
    typeof artifact.bankCount === 'number' &&
    artifact.bankCount !== artifact.imageSize / artifact.bankSize
  ) {
    results.push(invalidResult(`${fieldName}.bankCount must equal imageSize / bankSize`));
  }

  if (
    typeof artifact.bankCount === 'number' &&
    (artifact.bankCount < 1 || artifact.bankCount > TEC1G_EXPAND_BANK_COUNT)
  ) {
    results.push(
      invalidResult(`${fieldName}.bankCount must be between 1 and ${TEC1G_EXPAND_BANK_COUNT}`)
    );
  }

  if (artifact.bankSize !== artifact.windowSize) {
    results.push(
      invalidResult(
        `${fieldName}.bankSize must equal windowSize for Phase 2 TEC-1G expansion artifacts`
      )
    );
  }

  return results;
}

function getArtifactDiagnosticId(artifact: Record<string, unknown>, index: number): string {
  return typeof artifact.id === 'string' && artifact.id !== '' ? artifact.id : `#${index}`;
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
