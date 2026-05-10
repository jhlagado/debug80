const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, 'suite');
  const fixtureWorkspace = path.resolve(__dirname, 'fixtures/vscode-smoke');

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
