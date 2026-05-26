# Marketplace Publishing Agent Handover

This document is for an agent whose only job is to turn the current Debug80
working tree into a clean VS Code Marketplace release. Keep feature work and
release mechanics separate: do not redesign, refactor, or add new functionality
while following this handover.

## Assumptions

- Repo path: `/Users/johnhardy/projects/debug80`
- Publisher id: `jhlagado`
- Marketplace credentials are already available on this machine through `vsce`
  login state or local credential storage.
- The release should be made from `main`.
- Runtime dependencies, especially `@jhlagado/azm`, must be in
  `dependencies`, not `devDependencies`.
- The user may have already bumped the version. Check first; do not double-bump
  without a reason.

## Current Expected Pending Work

At the time this handover was written, the intended pending release work may
include:

- Debug80 version bump to `0.1.5`.
- AZM dependency update to `@jhlagado/azm@0.2.4`.
- Compact accordion styling in the Debug80 webview.
- AZM Project panel options:
  - `Register Care`: `Enforce`, `Audit`, `Off`
  - `Contract Updates`: `Ask`, `Auto`, `Never`

Confirm this with `git diff`; do not assume these are the only changes.

## Release Checklist

### 1. Inspect State

```bash
cd /Users/johnhardy/projects/debug80
git status --short
git branch --show-current
git log -1 --oneline
node -p "require('./package.json').version"
node -p "require('./package.json').dependencies['@jhlagado/azm']"
```

Expected:

- Branch is `main`, unless the user explicitly asks otherwise.
- `package.json` parses cleanly.
- Version is the intended marketplace version.
- AZM version is the intended bundled runtime dependency.

If the version still needs bumping:

```bash
npm version patch --no-git-tag-version
```

Use `minor` instead of `patch` only if the user explicitly asks for a minor
release.

### 2. Verify Before Commit

Run the full project gate:

```bash
npm run package:check
```

This runs type checks, tests, package creation, and VSIX content verification.
If this fails, stop and fix the failure before publishing.

Optional but useful if the changes are UI-heavy:

```bash
npm test
npm run build
```

### 3. Commit Release Candidate

Review the final diff:

```bash
git diff --stat
git diff -- package.json package-lock.json
```

Stage and commit all intended release changes:

```bash
git add -A
git commit -m "Release Debug80 0.1.5"
```

Use the actual version number in the commit message.

The repo has pre-commit hooks. If they modify files, re-check:

```bash
git status --short
```

If files remain modified after the commit hook, inspect them and either commit
the hook changes or resolve the issue.

### 4. Tag The Release

Create an annotated version tag:

```bash
git tag -a v0.1.5 -m "Debug80 0.1.5"
```

Use the actual package version.

### 5. Push Commit And Tag

```bash
git push origin main
git push origin v0.1.5
```

Use the actual tag name.

### 6. Publish To Marketplace

Make sure the package gate still passes from the committed state:

```bash
npm run package:check
```

Then publish:

```bash
npm run publish:marketplace
```

If `vsce` asks for credentials, use the local configured credential flow. The
expected case is that credentials are already present and publishing proceeds
without manually pasting a token.

### 7. Confirm Publication

After publish completes:

```bash
npx vsce show jhlagado.debug80
```

Confirm the shown version matches the package version.

Also check:

```bash
git status --short
```

Expected: clean working tree.

## Commands Summary

For a normal already-bumped patch release:

```bash
cd /Users/johnhardy/projects/debug80
git status --short
node -p "require('./package.json').version"
npm run package:check
git add -A
git commit -m "Release Debug80 0.1.5"
git tag -a v0.1.5 -m "Debug80 0.1.5"
git push origin main
git push origin v0.1.5
npm run publish:marketplace
npx vsce show jhlagado.debug80
git status --short
```

Replace `0.1.5` with the actual package version.

## Failure Rules

- Do not publish if `npm run package:check` fails.
- Do not publish with an uncommitted working tree.
- Do not publish with an unpushed release commit.
- Do not publish without tagging the release.
- Do not move AZM to `devDependencies`.
- Do not silently rewrite unrelated user work. If unexpected changes appear,
  inspect them and report clearly.

## Notes For Debug80

- `npm run package` invokes `vscode:prepublish`, which rebuilds `out/` before
  creating the VSIX.
- `npm run package:verify` checks that the VSIX contains required runtime files
  and excludes development-only directories.
- `npm run publish:marketplace` is `vsce publish`.
- The marketplace text is taken primarily from `README.md` and manifest metadata
  in `package.json`.
