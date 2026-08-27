/**
 * @file Every assembly starter supplied by Debug80 must execute through Atom.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

type AtomBuildResult = {
  generation: {
    images: readonly { address: number; bytes: readonly number[] }[];
  };
};

type AtomCompiler = {
  assembleAtomProject(options: {
    root: string;
    entry: string;
    target: { start: number; capacity: number };
  }): Promise<AtomBuildResult>;
};

const starterTemplates = [
  'simple/default/starter.asm',
  'cpm22/default/starter.asm',
  'tec1/classic-2k/starter.asm',
  'tec1/mon1b/starter.asm',
  'tec1g/mon3/starter.asm',
] as const;

describe('Atom project starters', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  for (const relativePath of starterTemplates) {
    it(`assembles ${relativePath}`, async () => {
      const compiler = (await import('atom-z80')) as unknown as AtomCompiler;
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-atom-starter-'));
      temporaryDirectories.push(root);
      const source = path.join(process.cwd(), 'resources', 'project-kits', relativePath);
      fs.copyFileSync(source, path.join(root, 'main.asm'));

      const result = await compiler.assembleAtomProject({
        root,
        entry: 'main.asm',
        target: { start: 0, capacity: 0xffff },
      });

      expect(result.generation.images.length).toBeGreaterThan(0);
    });
  }

  it('assembles the extension smoke target with the configured Atom backend', async () => {
    const compiler = (await import('atom-z80')) as unknown as AtomCompiler;
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'debug80.json'), 'utf8')
    ) as {
      targets: { app: { assembler: string; sourceFile: string } };
    };
    expect(config.targets.app.assembler).toBe('atom');

    const result = await compiler.assembleAtomProject({
      root: process.cwd(),
      entry: config.targets.app.sourceFile,
      target: { start: 0, capacity: 0xffff },
    });
    expect(result.generation.images.flatMap(({ bytes }) => bytes)).toEqual([
      0x3e, 0x05, 0xc6, 0x03, 0x76,
    ]);
  });
});
