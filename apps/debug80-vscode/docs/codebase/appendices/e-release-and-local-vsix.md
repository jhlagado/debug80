---
layout: default
title: 'Appendix E — Release and Local VSIX Testing'
parent: 'Appendices'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 5
---

[← Appendix D](d-bundle-manifest.md) | [Appendices](index.md)

# Appendix E — Release and Local VSIX Testing

Debug80 should be tested as a packaged VS Code extension before it is published. Running from the
Extension Development Host is useful during development, but it does not prove that the VSIX contains
the compiled extension host, webview bundles, runtime dependencies, ROM resources, schemas, syntax
files, and notices that a user receives.

The source-of-truth checklist lives in `apps/debug80-vscode/docs/release-process.md`. This appendix summarizes
the expected flow for contributors.

---

## Release principles

- Build release candidates from a clean commit on `main`.
- Keep runtime assembler dependencies in `dependencies`, not `devDependencies`.
- Keep the root `package-lock.json` entries for Rollup and Rolldown native
  optional bindings intact across supported platforms.
- Do not rely on globally installed assemblers, `npm link`, or sibling
  checkouts.
- Rebuild the extension and webview output before packaging.
- Install and smoke-test the generated VSIX before marketplace publishing.

---

## Local VSIX build

From the toolchain repository root:

```bash
npm ci
npm run check:native-lockfile
npm run package:debug80
```

`npm run check:native-lockfile` verifies that `package-lock.json` still pins the
declared Rollup and Rolldown native optional bindings for every supported
platform. Run it from a clean install before packaging because a local
`node_modules` tree can hide missing cross-platform entries.

`npm run package:debug80` delegates to the extension workspace's `package:check`
script. That script runs extension and webview type checks, the extension
Vitest suites, VSIX packaging, and package-content verification. The generated
file is written under `apps/debug80-vscode/`, for example:

```text
apps/debug80-vscode/debug80-<version>.vsix
```

Install it into normal VS Code with:

```bash
code --install-extension apps/debug80-vscode/debug80-<version>.vsix --force
```

Restart VS Code after installation, then open a real Debug80 project workspace.

---

## Minimum manual smoke test

Before calling a VSIX candidate releasable, test:

- the Debug80 view appears under Run and Debug;
- an initialized project auto-starts;
- TEC-1G MON3 launch works;
- Atom target assembly works and produces a native source map;
- an explicit AZM compatibility target still assembles;
- source-map editor features work from the built D8 map: F12, hover, workspace symbols, Variables and Watches;
- conditional breakpoints evaluate against registers, flags, symbols and memory reads;
- restart works;
- breakpoints work in included source files;
- Call Stack shows mapped stack-return candidates and `Run to Here` works on a caller frame;
- register editing works while paused;
- memory editing works for RAM and ROM protection behavior is clear;
- TEC-1G Displays and Machine accordions render GLCD, RGB matrix, LCD, seven-segment and keypad without needing visibility checkboxes;
- CoolTerm hardware send can locate the selected target HEX and report a missing CoolTerm socket clearly;
- audio starts muted and unmutes only after user interaction.

---

## Package contents

`npm run package:verify -w debug80` checks the VSIX manifest. The package must include:

- `out/`
- `resources/`
- `roms/`
- `schemas/`
- `syntaxes/`
- the bundled runtime code for Atom and the other in-process backends in `out/`
- `out/assets/native-core.json`, loaded by Atom's bundled native runner
- `out/library/`, used for Nucleus standard-library imports
- `README.md`
- `LICENSE` or `LICENSE.txt`
- `THIRD_PARTY_NOTICES.md`

It must exclude development-only material such as `src/`, `tests/`, `docs/`, `coverage/`,
`.github/`, `.vscode/`, and `.fallow/`.

---

## Marketplace direction

Marketplace publishing should be the final step after local VSIX testing and CI gates pass. Until
that process is fully automated, GitHub Releases are the safer place to attach pre-release VSIX
candidates for manual testing.

## CI Gate

CI is part of the Definition of Done for Debug80 changes. The `Toolchain CI`
workflow in `.github/workflows/ci.yml` checks the maintained AZM, headless,
source-size, and extension surfaces, including VS Code-hosted tests and VSIX
packaging. The source-size job now runs `npm run check:native-lockfile` before
its size and external-link gates so cross-platform bundler bindings stay pinned
in `package-lock.json`. Extracted packages have their own repository checks.
After pushing, confirm that this workflow passes for the pushed commit before
treating the change as complete or publishing a VSIX.

```bash
git rev-parse --short HEAD
gh run list --workflow ci.yml --branch main --limit 5
gh run watch
```

For PR branches, check the PR branch checks before merge instead of only checking `main`.
