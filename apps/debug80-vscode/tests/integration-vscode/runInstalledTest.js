import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';

const directory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(directory, '../..');

async function main() {
  const manifest = JSON.parse(await readFile(path.join(extensionRoot, 'package.json'), 'utf8'));
  const vsix = await realpath(
    process.argv[2] ?? path.join(extensionRoot, `debug80-${manifest.version}.vsix`)
  );
  // Keep Darwin's IPC socket path below its 103-character limit.
  const temporary = await mkdtemp(path.join(tmpdir(), 'd80-'));
  try {
    const extensions = path.join(temporary, 'extensions');
    const profile = path.join(temporary, 'user-data');
    const harness = path.join(temporary, 'test-harness');
    const workspace = path.join(temporary, 'vscode-smoke');
    await Promise.all([mkdir(extensions), mkdir(profile), mkdir(harness)]);
    await cp(path.join(directory, 'fixtures/vscode-smoke'), workspace, { recursive: true });
    await writeFile(
      path.join(harness, 'package.json'),
      JSON.stringify({
        name: 'installed-vsix-test-harness',
        publisher: 'debug80-tests',
        version: '0.0.1',
        engines: { vscode: '^1.134.0' },
      })
    );
    const executable = await downloadAndUnzipVSCode({
      version: '1.134.0',
      cachePath: path.join(extensionRoot, '.vscode-test'),
    });
    // Explicit private directories accompany both CLI installation and test launch.
    const isolation = ['--user-data-dir', profile, '--extensions-dir', extensions];
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, {
      reuseMachineInstall: true,
    });
    const installed = spawnSync(
      cli,
      [...cliArgs, ...isolation, '--install-extension', vsix, '--force'],
      {
        encoding: 'utf8',
        shell: process.platform === 'win32',
        timeout: 120000,
      }
    );
    assert.equal(
      installed.status,
      0,
      `VSIX installation failed: ${installed.error ?? ''}\n${installed.stdout}\n${installed.stderr}`
    );
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath: harness,
      extensionTestsPath: path.join(directory, 'suite/index.js'),
      extensionTestsEnv: { DEBUG80_INSTALLED_EXTENSIONS_DIR: extensions },
      launchArgs: [
        workspace,
        ...isolation,
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
      ],
    });
    console.log(`Installed VSIX acceptance passed: ${vsix}`);
  } catch (error) {
    console.error(`Installed VSIX test failed; private test directory retained: ${temporary}`);
    console.error(`VS Code logs: ${path.join(temporary, 'user-data', 'logs')}`);
    throw error;
  }
  await rm(temporary, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
