import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import {
  exists,
  expectCliArtifacts,
  makeCliWorkDir,
  removeCliWorkDir,
  runCli,
  writeCliMainSource,
} from '../helpers/cli.js';

describe('cli artifacts', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('writes default sibling artifacts from -o output path', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outHex = join(work, 'out.hex');
    const res = await runCli(['-o', outHex, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outHex);

    await expectCliArtifacts(work, 'out', { hex: true, bin: true, 'd8.json': true, lst: true });

    await removeCliWorkDir(work);
  }, 20_000);

  it('uses entry stem as default primary output path when -o is omitted', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const res = await runCli([entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(join(work, 'main.hex'));

    await expectCliArtifacts(work, 'main', { hex: true, bin: true, 'd8.json': true, lst: true });

    await removeCliWorkDir(work);
  }, 20_000);

  it('uses flat AZM origin 0 when no ORG is provided', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outHex = join(work, 'out.hex');
    const res = await runCli(['-o', outHex, entry]);
    expect(res.code).toBe(0);

    const d8Path = join(work, 'out.d8.json');
    const d8Map = JSON.parse(await readFile(d8Path, 'utf8')) as {
      generator?: { entryAddress?: number; entrySymbol?: string };
      symbols?: Array<{ name: string; kind: string; address?: number }>;
    };
    expect(d8Map.generator?.entrySymbol).toBe('main');
    expect(d8Map.generator?.entryAddress).toBe(0x0000);
    expect(
      d8Map.symbols?.some((s) => s.name === 'main' && s.kind === 'label' && s.address === 0x0000),
    ).toBe(true);

    await removeCliWorkDir(work);
  }, 20_000);

  it('honors suppression flags', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--nobin', '--nod8m', '--nolist', '-o', outHex, entry]);
    expect(res.code).toBe(0);

    await expectCliArtifacts(work, 'out', { hex: true, bin: false, 'd8.json': false, lst: false });

    await removeCliWorkDir(work);
  }, 20_000);

  it('writes ASM80-compatible lowered source as .z80 when --asm80 is set', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--asm80', '--nobin', '--nod8m', '--nolist', '-o', outHex, entry]);
    expect(res.code).toBe(0);

    await expectCliArtifacts(work, 'out', { hex: true, z80: true, asm80: false });

    await removeCliWorkDir(work);
  }, 20_000);

  it('suppresses hex output for --type bin with --nohex', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outBin = join(work, 'out.bin');
    const res = await runCli([
      '--nohex',
      '--nod8m',
      '--nolist',
      '--type',
      'bin',
      '-o',
      outBin,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);

    await expectCliArtifacts(work, 'out', { bin: true, hex: false, 'd8.json': false, lst: false });

    await removeCliWorkDir(work);
  }, 20_000);

  it('rejects --type hex when --nohex is set', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--nohex', '--type', 'hex', '-o', outHex, entry]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--type hex requires HEX output to be enabled');

    await removeCliWorkDir(work);
  }, 20_000);

  it('prints the primary output path for --type bin', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const outBin = join(work, 'out.bin');
    const res = await runCli(['--type', 'bin', '-o', outBin, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);

    await expectCliArtifacts(work, 'out', { bin: true, hex: true });

    await removeCliWorkDir(work);
  }, 20_000);

  it('resolves imports from repeated -I include paths', async () => {
    const tmpRoot = join(__dirname, '..', 'tmp');
    const work = join(tmpRoot, 'cli-include');
    const includes = join(work, 'includes');
    const entry = join(work, 'main.asm');
    const outHex = join(work, 'out.hex');

    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(includes, { recursive: true });
    await writeFile(entry, ['.include "lib.inc"', 'main:', '    call helper', '    ret', ''].join('\n'), 'utf8');
    await writeFile(join(includes, 'lib.inc'), ['helper:', '    nop', '    ret', ''].join('\n'), 'utf8');

    const res = await runCli([
      '-I',
      includes,
      '-o',
      outHex,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outHex);
    expect(await exists(outHex)).toBe(true);

    await rm(tmpRoot, { recursive: true, force: true });
  }, 20_000);

  it('accepts equals-form long options for output/type/include', async () => {
    const tmpRoot = join(__dirname, '..', 'tmp');
    const work = join(tmpRoot, 'cli-equals');
    const includes = join(work, 'includes');
    const entry = join(work, 'main.asm');
    const outBin = join(work, 'out.bin');

    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(includes, { recursive: true });
    await writeFile(entry, ['.include "lib.inc"', 'main:', '    call helper', '    ret', ''].join('\n'), 'utf8');
    await writeFile(join(includes, 'lib.inc'), ['helper:', '    nop', '    ret', ''].join('\n'), 'utf8');

    const res = await runCli([
      `--include=${includes}`,
      '--type=bin',
      `--output=${outBin}`,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);
    expect(await exists(outBin)).toBe(true);
    expect(await exists(join(__dirname, '..', 'tmp', 'cli-equals', 'out.hex'))).toBe(true);

    await rm(tmpRoot, { recursive: true, force: true });
  }, 20_000);

  it('rejects entry when it is not the last argument', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const res = await runCli([entry, '--nolist']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('must be last');

    await removeCliWorkDir(work);
  }, 20_000);

  it('returns usage error for unknown options', async () => {
    const work = await makeCliWorkDir('azm-cli-');
    const entry = await writeCliMainSource(work);

    const res = await runCli(['--badflag', entry]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unknown option');

    await removeCliWorkDir(work);
  }, 20_000);
});
