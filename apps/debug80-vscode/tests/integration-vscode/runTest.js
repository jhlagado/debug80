import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests } from '@vscode/test-electron';

const directory = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const extensionDevelopmentPath = path.resolve(directory, '../..');
  const extensionTestsPath = path.resolve(directory, 'suite/index.js');
  const fixtureWorkspace = path.resolve(directory, 'fixtures/vscode-smoke');

  await runTests({
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
