import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests } from '@vscode/test-electron';

const directory = path.dirname(fileURLToPath(import.meta.url));
const vscodeVersion = process.env.DEBUG80_VSCODE_TEST_VERSION ?? '1.134.0';

async function main() {
  const extensionDevelopmentPath = path.resolve(directory, '../..');
  const extensionTestsPath = path.resolve(directory, 'suite/index.js');
  const fixtureWorkspace = path.resolve(directory, 'fixtures/vscode-smoke');

  await runTests({
    version: vscodeVersion,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      fixtureWorkspace,
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
