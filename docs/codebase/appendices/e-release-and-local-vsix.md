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

The source-of-truth checklist lives in `debug80/docs/release-process.md`. This appendix summarizes
the expected flow for contributors.

---

## Release principles

- Build release candidates from a clean commit on `main`.
- Keep runtime assembler dependencies in `dependencies`, not `devDependencies`.
- Do not rely on globally installed assemblers, `npm link`, or sibling
  checkouts.
- Rebuild the extension and webview output before packaging.
- Install and smoke-test the generated VSIX before marketplace publishing.

---

## Local VSIX build

From the `debug80` repository:

```bash
npm ci
npm run package:check
```

`package:check` runs type checks, the test suite, VSIX packaging, and package content verification.
The generated file is written to the repository root, for example:

```text
debug80-<version>.vsix
```

Install it into normal VS Code with:

```bash
code --install-extension debug80-<version>.vsix --force
```

Restart VS Code after installation, then open a real Debug80 project workspace.

---

## Minimum manual smoke test

Before calling a VSIX candidate releasable, test:

- the Debug80 view appears under Run and Debug;
- an initialized project auto-starts;
- TEC-1G MON3 launch works;
- AZM target assembly works and produces a native source map;
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

`npm run package:verify` checks the VSIX manifest. The package must include:

- `out/`
- `resources/`
- `roms/`
- `schemas/`
- `syntaxes/`
- `node_modules/@jhlagado/azm`
- `README.md`
- `LICENSE` or `LICENSE.txt`
- `THIRD_PARTY_NOTICES.md`

It must exclude development-only material such as `src/`, `tests/`, `docs/`, `coverage/`,
`.github/`, `.vscode/`, `.fallow/`, `.claude/`, and `.cursor/`.

---

## Marketplace direction

Marketplace publishing should be the final step after local VSIX testing and CI gates pass. Until
that process is fully automated, GitHub Releases are the safer place to attach pre-release VSIX
candidates for manual testing.

## CI Gate

CI is part of the Definition of Done for Debug80 changes. After pushing, confirm that GitHub
Actions has started a `CI` workflow run for the pushed commit and that it passes before treating the
change as complete or publishing a VSIX.

```bash
git rev-parse --short HEAD
gh run list --workflow CI --branch main --limit 5
gh run watch
```

For PR branches, check the PR branch checks before merge instead of only checking `main`.
