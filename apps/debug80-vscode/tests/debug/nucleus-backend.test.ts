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
    return { root, source, hex };
  }

  it('requests canonical NOBJ and launchable HEX from the standalone compiler', async () => {
    const project = workspace();
    const run = vi.fn<NucleusCommandRunner>(async (_command, args) => {
      const output = args[args.indexOf('-o') + 1];
      const hexOutput = args[args.indexOf('--hex-output') + 1];
      fs.writeFileSync(output ?? '', 'NOBJ');
      fs.writeFileSync(hexOutput ?? '', ':00000001FF\n');
      return { exitCode: 0, stdout: 'compiled\n', stderr: '' };
    });
    const result = await new NucleusBackend(run, '/tool/nucleus').assemble({
      asmPath: project.source,
      hexPath: project.hex,
      sourceRoot: project.root,
    });

    expect(result.success).toBe(true);
    expect(run).toHaveBeenCalledWith(
      '/tool/nucleus',
      [
        'build',
        '-o',
        path.join(project.root, 'build', 'main.nobj'),
        '--hex-output',
        project.hex,
        project.source,
      ],
      project.root,
      undefined
    );
  });

  it('translates an exact Nucleus source diagnostic', async () => {
    const project = workspace();
    const run: NucleusCommandRunner = async () => ({
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
