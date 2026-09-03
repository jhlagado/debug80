import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  NUCLEUS_FLAT_TARGET_PUBLICATION_DESCRIPTOR,
  NUCLEUS_TARGET_PUBLICATION_SCHEMA,
  type NucleusPreparedSourceArtifactBuild,
} from '@jhlagado/nucleus';
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

  function workspace(): { root: string; source: string; hex: string; target: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-nucleus-'));
    temporaryDirectories.push(root);
    const source = path.join(root, 'main.nu');
    const hex = path.join(root, 'build', 'main.hex');
    const target = path.join(root, 'nucleus-target.json');
    fs.writeFileSync(
      source,
      [
        'var value as u16 = 3',
        'var cleared as u8',
        'sub main()',
        'value = value * 2',
        'end',
        '',
      ].join('\n')
    );
    fs.writeFileSync(
      target,
      JSON.stringify(
        {
          schema: NUCLEUS_TARGET_PUBLICATION_SCHEMA,
          ...NUCLEUS_FLAT_TARGET_PUBLICATION_DESCRIPTOR,
        },
        null,
        2
      )
    );
    return { root, source, hex, target };
  }

  const validD8 = JSON.stringify({
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
    files: {},
  });

  const success = (d8 = validD8): NucleusPreparedSourceArtifactBuild =>
    ({
      publication: {
        root: '',
        entry: 'main.nu',
        compilerManifest: '',
        assembler: 'atom',
        sourceParts: 1,
        sourcePartIdentities: ['main.nu'],
        sourceBytes: 15,
      },
      artifacts: {
        nobj: new Uint8Array(Buffer.from('NOBJ')),
        bin: new Uint8Array(Buffer.from('BIN')),
        hex: ':00000001FF\n',
        d8,
      },
    }) as NucleusPreparedSourceArtifactBuild;

  const compiler = (result: NucleusPreparedSourceArtifactBuild): NucleusCompilerApi => ({
    buildPreparedSourceArtifacts: vi.fn(() => Promise.resolve(result)),
  });

  it('builds NOBJ, HEX and D8 through the prepared source artifact API', async () => {
    const project = workspace();
    const api = compiler(success());
    const result = await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect(api.buildPreparedSourceArtifacts).toHaveBeenCalledWith({
      root: project.root,
      entry: 'main.nu',
      targetFile: project.target,
    });
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.nobj'), 'utf8')).toBe('NOBJ');
    expect(fs.readFileSync(project.hex, 'utf8')).toBe(':00000001FF\n');
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.d8.json'), 'utf8')).toContain(
      'd8-debug-map'
    );
  });

  it('publishes positive output paths while retaining required Debug80 HEX and D8 artifacts', async () => {
    const project = workspace();
    const api = compiler(success());
    const outputs = [
      path.join(project.root, 'out', 'program.nobj'),
      path.join(project.root, 'out', 'program.bin'),
      path.join(project.root, 'maps', 'program.d8.json'),
    ];
    const result = await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      outputPaths: outputs,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(outputs[0], 'utf8')).toBe('NOBJ');
    expect(fs.readFileSync(outputs[1], 'utf8')).toBe('BIN');
    expect(fs.readFileSync(outputs[2], 'utf8')).toContain('d8-debug-map');
    expect(fs.readFileSync(project.hex, 'utf8')).toBe(':00000001FF\n');
  });

  it('executes the in-repo Nucleus package in process', async () => {
    const project = workspace();
    const result = await new NucleusBackend().assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });
    expect(result.success, result.error).toBe(true);
    expect(fs.statSync(project.hex).size).toBeGreaterThan(0);
    expect(fs.statSync(path.join(project.root, 'build', 'main.nobj')).size).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.d8.json'), 'utf8')).toContain(
      'd8-debug-map'
    );
  }, 60_000);

  it('uses a conventional project file for the entry source only', async () => {
    const project = workspace();
    fs.writeFileSync(
      path.join(project.root, 'nucleus-project.json'),
      JSON.stringify({
        schema: 'nucleus-project/v2',
        entry: 'main.nu',
        target: 'nucleus-target.json',
      })
    );
    const api = compiler(success());
    await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });
    expect(api.buildPreparedSourceArtifacts).toHaveBeenCalledWith({
      root: project.root,
      entry: 'main.nu',
      targetFile: project.target,
    });
  });

  it('rejects old source-list project files instead of treating them as ordered manifests', async () => {
    const project = workspace();
    fs.writeFileSync(
      path.join(project.root, 'nucleus-project.json'),
      JSON.stringify({
        schema: 'nucleus-project/v1',
        sources: ['model.nu', 'main.nu'],
        target: 'nucleus-target.json',
      })
    );
    const api = compiler(success());
    const result = await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining(
        'source ordering now comes from leading //% import directives'
      ),
    });
    expect(api.buildPreparedSourceArtifacts).not.toHaveBeenCalled();
  });

  it('refuses to launch without a target descriptor', async () => {
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
      error: expect.stringContaining('Nucleus target descriptor not found'),
    });
    expect(api.buildPreparedSourceArtifacts).not.toHaveBeenCalled();
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

  it('reports prepared source build failures', async () => {
    const project = workspace();
    const api: NucleusCompilerApi = {
      buildPreparedSourceArtifacts: vi.fn(() => Promise.reject(new Error('bad source'))),
    };
    const result = await new NucleusBackend(api).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      error: 'Nucleus build failed: bad source',
    });
  });
});
