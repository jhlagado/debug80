import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'os';
import * as path from 'path';
import { ensureDebug80Gitignore } from '../../src/extension/project-gitignore';

function withTempProject(testBody: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-gi-'));
  try {
    testBody(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function gitignorePath(root: string): string {
  return path.join(root, '.gitignore');
}

function gitignoreExists(root: string): boolean {
  return fs.existsSync(gitignorePath(root));
}

function readGitignore(root: string): string {
  return fs.readFileSync(gitignorePath(root), 'utf8');
}

function writeGitignore(root: string, contents: string): void {
  fs.writeFileSync(gitignorePath(root), contents, 'utf8');
}

function countDebug80Blocks(contents: string): number {
  return contents.split('### Debug80').length - 1;
}

describe('ensureDebug80Gitignore', () => {
  it('merges a Debug80 block into .gitignore without duplicating on second run', () => {
    withTempProject((root) => {
      expect(gitignoreExists(root)).toBe(false);
      ensureDebug80Gitignore(root, 'build');
      const g1 = readGitignore(root);
      expect(g1).not.toContain('.debug80/');
      expect(g1).toContain('build/');
      expect(g1).toContain('roms/');
      ensureDebug80Gitignore(root, 'build');
      expect(countDebug80Blocks(readGitignore(root))).toBe(1);
    });
  });

  it('appends a Debug80 block when .gitignore already has user content', () => {
    withTempProject((root) => {
      writeGitignore(root, 'node_modules/\n');
      ensureDebug80Gitignore(root, 'out');
      const g = readGitignore(root);
      expect(g.startsWith('node_modules/')).toBe(true);
      expect(g).toContain('out/');
    });
  });
});
