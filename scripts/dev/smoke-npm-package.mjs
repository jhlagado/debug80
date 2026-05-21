import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.stdio ?? 'pipe',
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          [
            `${command} ${args.join(' ')} failed with exit code ${code}`,
            stdout.trim(),
            stderr.trim(),
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      );
    });
  });
}

const workDir = await mkdtemp(join(tmpdir(), 'azm-package-smoke-'));

try {
  const packDir = join(workDir, 'pack');
  const installDir = join(workDir, 'install');
  await run('mkdir', ['-p', packDir, installDir]);

  const pack = await run('npm', ['pack', '--pack-destination', packDir], { cwd: repoRoot });
  const tarballName = pack.stdout.trim().split(/\r?\n/).at(-1);
  if (!tarballName) throw new Error('npm pack did not report a tarball name');
  const tarball = join(packDir, basename(tarballName));

  await run('npm', ['init', '-y'], { cwd: installDir });
  await run('npm', ['install', tarball], { cwd: installDir });

  const asmPath = join(installDir, 'smoke.asm');
  await writeFile(
    asmPath,
    ['        .org 0100H', 'START:', '        ld a,42', '        ret', ''].join('\n'),
    'utf8',
  );

  const version = await run('npx', ['azm', '--version'], { cwd: installDir });
  const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  if (version.stdout.trim() !== pkg.version) {
    throw new Error(`npx azm --version returned ${version.stdout.trim()}, expected ${pkg.version}`);
  }

  await run('npx', ['azm', '--type', 'bin', '--output', 'smoke.bin', 'smoke.asm'], {
    cwd: installDir,
  });

  await run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        "import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';",
        "import { loadProgram } from '@jhlagado/azm/tooling';",
        "const loaded = await loadProgram({ entryFile: './smoke.asm' });",
        "if (!loaded.loadedProgram) throw new Error('loadProgram failed');",
        "const result = await compile('./smoke.asm', { outputType: 'bin', emitBin: true, emitHex: false, emitD8m: false, emitListing: false }, { formats: defaultFormatWriters });",
        "if (result.diagnostics.length) throw new Error(result.diagnostics.map((d) => d.message).join('\\n'));",
        "if (!result.artifacts.some((artifact) => artifact.kind === 'bin')) throw new Error('missing bin artifact');",
      ].join('\n'),
    ],
    { cwd: installDir },
  );

  console.log(`package smoke passed: ${tarball}`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
