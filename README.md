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
the headless verification session. The private integration workspace composes
Glimmer and the runtime without making either production package depend on the
other.

All repository-owned JavaScript output and tooling is ESM. Debug80 requires VS
Code 1.100 or newer, the first extension-host release with supported ESM
loading, and ships as a bundled ESM extension without `node_modules`.
