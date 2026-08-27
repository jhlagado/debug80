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
});
