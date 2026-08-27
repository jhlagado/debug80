/**
 * @file Atom-backed Debug80 example corpus proof.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AtomBackend } from '../../src/debug/launch/atom-backend';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const exampleRoot = path.join(repositoryRoot, 'examples', 'debug80-dev');
const gameCorpusRoot = path.join(repositoryRoot, 'packages', 'glimmer', 'corpus', 'tetro');

function assemblyFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? assemblyFiles(entryPath)
      : entry.name.endsWith('.asm')
        ? [entryPath]
        : [];
  });
}

const expected = {
  'matrix-smoke': {
    bytes: 76,
    sha256: '8844b601784c9bbb553c2a8f76e1c1d4ee6565aa19c961d264650a61d080758a',
  },
  'panel-smoke': {
    bytes: 42,
    sha256: '807026a4f55f15434f0866b58138027b6f735e270c5474ac0fda978b4ead6707',
  },
  'keypad-hold': {
    bytes: 87,
    sha256: 'd9f09eba90cf375e4ec77f319bb669a9fa561a7e40cdc4d202c5da3e8bd10ba1',
  },
  'seven-seg-hold': {
    bytes: 65,
    sha256: '7389b495d8489c7b4b9c0e184d634aeee9059e75caef87401792fca6a2d88a61',
  },
} as const;

describe('Atom example corpus', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  it('selects Atom and preserves every migrated target byte', async () => {
    const configuration = JSON.parse(
      fs.readFileSync(path.join(exampleRoot, 'debug80.json'), 'utf8')
    ) as { targets: Record<string, { assembler: string; sourceFile: string }> };

    for (const [name, account] of Object.entries(expected)) {
      const target = configuration.targets[name];
      expect(target?.assembler).toBe('atom');

      const root = fs.mkdtempSync(path.join(os.tmpdir(), `debug80-${name}-`));
      temporaryDirectories.push(root);
      const source = path.join(root, target.sourceFile);
      const artifactBase = path.join(root, 'build', name);
      fs.copyFileSync(path.join(exampleRoot, target.sourceFile), source);

      const result = await new AtomBackend().assemble({
        asmPath: source,
        hexPath: `${artifactBase}.hex`,
        sourceRoot: root,
      });
      expect(result.success, result.error).toBe(true);

      const bytes = fs.readFileSync(`${artifactBase}.bin`);
      expect(bytes.byteLength).toBe(account.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(account.sha256);
    }
  }, 30_000);

  it('assembles the multipart Tetro and Pacmo corpus with exact images', async () => {
    const configuration = JSON.parse(
      fs.readFileSync(path.join(gameCorpusRoot, 'debug80.json'), 'utf8')
    ) as { targets: Record<string, { assembler: string; sourceFile: string }> };
    const accounts = {
      tetro: {
        bytes: 2801,
        sha256: '1ded84b34cfe93d07ae8e766bfd499ffa85e405b5c850f0e7d1fcdae267c2688',
      },
      pacmo: {
        bytes: 3573,
        sha256: '4b985d210f22bde37bd82ed41b6c14326dc21dc7cca4568c8b0b6c8c6e42ec0e',
      },
    } as const;

    for (const [name, account] of Object.entries(accounts)) {
      const target = configuration.targets[name];
      expect(target?.assembler).toBe('atom');

      const output = fs.mkdtempSync(path.join(os.tmpdir(), `debug80-${name}-`));
      temporaryDirectories.push(output);
      const artifactBase = path.join(output, name);
      const result = await new AtomBackend().assemble({
        asmPath: path.join(gameCorpusRoot, target.sourceFile),
        hexPath: `${artifactBase}.hex`,
        sourceRoot: gameCorpusRoot,
      });
      expect(result.success, result.error).toBe(true);

      const bytes = fs.readFileSync(`${artifactBase}.bin`);
      expect(bytes.byteLength).toBe(account.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(account.sha256);

      const ledger = JSON.parse(
        fs.readFileSync(path.join(gameCorpusRoot, 'src', name, 'atom-symbols.json'), 'utf8')
      ) as {
        format: string;
        target: string;
        symbols: { module: string; original: string; short: string }[];
      };
      expect(ledger.format).toBe('atom-source-symbol-ledger');
      expect(ledger.target).toBe(name);
      expect(ledger.symbols.length).toBeGreaterThan(100);
      expect(ledger.symbols.every(({ short }) => /^[A-Za-z_][A-Za-z0-9_]{0,7}$/.test(short))).toBe(
        true
      );
      expect(new Set(ledger.symbols.map(({ short }) => short.toUpperCase())).size).toBe(
        ledger.symbols.length
      );

      for (const symbol of ledger.symbols) {
        const source = fs.readFileSync(path.join(gameCorpusRoot, 'src', symbol.module), 'utf8');
        expect(source).toMatch(new RegExp(`\\b${symbol.short}\\b`, 'i'));
      }
    }

    const source = assemblyFiles(path.join(gameCorpusRoot, 'src'))
      .map((filename) => fs.readFileSync(filename, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/^\s*\.(?:INCLUDE|ORG|DB|DW|DS|EQU)\b/im);
    expect(source).not.toMatch(/^\s*@/m);
    expect(source).not.toMatch(/\bG[0-9A-Z]{7}\b/);
  }, 60_000);
});
