import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureDirExists, inferDefaultTarget } from '../debug/config-utils';

const withTempDir = (fn: (dir: string) => void): void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-config-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('config-utils', () => {
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
