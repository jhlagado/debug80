export const VALID_PLATFORMS = ['simple', 'tec1', 'tec1g'] as const;
export type ValidPlatform = (typeof VALID_PLATFORMS)[number];

const PORT_MIN = 0;
const PORT_MAX = 255;
export const ADDRESS_MIN = 0;
export const ADDRESS_MAX = 0xffff;
const INSTRUCTION_LIMIT_MIN = 0;
const INSTRUCTION_LIMIT_MAX = 1_000_000_000;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type OptionalObjectValidation<T extends object> =
  { value: T; result?: undefined } | { value?: undefined; result: ValidationResult };

export function validResult(warnings: string[] = []): ValidationResult {
  return { valid: true, errors: [], warnings };
}

export function invalidResult(message: string): ValidationResult {
  return { valid: false, errors: [message], warnings: [] };
}

export function validateOptionalInteger(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null) {return validResult();}
  if (typeof value !== 'number') {
    return invalidResult(`${fieldName} must be a number, got ${typeof value}`);
  }
  return Number.isInteger(value)
    ? validResult()
    : invalidResult(`${fieldName} must be an integer, got ${value}`);
}

export function validateRequiredString(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return invalidResult(`${fieldName} is required`);
  }
  return typeof value === 'string'
    ? validResult()
    : invalidResult(`${fieldName} must be a string, got ${typeof value}`);
}

export function validateOptionalObject<T extends object>(
  value: unknown,
  fieldName: string
): OptionalObjectValidation<T> {
  if (value === undefined || value === null) {return { result: validResult() };}
  if (typeof value !== 'object' || Array.isArray(value)) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    return { result: invalidResult(`${fieldName} must be an object, got ${actualType}`) };
  }
  return { value: value as T };
}

export function validatePlatform(platform: unknown): ValidationResult {
  if (platform === undefined || platform === null || platform === '') {return validResult();}
  if (typeof platform !== 'string') {
    return invalidResult(`platform must be a string, got ${typeof platform}`);
  }
  const normalized = platform.trim().toLowerCase();
  if (!VALID_PLATFORMS.includes(normalized as ValidPlatform)) {
    return invalidResult(
      `Unsupported platform "${platform}". Valid platforms: ${VALID_PLATFORMS.join(', ')}`
    );
  }
  return validResult();
}

export function validatePort(value: unknown, fieldName: string): ValidationResult {
  const integerResult = validateOptionalInteger(value, fieldName);
  if (!integerResult.valid || value === undefined || value === null) {return integerResult;}
  const numberValue = value as number;
  return numberValue < PORT_MIN || numberValue > PORT_MAX
    ? invalidResult(`${fieldName} must be between ${PORT_MIN} and ${PORT_MAX}, got ${numberValue}`)
    : validResult();
}

export function validateAddress(value: unknown, fieldName: string): ValidationResult {
  const integerResult = validateOptionalInteger(value, fieldName);
  if (!integerResult.valid || value === undefined || value === null) {return integerResult;}
  const numberValue = value as number;
  return numberValue < ADDRESS_MIN || numberValue > ADDRESS_MAX
    ? invalidResult(
        `${fieldName} must be between ${ADDRESS_MIN} and 0x${ADDRESS_MAX.toString(16)}, got ${numberValue} (0x${numberValue.toString(16)})`
      )
    : validResult();
}

export function validateInstructionLimit(value: unknown, fieldName: string): ValidationResult {
  const integerResult = validateOptionalInteger(value, fieldName);
  if (!integerResult.valid || value === undefined || value === null) {return integerResult;}
  const numberValue = value as number;
  if (numberValue < INSTRUCTION_LIMIT_MIN) {
    return invalidResult(`${fieldName} must be non-negative, got ${numberValue}`);
  }
  return numberValue > INSTRUCTION_LIMIT_MAX
    ? validResult([
        `${fieldName} is very large (${numberValue}). This may cause performance issues.`,
      ])
    : validResult();
}

export function validatePath(
  value: unknown,
  fieldName: string,
  required = false
): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return required ? invalidResult(`${fieldName} is required`) : validResult();
  }
  if (typeof value !== 'string') {
    return invalidResult(`${fieldName} must be a string, got ${typeof value}`);
  }
  return value.includes('\0')
    ? invalidResult(`${fieldName} contains invalid null character`)
    : validResult();
}

export function validateStringArray(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null) {return validResult();}
  if (!Array.isArray(value)) {
    return invalidResult(`${fieldName} must be an array, got ${typeof value}`);
  }
  const errors = value.flatMap((item, index) =>
    typeof item === 'string' ? [] : [`${fieldName}[${index}] must be a string, got ${typeof item}`]
  );
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateBoolean(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null) {return validResult();}
  return typeof value === 'boolean'
    ? validResult()
    : invalidResult(`${fieldName} must be a boolean, got ${typeof value}`);
}

export function mergeResults(results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((result) => result.errors);
  const warnings = results.flatMap((result) => result.warnings);
  return { valid: errors.length === 0, errors, warnings };
}
