"use strict";
/**
 * @file Tests for config validation module
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const config_validation_1 = require("../src/debug/config-validation");
const errors_1 = require("../src/debug/errors");
(0, vitest_1.describe)('config-validation', () => {
    // ==========================================================================
    // Platform Validation
    // ==========================================================================
    (0, vitest_1.describe)('validatePlatform', () => {
        (0, vitest_1.it)('should accept valid platforms', () => {
            for (const platform of config_validation_1.VALID_PLATFORMS) {
                const result = (0, config_validation_1.validatePlatform)(platform);
                (0, vitest_1.expect)(result.valid).toBe(true);
                (0, vitest_1.expect)(result.errors).toHaveLength(0);
            }
        });
        (0, vitest_1.it)('should accept undefined/null/empty as valid (defaults to simple)', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePlatform)(undefined).valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePlatform)(null).valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePlatform)('').valid).toBe(true);
        });
        (0, vitest_1.it)('should normalize case and whitespace', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePlatform)('SIMPLE').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePlatform)('  Tec1  ').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePlatform)('TEC1G').valid).toBe(true);
        });
        (0, vitest_1.it)('should reject invalid platforms', () => {
            const result = (0, config_validation_1.validatePlatform)('invalid');
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.errors[0]).toContain('Unsupported platform');
            (0, vitest_1.expect)(result.errors[0]).toContain('simple');
        });
        (0, vitest_1.it)('should reject non-string values', () => {
            const result = (0, config_validation_1.validatePlatform)(123);
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.errors[0]).toContain('must be a string');
        });
    });
    // ==========================================================================
    // Port Validation
    // ==========================================================================
    (0, vitest_1.describe)('validatePort', () => {
        (0, vitest_1.it)('should accept valid ports (0-255)', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePort)(0, 'port').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePort)(128, 'port').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePort)(255, 'port').valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePort)(undefined, 'port').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePort)(null, 'port').valid).toBe(true);
        });
        (0, vitest_1.it)('should reject out of range ports', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePort)(-1, 'port').valid).toBe(false);
            (0, vitest_1.expect)((0, config_validation_1.validatePort)(256, 'port').valid).toBe(false);
        });
        (0, vitest_1.it)('should reject non-integer ports', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePort)(1.5, 'port').valid).toBe(false);
            (0, vitest_1.expect)((0, config_validation_1.validatePort)('0', 'port').valid).toBe(false);
        });
    });
    // ==========================================================================
    // Address Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateAddress', () => {
        (0, vitest_1.it)('should accept valid addresses (0-65535)', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateAddress)(0, 'addr').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateAddress)(0x8000, 'addr').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateAddress)(0xffff, 'addr').valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateAddress)(undefined, 'addr').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateAddress)(null, 'addr').valid).toBe(true);
        });
        (0, vitest_1.it)('should reject out of range addresses', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateAddress)(-1, 'addr').valid).toBe(false);
            (0, vitest_1.expect)((0, config_validation_1.validateAddress)(0x10000, 'addr').valid).toBe(false);
        });
        (0, vitest_1.it)('should include hex representation in error', () => {
            const result = (0, config_validation_1.validateAddress)(0x10000, 'addr');
            (0, vitest_1.expect)(result.errors[0]).toContain('0x10000');
        });
    });
    // ==========================================================================
    // Instruction Limit Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateInstructionLimit', () => {
        (0, vitest_1.it)('should accept valid limits', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateInstructionLimit)(0, 'limit').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateInstructionLimit)(1000, 'limit').valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateInstructionLimit)(undefined, 'limit').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateInstructionLimit)(null, 'limit').valid).toBe(true);
        });
        (0, vitest_1.it)('should reject negative values', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateInstructionLimit)(-1, 'limit').valid).toBe(false);
        });
        (0, vitest_1.it)('should warn on very large values', () => {
            const result = (0, config_validation_1.validateInstructionLimit)(2000000000, 'limit');
            (0, vitest_1.expect)(result.valid).toBe(true);
            (0, vitest_1.expect)(result.warnings.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(result.warnings[0]).toContain('performance');
        });
    });
    // ==========================================================================
    // Path Validation
    // ==========================================================================
    (0, vitest_1.describe)('validatePath', () => {
        (0, vitest_1.it)('should accept valid paths', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePath)('/path/to/file.asm', 'path').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePath)('relative/path.hex', 'path').valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null/empty for optional', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePath)(undefined, 'path').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePath)(null, 'path').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validatePath)('', 'path').valid).toBe(true);
        });
        (0, vitest_1.it)('should reject empty for required paths', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePath)('', 'path', true).valid).toBe(false);
            (0, vitest_1.expect)((0, config_validation_1.validatePath)(undefined, 'path', true).valid).toBe(false);
        });
        (0, vitest_1.it)('should reject non-string paths', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePath)(123, 'path').valid).toBe(false);
        });
        (0, vitest_1.it)('should reject paths with null characters', () => {
            (0, vitest_1.expect)((0, config_validation_1.validatePath)('/path/\0/file', 'path').valid).toBe(false);
        });
    });
    // ==========================================================================
    // String Array Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateStringArray', () => {
        (0, vitest_1.it)('should accept valid string arrays', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateStringArray)(['a', 'b', 'c'], 'arr').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateStringArray)([], 'arr').valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateStringArray)(undefined, 'arr').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateStringArray)(null, 'arr').valid).toBe(true);
        });
        (0, vitest_1.it)('should reject non-arrays', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateStringArray)('string', 'arr').valid).toBe(false);
        });
        (0, vitest_1.it)('should reject arrays with non-string elements', () => {
            const result = (0, config_validation_1.validateStringArray)(['a', 123, 'b'], 'arr');
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.errors[0]).toContain('[1]');
        });
    });
    // ==========================================================================
    // Boolean Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateBoolean', () => {
        (0, vitest_1.it)('should accept true and false', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateBoolean)(true, 'flag').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateBoolean)(false, 'flag').valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateBoolean)(undefined, 'flag').valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateBoolean)(null, 'flag').valid).toBe(true);
        });
        (0, vitest_1.it)('should reject non-boolean values', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateBoolean)('true', 'flag').valid).toBe(false);
            (0, vitest_1.expect)((0, config_validation_1.validateBoolean)(1, 'flag').valid).toBe(false);
        });
    });
    // ==========================================================================
    // Terminal Config Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateTerminalConfig', () => {
        (0, vitest_1.it)('should accept valid terminal config', () => {
            const result = (0, config_validation_1.validateTerminalConfig)({
                txPort: 0,
                rxPort: 1,
                statusPort: 2,
                interrupt: false,
            });
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateTerminalConfig)(undefined).valid).toBe(true);
            (0, vitest_1.expect)((0, config_validation_1.validateTerminalConfig)(null).valid).toBe(true);
        });
        (0, vitest_1.it)('should reject invalid port values', () => {
            const result = (0, config_validation_1.validateTerminalConfig)({ txPort: 300 });
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.errors[0]).toContain('txPort');
        });
        (0, vitest_1.it)('should reject non-object values', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateTerminalConfig)('string').valid).toBe(false);
        });
    });
    // ==========================================================================
    // Simple Config Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateSimpleConfig', () => {
        (0, vitest_1.it)('should accept valid simple config', () => {
            const result = (0, config_validation_1.validateSimpleConfig)({
                appStart: 0x8000,
                entry: 0x8000,
                binFrom: 0x8000,
                binTo: 0xffff,
            });
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateSimpleConfig)(undefined).valid).toBe(true);
        });
        (0, vitest_1.it)('should reject invalid address values', () => {
            const result = (0, config_validation_1.validateSimpleConfig)({ appStart: -1 });
            (0, vitest_1.expect)(result.valid).toBe(false);
        });
    });
    // ==========================================================================
    // TEC-1 Config Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateTec1Config', () => {
        (0, vitest_1.it)('should accept valid tec1 config', () => {
            const result = (0, config_validation_1.validateTec1Config)({
                romHex: 'path/to/rom.hex',
                appStart: 0x0900,
                entry: 0x0900,
            });
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateTec1Config)(undefined).valid).toBe(true);
        });
        (0, vitest_1.it)('should reject non-object values', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateTec1Config)('string').valid).toBe(false);
        });
    });
    // ==========================================================================
    // TEC-1G Config Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateTec1gConfig', () => {
        (0, vitest_1.it)('should accept valid tec1g config', () => {
            const result = (0, config_validation_1.validateTec1gConfig)({
                romHex: 'path/to/rom.hex',
                appStart: 0x4000,
                entry: 0x4000,
            });
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('should accept undefined/null', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateTec1gConfig)(undefined).valid).toBe(true);
        });
        (0, vitest_1.it)('should reject invalid appStart', () => {
            const result = (0, config_validation_1.validateTec1gConfig)({ appStart: -1 });
            (0, vitest_1.expect)(result.valid).toBe(false);
        });
    });
    // ==========================================================================
    // Full Launch Args Validation
    // ==========================================================================
    (0, vitest_1.describe)('validateLaunchArgs', () => {
        (0, vitest_1.it)('should accept valid launch args', () => {
            const result = (0, config_validation_1.validateLaunchArgs)({
                asm: 'src/main.asm',
                platform: 'simple',
                stopOnEntry: true,
            });
            (0, vitest_1.expect)(result.valid).toBe(true);
            (0, vitest_1.expect)(result.errors).toHaveLength(0);
        });
        (0, vitest_1.it)('should accept minimal args', () => {
            const result = (0, config_validation_1.validateLaunchArgs)({});
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('should reject null/undefined', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateLaunchArgs)(null).valid).toBe(false);
            (0, vitest_1.expect)((0, config_validation_1.validateLaunchArgs)(undefined).valid).toBe(false);
        });
        (0, vitest_1.it)('should reject non-object', () => {
            (0, vitest_1.expect)((0, config_validation_1.validateLaunchArgs)('string').valid).toBe(false);
        });
        (0, vitest_1.it)('should collect multiple errors', () => {
            const result = (0, config_validation_1.validateLaunchArgs)({
                platform: 'invalid',
                entry: -1,
                stepOverMaxInstructions: -10,
            });
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.errors.length).toBeGreaterThan(1);
        });
    });
    // ==========================================================================
    // Assertion Functions
    // ==========================================================================
    (0, vitest_1.describe)('assertValidLaunchArgs', () => {
        (0, vitest_1.it)('should not throw for valid args', () => {
            (0, vitest_1.expect)(() => (0, config_validation_1.assertValidLaunchArgs)({ asm: 'main.asm' })).not.toThrow();
        });
        (0, vitest_1.it)('should throw ConfigurationError for invalid args', () => {
            (0, vitest_1.expect)(() => (0, config_validation_1.assertValidLaunchArgs)({ platform: 'invalid' })).toThrow(errors_1.ConfigurationError);
        });
    });
    (0, vitest_1.describe)('assertValidPlatform', () => {
        (0, vitest_1.it)('should not throw for valid platforms', () => {
            (0, vitest_1.expect)(() => (0, config_validation_1.assertValidPlatform)('simple')).not.toThrow();
            (0, vitest_1.expect)(() => (0, config_validation_1.assertValidPlatform)('tec1')).not.toThrow();
            (0, vitest_1.expect)(() => (0, config_validation_1.assertValidPlatform)('tec1g')).not.toThrow();
        });
        (0, vitest_1.it)('should throw UnsupportedPlatformError for invalid platform', () => {
            (0, vitest_1.expect)(() => (0, config_validation_1.assertValidPlatform)('invalid')).toThrow(errors_1.UnsupportedPlatformError);
        });
    });
    (0, vitest_1.describe)('assertHasSourcePaths', () => {
        (0, vitest_1.it)('should not throw when asm is provided', () => {
            (0, vitest_1.expect)(() => (0, config_validation_1.assertHasSourcePaths)({ asm: 'main.asm' })).not.toThrow();
        });
        (0, vitest_1.it)('should not throw when hex and listing are provided', () => {
            (0, vitest_1.expect)(() => (0, config_validation_1.assertHasSourcePaths)({ hex: 'main.hex', listing: 'main.lst' })).not.toThrow();
        });
        (0, vitest_1.it)('should throw MissingConfigError when no source paths', () => {
            (0, vitest_1.expect)(() => (0, config_validation_1.assertHasSourcePaths)({})).toThrow(errors_1.MissingConfigError);
        });
        (0, vitest_1.it)('should throw for empty string paths', () => {
            (0, vitest_1.expect)(() => (0, config_validation_1.assertHasSourcePaths)({ asm: '', hex: '', listing: '' })).toThrow(errors_1.MissingConfigError);
        });
    });
});
//# sourceMappingURL=config-validation.test.js.map