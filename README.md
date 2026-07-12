# Debug80 Toolchain

This repository contains the independently versioned tools that make up the
Debug80 Z80 development environment.

## Workspace

- `packages/azm`: the AZM Z80 assembler and typed assembly language;
- `packages/glimmer`: the Glimmer reactive game preprocessor;
- `packages/debug80-runtime`: the reusable Z80 and platform runtime;
- `apps/debug80-vscode`: the Debug80 Visual Studio Code extension.

The repository uses npm workspaces so changes can be tested through the whole
toolchain without publishing intermediate package versions.

```sh
npm install
npm run build
npm run check
```

Each library keeps its own version and is published independently. Debug80 is
packaged as a VS Code extension.

## Debugging Debug80

Open the monorepo root in VS Code, select **Run and Debug**, choose
**Debug80 Extension**, and press F5. The committed launch configuration builds
the extension, starts an Extension Development Host from
`apps/debug80-vscode`, and opens the simple test project. Breakpoints in the
extension, debug adapter, and platform provider TypeScript sources map through
the bundled source map.

To exercise an adapter breakpoint, set it in the original window, for example
in `apps/debug80-vscode/src/debug/adapter.ts`. After the Extension Development
Host opens, select **Debug80 E2E (Simple)** in that second window and press F5
there. Debug80 runs the adapter inline in the extension host, so the original
window stops at both extension and adapter breakpoints; there is no separate
adapter process to attach to.

Choose **Debug80 Extension (performance diagnostics)** to run the same host
with `DEBUG80_PERF=1`. After changing extension or webview code, restart the
debug session so the pre-launch build regenerates both bundles.

## Architecture

The dependency direction is acyclic:

```text
AZM <- Glimmer <- Debug80
          ^          ^
          |          |
      integration  Debug80 Runtime
          |          ^
          +----------+
```

`@jhlagado/debug80-runtime` has no AZM, Glimmer, Debug Adapter Protocol or VS
Code dependency. It owns the Z80 and TEC runtime implementations and exposes
the stable ESM runner API at `@jhlagado/debug80-runtime/headless`. Private
integration workspaces compose AZM or Glimmer with the runtime without making
the production packages depend on each other.

All repository-owned JavaScript output and tooling is ESM. Debug80 requires VS
Code 1.100 or newer, the first extension-host release with supported ESM
loading, and ships as a bundled ESM extension without `node_modules`.
