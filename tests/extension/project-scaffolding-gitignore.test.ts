import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'os';
import * as path from 'path';
import { ensureDebug80Gitignore } from '../../src/extension/project-gitignore';

describe('ensureDebug80Gitignore', () => {
  it('merges a Debug80 block into .gitignore without duplicating on second run', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-gi-'));
    try {
      expect(fs.existsSync(path.join(root, '.gitignore'))).toBe(false);
      ensureDebug80Gitignore(root, 'build');
      const g1 = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
      expect(g1).toContain('.debug80/');
      expect(g1).toContain('build/');
      expect(g1).toContain('roms/');
      ensureDebug80Gitignore(root, 'build');
      const g2 = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
      expect(g2.split('### Debug80').length - 1).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('appends a Debug80 block when .gitignore already has user content', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-gi-'));
    try {
      fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n', 'utf8');
      ensureDebug80Gitignore(root, 'out');
      const g = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
      expect(g.startsWith('node_modules/')).toBe(true);
      expect(g).toContain('out/');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
