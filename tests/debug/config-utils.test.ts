import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureDirExists, inferDefaultTarget } from '../../src/debug/config-utils';

const withTempDir = (fn: (dir: string) => void): void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-config-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('config-utils', () => {
  describe('ensureDirExists', () => {
    it('creates directory recursively', () => {
      withTempDir((dir) => {
        const deepPath = path.join(dir, 'a', 'b', 'c');
        assert.equal(fs.existsSync(deepPath), false);
        ensureDirExists(deepPath);
        assert.equal(fs.existsSync(deepPath), true);
      });
    });

    it('does nothing for empty string', () => {
      // Should not throw
      ensureDirExists('');
    });

    it('does nothing for current directory (.)', () => {
      // Should not throw
      ensureDirExists('.');
    });

    it('handles already existing directory', () => {
      withTempDir((dir) => {
        const subDir = path.join(dir, 'existing');
        fs.mkdirSync(subDir);
        // Should not throw when directory exists
        ensureDirExists(subDir);
        assert.equal(fs.existsSync(subDir), true);
      });
    });
  });

  describe('inferDefaultTarget', () => {
    it('infers src/main.asm when present', () => {
      withTempDir((dir) => {
        const srcDir = path.join(dir, 'src');
        ensureDirExists(srcDir);
        const mainPath = path.join(srcDir, 'main.asm');
        fs.writeFileSync(mainPath, '; test');

        const inferred = inferDefaultTarget(dir);
        assert.equal(inferred.sourceFile, 'src/main.asm');
        assert.equal(inferred.artifactBase, 'main');
        assert.equal(inferred.outputDir, 'build');
        assert.equal(inferred.found, true);
      });
    });

    it('falls back to first asm in tree when main not present', () => {
      withTempDir((dir) => {
        const srcDir = path.join(dir, 'src', 'lib');
        ensureDirExists(srcDir);
        const asmPath = path.join(srcDir, 'util.asm');
        fs.writeFileSync(asmPath, '; util');

        const inferred = inferDefaultTarget(dir);
        assert.equal(inferred.sourceFile, 'src/lib/util.asm');
        assert.equal(inferred.artifactBase, 'util');
        assert.equal(inferred.found, true);
      });
    });

    it('returns not found when nothing exists', () => {
      withTempDir((dir) => {
        const inferred = inferDefaultTarget(dir);
        assert.equal(inferred.sourceFile, 'src/main.asm');
        assert.equal(inferred.artifactBase, 'main');
        assert.equal(inferred.found, false);
      });
    });
  });
});
