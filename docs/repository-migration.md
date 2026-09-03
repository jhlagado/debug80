# Repository Migration

Debug80 is being reduced from a general toolchain monorepo to the Debug80 IDE
and the packages that still require coordinated releases with it. This change
does not rewrite or discard package history.

## Extracted repositories

The following repositories were produced with `git subtree split`, so
their histories contain the commits that changed their former package paths:

| Project           | Local repository                                    | Published or preserved revision            | State                                                                                                   |
| ----------------- | --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Debug80 Runtime   | `/Users/johnhardy/projects/debug80-runtime`         | `b7343aa8c38c248abbc6ee801b4af270d4843ad6` | Version 0.3.0; standalone package and Git-install proofs pass                                           |
| Z80 Tool Services | `/Users/johnhardy/projects/z80-tool-services`       | `feb8b4d152e15f980faced02c8ab39884ab5e0be` | Version 0.1.0; 98 tests, package proof, and standalone Linux CI pass                                    |
| Atom              | `/Users/johnhardy/projects/atom`                    | `27b32ad97ee0596d1952617261b644f8ccc389f9` | Version 0.3.0; 341 standalone tests plus CP/M asset export and offline package proofs pass              |
| Nucleus           | `/Users/johnhardy/projects/nucleus/.worktrees/main` | `6bd2723cb1b6e35f3e3796dbbfdcda9c320d40c6` | Version 0.3.0; Linux CI passes at code revision `384432a`; this revision updates Host API documentation |
| Glimmer           | `/Users/johnhardy/projects/glimmer`                 | `f4e3ca3e104846d4663c0743de56b34f1d51d770` | Current Debug80-owned source preserved separately before removal                                        |

The existing `/Users/johnhardy/projects/glimmer-old` checkout has independent
commits and uncommitted documentation. The extraction did not modify it or
combine the two histories.

Runtime and Tool Services now have public repositories:
[Debug80 Runtime](https://github.com/jhlagado/debug80-runtime) and
[Z80 Tool Services](https://github.com/jhlagado/z80-tool-services).
The prepared histories have also been fast-forwarded to the existing public
[Atom](https://github.com/jhlagado/atom) and
[Nucleus](https://github.com/jhlagado/nucleus) repositories. No force push was
used. Glimmer's extracted history remains local; its existing remote has not
been reconciled or changed by this migration.

Nucleus's installed host package depends on standalone Runtime. Its compiler
source proofs still use a development-only AZM build from a pinned Debug80
revision, because the npm AZM release lacks a required contract-checking rule.
The local suite passed 548 tests; isolated reruns of the four affected files
passed all nine tests after eliminating a shared-build race and allowing more
host assembly time. The byte-size assertions are unchanged. The final build
and published-runtime boundary check pass. The published correction also passed
Linux CI (run `33766279539`), as did the subsequent documentation revision
(run `33767171537`). Runtime and Tool Services passed their independent
Linux workflows (runs `33764302118` and `33765617549`).

## Debug80 boundary

Debug80 no longer contains or ships the Glimmer compiler, language grammar,
launch backend, target discovery rules, or headless integration workspace.
Historical changelog entries may still describe releases that included
Glimmer.

Debug80 keeps only the extension, AZM, and the AZM headless integration as npm
workspaces. The extension pins Runtime, Atom, Nucleus, and Z80 Tool Services to
reviewed Git commits. The Nucleus backend calls the standalone Host API and the
build copies Atom's native core and Nucleus's standard library into `out/`.
Development and packaged extensions therefore use the same resource layout;
compiler sources and proof trees are not extension resources.

The four former package directories have been removed from the tracked tree.
Their authoritative copies are published, and their former contents remain
recoverable from Git history. The lockfile installs public HTTPS Git revisions,
not sibling directories. AZM remains a workspace; separating its source-proof
release dependency is future work.

The real GitHub dependency install passes Debug80's maintained `npm run check`:
1,034 AZM tests, one headless integration test, 995 extension tests, and 293
webview tests. Two existing tests are skipped. CP/M acceptance checks pass with
the complete disk image byte-for-byte unchanged. The live VS Code project and
CP/M guest tests pass, and the staged VSIX smoke compiles with both installed
compilers, including a Nucleus standard-library import. These are host-software
proofs, not ESP32 hardware measurements.

The final clean-clone proof passed at Debug80 commit `8166329e`: `npm ci`,
`npm run check`, and `npm run package:verify -w debug80`, with none of the four
former package directories present and no tracked changes after the run. The
checkout was `/tmp/debug80-cutover.4oAs76/debug80`; installation ran with global
Git configuration disabled and terminal prompting disabled. The main checkout
also passed `npm run test:cpm22`, `npm run package:debug80`, and the final
`npm run test:vscode -w debug80` run. The rebuilt VSIX is
`apps/debug80-vscode/debug80-0.3.2.vsix` (93 files, 1.43 MB).

The four extracted public repositories are pushed. Debug80's final cutover is
committed locally; pushing that cutover still awaits authorization. The
remaining release work is to resolve the external-link failures below and
verify Debug80's Linux CI after its push.

The separate external-link check reports two existing upstream failures:
`https://www.cpm.z80.de/source.html` has a self-signed TLS certificate, and the
CI badge in the preserved CP/M upstream README returns HTTP 404. Local links
and the source-size enforcement check pass. The external-link failures still
affect the Debug80 CI documentation gate; no certificate checks were disabled
and no vendored provenance was altered to hide them.

`npm ci` also reports 22 dependency advisories (5 moderate, 15 high, 2 critical).
Dependency upgrades were not mixed into this behavior-preserving refactor;
their reachability and remediation need a separate audit.

## Verification rule

Every removal follows the same order:

1. extract or reconcile the package history;
2. run the package outside Debug80;
3. publish an immutable version or push an immutable Git revision;
4. install that version in a clean Debug80 checkout;
5. pass the Debug80 type, unit, packaging, and extension tests;
6. remove the workspace copy.

This order keeps a clean clone buildable at every committed stage.
