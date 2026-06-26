/**
 * @file Tests for config validation module
 */

import { describe, it, expect } from 'vitest';
import {
  validatePlatform,
  validatePort,
  validateAddress,
  validateInstructionLimit,
  validatePath,
  validateStringArray,
  validateBoolean,
  validateTerminalConfig,
  validateSimpleConfig,
  validateTec1Config,
  validateTec1gConfig,
  validateLaunchArgs,
  assertValidLaunchArgs,
  assertValidPlatform,
  assertHasSourcePaths,
  VALID_PLATFORMS,
} from '../../src/debug/launch/config-validation';
import {
  ConfigurationError,
  MissingConfigError,
  UnsupportedPlatformError,
} from '../../src/debug/session/errors';

describe('config-validation', () => {
  // ==========================================================================
  // Platform Validation
  // ==========================================================================
  describe('validatePlatform', () => {
    it('should accept valid platforms', () => {
      for (const platform of VALID_PLATFORMS) {
        const result = validatePlatform(platform);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it('should accept undefined/null/empty as valid (defaults to simple)', () => {
      expect(validatePlatform(undefined).valid).toBe(true);
      expect(validatePlatform(null).valid).toBe(true);
      expect(validatePlatform('').valid).toBe(true);
    });

    it('should normalize case and whitespace', () => {
      expect(validatePlatform('SIMPLE').valid).toBe(true);
      expect(validatePlatform('  Tec1  ').valid).toBe(true);
      expect(validatePlatform('TEC1G').valid).toBe(true);
    });

    it('should reject invalid platforms', () => {
      const result = validatePlatform('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unsupported platform');
      expect(result.errors[0]).toContain('simple');
    });

    it('should reject non-string values', () => {
      const result = validatePlatform(123);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be a string');
    });
  });

  // ==========================================================================
  // Port Validation
  // ==========================================================================
  describe('validatePort', () => {
    it('should accept valid ports (0-255)', () => {
      expect(validatePort(0, 'port').valid).toBe(true);
      expect(validatePort(128, 'port').valid).toBe(true);
      expect(validatePort(255, 'port').valid).toBe(true);
    });

    it('should accept undefined/null', () => {
      expect(validatePort(undefined, 'port').valid).toBe(true);
      expect(validatePort(null, 'port').valid).toBe(true);
    });

    it('should reject out of range ports', () => {
      expect(validatePort(-1, 'port').valid).toBe(false);
      expect(validatePort(256, 'port').valid).toBe(false);
    });

    it('should reject non-integer ports', () => {
      expect(validatePort(1.5, 'port').valid).toBe(false);
      expect(validatePort('0', 'port').valid).toBe(false);
    });
  });

  // ==========================================================================
  // Address Validation
  // ==========================================================================
  describe('validateAddress', () => {
    it('should accept valid addresses (0-65535)', () => {
      expect(validateAddress(0, 'addr').valid).toBe(true);
      expect(validateAddress(0x8000, 'addr').valid).toBe(true);
      expect(validateAddress(0xffff, 'addr').valid).toBe(true);
    });

    it('should accept undefined/null', () => {
      expect(validateAddress(undefined, 'addr').valid).toBe(true);
      expect(validateAddress(null, 'addr').valid).toBe(true);
    });

    it('should reject out of range addresses', () => {
      expect(validateAddress(-1, 'addr').valid).toBe(false);
      expect(validateAddress(0x10000, 'addr').valid).toBe(false);
    });

    it('should include hex representation in error', () => {
      const result = validateAddress(0x10000, 'addr');
      expect(result.errors[0]).toContain('0x10000');
    });
  });

  // ==========================================================================
  // Instruction Limit Validation
  // ==========================================================================
  describe('validateInstructionLimit', () => {
    it('should accept valid limits', () => {
      expect(validateInstructionLimit(0, 'limit').valid).toBe(true);
      expect(validateInstructionLimit(1000, 'limit').valid).toBe(true);
    });

    it('should accept undefined/null', () => {
      expect(validateInstructionLimit(undefined, 'limit').valid).toBe(true);
      expect(validateInstructionLimit(null, 'limit').valid).toBe(true);
    });

    it('should reject negative values', () => {
      expect(validateInstructionLimit(-1, 'limit').valid).toBe(false);
    });

    it('should warn on very large values', () => {
      const result = validateInstructionLimit(2_000_000_000, 'limit');
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('performance');
    });
  });

  // ==========================================================================
  // Path Validation
  // ==========================================================================
  describe('validatePath', () => {
    it('should accept valid paths', () => {
      expect(validatePath('/path/to/file.asm', 'path').valid).toBe(true);
      expect(validatePath('relative/path.hex', 'path').valid).toBe(true);
    });

    it('should accept undefined/null/empty for optional', () => {
      expect(validatePath(undefined, 'path').valid).toBe(true);
      expect(validatePath(null, 'path').valid).toBe(true);
      expect(validatePath('', 'path').valid).toBe(true);
    });

    it('should reject empty for required paths', () => {
      expect(validatePath('', 'path', true).valid).toBe(false);
      expect(validatePath(undefined, 'path', true).valid).toBe(false);
    });

    it('should reject non-string paths', () => {
      expect(validatePath(123, 'path').valid).toBe(false);
    });

    it('should reject paths with null characters', () => {
      expect(validatePath('/path/\0/file', 'path').valid).toBe(false);
    });
  });

  // ==========================================================================
  // String Array Validation
  // ==========================================================================
  describe('validateStringArray', () => {
    it('should accept valid string arrays', () => {
      expect(validateStringArray(['a', 'b', 'c'], 'arr').valid).toBe(true);
      expect(validateStringArray([], 'arr').valid).toBe(true);
    });

    it('should accept undefined/null', () => {
      expect(validateStringArray(undefined, 'arr').valid).toBe(true);
      expect(validateStringArray(null, 'arr').valid).toBe(true);
    });

    it('should reject non-arrays', () => {
      expect(validateStringArray('string', 'arr').valid).toBe(false);
    });

    it('should reject arrays with non-string elements', () => {
      const result = validateStringArray(['a', 123, 'b'], 'arr');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('[1]');
    });
  });

  // ==========================================================================
  // Boolean Validation
  // ==========================================================================
  describe('validateBoolean', () => {
    it('should accept true and false', () => {
      expect(validateBoolean(true, 'flag').valid).toBe(true);
      expect(validateBoolean(false, 'flag').valid).toBe(true);
    });

    it('should accept undefined/null', () => {
      expect(validateBoolean(undefined, 'flag').valid).toBe(true);
      expect(validateBoolean(null, 'flag').valid).toBe(true);
    });

    it('should reject non-boolean values', () => {
      expect(validateBoolean('true', 'flag').valid).toBe(false);
      expect(validateBoolean(1, 'flag').valid).toBe(false);
    });
  });

  // ==========================================================================
  // Terminal Config Validation
  // ==========================================================================
  describe('validateTerminalConfig', () => {
    it('should accept valid terminal config', () => {
      const result = validateTerminalConfig({
        txPort: 0,
        rxPort: 1,
        statusPort: 2,
        interrupt: false,
      });
      expect(result.valid).toBe(true);
    });

    it('should accept undefined/null', () => {
      expect(validateTerminalConfig(undefined).valid).toBe(true);
      expect(validateTerminalConfig(null).valid).toBe(true);
    });

    it('should reject invalid port values', () => {
      const result = validateTerminalConfig({ txPort: 300 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('txPort');
    });

    it('should reject non-object values', () => {
      expect(validateTerminalConfig('string').valid).toBe(false);
    });
  });

  // ==========================================================================
  // Simple Config Validation
  // ==========================================================================
  describe('validateSimpleConfig', () => {
    it('should accept valid simple config', () => {
      const result = validateSimpleConfig({
        appStart: 0x8000,
        entry: 0x8000,
        binFrom: 0x8000,
        binTo: 0xffff,
      });
      expect(result.valid).toBe(true);
    });

    it('should accept undefined/null', () => {
      expect(validateSimpleConfig(undefined).valid).toBe(true);
    });

    it('should reject invalid address values', () => {
      const result = validateSimpleConfig({ appStart: -1 });
      expect(result.valid).toBe(false);
    });
  });

  // ==========================================================================
  // TEC-1 Config Validation
  // ==========================================================================
  describe('validateTec1Config', () => {
    it('should accept valid tec1 config', () => {
      const result = validateTec1Config({
        romHex: 'path/to/rom.hex',
        appStart: 0x0900,
        entry: 0x0900,
      });
      expect(result.valid).toBe(true);
    });

    it('should accept undefined/null', () => {
      expect(validateTec1Config(undefined).valid).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(validateTec1Config('string').valid).toBe(false);
    });
  });

  // ==========================================================================
  // TEC-1G Config Validation
  // ==========================================================================
  describe('validateTec1gConfig', () => {
    it('should accept valid tec1g config', () => {
      const result = validateTec1gConfig({
        romHex: 'path/to/rom.hex',
        expansionRomHex: 'path/to/expansion.bin',
        appStart: 0x4000,
        entry: 0x4000,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject legacy cartridgeHex in tec1g config', () => {
      const result = validateTec1gConfig({
        cartridgeHex: 'path/to/cart.hex',
      });

      expect(result).toMatchObject({
        valid: false,
        errors: ['tec1g.cartridgeHex is no longer supported; use tec1g.expansionRomHex'],
      });
    });

    it('should accept undefined/null', () => {
      expect(validateTec1gConfig(undefined).valid).toBe(true);
    });

    it('should reject invalid appStart', () => {
      const result = validateTec1gConfig({ appStart: -1 });
      expect(result.valid).toBe(false);
    });

    it('should accept phase 2 source-backed monitor and expansion romArtifacts', () => {
      const result = validateTec1gConfig({
        romHex: 'build/roms/tec1g/tecm8/monitor/monitor.bin',
        expansionRomHex: 'build/roms/tec1g/tecm8/expansion/expansion.bin',
        romArtifacts: [
          {
            id: 'tecm8-monitor',
            role: 'monitor',
            sourceFile: 'roms/tec1g/tecm8/monitor/monitor.asm',
            outputBin: 'build/roms/tec1g/tecm8/monitor/monitor.bin',
            outputDebugMap: 'build/roms/tec1g/tecm8/monitor/monitor.d8.json',
            address: 0xc000,
            size: 0x4000,
          },
          {
            id: 'tecm8-expansion',
            role: 'expansion',
            sourceFile: 'roms/tec1g/tecm8/expansion/expansion.asm',
            outputBin: 'build/roms/tec1g/tecm8/expansion/expansion.bin',
            outputDebugMap: 'build/roms/tec1g/tecm8/expansion/expansion.d8.json',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x8000,
            bankSize: 0x4000,
            bankCount: 2,
          },
        ],
      });

      expect(result).toMatchObject({ valid: true, errors: [] });
    });

    it('should accept TEC-1G expansion artifacts with two legacy banks plus seven additional banks', () => {
      const result = validateTec1gConfig({
        expansionRomHex: 'build/roms/tec1g/tecm8/expansion/expansion.bin',
        romArtifacts: [
          {
            id: 'tecm8-expansion',
            role: 'expansion',
            sourceFile: 'roms/tec1g/tecm8/expansion/expansion.asm',
            outputBin: 'build/roms/tec1g/tecm8/expansion/expansion.bin',
            outputDebugMap: 'build/roms/tec1g/tecm8/expansion/expansion.d8.json',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x24000,
            bankSize: 0x4000,
            bankCount: 9,
          },
        ],
      });

      expect(result).toMatchObject({ valid: true, errors: [] });
    });

    it('should reject duplicate active romArtifacts for the same role', () => {
      const result = validateTec1gConfig({
        romArtifacts: [
          {
            id: 'monitor-a',
            role: 'monitor',
            sourceFile: 'roms/a.asm',
            outputBin: 'build/a.bin',
            address: 0xc000,
            size: 0x4000,
          },
          {
            id: 'monitor-b',
            role: 'monitor',
            sourceFile: 'roms/b.asm',
            outputBin: 'build/b.bin',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      });

      expect(result).toMatchObject({
        valid: false,
        errors: ['tec1g.romArtifacts[1].role duplicates active monitor artifact monitor-a'],
      });
    });

    it('should accept inactive romArtifacts with the same role as an active artifact', () => {
      const result = validateTec1gConfig({
        romArtifacts: [
          {
            id: 'active-monitor',
            role: 'monitor',
            sourceFile: 'roms/active.asm',
            outputBin: 'build/active.bin',
            address: 0xc000,
            size: 0x4000,
          },
          {
            id: 'future-monitor',
            role: 'monitor',
            active: false,
            sourceFile: 'roms/future.asm',
            outputBin: 'build/future.bin',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      });

      expect(result).toMatchObject({ valid: true, errors: [] });
    });

    it('should reject invalid monitor artifact geometry', () => {
      const result = validateTec1gConfig({
        romArtifacts: [
          {
            id: 'bad-monitor',
            role: 'monitor',
            sourceFile: 'roms/monitor.asm',
            outputBin: 'build/monitor.bin',
            address: 0x8000,
            size: 0x2000,
          },
        ],
      });

      expect(result).toMatchObject({
        valid: false,
        errors: [
          'tec1g.romArtifacts[0].address must be 0xc000 for TEC-1G monitor artifacts',
          'tec1g.romArtifacts[0].size must be 0x4000 for TEC-1G monitor artifacts',
        ],
      });
    });

    it('should reject invalid expansion artifact bank geometry', () => {
      const result = validateTec1gConfig({
        romArtifacts: [
          {
            id: 'bad-expansion',
            role: 'expansion',
            sourceFile: 'roms/expansion.asm',
            outputBin: 'build/expansion.bin',
            windowAddress: 0x9000,
            windowSize: 0x2000,
            imageSize: 0x6000,
            bankSize: 0x4000,
            bankCount: 3,
          },
        ],
      });

      expect(result).toMatchObject({
        valid: false,
        errors: [
          'tec1g.romArtifacts[0].windowAddress must be 0x8000 for TEC-1G expansion artifacts',
          'tec1g.romArtifacts[0].windowSize must be 0x4000 for TEC-1G expansion artifacts',
          'tec1g.romArtifacts[0].imageSize must be a positive multiple of bankSize',
          'tec1g.romArtifacts[0].bankCount must equal imageSize / bankSize',
          'tec1g.romArtifacts[0].bankSize must equal windowSize for Phase 2 TEC-1G expansion artifacts',
        ],
      });
    });

    it('should reject TEC-1G expansion artifacts beyond the supported nine banks', () => {
      const result = validateTec1gConfig({
        romArtifacts: [
          {
            id: 'oversized-expansion',
            role: 'expansion',
            sourceFile: 'roms/expansion.asm',
            outputBin: 'build/expansion.bin',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x28000,
            bankSize: 0x4000,
            bankCount: 10,
          },
        ],
      });

      expect(result).toMatchObject({
        valid: false,
        errors: ['tec1g.romArtifacts[0].bankCount must be between 1 and 9'],
      });
    });

    it('should reject romArtifacts that mix source-backed and binary-only fields', () => {
      const result = validateTec1gConfig({
        romArtifacts: [
          {
            id: 'mixed-monitor',
            role: 'monitor',
            sourceFile: 'roms/monitor.asm',
            binary: 'roms/monitor.bin',
            outputBin: 'build/monitor.bin',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      });

      expect(result).toMatchObject({
        valid: false,
        errors: ['tec1g.romArtifacts[0] source-backed artifacts must not specify binary'],
      });
    });

    it('should reject source-backed romArtifacts that specify binary-only debugMap', () => {
      const result = validateTec1gConfig({
        romArtifacts: [
          {
            id: 'mixed-monitor',
            role: 'monitor',
            sourceFile: 'roms/monitor.asm',
            outputBin: 'build/monitor.bin',
            debugMap: 'roms/monitor.d8.json',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      });

      expect(result).toMatchObject({
        valid: false,
        errors: ['tec1g.romArtifacts[0] source-backed artifacts must not specify debugMap'],
      });
    });

    it('should reject active binary-only romArtifacts during Phase 2', () => {
      const result = validateTec1gConfig({
        romArtifacts: [
          {
            id: 'monitor-binary',
            role: 'monitor',
            binary: 'roms/monitor.bin',
            address: 0xc000,
            size: 0x4000,
          },
        ],
      });

      expect(result).toMatchObject({
        valid: false,
        errors: ['tec1g.romArtifacts[0] active binary-only artifacts are deferred for Phase 2'],
      });
    });
  });

  // ==========================================================================
  // Full Launch Args Validation
  // ==========================================================================
  describe('validateLaunchArgs', () => {
    it('should accept valid launch args', () => {
      const result = validateLaunchArgs({
        asm: 'src/main.asm',
        platform: 'simple',
        stopOnEntry: true,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept minimal args', () => {
      const result = validateLaunchArgs({});
      expect(result.valid).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(validateLaunchArgs(null).valid).toBe(false);
      expect(validateLaunchArgs(undefined).valid).toBe(false);
    });

    it('should reject non-object', () => {
      expect(validateLaunchArgs('string').valid).toBe(false);
    });

    it('should collect multiple errors', () => {
      const result = validateLaunchArgs({
        platform: 'invalid',
        entry: -1,
        stepOverMaxInstructions: -10,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('preserves nested platform and terminal field names in collected errors', () => {
      const result = validateLaunchArgs({
        terminal: { txPort: 300, interrupt: 'yes' },
        simple: { binFrom: -1 },
        tec1: 'bad',
        tec1g: { expansionRomHex: 42 },
      });

      expect(result).toMatchObject({
        valid: false,
        errors: [
          'terminal.txPort must be between 0 and 255, got 300',
          'terminal.interrupt must be a boolean, got string',
          'simple.binFrom must be between 0 and 0xffff, got -1 (0x-1)',
          'tec1 must be an object, got string',
          'tec1g.expansionRomHex must be a string, got number',
        ],
      });
    });
  });

  // ==========================================================================
  // Assertion Functions
  // ==========================================================================
  describe('assertValidLaunchArgs', () => {
    it('should not throw for valid args', () => {
      expect(() => assertValidLaunchArgs({ asm: 'main.asm' })).not.toThrow();
    });

    it('should throw ConfigurationError for invalid args', () => {
      expect(() => assertValidLaunchArgs({ platform: 'invalid' })).toThrow(ConfigurationError);
    });
  });

  describe('assertValidPlatform', () => {
    it('should not throw for valid platforms', () => {
      expect(() => assertValidPlatform('simple')).not.toThrow();
      expect(() => assertValidPlatform('tec1')).not.toThrow();
      expect(() => assertValidPlatform('tec1g')).not.toThrow();
    });

    it('should throw UnsupportedPlatformError for invalid platform', () => {
      expect(() => assertValidPlatform('invalid')).toThrow(UnsupportedPlatformError);
    });
  });

  describe('assertHasSourcePaths', () => {
    it('should not throw when asm is provided', () => {
      expect(() => assertHasSourcePaths({ asm: 'main.asm' })).not.toThrow();
    });

    it('should not throw when hex is provided', () => {
      expect(() => assertHasSourcePaths({ hex: 'main.hex' })).not.toThrow();
    });

    it('should throw MissingConfigError when no source paths', () => {
      expect(() => assertHasSourcePaths({})).toThrow(MissingConfigError);
    });

    it('should throw for empty string paths', () => {
      expect(() => assertHasSourcePaths({ asm: '', hex: '' })).toThrow(MissingConfigError);
    });
  });
});
