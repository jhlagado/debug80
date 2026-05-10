# Debug80 Release Process

This document defines the release path for local VSIX testing and eventual VS Code Marketplace
publishing. The goal is to make marketplace publishing a controlled final step, not a separate
one-off process.

## Release Principles

- Releases are built from a clean git commit on `main`.
- Runtime dependencies must be packaged inside the VSIX. Users must not need global `asm80`, global
  `zax`, `npm link`, or sibling checkouts.
- `asm80` and `@jhlagado/zax` stay in `dependencies`, not `devDependencies`.
- `npm run package` must rebuild `out/` before packaging so the VSIX cannot contain stale extension
  host code.
- Manual VSIX testing comes before marketplace publishing.

## Local Candidate Build

Use this command before sharing a candidate VSIX:

```bash
npm ci
npm run package:check
```

`package:check` runs:

- `npm run typecheck`
- `npm run typecheck:webview`
- `npm test`
- `npm run package`

The package step runs `vscode:prepublish`, which rebuilds the extension and webview output before
`vsce package` creates the VSIX.

## VSIX Content Check

After packaging, inspect the generated extension:

```bash
npx vsce ls | rg 'node_modules/(asm80|@jhlagado/zax)|^coverage/|^tests/|^docs/|^src/'
```

Expected:

- `node_modules/asm80/...` is present.
- `node_modules/@jhlagado/zax/...` is present.
- `coverage/`, `tests/`, `docs/`, and `src/` are absent.
- `out/`, `resources/`, `roms/`, `schemas/`, `syntaxes/`, `README.md`, `LICENSE.txt`, and
  `THIRD_PARTY_NOTICES.md` are present.

If unwanted files appear, fix `.vscodeignore` before publishing.

## Manual Mac Test

Install the local candidate into normal VS Code:

```bash
code --install-extension debug80-0.0.1.vsix --force
```

Then test:

- Open a workspace with an initialized Debug80 project.
- Confirm the Debug80 view appears under the VS Code Run and Debug side bar.
- Launch a TEC-1G MON3 target.
- Confirm asm80 target assembly works.
- Confirm ZAX target assembly works.
- Confirm project restart works.
- Confirm breakpoints and source mapping work in a project with include files.

Uninstall if needed:

```bash
code --uninstall-extension jhlagado.debug80
```

## Versioning

Use semver:

- Patch: bug fixes, packaging fixes, documentation corrections.
- Minor: new user-facing capabilities, new platform behavior, new project workflow.
- Major: breaking configuration or project-layout changes.

Before a release:

```bash
npm version patch
```

or:

```bash
npm version minor
```

Do not publish from an uncommitted working tree.

## Marketplace Setup

One-time setup:

1. Confirm the publisher id in `package.json` is correct: `jhlagado`.
2. Create or verify the VS Code Marketplace publisher.
3. Create an Azure DevOps Personal Access Token with Marketplace publishing rights.
4. Log in locally:

```bash
npx vsce login jhlagado
```

Publishing command:

```bash
npm run package:check
npm run publish:marketplace
```

Do not publish until the candidate VSIX has been manually installed and tested locally.

## GitHub Release Candidate Flow

Until marketplace publishing is ready, use GitHub Releases rather than GitHub Pages:

1. Build with `npm run package:check`.
2. Create a draft GitHub Release.
3. Attach the generated `.vsix`.
4. Mark it as pre-release if it is not intended for general users.

This gives a stable manual download URL without pretending to be an update channel.

## Future Automation

Once the manual process is reliable, add a release workflow:

- Trigger on tags like `v0.1.0`.
- Run tests on macOS, Linux, and Windows.
- Build the VSIX on Ubuntu.
- Upload the VSIX as a GitHub Release asset.
- Publish to Marketplace only when a protected environment approval is granted.
