import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NucleusBackend, type NucleusCommandRunner } from '../../src/debug/launch/nucleus-backend';

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

  it('requests canonical NOBJ and launchable HEX from the standalone compiler', async () => {
    const project = workspace();
    const run = vi.fn<NucleusCommandRunner>((_command, args) => {
      const output = args[args.indexOf('-o') + 1];
      const hexOutput = args[args.indexOf('--hex-output') + 1];
      const d8Output = args[args.indexOf('--d8-output') + 1];
      fs.writeFileSync(output ?? '', 'NOBJ');
      fs.writeFileSync(hexOutput ?? '', ':00000001FF\n');
      fs.writeFileSync(d8Output ?? '', validD8);
      return Promise.resolve({ exitCode: 0, stdout: 'compiled\n', stderr: '' });
    });
    const result = await new NucleusBackend(run, '/tool/nucleus').assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect(run).toHaveBeenCalledWith(
      '/tool/nucleus',
      expect.arrayContaining([
        'build',
        '-o',
        '--hex-output',
        '--d8-output',
        '--target-profile',
        path.join(project.root, 'nucleus-target.json'),
        project.source,
      ]),
      project.root,
      undefined
    );
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.nobj'), 'utf8')).toBe('NOBJ');
    expect(fs.readFileSync(project.hex, 'utf8')).toBe(':00000001FF\n');
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.d8.json'), 'utf8')).toContain(
      'd8-debug-map'
    );
  });

  it('refuses to launch a synthetic target without real service destinations', async () => {
    const project = workspace();
    fs.unlinkSync(path.join(project.root, 'nucleus-target.json'));
    const run = vi.fn<NucleusCommandRunner>();

    const result = await new NucleusBackend(run).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Nucleus target profile not found'),
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects banked profiles before requesting an impossible flat HEX launch artifact', async () => {
    const project = workspace();
    const targetProfile = path.join(project.root, 'nucleus-target.json');
    const profile = JSON.parse(fs.readFileSync(targetProfile, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(targetProfile, JSON.stringify({ ...profile, bankCount: 2, entryBank: 0 }));
    const run = vi.fn<NucleusCommandRunner>();

    const result = await new NucleusBackend(run).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('requires a flat target'),
    });
    expect(result.error).toContain('standalone Nucleus CLI');
    expect(run).not.toHaveBeenCalled();
  });

  it('does not accept stale final artifacts as output from a successful command', async () => {
    const project = workspace();
    fs.mkdirSync(path.dirname(project.hex), { recursive: true });
    fs.writeFileSync(project.hex, 'STALE HEX');
    fs.writeFileSync(path.join(project.root, 'build', 'main.nobj'), 'STALE NOBJ');
    const run: NucleusCommandRunner = () =>
      Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });

    const result = await new NucleusBackend(run).assemble({
      asmPath: project.source,
      hexPath: project.hex,
    });

    expect(result).toMatchObject({
      success: false,
      error:
        'Nucleus compiler succeeded without producing nonempty fresh NOBJ, Intel HEX and D8 artifacts',
    });
    expect(fs.readFileSync(project.hex, 'utf8')).toBe('STALE HEX');
    expect(fs.readFileSync(path.join(project.root, 'build', 'main.nobj'), 'utf8')).toBe(
      'STALE NOBJ'
    );
  });

  it('rejects empty fresh artifacts and retains the last complete generation', async () => {
    const project = workspace();
    fs.mkdirSync(path.dirname(project.hex), { recursive: true });
    const nobj = path.join(project.root, 'build', 'main.nobj');
    const d8 = path.join(project.root, 'build', 'main.d8.json');
    fs.writeFileSync(project.hex, 'PREVIOUS HEX');
    fs.writeFileSync(nobj, 'PREVIOUS NOBJ');
    fs.writeFileSync(d8, 'PREVIOUS D8');
    const run: NucleusCommandRunner = (_command, args) => {
      fs.writeFileSync(args[args.indexOf('-o') + 1] ?? '', '');
      fs.writeFileSync(args[args.indexOf('--hex-output') + 1] ?? '', '');
      fs.writeFileSync(args[args.indexOf('--d8-output') + 1] ?? '', '');
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };

    const result = await new NucleusBackend(run).assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(false);
    expect(fs.readFileSync(project.hex, 'utf8')).toBe('PREVIOUS HEX');
    expect(fs.readFileSync(nobj, 'utf8')).toBe('PREVIOUS NOBJ');
    expect(fs.readFileSync(d8, 'utf8')).toBe('PREVIOUS D8');
    expect(fs.readdirSync(path.dirname(project.hex)).sort()).toEqual([
      'main.d8.json',
      'main.hex',
      'main.nobj',
    ]);
  });

  it('rejects malformed D8 through the normal validator and retains the last generation', async () => {
    const project = workspace();
    fs.mkdirSync(path.dirname(project.hex), { recursive: true });
    const nobj = path.join(project.root, 'build', 'main.nobj');
    const d8 = path.join(project.root, 'build', 'main.d8.json');
    fs.writeFileSync(project.hex, 'PREVIOUS HEX');
    fs.writeFileSync(nobj, 'PREVIOUS NOBJ');
    fs.writeFileSync(d8, validD8);
    const run: NucleusCommandRunner = (_command, args) => {
      fs.writeFileSync(args[args.indexOf('-o') + 1] ?? '', 'NOBJ');
      fs.writeFileSync(args[args.indexOf('--hex-output') + 1] ?? '', ':00000001FF\n');
      fs.writeFileSync(args[args.indexOf('--d8-output') + 1] ?? '', '{bad json');
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };

    const result = await new NucleusBackend(run).assemble({
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

  it('translates an exact Nucleus source diagnostic', async () => {
    const project = workspace();
    const run: NucleusCommandRunner = () =>
      Promise.resolve({
        exitCode: 1,
        stdout: '',
        stderr: `${project.source}:1:5: Nucleus diagnostic 87\n`,
      });
    const result = await new NucleusBackend(run).assemble({
      asmPath: project.source,
      hexPath: project.hex,
    });

    expect(result).toMatchObject({
      success: false,
      diagnostic: {
        path: project.source,
        line: 1,
        column: 5,
        message: 'Nucleus diagnostic 87',
        sourceLine: 'sub main()',
      },
    });
  });
});
