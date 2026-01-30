"use strict";
/**
 * @file Debug80 Error Types Tests
 * @description Tests for custom error classes
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const errors_1 = require("../src/debug/errors");
(0, vitest_1.describe)('Debug80Error', () => {
    (0, vitest_1.it)('should create error with message and code', () => {
        const error = new errors_1.Debug80Error('Test error', 'TEST_CODE');
        (0, vitest_1.expect)(error.message).toBe('Test error');
        (0, vitest_1.expect)(error.code).toBe('TEST_CODE');
        (0, vitest_1.expect)(error.name).toBe('Debug80Error');
        (0, vitest_1.expect)(error.context).toBeUndefined();
    });
    (0, vitest_1.it)('should create error with context', () => {
        const error = new errors_1.Debug80Error('Test error', 'TEST_CODE', { key: 'value' });
        (0, vitest_1.expect)(error.context).toEqual({ key: 'value' });
    });
    (0, vitest_1.it)('should be instanceof Error', () => {
        const error = new errors_1.Debug80Error('Test', 'TEST');
        (0, vitest_1.expect)(error instanceof Error).toBe(true);
        (0, vitest_1.expect)(error instanceof errors_1.Debug80Error).toBe(true);
    });
});
(0, vitest_1.describe)('ConfigurationError', () => {
    (0, vitest_1.it)('should create configuration error', () => {
        const error = new errors_1.ConfigurationError('Invalid config');
        (0, vitest_1.expect)(error.name).toBe('ConfigurationError');
        (0, vitest_1.expect)(error.code).toBe('CONFIG_ERROR');
    });
});
(0, vitest_1.describe)('UnsupportedPlatformError', () => {
    (0, vitest_1.it)('should create error with platform and supported list', () => {
        const error = new errors_1.UnsupportedPlatformError('invalid');
        (0, vitest_1.expect)(error.name).toBe('UnsupportedPlatformError');
        (0, vitest_1.expect)(error.platform).toBe('invalid');
        (0, vitest_1.expect)(error.supported).toEqual(['simple', 'tec1', 'tec1g']);
        (0, vitest_1.expect)(error.message).toContain('invalid');
        (0, vitest_1.expect)(error.message).toContain('simple, tec1, tec1g');
    });
    (0, vitest_1.it)('should accept custom supported list', () => {
        const error = new errors_1.UnsupportedPlatformError('bad', ['a', 'b']);
        (0, vitest_1.expect)(error.supported).toEqual(['a', 'b']);
    });
});
(0, vitest_1.describe)('MissingConfigError', () => {
    (0, vitest_1.it)('should create error with missing keys', () => {
        const error = new errors_1.MissingConfigError('Missing required fields', ['hex', 'listing']);
        (0, vitest_1.expect)(error.name).toBe('MissingConfigError');
        (0, vitest_1.expect)(error.missingKeys).toEqual(['hex', 'listing']);
    });
});
(0, vitest_1.describe)('FileResolutionError', () => {
    (0, vitest_1.it)('should create error with file path and type', () => {
        const error = new errors_1.FileResolutionError('File not found', '/path/to/file', 'hex');
        (0, vitest_1.expect)(error.name).toBe('FileResolutionError');
        (0, vitest_1.expect)(error.code).toBe('FILE_RESOLUTION_ERROR');
        (0, vitest_1.expect)(error.filePath).toBe('/path/to/file');
        (0, vitest_1.expect)(error.fileType).toBe('hex');
    });
    (0, vitest_1.it)('should create missingArtifacts error', () => {
        const error = errors_1.FileResolutionError.missingArtifacts();
        (0, vitest_1.expect)(error.message).toContain('HEX and LST');
        (0, vitest_1.expect)(error.fileType).toBe('artifacts');
    });
    (0, vitest_1.it)('should create missingSource error', () => {
        const error = errors_1.FileResolutionError.missingSource();
        (0, vitest_1.expect)(error.message).toContain('asm');
        (0, vitest_1.expect)(error.fileType).toBe('asm');
    });
});
(0, vitest_1.describe)('AssemblyError', () => {
    (0, vitest_1.it)('should create error with exit code and output', () => {
        const error = new errors_1.AssemblyError('Assembly failed', 1, 'stderr output', 'stdout output');
        (0, vitest_1.expect)(error.name).toBe('AssemblyError');
        (0, vitest_1.expect)(error.code).toBe('ASSEMBLY_ERROR');
        (0, vitest_1.expect)(error.exitCode).toBe(1);
        (0, vitest_1.expect)(error.stderr).toBe('stderr output');
        (0, vitest_1.expect)(error.stdout).toBe('stdout output');
    });
    (0, vitest_1.it)('should create error from exit code', () => {
        const error = errors_1.AssemblyError.fromExitCode(2, 'error msg');
        (0, vitest_1.expect)(error.exitCode).toBe(2);
        (0, vitest_1.expect)(error.message).toContain('asm80 exited with code 2');
        (0, vitest_1.expect)(error.message).toContain('error msg');
    });
    (0, vitest_1.it)('should create error from exit code with custom command', () => {
        const error = errors_1.AssemblyError.fromExitCode(1, undefined, undefined, 'z80asm');
        (0, vitest_1.expect)(error.message).toContain('z80asm exited with code 1');
    });
});
(0, vitest_1.describe)('AssemblerNotFoundError', () => {
    (0, vitest_1.it)('should create error with searched paths', () => {
        const error = new errors_1.AssemblerNotFoundError('Assembler not found', ['/usr/bin', '/usr/local/bin']);
        (0, vitest_1.expect)(error.name).toBe('AssemblerNotFoundError');
        (0, vitest_1.expect)(error.code).toBe('ASSEMBLER_NOT_FOUND');
        (0, vitest_1.expect)(error.searchedPaths).toEqual(['/usr/bin', '/usr/local/bin']);
    });
});
(0, vitest_1.describe)('ParseError', () => {
    (0, vitest_1.it)('should create error with line and content', () => {
        const error = new errors_1.ParseError('Parse failed', 10, 'bad content');
        (0, vitest_1.expect)(error.name).toBe('ParseError');
        (0, vitest_1.expect)(error.code).toBe('PARSE_ERROR');
        (0, vitest_1.expect)(error.line).toBe(10);
        (0, vitest_1.expect)(error.content).toBe('bad content');
    });
});
(0, vitest_1.describe)('HexParseError', () => {
    (0, vitest_1.it)('should create error for invalid HEX line', () => {
        const error = new errors_1.HexParseError(':INVALID', 5);
        (0, vitest_1.expect)(error.name).toBe('HexParseError');
        (0, vitest_1.expect)(error.message).toContain(':INVALID');
        (0, vitest_1.expect)(error.line).toBe(5);
        (0, vitest_1.expect)(error.content).toBe(':INVALID');
    });
});
(0, vitest_1.describe)('RuntimeError', () => {
    (0, vitest_1.it)('should create error with PC', () => {
        const error = new errors_1.RuntimeError('Runtime error', 0x1234);
        (0, vitest_1.expect)(error.name).toBe('RuntimeError');
        (0, vitest_1.expect)(error.code).toBe('RUNTIME_ERROR');
        (0, vitest_1.expect)(error.pc).toBe(0x1234);
    });
});
(0, vitest_1.describe)('Type Guards', () => {
    (0, vitest_1.it)('isDebug80Error should identify Debug80Error', () => {
        (0, vitest_1.expect)((0, errors_1.isDebug80Error)(new errors_1.Debug80Error('test', 'TEST'))).toBe(true);
        (0, vitest_1.expect)((0, errors_1.isDebug80Error)(new errors_1.ConfigurationError('test'))).toBe(true);
        (0, vitest_1.expect)((0, errors_1.isDebug80Error)(new Error('test'))).toBe(false);
        (0, vitest_1.expect)((0, errors_1.isDebug80Error)('string')).toBe(false);
    });
    (0, vitest_1.it)('isConfigurationError should identify ConfigurationError', () => {
        (0, vitest_1.expect)((0, errors_1.isConfigurationError)(new errors_1.ConfigurationError('test'))).toBe(true);
        (0, vitest_1.expect)((0, errors_1.isConfigurationError)(new errors_1.UnsupportedPlatformError('x'))).toBe(true);
        (0, vitest_1.expect)((0, errors_1.isConfigurationError)(new errors_1.Debug80Error('test', 'TEST'))).toBe(false);
    });
    (0, vitest_1.it)('isFileResolutionError should identify FileResolutionError', () => {
        (0, vitest_1.expect)((0, errors_1.isFileResolutionError)(new errors_1.FileResolutionError('test'))).toBe(true);
        (0, vitest_1.expect)((0, errors_1.isFileResolutionError)(new errors_1.Debug80Error('test', 'TEST'))).toBe(false);
    });
    (0, vitest_1.it)('isAssemblyError should identify AssemblyError', () => {
        (0, vitest_1.expect)((0, errors_1.isAssemblyError)(new errors_1.AssemblyError('test'))).toBe(true);
        (0, vitest_1.expect)((0, errors_1.isAssemblyError)(new errors_1.Debug80Error('test', 'TEST'))).toBe(false);
    });
    (0, vitest_1.it)('isParseError should identify ParseError', () => {
        (0, vitest_1.expect)((0, errors_1.isParseError)(new errors_1.ParseError('test'))).toBe(true);
        (0, vitest_1.expect)((0, errors_1.isParseError)(new errors_1.HexParseError(':BAD'))).toBe(true);
        (0, vitest_1.expect)((0, errors_1.isParseError)(new errors_1.Debug80Error('test', 'TEST'))).toBe(false);
    });
});
(0, vitest_1.describe)('Error Utilities', () => {
    (0, vitest_1.describe)('wrapError', () => {
        (0, vitest_1.it)('should return Debug80Error unchanged', () => {
            const original = new errors_1.Debug80Error('test', 'TEST');
            (0, vitest_1.expect)((0, errors_1.wrapError)(original)).toBe(original);
        });
        (0, vitest_1.it)('should wrap regular Error', () => {
            const original = new Error('regular error');
            const wrapped = (0, errors_1.wrapError)(original);
            (0, vitest_1.expect)(wrapped.message).toBe('regular error');
            (0, vitest_1.expect)(wrapped.code).toBe('UNKNOWN_ERROR');
        });
        (0, vitest_1.it)('should wrap non-Error values', () => {
            const wrapped = (0, errors_1.wrapError)('string error');
            (0, vitest_1.expect)(wrapped.code).toBe('UNKNOWN_ERROR');
        });
        (0, vitest_1.it)('should use default message for non-Error values', () => {
            const wrapped = (0, errors_1.wrapError)(null, 'Custom default');
            (0, vitest_1.expect)(wrapped.message).toBe('Custom default');
        });
    });
    (0, vitest_1.describe)('getErrorMessage', () => {
        (0, vitest_1.it)('should get message from Error', () => {
            (0, vitest_1.expect)((0, errors_1.getErrorMessage)(new Error('test message'))).toBe('test message');
        });
        (0, vitest_1.it)('should convert non-Error to string', () => {
            (0, vitest_1.expect)((0, errors_1.getErrorMessage)('string value')).toBe('string value');
            (0, vitest_1.expect)((0, errors_1.getErrorMessage)(42)).toBe('42');
        });
    });
});
//# sourceMappingURL=errors.test.js.map