import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureDirExists, inferDefaultTarget } from '../../src/debug/launch/config-utils';

const withTempDir = <T>(fn: (dir: string) => T): T => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-config-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const writeTextFile = (filePath: string, contents: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
};

const writeSourceFile = (projectRoot: string, relativePath: string, contents = '; test'): void => {
  writeTextFile(path.join(projectRoot, relativePath), contents);
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
      const inferred = withTempDir((dir) => {
        writeSourceFile(dir, path.join('src', 'main.asm'));

        return inferDefaultTarget(dir);
      });

      assert.equal(inferred.sourceFile, 'src/main.asm');
      assert.equal(inferred.artifactBase, 'main');
      assert.equal(inferred.outputDir, 'build');
      assert.equal(inferred.found, true);
    });

    it('falls back to first asm in tree when main not present', () => {
      const inferred = withTempDir((dir) => {
        writeSourceFile(dir, path.join('src', 'lib', 'util.asm'), '; util');

        return inferDefaultTarget(dir);
      });

      assert.equal(inferred.sourceFile, 'src/lib/util.asm');
      assert.equal(inferred.artifactBase, 'util');
      assert.equal(inferred.found, true);
    });

    it('accepts main.z80 and other z80 source files', () => {
      const main = withTempDir((dir) => {
        writeSourceFile(dir, 'main.z80');
        return inferDefaultTarget(dir);
      });
      const nested = withTempDir((dir) => {
        writeSourceFile(dir, path.join('legacy', 'monitor.z80'));
        return inferDefaultTarget(dir);
      });

      assert.equal(main.sourceFile, 'main.z80');
      assert.equal(main.artifactBase, 'main');
      assert.equal(main.found, true);
      assert.equal(nested.sourceFile, 'legacy/monitor.z80');
      assert.equal(nested.artifactBase, 'monitor');
      assert.equal(nested.found, true);
    });

    it('returns not found when nothing exists', () => {
      const inferred = withTempDir((dir) => inferDefaultTarget(dir));

      assert.equal(inferred.sourceFile, 'src/main.asm');
      assert.equal(inferred.artifactBase, 'main');
      assert.equal(inferred.found, false);
    });

    it('does not infer generated or dependency sources as project entry files', () => {
      const inferred = withTempDir((dir) => {
        writeSourceFile(dir, path.join('build', 'generated.asm'));
        writeSourceFile(dir, path.join('node_modules', 'package', 'main.z80'));
        return inferDefaultTarget(dir);
      });

      assert.equal(inferred.sourceFile, 'src/main.asm');
      assert.equal(inferred.found, false);
    });
  });
});
