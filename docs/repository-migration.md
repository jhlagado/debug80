# Repository Migration

Debug80 is being reduced from a general toolchain monorepo to the Debug80 IDE
and the packages that still require coordinated releases with it. This change
does not rewrite or discard package history.

## Extracted repositories

The following local repositories were produced with `git subtree split`, so
their histories contain the commits that changed their former package paths:

| Project | Local repository | Extracted commit | State |
| --- | --- | --- | --- |
| Debug80 Runtime | `/Users/johnhardy/projects/debug80-runtime` | `6b3deccd6902cf4efe3997393730ba32dea0188a` | Independently installs and passes `npm run check`; version prepared as 0.3.0 |
| Z80 Tool Services | `/Users/johnhardy/projects/z80-tool-services` | `c714d483f2d918652de2e1844ba2104124e82212` | Independently installs and passes `npm run check`; version remains 0.1.0 |
| Atom | `/Users/johnhardy/projects/atom` | `737dc28e03c27f4a344fe52a98444e72a4b39f11` | Existing standalone history fast-forwarded to the Debug80 package state |
| Glimmer | `/Users/johnhardy/projects/glimmer` | `f4e3ca3e104846d4663c0743de56b34f1d51d770` | Current Debug80-owned source preserved separately before removal |

The existing `/Users/johnhardy/projects/glimmer-old` checkout has independent
commits and uncommitted documentation. The extraction did not modify it or
combine the two histories.

## Current Debug80 boundary

Debug80 no longer contains or ships the Glimmer compiler, language grammar,
launch backend, target discovery rules, or headless integration workspace.
Historical changelog entries may still describe releases that included
Glimmer.

The Debug80 workspace still contains Atom and Debug80 Runtime as temporary
release bridges. Removing either copy now would lose tested behaviour:

- `@jhlagado/debug80-runtime@0.2.0` does not contain the current CP/M platform
  types and modules used by Debug80.
- `atom-z80@0.2.0` rejects source emitted by the current Nucleus integration,
  and its packed manifest retains local `file:` dependency declarations.

The next Runtime release must publish the extracted 0.3.0 package. The next
Atom release must pass its standalone gate and the Debug80 Nucleus backend
test. Debug80 can then replace the two workspace dependencies with versioned
package dependencies and remove the bridge directories.

AZM, Nucleus, and Z80 Tool Services remain workspace packages for now. Nucleus
has active, divergent work in its standalone repository, so its histories need
an explicit reconciliation before Debug80 removes the workspace copy.

## Verification rule

Every removal follows the same order:

1. extract or reconcile the package history;
2. run the package outside Debug80;
3. publish an immutable version;
4. install that version in a clean Debug80 checkout;
5. pass the Debug80 type, unit, packaging, and extension tests;
6. remove the workspace copy.

This order keeps a clean clone buildable at every committed stage.
