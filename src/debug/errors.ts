/**
 * @file Debug80 Error Types
 * @description Custom error classes for different error scenarios in the debug80 extension.
 * Provides structured error handling with specific error types for configuration,
 * assembly, file resolution, and runtime errors.
 * @module debug/errors
 */

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base error class for all Debug80 errors.
 * Provides a consistent error structure with error codes and context.
 */
export class Debug80Error extends Error {
  /** Error code for programmatic handling */
  readonly code: string;
  /** Additional context about the error */
  readonly context?: Record<string, unknown>;

  /**
   * Creates a new Debug80Error.
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param context - Optional additional context
   */
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'Debug80Error';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
    // Maintains proper stack trace in V8
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

/**
 * Error thrown when configuration is invalid or missing.
 */
export class ConfigurationError extends Debug80Error {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when an unsupported platform is specified.
 */
export class UnsupportedPlatformError extends ConfigurationError {
  /** The invalid platform name that was provided */
  readonly platform: string;
  /** List of supported platform names */
  readonly supported: readonly string[];

  /**
   * Creates a new UnsupportedPlatformError.
   * @param platform - The invalid platform name
   * @param supported - List of supported platforms
   */
  constructor(platform: string, supported: readonly string[] = ['simple', 'tec1', 'tec1g']) {
    super(`Unsupported platform "${platform}". Supported: ${supported.join(', ')}`, {
      platform,
      supported,
    });
    this.name = 'UnsupportedPlatformError';
    this.platform = platform;
    this.supported = supported;
  }
}

/**
 * Error thrown when required configuration is missing.
 */
export class MissingConfigError extends ConfigurationError {
  /** The missing configuration key(s) */
  readonly missingKeys: string[];

  /**
   * Creates a new MissingConfigError.
   * @param message - Error message
   * @param missingKeys - List of missing configuration keys
   */
  constructor(message: string, missingKeys: string[]) {
    super(message, { missingKeys });
    this.name = 'MissingConfigError';
    this.missingKeys = missingKeys;
  }
}

// ============================================================================
// File Resolution Errors
// ============================================================================

/**
 * Error thrown when a required file cannot be found or resolved.
 */
export class FileResolutionError extends Debug80Error {
  /** The path that could not be resolved */
  readonly filePath?: string;
  /** The type of file (hex, listing, asm, etc.) */
  readonly fileType?: string;

  /**
   * Creates a new FileResolutionError.
   * @param message - Error message
   * @param filePath - The path that could not be resolved
   * @param fileType - The type of file
   */
  constructor(message: string, filePath?: string, fileType?: string) {
    super(message, 'FILE_RESOLUTION_ERROR', { filePath, fileType });
    this.name = 'FileResolutionError';
    if (filePath !== undefined) {
      this.filePath = filePath;
    }
    if (fileType !== undefined) {
      this.fileType = fileType;
    }
  }

  /**
   * Creates an error for missing artifact paths.
   * @returns FileResolutionError for missing HEX/LST paths
   */
  static missingArtifacts(): FileResolutionError {
    return new FileResolutionError(
      'Z80 runtime requires resolvable HEX and LST paths.',
      undefined,
      'artifacts'
    );
  }

  /**
   * Creates an error for missing source file.
   * @returns FileResolutionError for missing ASM source
   */
  static missingSource(): FileResolutionError {
    return new FileResolutionError(
      'Z80 runtime requires "asm" (root asm file) or explicit "hex" and "listing" paths.',
      undefined,
      'asm'
    );
  }
}

// ============================================================================
// Assembly Errors
// ============================================================================

/**
 * Error thrown when assembly fails.
 */
export class AssemblyError extends Debug80Error {
  /** Exit code from the assembler */
  readonly exitCode?: number;
  /** Standard error output from assembler */
  readonly stderr?: string;
  /** Standard output from assembler */
  readonly stdout?: string;

  /**
   * Creates a new AssemblyError.
   * @param message - Error message
   * @param exitCode - Exit code from assembler
   * @param stderr - Standard error output
   * @param stdout - Standard output
   */
  constructor(message: string, exitCode?: number, stderr?: string, stdout?: string) {
    super(message, 'ASSEMBLY_ERROR', { exitCode, stderr, stdout });
    this.name = 'AssemblyError';
    if (exitCode !== undefined) {
      this.exitCode = exitCode;
    }
    if (stderr !== undefined) {
      this.stderr = stderr;
    }
    if (stdout !== undefined) {
      this.stdout = stdout;
    }
  }

  /**
   * Creates an AssemblyError from assembler execution result.
   * @param exitCode - Exit code from assembler
   * @param stderr - Standard error output
   * @param stdout - Standard output
   * @param command - The assembler command name
   * @returns AssemblyError with formatted message
   */
  static fromExitCode(
    exitCode: number,
    stderr?: string,
    stdout?: string,
    command = 'asm80'
  ): AssemblyError {
    const suffix = stderr !== undefined && stderr !== '' ? `\n${stderr}` : '';
    return new AssemblyError(
      `${command} exited with code ${exitCode}${suffix}`,
      exitCode,
      stderr,
      stdout
    );
  }
}

/**
 * Error thrown when the assembler binary cannot be found.
 */
export class AssemblerNotFoundError extends Debug80Error {
  /** Paths that were searched for the assembler */
  readonly searchedPaths?: string[];

  /**
   * Creates a new AssemblerNotFoundError.
   * @param message - Error message
   * @param searchedPaths - Paths that were searched
   */
  constructor(message: string, searchedPaths?: string[]) {
    super(message, 'ASSEMBLER_NOT_FOUND', { searchedPaths });
    this.name = 'AssemblerNotFoundError';
    if (searchedPaths !== undefined) {
      this.searchedPaths = searchedPaths;
    }
  }
}

// ============================================================================
// Parse Errors
// ============================================================================

/**
 * Error thrown when parsing fails.
 */
export class ParseError extends Debug80Error {
  /** The line number where parsing failed (1-based) */
  readonly line?: number;
  /** The content that caused the parse failure */
  readonly content?: string;

  /**
   * Creates a new ParseError.
   * @param message - Error message
   * @param line - Line number where parsing failed
   * @param content - The content that caused the failure
   */
  constructor(message: string, line?: number, content?: string) {
    super(message, 'PARSE_ERROR', { line, content });
    this.name = 'ParseError';
    if (line !== undefined) {
      this.line = line;
    }
    if (content !== undefined) {
      this.content = content;
    }
  }
}

/**
 * Error thrown when Intel HEX parsing fails.
 */
export class HexParseError extends ParseError {
  /**
   * Creates a new HexParseError.
   * @param line - The invalid HEX line content
   * @param lineNumber - Line number in the file
   */
  constructor(line: string, lineNumber?: number) {
    super(`Invalid HEX line: ${line}`, lineNumber, line);
    this.name = 'HexParseError';
  }
}

// ============================================================================
// Runtime Errors
// ============================================================================

/**
 * Error thrown during Z80 runtime execution.
 */
export class RuntimeError extends Debug80Error {
  /** Program counter at time of error */
  readonly pc?: number;

  /**
   * Creates a new RuntimeError.
   * @param message - Error message
   * @param pc - Program counter at time of error
   */
  constructor(message: string, pc?: number) {
    super(message, 'RUNTIME_ERROR', { pc });
    this.name = 'RuntimeError';
    if (pc !== undefined) {
      this.pc = pc;
    }
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an error is a Debug80Error.
 * @param error - The error to check
 * @returns True if the error is a Debug80Error
 */
export function isDebug80Error(error: unknown): error is Debug80Error {
  return error instanceof Debug80Error;
}

/**
 * Type guard to check if an error is a ConfigurationError.
 * @param error - The error to check
 * @returns True if the error is a ConfigurationError
 */
export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}

/**
 * Type guard to check if an error is a FileResolutionError.
 * @param error - The error to check
 * @returns True if the error is a FileResolutionError
 */
export function isFileResolutionError(error: unknown): error is FileResolutionError {
  return error instanceof FileResolutionError;
}

/**
 * Type guard to check if an error is an AssemblyError.
 * @param error - The error to check
 * @returns True if the error is an AssemblyError
 */
export function isAssemblyError(error: unknown): error is AssemblyError {
  return error instanceof AssemblyError;
}

/**
 * Type guard to check if an error is a ParseError.
 * @param error - The error to check
 * @returns True if the error is a ParseError
 */
export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError;
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Wraps an unknown error in a Debug80Error if it isn't already one.
 * @param error - The error to wrap
 * @param defaultMessage - Default message if error is not an Error
 * @returns A Debug80Error
 */
export function wrapError(
  error: unknown,
  defaultMessage = 'An unknown error occurred'
): Debug80Error {
  if (isDebug80Error(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new Debug80Error(error.message, 'UNKNOWN_ERROR', { originalError: error.name });
  }
  return new Debug80Error(defaultMessage, 'UNKNOWN_ERROR', { originalValue: String(error) });
}

/**
 * Gets a user-friendly error message from any error.
 * @param error - The error to get a message from
 * @returns Human-readable error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
