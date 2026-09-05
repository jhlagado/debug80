import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runTests } from '@vscode/test-electron';

const directory = path.dirname(fileURLToPath(import.meta.url));
const vscodeVersion = process.env.DEBUG80_VSCODE_TEST_VERSION ?? '1.134.0';

async function main() {
  const extensionDevelopmentPath = path.resolve(directory, '../..');
  const extensionTestsPath = path.resolve(directory, 'suite/index.js');
  // Keep Darwin's IPC socket path below its 103-character limit.
  const temporary = await mkdtemp(path.join(tmpdir(), 'd80-'));
  try {
    const extensions = path.join(temporary, 'extensions');
    const profile = path.join(temporary, 'user-data');
    const workspace = path.join(temporary, 'vscode-smoke');
    const completion = path.join(temporary, 'suite-completed');
    const runner = path.join(temporary, 'suite.mjs');
    await Promise.all([mkdir(extensions), mkdir(profile)]);
    await cp(path.join(directory, 'fixtures/vscode-smoke'), workspace, { recursive: true });
    // A successful process exit alone does not prove the suite ran.
    await writeFile(
      runner,
      [
        "import { writeFile } from 'node:fs/promises';",
        `import { run as runSuite } from ${JSON.stringify(pathToFileURL(extensionTestsPath).href)};`,
        'export async function run() {',
        '  await runSuite();',
        `  await writeFile(${JSON.stringify(completion)}, 'passed');`,
        '}',
        '',
      ].join('\n')
    );
    await runTests({
      version: vscodeVersion,
      extensionDevelopmentPath,
      extensionTestsPath: runner,
      launchArgs: [
        workspace,
        '--user-data-dir',
        profile,
        '--extensions-dir',
        extensions,
        '--disable-extensions',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
      ],
    });
    assert.equal(await readFile(completion, 'utf8'), 'passed');
    console.log(
      'Development VS Code acceptance passed: project and CP/M pipeline assertions completed'
    );
  } catch (error) {
    console.error(`Development VS Code test failed; private test directory retained: ${temporary}`);
    console.error(`VS Code logs: ${path.join(temporary, 'user-data', 'logs')}`);
    throw error;
  }
  await rm(temporary, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
