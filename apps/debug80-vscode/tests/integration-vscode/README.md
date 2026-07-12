# VS Code Extension Host Smoke Tests

Run with:

```sh
npm run test:vscode
```

The suite launches a real VS Code Extension Development Host with the fixture workspace in `fixtures/vscode-smoke`, activates the Debug80 extension, verifies core commands are registered, and checks that VS Code can see the workspace folder.

On Linux CI, run the command under `xvfb-run` unless the runner already provides a display:

```sh
xvfb-run -a npm run test:vscode
```
