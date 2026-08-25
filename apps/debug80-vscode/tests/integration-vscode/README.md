# VS Code Extension Host Smoke Tests

Run with:

```sh
npm run test:vscode
```

The suite launches a real VS Code Extension Development Host with the fixture
workspace in `fixtures/vscode-smoke`, activates the Debug80 extension, verifies
core commands are registered, and drives the project command layer.

It also creates a clean CP/M 2.2 project, boots the guest to `A>`, stops at the
source-mapped BIOS `ConsoleOutput` routine, runs `DIR`, `TYPE README.TXT`, and
`SMOKE`, and proves `TYPE RESULT.TXT` after the warm boot. The exact terminal
transcript is retained in `expected/cpm22-transcript.json`.

The default test version is pinned in `runTest.js`. Set
`DEBUG80_VSCODE_TEST_VERSION` to exercise another VS Code release.

On Linux CI, run the command under `xvfb-run` unless the runner already provides a display:

```sh
xvfb-run -a npm run test:vscode
```

The extension CI job runs this command under Node.js 22, the minimum supported
version of the current `@vscode/test-electron` runner.
