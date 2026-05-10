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

## Local VSIX Test Build

Use this process when you want to test Debug80 as a real installed VS Code extension rather than
through the Extension Development Host.

This is the closest local equivalent to how a user will experience the extension after download:
VS Code loads the packaged files from the VSIX, not the TypeScript source tree.

### Build the VSIX

Use this command before sharing a candidate VSIX:

```bash
cd /Users/johnhardy/Documents/projects/debug80
npm ci
npm run package:check
```

`package:check` runs:

- `npm run typecheck`
- `npm run typecheck:webview`
- `npm test`
- `npm run package`
- `npm run package:verify`

The package step runs `vscode:prepublish`, which rebuilds the extension and webview output before
`vsce package` creates the VSIX. The verification step inspects the `vsce ls` package manifest and
fails if required runtime files are missing or top-level development debris is present.

The generated VSIX is written to the repo root, for example:

```text
debug80-0.0.1.vsix
```

### Install into normal VS Code

Install the generated VSIX into your regular VS Code:

```bash
code --install-extension debug80-0.0.1.vsix --force
```

The `--force` flag is useful when replacing an already installed local build with a newer VSIX.

If you want to remove the existing extension first:

```bash
code --uninstall-extension jhlagado.debug80
code --install-extension debug80-0.0.1.vsix
```

Restart VS Code after installation. Then open a normal Debug80 project workspace and test from the
Run and Debug sidebar.

### What this tests

This path verifies things that F5 development-host testing can miss:

- The extension manifest activates correctly after packaging.
- `out/` extension-host code and webview bundles are present.
- Webview CSS, JavaScript, images, ROM bundles, syntax files, schemas, and resources are packaged.
- Runtime dependencies such as `asm80` and `@jhlagado/zax` are available from inside the installed
  extension, without relying on global tools, `npm link`, sibling repos, or the development checkout.
- The Debug80 view appears in the normal VS Code Run and Debug sidebar.
- Existing `debug80.json` projects can auto-start and restart.
- Breakpoints, included-source mapping, register editing, memory editing, and sound mute behavior
  work in the packaged extension.

### Local smoke checklist

After installing the VSIX, test at least:

- Open a workspace with an initialized Debug80 project.
- Confirm the Debug80 panel appears under Run and Debug.
- Launch a TEC-1G MON3 target.
- Confirm asm80 target assembly works.
- Confirm ZAX target assembly works.
- Confirm restart works.
- Confirm breakpoints work in a project with include files.
- Confirm register editing works while paused.
- Confirm memory editing works for RAM, and ROM edit protection/unlock behavior is clear.
- Confirm the speaker starts muted and only unmutes after user interaction.

### Uninstall the local package

Remove the installed package when you want to return to development-host testing or install a fresh
candidate:

```bash
code --uninstall-extension jhlagado.debug80
```

## VSIX Content Check

After packaging, verify the generated extension contents:

```bash
npm run package:verify
```

The verification gate requires:

- `node_modules/asm80/...` is present.
- `node_modules/@jhlagado/zax/...` is present.
- `out/`, `resources/`, `roms/`, `schemas/`, `syntaxes/`, `README.md`, `LICENSE.txt` or `LICENSE`,
  and `THIRD_PARTY_NOTICES.md` are present.
- Top-level `src/`, `tests/`, `docs/`, `coverage/`, `.fallow/`, `.claude/`, `.cursor/`, `.github/`,
  and `.vscode/` are absent.

If unwanted files appear, fix `.vscodeignore` before publishing.

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
