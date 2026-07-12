# Repository Migration

The Debug80 Toolchain repository starts a new public Debug80 history while
retaining the useful AZM and Glimmer histories.

## Provenance

- AZM was imported under `packages/azm` with its main-line history.
- Glimmer was imported under `packages/glimmer` with its main-line history.
- Debug80 was imported under `apps/debug80-vscode` as one tracked-tree snapshot
  of commit `5e90358ca889b2cdeb95dfbb900d82db6cb52f46`.
- No commit from the previous Debug80 repository is reachable from this
  repository.

Ignored VSIX files, `node_modules`, agent state and the untracked `$CODEX_HOME`
directory were not imported. Debug80 release packages are rebuilt from source.

## Release Identity

Package-qualified tags prevent collisions:

```text
azm-v0.3.4
glimmer-v0.5.3
debug80-runtime-v0.1.0
debug80-v0.2.0
```

AZM, Glimmer and Debug80 Runtime remain independently published npm packages.
Debug80 remains a VS Code Marketplace extension.
