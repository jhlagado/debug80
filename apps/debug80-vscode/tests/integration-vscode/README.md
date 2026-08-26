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
`SMOKE`, and proves `TYPE RESULT.TXT` after the warm boot. Native Atom is then
exercised with its default, named single-source, 16.5 KiB single-source, and
66,000-byte multipart commands; every resulting COM is executed in the guest.
The exact terminal transcript is retained in
`expected/cpm22-transcript.json`.

The default test version is pinned in `runTest.js`. Set
`DEBUG80_VSCODE_TEST_VERSION` to exercise another VS Code release.

The CP/M pipeline also opens the real Debug80 terminal panel and runs the
bundled full-screen editor. It waits for the initial source and reverse-video
status sequence, performs a forward search and literal replacement, sends
insertion, Backspace, arrow, Delete, Ctrl-S, and Ctrl-Q input through the active
debug session, then uses guest `TYPE INPUT.NU` to verify the saved bytes. The
terminal webview's raw control-key mapping is covered separately by its DOM
regression test.

On Linux CI, run the command under `xvfb-run` unless the runner already provides a display:

```sh
xvfb-run -a npm run test:vscode
```

The extension CI job runs this command under Node.js 22, the minimum supported
version of the current `@vscode/test-electron` runner.
