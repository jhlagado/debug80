/**
 * @file Path Utilities Tests
 * @description Tests for cross-platform path handling utilities
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
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
      expect(isPathWithin('/home/user/project/src/file.ts', '/home/user/project')).toBe(true);
    });

    it('should return false when path is outside base', () => {
      expect(isPathWithin('/home/user/other/file.ts', '/home/user/project')).toBe(false);
    });

    it('should not match partial directory names', () => {
      // /home/user should not be "within" /home/use
      expect(isPathWithin('/home/user', '/home/use')).toBe(false);
    });

    it('should return true when path equals base', () => {
      expect(isPathWithin('/home/user/project', '/home/user/project')).toBe(true);
    });

    it('should handle trailing separators', () => {
      expect(isPathWithin('/home/user/project/file.ts', '/home/user/project/')).toBe(true);
    });
  });

  describe('relativeIfWithin', () => {
    it('should return relative path when within base', () => {
      const result = relativeIfWithin('/home/user/project/src/file.ts', '/home/user/project');
      expect(result).toBe(path.join('src', 'file.ts'));
    });

    it('should return absolute path when outside base', () => {
      const result = relativeIfWithin('/home/other/file.ts', '/home/user/project');
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
      const root = '/home/user/project';
      const absPath = '/home/user/project/src/file.ts';
      const result = toPortableRelative(root, absPath);
      expect(result).toBe('src/file.ts');
    });

    it('should use basename for non-relative paths', () => {
      // When path equals root, relative returns '', so it uses basename
      const root = '/home/user/project';
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
});
