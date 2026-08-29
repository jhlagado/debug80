/**
 * @file Atom assembler backend tests.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtomBackend, type AtomCompilerApi } from '../../src/debug/launch/atom-backend';

const validD8 = {
  format: 'd8-debug-map',
  version: 1,
  arch: 'z80',
  addressWidth: 16,
  endianness: 'little',
  files: {},
};

function fakeCompiler(overrides: Partial<AtomCompilerApi> = {}): AtomCompilerApi {
  return {
    assembleAtomProject: vi.fn(() =>
      Promise.resolve({
        project: {},
        generation: { finalCursor: 0x100, images: [{ address: 0x100, bytes: Uint8Array.of(0) }] },
      })
    ),
    renderAtomArtifacts: vi.fn(() => ({
      bin: Uint8Array.of(0x00),
      hex: ':00000001FF\n',
      listing: '0100  00  main.asm:1  NOP\n',
      d8Text: `${JSON.stringify(validD8)}\n`,
      d8: validD8,
    })),
    publishAtomOutputFiles: vi.fn((outputs) =>
      Promise.resolve(outputs.map((output) => path.resolve(output.path)))
    ),
    ...overrides,
  };
}

describe('Atom backend', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  function workspace(): { root: string; source: string; hex: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-atom-'));
    temporaryDirectories.push(root);
    const source = path.join(root, 'main.asm');
    const hex = path.join(root, 'build', 'main.hex');
    fs.writeFileSync(source, 'ORG 0100H\nNOP\n');
    return { root, source, hex };
  }

  it('requests one in-process build and publishes the Debug80 artifact set', async () => {
    const project = workspace();
    const compiler = fakeCompiler();
    const result = await new AtomBackend(compiler).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect(compiler.assembleAtomProject).toHaveBeenCalledWith({
      root: project.root,
      entry: 'main.asm',
      assembler: 'atom',
      target: { start: 0, capacity: 0xffff },
    });
    expect(compiler.renderAtomArtifacts).toHaveBeenCalledWith(expect.anything(), {
      base: 0x100,
      entryAddress: 0x100,
    });
    expect(compiler.publishAtomOutputFiles).toHaveBeenCalledWith([
      { path: project.hex, bytes: ':00000001FF\n' },
      { path: path.join(project.root, 'build', 'main.bin'), bytes: Uint8Array.of(0x00) },
      {
        path: path.join(project.root, 'build', 'main.d8.json'),
        bytes: `${JSON.stringify(validD8)}\n`,
      },
      {
        path: path.join(project.root, 'build', 'main.lst'),
        bytes: '0100  00  main.asm:1  NOP\n',
      },
    ]);
    expect(result.stdout).toContain('4 build artifacts');
  });

  it('executes Atom on the Z80 emulator and retains included-source provenance', async () => {
    const project = workspace();
    fs.writeFileSync(path.join(project.root, 'library.asm'), 'VALUE EQU 42\n');
    fs.writeFileSync(project.source, '%INCLUDE "library.asm"\nORG 0100H\nLD A,VALUE\n');

    const result = await new AtomBackend().assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.bin'))).toEqual(
      Buffer.from([0x3e, 42])
    );
    expect(fs.readFileSync(project.hex, 'utf8')).toContain(':020100003E2A95');
    const d8 = JSON.parse(
      fs.readFileSync(path.join(project.root, 'build', 'main.d8.json'), 'utf8')
    ) as { files: Record<string, unknown>; generator: { tool: string } };
    expect(Object.keys(d8.files)).toEqual(['library.asm', 'main.asm']);
    expect(d8.generator.tool).toBe('atom');
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.lst'), 'utf8')).toContain(
      'main.asm:3'
    );
  }, 30_000);

  it('publishes a fixed-width binary range from Atom generation records', async () => {
    const project = workspace();
    const compiler = fakeCompiler({
      assembleAtomProject: vi.fn(() =>
        Promise.resolve({
          project: {},
          generation: {
            finalCursor: 0x4004,
            images: [
              { address: 0x3fff, bytes: Uint8Array.of(0xee, 0x01, 0x02) },
              { address: 0x4004, bytes: Uint8Array.of(0x04) },
            ],
            patches: [{ address: 0x4002, bytes: Uint8Array.of(0xaa) }],
          },
        })
      ),
    });

    const result = await new AtomBackend(compiler).assembleBin({
      asmPath: project.source,
      hexPath: project.hex,
      binFrom: 0x4000,
      binTo: 0x4004,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect(compiler.assembleAtomProject).toHaveBeenCalledWith({
      root: project.root,
      entry: 'main.asm',
      assembler: 'atom',
      target: { start: 0, capacity: 0xffff },
    });
    expect(compiler.renderAtomArtifacts).not.toHaveBeenCalled();
    expect(compiler.publishAtomOutputFiles).toHaveBeenCalledWith([
      {
        path: path.join(project.root, 'build', 'main.bin'),
        bytes: Uint8Array.of(0x01, 0x02, 0xaa, 0x00, 0x04),
      },
    ]);
  });

  it('executes Atom binary output on the Z80 emulator', async () => {
    const project = workspace();
    fs.writeFileSync(project.source, 'ORG 4001H\nDB 0AAH\nORG 4003H\nDB 055H\n');

    const result = await new AtomBackend().assembleBin({
      asmPath: project.source,
      hexPath: project.hex,
      binFrom: 0x4000,
      binTo: 0x4004,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect([...fs.readFileSync(path.join(project.root, 'build', 'main.bin'))]).toEqual([
      0x00, 0xaa, 0x00, 0x55, 0x00,
    ]);
  }, 30_000);

  it('maps Atom source diagnostics without publishing partial artifacts', async () => {
    const project = workspace();
    fs.writeFileSync(project.source, 'ORG 0100H\nBROKEN\n');
    const publish = vi.fn(() => Promise.resolve([]));
    const compiler = fakeCompiler({
      assembleAtomProject: vi.fn(() => {
        const error = new Error('Atom rejected a source statement') as Error & {
          diagnostic: { logicalIdentity: string; line: number; column: number };
        };
        error.diagnostic = { logicalIdentity: 'main.asm', line: 2, column: 1 };
        return Promise.reject(error);
      }),
      publishAtomOutputFiles: publish,
    });

    const result = await new AtomBackend(compiler).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      diagnostic: {
        path: project.source,
        line: 2,
        column: 1,
        sourceLine: 'BROKEN',
      },
    });
    expect(result.error).toContain('BROKEN');
    expect(publish).not.toHaveBeenCalled();
    expect(fs.existsSync(project.hex)).toBe(false);
  });

  it('rejects malformed D8 before publishing', async () => {
    const project = workspace();
    const publish = vi.fn(() => Promise.resolve([]));
    const compiler = fakeCompiler({
      renderAtomArtifacts: vi.fn(() => ({
        bin: Uint8Array.of(0),
        hex: ':00000001FF\n',
        listing: '',
        d8Text: '{bad json',
        d8: {},
      })),
      publishAtomOutputFiles: publish,
    });

    const result = await new AtomBackend(compiler).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result.error).toContain('invalid D8 artifact');
    expect(publish).not.toHaveBeenCalled();
  });

  it('reports a transactional publication failure as an Atom build failure', async () => {
    const project = workspace();
    const compiler = fakeCompiler({
      publishAtomOutputFiles: vi.fn(() => Promise.reject(new Error('disk full'))),
    });
    const result = await new AtomBackend(compiler).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toEqual({ success: false, error: 'Atom failed: disk full' });
  });
});
