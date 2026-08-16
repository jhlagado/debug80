import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NucleusBuildResult } from '@jhlagado/nucleus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NucleusBackend, type NucleusCompilerApi } from '../../src/debug/launch/nucleus-backend';

describe('Nucleus backend', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  function workspace(): { root: string; source: string; hex: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-nucleus-'));
    temporaryDirectories.push(root);
    const source = path.join(root, 'main.nu');
    const hex = path.join(root, 'build', 'main.hex');
    fs.writeFileSync(source, 'sub main()\nend\n');
    fs.writeFileSync(
      path.join(root, 'nucleus-target.json'),
      JSON.stringify({
        schema: 'nucleus-target/v1',
        services: {
          readInputByte: 0x7000,
          writeOutputByte: 0x7003,
          readStorageByte: 0x7006,
          rewindStorageInput: 0x7009,
          writeStorageByte: 0x700c,
          seekStorageOutput: 0x700f,
          success: 0x7012,
          unhandledFailure: 0x7015,
          trap: 0x7018,
          farCall: 0x701b,
          farJump: 0x701e,
        },
      })
    );
    return { root, source, hex };
  }

  const validD8 = JSON.stringify({
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
    files: {},
  });

  const success = (d8 = validD8): NucleusBuildResult => ({
    success: true,
    artifacts: {
      nobj: new Uint8Array(Buffer.from('NOBJ')),
      hex: ':00000001FF\n',
      d8: [{ bank: 0, map: {} as never, json: d8 }],
    },
    materialized: {} as never,
    instructions: 10,
    cycles: 100,
  });

  const compiler = (result: NucleusBuildResult): NucleusCompilerApi => ({
    build: vi.fn(() => Promise.resolve(result)),
  });

  it('builds NOBJ, HEX and D8 through the in-process package API', async () => {
    const project = workspace();
    const api = compiler(success());
    const result = await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect(api.build).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.objectContaining({ name: 'main.nu' })],
        artifacts: { hex: true, d8: true },
      })
    );
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.nobj'), 'utf8')).toBe('NOBJ');
    expect(fs.readFileSync(project.hex, 'utf8')).toBe(':00000001FF\n');
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.d8.json'), 'utf8')).toContain(
      'd8-debug-map'
    );
  });

  it('executes the authoritative Z80 compiler in process', async () => {
    const project = workspace();
    const result = await new NucleusBackend().assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });
    expect(result.success).toBe(true);
    expect(fs.statSync(project.hex).size).toBeGreaterThan(0);
    expect(fs.statSync(path.join(project.root, 'build', 'main.nobj')).size).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.d8.json'), 'utf8')).toContain(
      'd8-debug-map'
    );
  }, 30_000);

  it('uses a conventional project file for ordered multipart source', async () => {
    const project = workspace();
    fs.writeFileSync(path.join(project.root, 'model.nu'), 'const answer = 42\n');
    fs.writeFileSync(
      path.join(project.root, 'nucleus-project.json'),
      JSON.stringify({
        schema: 'nucleus-project/v1',
        sources: ['model.nu', 'main.nu'],
        target: 'nucleus-target.json',
        outputs: { nobj: 'ignored.nobj' },
      })
    );
    const api = compiler(success());
    await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });
    expect(api.build).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({ name: 'model.nu' }),
          expect.objectContaining({ name: 'main.nu' }),
        ],
      })
    );
  });

  it('discovers project-v2 imports through the standalone host API', async () => {
    const project = workspace();
    fs.writeFileSync(path.join(project.root, 'model.nu'), 'const answer = 42\n');
    fs.writeFileSync(project.source, '//% import "model.nu"\nsub main()\nend\n');
    fs.writeFileSync(
      path.join(project.root, 'nucleus-project.json'),
      JSON.stringify({
        schema: 'nucleus-project/v2',
        entry: 'main.nu',
        target: 'nucleus-target.json',
        outputs: { nobj: 'ignored.nobj' },
      })
    );
    const api = compiler(success());

    await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(api.build).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({ name: 'model.nu' }),
          expect.objectContaining({ name: 'main.nu' }),
        ],
      })
    );
  });

  it('produces identical artifacts from explicit and discovered source order', async () => {
    const project = workspace();
    fs.writeFileSync(path.join(project.root, 'model.nu'), 'const answer = 42\n');
    fs.writeFileSync(
      project.source,
      '//% import "model.nu"\nvar result as u8\nsub main()\nresult = answer\nend\n'
    );
    const projectPath = path.join(project.root, 'nucleus-project.json');
    fs.writeFileSync(
      projectPath,
      JSON.stringify({
        schema: 'nucleus-project/v1',
        sources: ['model.nu', 'main.nu'],
        target: 'nucleus-target.json',
        outputs: { nobj: 'ignored.nobj' },
      })
    );
    const explicitHex = path.join(project.root, 'build', 'explicit.hex');
    const discoveredHex = path.join(project.root, 'build', 'discovered.hex');

    const explicit = await new NucleusBackend().assemble({
      asmPath: project.source,
      hexPath: explicitHex,
      sourceRoot: project.root,
    });
    fs.writeFileSync(
      projectPath,
      JSON.stringify({
        schema: 'nucleus-project/v2',
        entry: 'main.nu',
        target: 'nucleus-target.json',
        outputs: { nobj: 'ignored.nobj' },
      })
    );
    const discovered = await new NucleusBackend().assemble({
      asmPath: project.source,
      hexPath: discoveredHex,
      sourceRoot: project.root,
    });

    expect(explicit.success).toBe(true);
    expect(discovered.success).toBe(true);
    expect(fs.readFileSync(discoveredHex)).toEqual(fs.readFileSync(explicitHex));
    expect(fs.readFileSync(discoveredHex.replace(/\.hex$/, '.nobj'))).toEqual(
      fs.readFileSync(explicitHex.replace(/\.hex$/, '.nobj'))
    );
    expect(fs.readFileSync(discoveredHex.replace(/\.hex$/, '.d8.json'))).toEqual(
      fs.readFileSync(explicitHex.replace(/\.hex$/, '.d8.json'))
    );
  });

  it('refuses to launch without a target profile', async () => {
    const project = workspace();
    fs.unlinkSync(path.join(project.root, 'nucleus-target.json'));
    const api = compiler(success());

    const result = await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Nucleus target profile not found'),
    });
    expect(api.build).not.toHaveBeenCalled();
  });

  it('rejects banked profiles before requesting a flat launch artifact', async () => {
    const project = workspace();
    const targetProfile = path.join(project.root, 'nucleus-target.json');
    const profile = JSON.parse(fs.readFileSync(targetProfile, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(
      targetProfile,
      JSON.stringify({ ...profile, bankCount: 2, entryBank: 0, partBanks: [0] })
    );
    const api = compiler(success());

    const result = await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('requires a flat target'),
    });
    expect(result.error).toContain('standalone Nucleus API or CLI');
    expect(api.build).not.toHaveBeenCalled();
  });

  it('rejects malformed D8 and retains the last complete generation', async () => {
    const project = workspace();
    fs.mkdirSync(path.dirname(project.hex), { recursive: true });
    const nobj = path.join(project.root, 'build', 'main.nobj');
    const d8 = path.join(project.root, 'build', 'main.d8.json');
    fs.writeFileSync(project.hex, 'PREVIOUS HEX');
    fs.writeFileSync(nobj, 'PREVIOUS NOBJ');
    fs.writeFileSync(d8, validD8);

    const result = await new NucleusBackend(compiler(success('{bad json'))).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('invalid D8 artifact'),
    });
    expect(fs.readFileSync(project.hex, 'utf8')).toBe('PREVIOUS HEX');
    expect(fs.readFileSync(nobj, 'utf8')).toBe('PREVIOUS NOBJ');
    expect(fs.readFileSync(d8, 'utf8')).toBe(validD8);
  });

  it('translates an exact structured Nucleus source diagnostic', async () => {
    const project = workspace();
    const result = await new NucleusBackend(
      compiler({
        success: false,
        kind: 'source',
        message: 'failure handling is invalid in this context',
        diagnostic: {
          code: 87,
          sourcePart: 1,
          sourceName: 'main.nu',
          offset: 4,
          line: 1,
          column: 5,
        },
        instructions: 8,
        cycles: 80,
      })
    ).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      diagnostic: {
        path: project.source,
        line: 1,
        column: 5,
        message: 'failure handling is invalid in this context [N87]',
        sourceLine: 'sub main()',
      },
    });
  });
});
