/**
 * @file Debug80 Error Types Tests
 * @description Tests for custom error classes
 */

import { describe, it, expect } from 'vitest';
import {
  Debug80Error,
  ConfigurationError,
  UnsupportedPlatformError,
  MissingConfigError,
  FileResolutionError,
  AssemblyError,
  AssemblerNotFoundError,
  ParseError,
  HexParseError,
  RuntimeError,
  isDebug80Error,
  isConfigurationError,
  isFileResolutionError,
  isAssemblyError,
  isParseError,
  wrapError,
  getErrorMessage,
} from '../src/debug/errors';

describe('Debug80Error', () => {
  it('should create error with message and code', () => {
    const error = new Debug80Error('Test error', 'TEST_CODE');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('Debug80Error');
    expect(error.context).toBeUndefined();
  });

  it('should create error with context', () => {
    const error = new Debug80Error('Test error', 'TEST_CODE', { key: 'value' });
    expect(error.context).toEqual({ key: 'value' });
  });

  it('should be instanceof Error', () => {
    const error = new Debug80Error('Test', 'TEST');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof Debug80Error).toBe(true);
  });
});

describe('ConfigurationError', () => {
  it('should create configuration error', () => {
    const error = new ConfigurationError('Invalid config');
    expect(error.name).toBe('ConfigurationError');
    expect(error.code).toBe('CONFIG_ERROR');
  });
});

describe('UnsupportedPlatformError', () => {
  it('should create error with platform and supported list', () => {
    const error = new UnsupportedPlatformError('invalid');
    expect(error.name).toBe('UnsupportedPlatformError');
    expect(error.platform).toBe('invalid');
    expect(error.supported).toEqual(['simple', 'tec1', 'tec1g']);
    expect(error.message).toContain('invalid');
    expect(error.message).toContain('simple, tec1, tec1g');
  });

  it('should accept custom supported list', () => {
    const error = new UnsupportedPlatformError('bad', ['a', 'b']);
    expect(error.supported).toEqual(['a', 'b']);
  });
});

describe('MissingConfigError', () => {
  it('should create error with missing keys', () => {
    const error = new MissingConfigError('Missing required fields', ['hex', 'listing']);
    expect(error.name).toBe('MissingConfigError');
    expect(error.missingKeys).toEqual(['hex', 'listing']);
  });
});

describe('FileResolutionError', () => {
  it('should create error with file path and type', () => {
    const error = new FileResolutionError('File not found', '/path/to/file', 'hex');
    expect(error.name).toBe('FileResolutionError');
    expect(error.code).toBe('FILE_RESOLUTION_ERROR');
    expect(error.filePath).toBe('/path/to/file');
    expect(error.fileType).toBe('hex');
  });

  it('should create missingArtifacts error', () => {
    const error = FileResolutionError.missingArtifacts();
    expect(error.message).toContain('HEX and LST');
    expect(error.fileType).toBe('artifacts');
  });

  it('should create missingSource error', () => {
    const error = FileResolutionError.missingSource();
    expect(error.message).toContain('asm');
    expect(error.fileType).toBe('asm');
  });
});

describe('AssemblyError', () => {
  it('should create error with exit code and output', () => {
    const error = new AssemblyError('Assembly failed', 1, 'stderr output', 'stdout output');
    expect(error.name).toBe('AssemblyError');
    expect(error.code).toBe('ASSEMBLY_ERROR');
    expect(error.exitCode).toBe(1);
    expect(error.stderr).toBe('stderr output');
    expect(error.stdout).toBe('stdout output');
  });

  it('should create error from exit code', () => {
    const error = AssemblyError.fromExitCode(2, 'error msg');
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain('asm80 exited with code 2');
    expect(error.message).toContain('error msg');
  });

  it('should create error from exit code with custom command', () => {
    const error = AssemblyError.fromExitCode(1, undefined, undefined, 'z80asm');
    expect(error.message).toContain('z80asm exited with code 1');
  });
});

describe('AssemblerNotFoundError', () => {
  it('should create error with searched paths', () => {
    const error = new AssemblerNotFoundError('Assembler not found', ['/usr/bin', '/usr/local/bin']);
    expect(error.name).toBe('AssemblerNotFoundError');
    expect(error.code).toBe('ASSEMBLER_NOT_FOUND');
    expect(error.searchedPaths).toEqual(['/usr/bin', '/usr/local/bin']);
  });
});

describe('ParseError', () => {
  it('should create error with line and content', () => {
    const error = new ParseError('Parse failed', 10, 'bad content');
    expect(error.name).toBe('ParseError');
    expect(error.code).toBe('PARSE_ERROR');
    expect(error.line).toBe(10);
    expect(error.content).toBe('bad content');
  });
});

describe('HexParseError', () => {
  it('should create error for invalid HEX line', () => {
    const error = new HexParseError(':INVALID', 5);
    expect(error.name).toBe('HexParseError');
    expect(error.message).toContain(':INVALID');
    expect(error.line).toBe(5);
    expect(error.content).toBe(':INVALID');
  });
});

describe('RuntimeError', () => {
  it('should create error with PC', () => {
    const error = new RuntimeError('Runtime error', 0x1234);
    expect(error.name).toBe('RuntimeError');
    expect(error.code).toBe('RUNTIME_ERROR');
    expect(error.pc).toBe(0x1234);
  });
});

describe('Type Guards', () => {
  it('isDebug80Error should identify Debug80Error', () => {
    expect(isDebug80Error(new Debug80Error('test', 'TEST'))).toBe(true);
    expect(isDebug80Error(new ConfigurationError('test'))).toBe(true);
    expect(isDebug80Error(new Error('test'))).toBe(false);
    expect(isDebug80Error('string')).toBe(false);
  });

  it('isConfigurationError should identify ConfigurationError', () => {
    expect(isConfigurationError(new ConfigurationError('test'))).toBe(true);
    expect(isConfigurationError(new UnsupportedPlatformError('x'))).toBe(true);
    expect(isConfigurationError(new Debug80Error('test', 'TEST'))).toBe(false);
  });

  it('isFileResolutionError should identify FileResolutionError', () => {
    expect(isFileResolutionError(new FileResolutionError('test'))).toBe(true);
    expect(isFileResolutionError(new Debug80Error('test', 'TEST'))).toBe(false);
  });

  it('isAssemblyError should identify AssemblyError', () => {
    expect(isAssemblyError(new AssemblyError('test'))).toBe(true);
    expect(isAssemblyError(new Debug80Error('test', 'TEST'))).toBe(false);
  });

  it('isParseError should identify ParseError', () => {
    expect(isParseError(new ParseError('test'))).toBe(true);
    expect(isParseError(new HexParseError(':BAD'))).toBe(true);
    expect(isParseError(new Debug80Error('test', 'TEST'))).toBe(false);
  });
});

describe('Error Utilities', () => {
  describe('wrapError', () => {
    it('should return Debug80Error unchanged', () => {
      const original = new Debug80Error('test', 'TEST');
      expect(wrapError(original)).toBe(original);
    });

    it('should wrap regular Error', () => {
      const original = new Error('regular error');
      const wrapped = wrapError(original);
      expect(wrapped.message).toBe('regular error');
      expect(wrapped.code).toBe('UNKNOWN_ERROR');
    });

    it('should wrap non-Error values', () => {
      const wrapped = wrapError('string error');
      expect(wrapped.code).toBe('UNKNOWN_ERROR');
    });

    it('should use default message for non-Error values', () => {
      const wrapped = wrapError(null, 'Custom default');
      expect(wrapped.message).toBe('Custom default');
    });
  });

  describe('getErrorMessage', () => {
    it('should get message from Error', () => {
      expect(getErrorMessage(new Error('test message'))).toBe('test message');
    });

    it('should convert non-Error to string', () => {
      expect(getErrorMessage('string value')).toBe('string value');
      expect(getErrorMessage(42)).toBe('42');
    });
  });
});
