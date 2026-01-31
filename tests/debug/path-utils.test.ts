/**
 * @file Path Utilities Tests
 * @description Tests for cross-platform path handling utilities
 */

import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import {
  IS_WINDOWS,
  pathsEqual,
  isPathWithin,
  relativeIfWithin,
  toPortablePath,
  fromPortablePath,
  toPortableRelative,
  normalizePathForKey,
} from '../../src/debug/path-utils';

describe('path-utils', () => {
  describe('pathsEqual', () => {
    it('should return true for identical paths', () => {
      expect(pathsEqual('/foo/bar', '/foo/bar')).toBe(true);
    });

    it('should handle relative path resolution', () => {
      const cwd = process.cwd();
      expect(pathsEqual(path.join(cwd, 'foo'), './foo')).toBe(true);
    });

    it('should return false for different paths', () => {
      expect(pathsEqual('/foo/bar', '/foo/baz')).toBe(false);
    });
  });

  describe('isPathWithin', () => {
    it('should return true when path is within base', () => {
      const base = path.join(os.homedir(), 'project');
      const filePath = path.join(base, 'src', 'file.ts');
      expect(isPathWithin(filePath, base)).toBe(true);
    });

    it('should return false when path is outside base', () => {
      const base = path.join(os.homedir(), 'project');
      const other = path.join(os.homedir(), 'other', 'file.ts');
      expect(isPathWithin(other, base)).toBe(false);
    });

    it('should not match partial directory names', () => {
      // /home/user should not be "within" /home/use
      const root = path.join(os.homedir(), 'use');
      const filePath = path.join(os.homedir(), 'user');
      expect(isPathWithin(filePath, root)).toBe(false);
    });

    it('should return true when path equals base', () => {
      const base = path.join(os.homedir(), 'project');
      expect(isPathWithin(base, base)).toBe(true);
    });

    it('should handle trailing separators', () => {
      const base = path.join(os.homedir(), 'project');
      const filePath = path.join(base, 'file.ts');
      expect(isPathWithin(filePath, `${base}${path.sep}`)).toBe(true);
    });
  });

  describe('relativeIfWithin', () => {
    it('should return relative path when within base', () => {
      const base = path.join(os.homedir(), 'project');
      const filePath = path.join(base, 'src', 'file.ts');
      const result = relativeIfWithin(filePath, base);
      expect(result).toBe(path.join('src', 'file.ts'));
    });

    it('should return absolute path when outside base', () => {
      const base = path.join(os.homedir(), 'project');
      const filePath = path.join(os.homedir(), 'other', 'file.ts');
      const result = relativeIfWithin(filePath, base);
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('toPortablePath', () => {
    it('should convert path separators to forward slashes', () => {
      // On all platforms, toPortablePath should produce forward slashes
      const input = path.join('foo', 'bar', 'baz');
      expect(toPortablePath(input)).toBe('foo/bar/baz');
    });

    it('should preserve forward slashes', () => {
      expect(toPortablePath('foo/bar/baz')).toBe('foo/bar/baz');
    });
  });

  describe('fromPortablePath', () => {
    it('should convert forward slashes to native separators', () => {
      const result = fromPortablePath('foo/bar/baz');
      expect(result).toBe(path.join('foo', 'bar', 'baz'));
    });
  });

  describe('toPortableRelative', () => {
    it('should return portable relative path', () => {
      const root = path.join(os.homedir(), 'project');
      const absPath = path.join(root, 'src', 'file.ts');
      const result = toPortableRelative(root, absPath);
      expect(result).toBe('src/file.ts');
    });

    it('should use basename for non-relative paths', () => {
      // When path equals root, relative returns '', so it uses basename
      const root = path.join(os.homedir(), 'project');
      const result = toPortableRelative(root, root);
      expect(result).toBe('project');
    });
  });

  describe('normalizePathForKey', () => {
    it('should resolve paths', () => {
      const result = normalizePathForKey('./foo/../bar');
      expect(result).toContain('bar');
      expect(result).not.toContain('foo');
    });
  });

  describe('windows-specific behavior', () => {
    const maybeIt = IS_WINDOWS ? it : it.skip;

    maybeIt('compares paths case-insensitively', () => {
      expect(pathsEqual('C:\\Temp\\File.asm', 'c:\\temp\\file.asm')).toBe(true);
    });

    maybeIt('treats base path case-insensitively for containment', () => {
      expect(isPathWithin('C:\\Temp\\Project\\src\\file.asm', 'c:\\temp\\project')).toBe(true);
    });

    maybeIt('converts backslashes to forward slashes for portable paths', () => {
      expect(toPortablePath('C:\\Temp\\Project\\file.asm')).toBe('C:/Temp/Project/file.asm');
    });
  });
});
