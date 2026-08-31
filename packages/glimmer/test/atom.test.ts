import { compile } from '@jhlagado/azm/compile';
import { assembleAtomProject, renderAtomArtifacts } from 'atom-z80';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { generateAtom } from '../src/atom.js';
import { buildGlimmerProgram } from '../src/build.js';
import { generateAzm } from '../src/generate.js';
import { loadGlimmerProgram } from '../src/load.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('generateAtom', () => {
  for (const name of ['dot', 'slide', 'trail', 'sprite-chase']) {
    it(`preserves every assembled byte for ${name}`, async () => {
      const entry = path.resolve(import.meta.dirname, `../examples/${name}.glim`);
      const loaded = loadGlimmerProgram(entry);
      expect(loaded.diagnostics).toEqual([]);
      expect(loaded.program).not.toBeNull();

      const azm = generateAzm(loaded.program!);
      const atom = generateAtom(loaded.program!);
      expect(azm.diagnostics).toEqual([]);
      expect(atom.diagnostics).toEqual([]);
      expect(atom.source).not.toContain('.contracts');
      expect(atom.source).not.toMatch(/^\s*\.routine\b/m);
      expect(atom.source).not.toMatch(/^\s*op\s+/m);

      const root = await mkdtemp(path.join(os.tmpdir(), `glimmer-${name}-atom-`));
      temporaryRoots.push(root);
      const azmPath = path.join(root, 'program.azm.asm');
      const atomPath = path.join(root, 'program.asm');
      await writeFile(azmPath, azm.source);
      await writeFile(atomPath, atom.source);

      const oracle = await compile(azmPath, {
        emitBin: true,
        emitHex: false,
        emitD8m: false,
        emitLst: false,
        outputType: 'bin',
        registerContracts: 'error',
        registerContractsProfile: 'mon3',
      });
      expect(oracle.diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
      const binArtifact = oracle.artifacts.find(({ kind }) => kind === 'bin');
      const expected =
        binArtifact !== undefined && 'bytes' in binArtifact ? binArtifact.bytes : undefined;
      expect(expected).not.toBeUndefined();

      const assembled = await assembleAtomProject({
        root,
        entry: path.basename(atomPath),
        target: { start: 0x4000, capacity: 0x8000 },
        maxInstructions: 400_000_000,
        maxCycles: 4_000_000_000,
      });
      const actual = renderAtomArtifacts(assembled, { base: 0x4000 }).bin;
      expect(Buffer.from(actual)).toEqual(Buffer.from(expected!));
    }, 90_000);
  }

  it('keeps the source-only projection strict when imported module bytes are unavailable', () => {
    const loaded = loadGlimmerProgram(path.resolve(import.meta.dirname, '../examples/snake.glim'));
    expect(loaded.program).not.toBeNull();
    const generated = generateAtom(loaded.program!);
    expect(generated.source).toBe('');
    expect(generated.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('requires the imported module sources'),
      }),
    ]);
  });

  for (const name of ['snake', 'tetro']) {
    it(`preserves AZM bytes and module provenance for multipart ${name}`, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), `glimmer-${name}-multipart-`));
      temporaryRoots.push(root);
      const dependencies =
        name === 'snake'
          ? ['snake.glim', 'snake-rules.glim', 'snake-lib.asm']
          : ['tetro.glim', 'tetro-rules.glim', 'tetro-lib.asm'];
      for (const dependency of dependencies) {
        await writeFile(
          path.join(root, dependency),
          await readFile(path.resolve(import.meta.dirname, `../examples/${dependency}`)),
        );
      }
      const entry = path.join(root, `${name}.glim`);
      const azm = await buildGlimmerProgram(entry, {
        assembler: 'azm',
        outputPath: path.join(root, `${name}.azm.asm`),
      });
      const atom = await buildGlimmerProgram(entry, {
        assembler: 'atom',
        outputPath: path.join(root, `${name}.atom.asm`),
      });
      expect(azm.diagnostics).toEqual([]);
      expect(atom.diagnostics).toEqual([]);
      expect(await readFile(atom.artifacts!.bin!)).toEqual(await readFile(azm.artifacts!.bin!));

      const map = JSON.parse(await readFile(atom.artifacts!.d8!, 'utf8')) as {
        files?: Record<string, unknown>;
      };
      expect(map.files).toHaveProperty(`${name}-lib.asm`);
      expect(map.files).toHaveProperty(`${name}-rules.glim`);
    }, 90_000);
  }

  it('builds Atom HEX, BIN, and D8 artifacts with Glimmer body provenance', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'glimmer-atom-build-'));
    temporaryRoots.push(root);
    const entry = path.join(root, 'dot.glim');
    await writeFile(
      entry,
      await readFile(path.resolve(import.meta.dirname, '../examples/dot.glim')),
    );

    const result = await buildGlimmerProgram(entry, { assembler: 'atom' });
    expect(result.diagnostics).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.mappedSegments).toBeGreaterThan(0);
    expect(result.artifacts).toEqual({
      asm: path.join(root, 'dot.main.asm'),
      hex: path.join(root, 'dot.main.hex'),
      bin: path.join(root, 'dot.main.bin'),
      d8: path.join(root, 'dot.main.d8.json'),
    });
    const map = JSON.parse(await readFile(result.artifacts!.d8!, 'utf8')) as {
      files?: Record<string, unknown>;
      generator?: { name?: string };
      symbols?: Array<{ name?: string }>;
    };
    expect(map.generator?.name).toBe('atom');
    expect(map.files).toHaveProperty('dot.glim');
    const symbolNames = map.symbols?.map((symbol) => symbol.name);
    expect(symbolNames).toContain('Framebuffer');
    expect(symbolNames).toContain('GlimPollBindings');
  }, 30_000);
});
