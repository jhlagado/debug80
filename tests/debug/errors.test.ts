/**
 * @file Debug80 error helpers tests.
 */

import { describe, it, expect } from 'vitest';
import {
  AssemblyError,
  AssemblerNotFoundError,
  ConfigurationError,
  Debug80Error,
  FileResolutionError,
  HexParseError,
  MissingConfigError,
  RuntimeError,
  UnsupportedPlatformError,
  getErrorMessage,
  isAssemblyError,
  isConfigurationError,
  isDebug80Error,
  isFileResolutionError,
  isParseError,
  wrapError,
} from '../../src/debug/errors';

describe('errors', () => {
  it('preserves code and context for Debug80Error', () => {
    const err = new Debug80Error('oops', 'E1', { detail: 123 });
    expect(err.code).toBe('E1');
    expect(err.context).toEqual({ detail: 123 });
    expect(err.name).toBe('Debug80Error');
  });

  it('builds configuration errors with context', () => {
    const err = new ConfigurationError('bad config', { field: 'asm' });
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.context).toEqual({ field: 'asm' });
    expect(isConfigurationError(err)).toBe(true);
  });

  it('builds unsupported platform errors with defaults', () => {
    const err = new UnsupportedPlatformError('weird');
    expect(err.platform).toBe('weird');
    expect(err.supported.length).toBeGreaterThan(0);
    expect(err.message).toContain('Unsupported platform');
  });

  it('builds missing config error', () => {
    const err = new MissingConfigError('missing', ['asm', 'listing']);
    expect(err.missingKeys).toEqual(['asm', 'listing']);
  });

  it('builds file resolution errors and helpers', () => {
    const err = new FileResolutionError('no file', 'a.hex', 'hex');
    expect(err.filePath).toBe('a.hex');
    expect(err.fileType).toBe('hex');
    expect(isFileResolutionError(err)).toBe(true);
    expect(FileResolutionError.missingArtifacts().fileType).toBe('artifacts');
    expect(FileResolutionError.missingSource().fileType).toBe('asm');
  });

  it('builds assembly errors and helper messages', () => {
    const err = new AssemblyError('fail', 1, 'stderr', 'stdout');
    expect(err.exitCode).toBe(1);
    expect(err.stderr).toBe('stderr');
    expect(err.stdout).toBe('stdout');
    expect(isAssemblyError(err)).toBe(true);

    const fromExit = AssemblyError.fromExitCode(2, 'bad', 'ok', 'asm80');
    expect(fromExit.message).toContain('asm80 exited with code 2');
    expect(fromExit.message).toContain('bad');
  });

  it('builds assembler not found error', () => {
    const err = new AssemblerNotFoundError('missing', ['path1', 'path2']);
    expect(err.code).toBe('ASSEMBLER_NOT_FOUND');
    expect(err.searchedPaths).toEqual(['path1', 'path2']);
  });

  it('builds parse errors and hex parse errors', () => {
    const err = new HexParseError(':00BAD', 3);
    expect(err.message).toContain('Invalid HEX line');
    expect(err.line).toBe(3);
    expect(err.content).toBe(':00BAD');
    expect(isParseError(err)).toBe(true);
  });

  it('builds runtime errors', () => {
    const err = new RuntimeError('boom', 0x1234);
    expect(err.code).toBe('RUNTIME_ERROR');
    expect(err.pc).toBe(0x1234);
  });

  it('wraps unknown errors into Debug80Error', () => {
    const wrapped = wrapError('nope');
    expect(isDebug80Error(wrapped)).toBe(true);
    expect(wrapped.code).toBe('UNKNOWN_ERROR');
  });

  it('returns error messages for non-errors', () => {
    expect(getErrorMessage('x')).toBe('x');
  });
});
